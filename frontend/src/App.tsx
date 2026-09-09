import { useState } from "react";
import OperationsPanel from "./OperationsPanel";
import { request } from "./api";
import ProviderSelector, { type Provider } from "./ProviderSelector";
import OcrControls from "./OcrControls";
import DocumentPreview from "./DocumentPreview";
import { useAnalysis } from "./useAnalysis";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

type FileItem = {
  id: string;
  current_path: string;
  size: number;
  category: string;
  proposed_name: string;
  proposed_folder: string;
  reason: string;
  status: string;
  included: boolean;
  issues: string[];
  suggestion_source: Provider;
  provider_note: string;
  extraction_method: string;
  extraction_notes: string[];
  preview_token?: string;
};
export type Plan = {
  root: string;
  provider: string;
  items: FileItem[];
  warnings: string[];
};

export default function App() {
  const analysis = useAnalysis();
  const [path, setPath] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [original, setOriginal] = useState<Plan | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [validated, setValidated] = useState(false);
  const [filter, setFilter] = useState("all");
  const [isDemo, setIsDemo] = useState(false);
  const [provider, setProvider] = useState<Provider>("demo-rules");
  const [useOcr, setUseOcr] = useState(false);
  const [recursive, setRecursive] = useState(false);
  const [previewId, setPreviewId] = useState("");
  const [folderMessage, setFolderMessage] = useState("");
  const selected =
    plan?.items.filter((i) => i.included && i.status === "ready").length ?? 0;
  const attention =
    plan?.items.filter(
      (i) => i.status !== "ready" || (i.included && i.issues.length),
    ).length ?? 0;

  async function analyze(demo: boolean) {
    setBusy("analyze");
    setError("");
    setValidated(false);
    try {
      const result = await analysis.run({
        path,
        demo,
        provider,
        ocr: useOcr,
        recursive,
      });
      setPlan(result);
      setOriginal(structuredClone(result));
      setDirty(false);
      setFilter("all");
      setIsDemo(demo);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Could not reach the local server. Make sure the backend is running on port 8000."
          : (e as Error).message,
      );
    } finally {
      setBusy("");
    }
  }

  function edit(id: string, changes: Partial<FileItem>) {
    setPlan(
      (p) =>
        p && {
          ...p,
          items: p.items.map((i) => (i.id === id ? { ...i, ...changes } : i)),
        },
    );
    setDirty(true);
    setValidated(false);
  }

  async function validate() {
    setBusy("validate");
    setError("");
    try {
      setPlan(await request<Plan>("validate", plan));
      setDirty(false);
      setValidated(true);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Local server unavailable. Your edits are still on this page."
          : (e as Error).message,
      );
    } finally {
      setBusy("");
    }
  }

  async function copyDemo() {
    setBusy("analyze");
    setError("");
    try {
      const copy = await request<{ path: string }>("demo-copy", {});
      const result = await analysis.run({
        path: copy.path,
        provider,
        ocr: useOcr,
        recursive,
      });
      setPath(copy.path);
      setPlan(result);
      setOriginal(structuredClone(result));
      setIsDemo(false);
      setDirty(false);
      setValidated(false);
      setFilter("all");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function pickFolder() {
    setBusy("picker");
    setError("");
    setFolderMessage("Choose a folder in the system dialog.");
    try {
      const result = await request<{ path: string | null }>("folders/pick", {});
      if (result.path) {
        setPath(result.path);
        setFolderMessage("Folder selected. Click Analyze folder to continue.");
      } else
        setFolderMessage("Selection cancelled. The previous path was kept.");
    } catch (e) {
      setError((e as Error).message);
      setFolderMessage("");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          FileNest<span className="version">1.0</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <div className="nav-item">
          <FolderOpen size={18} /> Organizer <span>01</span>
        </div>
        <div className="sidebar-note">
          <LockKeyhole size={19} />
          <strong>
            Your files.
            <br />
            Your computer.
          </strong>
          <p>Analysis runs on your computer. Your documents stay with you.</p>
          <span className="local-dot">No external AI services</span>
        </div>
        <div className="sidebar-footer">
          A little order. A lot of clarity.
          <br />
          <span>FileNest · version 1.0</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} />
            <strong>Organizer</strong>
          </span>
          <span className="readonly">
            <ShieldCheck size={15} /> Every change, approved by you
          </span>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">LESS CLUTTER. MORE POSSIBILITY.</div>
              <h1>
                Make room for <em>what matters.</em>
              </h1>
              <p>Turn scattered documents into a considered collection.</p>
            </div>
            <span className="mode-pill">
              <span />{" "}
              {(plan?.provider ?? provider) === "ollama"
                ? "Local AI · Qwen3 4B"
                : "Local rules · no AI"}
            </span>
          </section>
          <ol className="steps">
            <li className="active">
              <span>{plan ? <Check size={14} /> : "1"}</span> Choose folder
            </li>
            <li className={plan ? "active" : ""}>
              <span>2</span> Review suggestions
            </li>
            <li>
              <span>3</span> Organize & undo
            </li>
          </ol>
          <section className="source-panel">
            <div className="section-title">
              <div className="icon-box">
                <FolderOpen size={21} />
              </div>
              <div>
                <h2>Start with a folder</h2>
                <p>
                  PDF and TXT documents · up to{" "}
                  {provider === "ollama" ? 20 : 100} documents · 10 MB per file
                </p>
              </div>
            </div>
            <ProviderSelector
              value={provider}
              onChange={setProvider}
              disabled={!!busy}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void analyze(false);
              }}
            >
              <label htmlFor="folder-path">Local folder path</label>
              <div className="path-row">
                <div className="path-input">
                  <Folder size={18} />
                  <input
                    id="folder-path"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="C:\Users\YourName\Documents\Unsorted"
                    disabled={!!busy}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => void pickFolder()}
                >
                  <FolderOpen size={16} />
                  {busy === "picker" ? "Dialog open…" : "Choose folder"}
                </button>
                <button className="primary" disabled={!!busy || !path.trim()}>
                  {busy === "analyze" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}{" "}
                  Analyze folder
                </button>
              </div>
              {folderMessage && (
                <p className="folder-message" aria-live="polite">
                  {folderMessage}
                </p>
              )}
            </form>
            <div className="ocr-controls">
              <label>
                <input
                  type="checkbox"
                  checked={recursive}
                  disabled={!!busy}
                  onChange={(e) => setRecursive(e.target.checked)}
                />
                Include subfolders
              </label>
              <p>
                Explore up to 20 levels. Limits apply to the whole selection.
                Destinations stay inside your chosen folder. Links are skipped.
                Analyze again after changing this option.
              </p>
            </div>
            <OcrControls
              enabled={useOcr}
              onChange={setUseOcr}
              disabled={!!busy}
            />
            <div className="source-bottom">
              <span>
                <LockKeyhole size={13} /> Your originals stay untouched during
                analysis.
              </span>
              <button
                className="text-button"
                onClick={() => void analyze(true)}
                disabled={!!busy}
              >
                <Play size={14} /> Try the demo <ArrowRight size={14} />
              </button>
            </div>
          </section>
          {error && (
            <div className="error-banner" role="alert">
              <TriangleAlert size={18} />
              {error}
            </div>
          )}
          {busy === "analyze" && (
            <div className="loading" role="status">
              <LoaderCircle className="spin" />{" "}
              {provider === "ollama"
                ? "Analyzing with local AI… The first document may take longer while the model loads."
                : "Reading documents and preparing suggestions…"}
              {analysis.progress && (
                <div>
                  <p>
                    {analysis.progress.total === null
                      ? "Checking your folder…"
                      : `${analysis.progress.completed} of ${analysis.progress.total} documents completed`}
                  </p>
                  {analysis.progress.total !== null && (
                    <progress
                      aria-label="Analysis progress"
                      value={analysis.progress.completed}
                      max={Math.max(1, analysis.progress.total)}
                    />
                  )}
                  <p className="root-path">{analysis.progress.current}</p>
                  <button
                    className="secondary"
                    disabled={analysis.progress.cancel_requested}
                    onClick={() => void analysis.cancel()}
                  >
                    {analysis.progress.cancel_requested
                      ? "Cancelling…"
                      : "Cancel analysis"}
                  </button>
                  <p>
                    Cancellation takes effect after the current document.
                    Completed results are kept.
                  </p>
                  {analysis.cancelError && (
                    <p role="alert">{analysis.cancelError}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!plan && !busy && (
            <section className="welcome">
              <div className="file-illustration">
                <span>
                  <FileText />
                </span>
                <span>
                  <FolderOpen size={42} />
                </span>
                <span>
                  <FileText />
                </span>
              </div>
              <h2>A fresh start for your files.</h2>
              <p>
                Choose a folder, or take a look around with our sample
                documents.
                <br />
                Preview every name and destination before anything moves.
              </p>
              <button className="secondary" onClick={() => void analyze(true)}>
                <Play size={15} /> Explore sample files
              </button>
              <div className="preview-example">
                <span>scan_001.pdf</span>
                <ArrowRight size={16} />
                <strong>Finance/2026-09-01_invoice.pdf</strong>
              </div>
            </section>
          )}
          {plan && (
            <section className="results" aria-busy={!!busy}>
              <div className="results-heading">
                <div>
                  <h2>
                    Your organization plan{" "}
                    <span className="count">{plan.items.length}</span>
                  </h2>
                  <p className="root-path">
                    {isDemo ? "Fictional documents · examples/demo" : plan.root}
                  </p>
                </div>
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => {
                    setPlan(structuredClone(original));
                    setDirty(false);
                    setValidated(false);
                  }}
                >
                  <RotateCcw size={14} /> Reset suggestions
                </button>
              </div>
              <div className="result-summary" aria-label="Plan summary">
                <div>
                  <strong>{plan.items.length}</strong>
                  <span>Documents found</span>
                </div>
                <div>
                  <strong>{selected}</strong>
                  <span>Included in plan</span>
                </div>
                <div>
                  <strong>{attention}</strong>
                  <span>Need your review</span>
                </div>
              </div>
              <div className="demo-notice">
                <span className="rule-tag">
                  {plan.provider === "ollama" ? "LOCAL AI" : "LOCAL RULES"}
                </span>
                {plan.provider === "ollama"
                  ? `${plan.items.filter((i) => i.status === "ready" && i.suggestion_source === "ollama").length} AI suggestions · ${plan.items.filter((i) => i.status === "ready" && i.suggestion_source === "demo-rules").length} from rules. Review the results: AI can make mistakes.`
                  : "Deterministic suggestions based on keywords. These are rules, not AI results."}
              </div>
              {plan.warnings.map((warning, i) => (
                <p className="warning" key={i}>
                  {warning}
                </p>
              ))}
              <div className="result-toolbar">
                <div className="filters">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    All <span>{plan.items.length}</span>
                  </button>
                  <button
                    className={filter === "attention" ? "selected" : ""}
                    onClick={() => setFilter("attention")}
                  >
                    Needs review <span>{attention}</span>
                  </button>
                </div>
                <span>{selected} included in the plan</span>
              </div>
              {!plan.items.length ? (
                <div className="empty">
                  <FolderOpen size={32} />
                  <h3>No supported documents</h3>
                  <p>
                    No PDF or TXT documents were found in this selection.
                    <br />
                    Choose another folder or try the demo.
                  </p>
                </div>
              ) : (
                <div className="file-list">
                  {plan.items
                    .filter(
                      (i) =>
                        filter === "all" ||
                        i.status !== "ready" ||
                        (i.included && i.issues.length),
                    )
                    .map((item) => (
                      <article
                        className={`file-card ${!item.included ? "excluded" : ""} ${previewId === item.id && item.preview_token ? "has-preview" : ""}`}
                        key={item.id}
                      >
                        <div className="file-top">
                          <label className="file-select">
                            <input
                              type="checkbox"
                              aria-label={`Include ${item.current_path}`}
                              checked={item.included}
                              disabled={!!busy || item.status !== "ready"}
                              onChange={(e) =>
                                edit(item.id, { included: e.target.checked })
                              }
                            />
                            <span
                              className={`file-icon ${item.current_path.toLowerCase().endsWith(".pdf") ? "pdf" : ""}`}
                            >
                              <FileText size={18} />
                            </span>
                            <strong>{item.current_path}</strong>
                          </label>
                          <div className="file-badges">
                            {item.preview_token && (
                              <button
                                className="text-button"
                                disabled={!!busy}
                                aria-expanded={previewId === item.id}
                                aria-label={`Preview ${item.current_path}`}
                                onClick={() =>
                                  setPreviewId(
                                    previewId === item.id ? "" : item.id,
                                  )
                                }
                              >
                                {previewId === item.id
                                  ? "Close preview"
                                  : "View document"}
                              </button>
                            )}
                            <span className="category">{item.category}</span>
                            {item.status === "ready" && (
                              <span
                                className={`source-badge ${item.suggestion_source === "ollama" ? "ai" : ""}`}
                              >
                                {item.suggestion_source === "ollama"
                                  ? "Local AI"
                                  : "Local rules"}
                              </span>
                            )}
                          </div>
                        </div>
                        {previewId === item.id && item.preview_token && (
                          <DocumentPreview
                            key={item.preview_token}
                            token={item.preview_token}
                            name={item.current_path}
                          />
                        )}
                        {item.status === "ready" ? (
                          <>
                            <div className="comparison">
                              <div className="current">
                                <span className="field-label">
                                  CURRENT PATH
                                </span>
                                <p>{item.current_path}</p>
                                <small>
                                  {(item.size / 1024).toFixed(1)} KB
                                </small>
                              </div>
                              <ArrowRight className="compare-arrow" size={18} />
                              <div className="destination">
                                <span className="field-label">
                                  PROPOSED DESTINATION
                                </span>
                                <div className="destination-fields">
                                  <label>
                                    <span>Folder</span>
                                    <input
                                      aria-label={`Folder for ${item.current_path}`}
                                      value={item.proposed_folder}
                                      maxLength={500}
                                      disabled={!!busy || !item.included}
                                      onChange={(e) =>
                                        edit(item.id, {
                                          proposed_folder: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <span className="slash">/</span>
                                  <label>
                                    <span>File name</span>
                                    <input
                                      aria-label={`Proposed name for ${item.current_path}`}
                                      value={item.proposed_name}
                                      maxLength={120}
                                      disabled={!!busy || !item.included}
                                      onChange={(e) =>
                                        edit(item.id, {
                                          proposed_name: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              </div>
                            </div>
                            <p className="reason">{item.reason}</p>
                            {item.extraction_method === "ocr" && (
                              <span className="source-badge">
                                Text recognized by OCR
                              </span>
                            )}
                            {item.extraction_notes?.map((note) => (
                              <p className="warning" key={note}>
                                {note}
                              </p>
                            ))}
                            {item.provider_note && (
                              <p className="warning">{item.provider_note}</p>
                            )}
                            {item.included &&
                              item.issues.map((issue) => (
                                <p className="warning" key={issue}>
                                  <TriangleAlert size={14} />
                                  {issue}
                                  {dirty && <small> · validate again</small>}
                                </p>
                              ))}
                          </>
                        ) : (
                          <p className="warning">
                            <TriangleAlert size={16} />
                            {item.reason}
                          </p>
                        )}
                      </article>
                    ))}
                  {filter === "attention" && attention === 0 && (
                    <div className="empty">
                      <Check />
                      <h3>All clear in this list</h3>
                      <p>
                        {dirty
                          ? "Validate your edits to refresh the warnings."
                          : "No issues were found in this plan."}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {!!plan.items.length && (
                <div className="plan-footer">
                  <div>
                    <strong>
                      {dirty
                        ? "Your edits are ready to validate"
                        : validated
                          ? "Validation complete"
                          : "A good review makes all the difference."}
                    </strong>
                    <p role="status">
                      {validated
                        ? `${attention} files need review. No originals were changed.`
                        : "Check names and collisions before preparing the organization."}
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={!!busy || selected === 0}
                    onClick={() => void validate()}
                  >
                    {busy === "validate" ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}{" "}
                    Validate plan
                  </button>
                </div>
              )}
            </section>
          )}
          <OperationsPanel
            plan={plan}
            isDemo={isDemo}
            disabled={!!busy}
            onBusy={(value) => setBusy(value ? "operations" : "")}
            onChanged={() => {
              setPlan(null);
              setOriginal(null);
              setValidated(false);
              setDirty(false);
            }}
            onCopyDemo={() => void copyDemo()}
          />
          <footer className="page-footer">
            <ShieldCheck size={14} /> Local by design. Yours by default.
            <span>
              Local extraction <ArrowDown size={12} /> Rules{" "}
              <ArrowDown size={12} /> Review
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
