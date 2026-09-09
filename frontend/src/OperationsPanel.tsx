import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import type { Plan } from "./App";
import { request } from "./api";

type Action = {
  source: string;
  destination: string;
  state: string;
  error: string;
};
type Operation = {
  id: string;
  root: string;
  created_at: string;
  status: string;
  actions: Action[];
  error: string;
};
const statuses: Record<string, string> = {
  prepared: "Prepared · not executed",
  applying: "Execution interrupted or in progress",
  completed: "Organized",
  partial: "Partially organized",
  undoing: "Undo interrupted or in progress",
  undo_partial: "Undo has conflicts",
  undone: "Undone",
};
const actionStates: Record<string, string> = {
  pending: "Not moved",
  moving: "Check on disk",
  moved: "Moved",
  restoring: "Check restoration",
  undone: "At original path",
};

type Props = {
  plan: Plan | null;
  isDemo: boolean;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
  onCopyDemo: () => void;
};

export default function OperationsPanel({
  plan,
  isDemo,
  disabled,
  onBusy,
  onChanged,
  onCopyDemo,
}: Props) {
  const [records, setRecords] = useState<Operation[]>([]);
  const [confirmation, setConfirmation] = useState<{
    operation: Operation;
    undo: boolean;
  } | null>(null);
  const [approved, setApproved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const confirmationRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef(0);

  async function refresh(
    nextPage = page,
    nextSearch = search,
    nextStatus = statusFilter,
  ) {
    const sequence = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const result = await request<{
        items: Operation[];
        total: number;
        page: number;
        pages: number;
      }>("operations/search", {
        page: nextPage,
        search: nextSearch,
        status: nextStatus,
      });
      if (sequence === historyRequest.current) {
        setRecords(result.items);
        setTotal(result.total);
        setPage(result.page);
        setPages(result.pages);
      }
    } finally {
      if (sequence === historyRequest.current) setHistoryLoading(false);
    }
  }

  async function exportHistory() {
    setError("");
    try {
      const result = await request<unknown>("operations/export", {
        search,
        status: statusFilter,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "filenest-history.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh().catch(() =>
      setError(
        "Could not load history. Make sure the updated backend is running.",
      ),
    );
  }, []);
  useEffect(() => {
    setConfirmation(null);
    setApproved(false);
  }, [plan]);
  useEffect(() => {
    if (confirmation) confirmationRef.current?.focus();
  }, [confirmation]);

  async function prepare() {
    setPending(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const operation = await request<Operation>("operations/prepare", plan);
      setConfirmation({ operation, undo: false });
      setApproved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  async function execute() {
    if (!confirmation || !approved) return;
    setPending(true);
    onBusy(true);
    setError("");
    try {
      const { operation, undo } = confirmation;
      const result = await request<Operation>(
        `operations/${operation.id}/${undo ? "undo" : "apply"}`,
        { approved: true },
      );
      setMessage(
        result.status === "completed"
          ? "Organization complete. You can undo it in the history below."
          : result.status === "undone"
            ? "Undo complete. Files are back at their original paths."
            : "This operation needs attention. Check the details in history.",
      );
      setConfirmation(null);
      setApproved(false);
      onChanged();
      setSearch("");
      setDraftSearch("");
      setStatusFilter("all");
      await refresh(1, "", "all");
    } catch (e) {
      setError(
        `${(e as Error).message} If the connection was lost, refresh history before continuing.`,
      );
      await refresh().catch(() => {});
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  const valid =
    plan &&
    plan.items.some((i) => i.included && i.status === "ready") &&
    !plan.items.some(
      (i) => i.included && (i.status !== "ready" || i.issues.length > 0),
    );

  return (
    <section className="operations-panel" aria-label="Organization and history">
      {plan && (
        <div className="plan-footer">
          <div>
            <strong>
              {isDemo
                ? "Try the complete flow on a copy"
                : "Ready to put everything in place?"}
            </strong>
            <p>
              {isDemo
                ? "The original samples stay untouched. We will create a separate local folder."
                : "Review the final plan. Files move only after your explicit approval."}
            </p>
          </div>
          <button
            className="primary"
            disabled={disabled || pending || (!isDemo && !valid)}
            onClick={isDemo ? onCopyDemo : () => void prepare()}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            {isDemo ? "Create a demo copy" : "Prepare organization"}
          </button>
        </div>
      )}
      {confirmation && (
        <section
          ref={confirmationRef}
          tabIndex={-1}
          className="approval-panel"
          aria-label={
            confirmation.undo ? "Confirm undo" : "Confirm organization"
          }
        >
          <h2>
            {confirmation.undo
              ? "Restore original paths"
              : "Final review before organizing"}
          </h2>
          <p className="root-path">{confirmation.operation.root}</p>
          <p>
            {confirmation.undo
              ? "Undo is blocked for changed files or occupied paths. Empty folders are kept."
              : `You will move ${confirmation.operation.actions.length} files. Contents stay the same; paths change as listed below.`}
          </p>
          <ul className="action-list">
            {confirmation.operation.actions.map((action) => (
              <li key={action.source}>
                <span>
                  {confirmation.undo ? action.destination : action.source}
                </span>
                <span aria-hidden="true"> → </span>
                <strong>
                  {confirmation.undo ? action.source : action.destination}
                </strong>
              </li>
            ))}
          </ul>
          <label className="approval-checkbox">
            <input
              type="checkbox"
              checked={approved}
              disabled={pending}
              onChange={(e) => setApproved(e.target.checked)}
            />
            {confirmation.undo
              ? "I confirm undoing this operation."
              : "I reviewed these paths and approve moving these files."}
          </label>
          <div className="operation-buttons">
            <button
              className="secondary"
              disabled={pending}
              onClick={() => {
                setConfirmation(null);
                setApproved(false);
              }}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={!approved || pending || disabled}
              onClick={() => void execute()}
            >
              {pending && <LoaderCircle size={16} className="spin" />}
              {confirmation.undo ? "Confirm and undo" : "Confirm and organize"}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="operation-message" role="status">
          <Check size={18} />
          {message}
        </p>
      )}
      <div className="results-heading history-heading">
        <div>
          <h2>Local history</h2>
          <p>{total} operations found · stored on this computer.</p>
        </div>
        <button
          className="text-button"
          disabled={disabled || pending || historyLoading}
          onClick={() =>
            void refresh()
              .then(() => setError(""))
              .catch(() => setError("Could not refresh history."))
          }
        >
          <RotateCcw size={14} /> Refresh history
        </button>
      </div>
      <form
        className="history-controls"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draftSearch);
          void refresh(1, draftSearch, statusFilter).catch(() =>
            setError("Could not search history."),
          );
        }}
      >
        <label>
          Search paths
          <input
            value={draftSearch}
            maxLength={200}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="File or folder name"
            disabled={disabled || pending}
          />
        </label>
        <label>
          Operation status
          <select
            value={statusFilter}
            disabled={disabled || pending}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              void refresh(1, search, e.target.value).catch(() =>
                setError("Could not filter history."),
              );
            }}
          >
            <option value="all">All statuses</option>
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="secondary"
          disabled={disabled || pending || historyLoading}
        >
          Search
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || pending || historyLoading || !total}
          onClick={() => void exportHistory()}
        >
          Export results
        </button>
      </form>
      <p className="history-export-note">
        JSON exports include local paths and operation results, not document
        contents.
      </p>
      {historyLoading && <p aria-live="polite">Loading history…</p>}
      {!records.length && (
        <p className="history-empty">
          {search || statusFilter !== "all"
            ? "No operations match these filters. Try another search or status."
            : "Your story starts here. Prepare an organization to see it in your history."}
        </p>
      )}
      {records.map((record) => (
        <article className="history-card" key={record.id}>
          <div className="results-heading">
            <div>
              <strong>{statuses[record.status] ?? record.status}</strong>
              <p>
                {new Date(record.created_at).toLocaleString("en-GB")} ·{" "}
                {record.actions.length} files
              </p>
            </div>
            {!["prepared", "undone"].includes(record.status) && (
              <button
                className="secondary"
                disabled={disabled || pending}
                onClick={() => {
                  setConfirmation({ operation: record, undo: true });
                  setApproved(false);
                  setError("");
                }}
              >
                <RotateCcw size={14} /> Undo
              </button>
            )}
          </div>
          <p className="root-path">{record.root}</p>
          {record.error && <p className="warning">{record.error}</p>}
          <details>
            <summary>View files and results</summary>
            <ul className="action-list">
              {record.actions.map((action) => (
                <li key={action.source}>
                  <span>
                    {action.source} → {action.destination}
                  </span>
                  <strong>
                    {" "}
                    · {actionStates[action.state] ?? action.state}
                  </strong>
                  {action.error && <p className="warning">{action.error}</p>}
                </li>
              ))}
            </ul>
          </details>
        </article>
      ))}
      <nav className="history-pagination" aria-label="History pages">
        <button
          className="secondary"
          disabled={disabled || pending || historyLoading || page <= 1}
          onClick={() =>
            void refresh(page - 1).catch(() =>
              setError("Could not change page."),
            )
          }
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="secondary"
          disabled={disabled || pending || historyLoading || page >= pages}
          onClick={() =>
            void refresh(page + 1).catch(() =>
              setError("Could not change page."),
            )
          }
        >
          Next
        </button>
      </nav>
    </section>
  );
}
