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
  prepared: "Preparado · não executado",
  applying: "Execução interrompida ou em curso",
  completed: "Organizado",
  partial: "Organização parcial",
  undoing: "Restauro interrompido ou em curso",
  undo_partial: "Restauro com conflitos",
  undone: "Desfeito",
};
const actionStates: Record<string, string> = {
  pending: "Não movido",
  moving: "Verificar no disco",
  moved: "Movido",
  restoring: "Restauro por verificar",
  undone: "No caminho original",
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
      link.download = "filenest-historico.json";
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
        "Não foi possível carregar o histórico. Confirme que reiniciou o backend atualizado.",
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
          ? "Organização concluída. Pode desfazer no histórico abaixo."
          : result.status === "undone"
            ? "Restauro concluído. Os ficheiros voltaram aos caminhos originais."
            : "A operação requer atenção. Consulte os detalhes no histórico.",
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
        `${(e as Error).message} Se perdeu a ligação, atualize o histórico antes de continuar.`,
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
    <section className="operations-panel" aria-label="Organização e histórico">
      {plan && (
        <div className="plan-footer">
          <div>
            <strong>
              {isDemo
                ? "Experimente o fluxo completo numa cópia"
                : "Pronto para pôr os ficheiros no lugar?"}
            </strong>
            <p>
              {isDemo
                ? "Os exemplos publicados permanecem intactos. Criamos uma pasta local separada."
                : "Prepare a revisão final. Só moveremos os ficheiros após a sua confirmação explícita."}
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
            {isDemo ? "Criar cópia para organizar" : "Preparar organização"}
          </button>
        </div>
      )}
      {confirmation && (
        <section
          ref={confirmationRef}
          tabIndex={-1}
          className="approval-panel"
          aria-label={
            confirmation.undo ? "Confirmar restauro" : "Confirmar organização"
          }
        >
          <h2>
            {confirmation.undo
              ? "Restaurar os caminhos originais"
              : "Revisão final antes de organizar"}
          </h2>
          <p className="root-path">{confirmation.operation.root}</p>
          <p>
            {confirmation.undo
              ? "O restauro será bloqueado para ficheiros alterados ou caminhos ocupados. As pastas vazias serão mantidas."
              : `Vai mover ${confirmation.operation.actions.length} ficheiro(s). O conteúdo será preservado e os caminhos mudarão conforme esta lista.`}
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
              ? "Confirmo o restauro dos ficheiros desta operação."
              : "Revi estes caminhos e autorizo mover estes ficheiros."}
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
              Cancelar
            </button>
            <button
              className="primary"
              disabled={!approved || pending || disabled}
              onClick={() => void execute()}
            >
              {pending && <LoaderCircle size={16} className="spin" />}
              {confirmation.undo
                ? "Confirmar e desfazer"
                : "Confirmar e organizar"}
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
          <h2>Histórico local</h2>
          <p>{total} operação(ões) encontradas · guardadas neste computador.</p>
        </div>
        <button
          className="text-button"
          disabled={disabled || pending || historyLoading}
          onClick={() =>
            void refresh()
              .then(() => setError(""))
              .catch(() => setError("Não foi possível atualizar o histórico."))
          }
        >
          <RotateCcw size={14} /> Atualizar histórico
        </button>
      </div>
      <form
        className="history-controls"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draftSearch);
          void refresh(1, draftSearch, statusFilter).catch(() =>
            setError("Não foi possível pesquisar o histórico."),
          );
        }}
      >
        <label>
          Pesquisar caminhos
          <input
            value={draftSearch}
            maxLength={200}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Nome do ficheiro ou pasta"
            disabled={disabled || pending}
          />
        </label>
        <label>
          Estado da operação
          <select
            value={statusFilter}
            disabled={disabled || pending}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              void refresh(1, search, e.target.value).catch(() =>
                setError("Não foi possível filtrar o histórico."),
              );
            }}
          >
            <option value="all">Todos os estados</option>
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
          Pesquisar
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled || pending || historyLoading || !total}
          onClick={() => void exportHistory()}
        >
          Exportar resultados
        </button>
      </form>
      <p className="history-export-note">
        A exportação JSON inclui os caminhos locais e os resultados das
        operações, sem o conteúdo dos documentos.
      </p>
      {historyLoading && <p aria-live="polite">A carregar o histórico…</p>}
      {!records.length && (
        <p className="history-empty">
          {search || statusFilter !== "all"
            ? "Nenhuma operação corresponde aos filtros. Experimente outra pesquisa ou estado."
            : "Ainda não existem operações. O histórico aparecerá aqui quando preparar uma organização."}
        </p>
      )}
      {records.map((record) => (
        <article className="history-card" key={record.id}>
          <div className="results-heading">
            <div>
              <strong>{statuses[record.status] ?? record.status}</strong>
              <p>
                {new Date(record.created_at).toLocaleString("pt-PT")} ·{" "}
                {record.actions.length} ficheiro(s)
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
                <RotateCcw size={14} /> Desfazer
              </button>
            )}
          </div>
          <p className="root-path">{record.root}</p>
          {record.error && <p className="warning">{record.error}</p>}
          <details>
            <summary>Ver ficheiros e resultados</summary>
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
      <nav className="history-pagination" aria-label="Páginas do histórico">
        <button
          className="secondary"
          disabled={disabled || pending || historyLoading || page <= 1}
          onClick={() =>
            void refresh(page - 1).catch(() =>
              setError("Não foi possível mudar de página."),
            )
          }
        >
          Anterior
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button
          className="secondary"
          disabled={disabled || pending || historyLoading || page >= pages}
          onClick={() =>
            void refresh(page + 1).catch(() =>
              setError("Não foi possível mudar de página."),
            )
          }
        >
          Seguinte
        </button>
      </nav>
    </section>
  );
}
