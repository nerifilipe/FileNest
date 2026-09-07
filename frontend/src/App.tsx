import { useState } from "react";
import OperationsPanel from "./OperationsPanel";
import { request } from "./api";
import ProviderSelector, { type Provider } from "./ProviderSelector";
import OcrControls from "./OcrControls";
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
};
export type Plan = {
  root: string;
  provider: string;
  items: FileItem[];
  warnings: string[];
};

export default function App() {
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
      const result = await request<Plan>("analyze", {
        path,
        demo,
        provider,
        ocr: useOcr,
      });
      setPlan(result);
      setOriginal(structuredClone(result));
      setDirty(false);
      setFilter("all");
      setIsDemo(demo);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Não foi possível contactar o servidor local. Confirme que o backend está a executar na porta 8000."
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
          ? "Servidor local indisponível. As suas edições continuam nesta página."
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
      const result = await request<Plan>("analyze", {
        path: copy.path,
        provider,
        ocr: useOcr,
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
    setFolderMessage("Escolha uma pasta na janela do sistema.");
    try {
      const result = await request<{ path: string | null }>("folders/pick", {});
      if (result.path) {
        setPath(result.path);
        setFolderMessage(
          "Pasta selecionada. Clique em Analisar pasta para continuar.",
        );
      } else
        setFolderMessage("Seleção cancelada. O caminho anterior foi mantido.");
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
        <div className="workspace-label">ESPAÇO LOCAL</div>
        <div className="nav-item">
          <FolderOpen size={18} /> Organizador <span>01</span>
        </div>
        <div className="sidebar-note">
          <LockKeyhole size={19} />
          <strong>
            Os seus ficheiros,
            <br />
            no seu computador.
          </strong>
          <p>
            A análise corre localmente. Nenhum conteúdo é enviado para serviços
            externos.
          </p>
          <span className="local-dot">Sem ligação a IA externa</span>
        </div>
        <div className="sidebar-footer">
          Feito para pôr tudo no lugar.
          <br />
          <span>FileNest · versão 1.0</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Espaço local <ChevronRight size={14} />
            <strong>Organizador</strong>
          </span>
          <span className="readonly">
            <ShieldCheck size={15} /> Alterações só com aprovação
          </span>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">MENOS CONFUSÃO. MAIS CLAREZA.</div>
              <h1>Um lugar para cada ficheiro.</h1>
              <p>Descubra o que tem. Veja onde faz sentido guardar.</p>
            </div>
            <span className="mode-pill">
              <span />{" "}
              {(plan?.provider ?? provider) === "ollama"
                ? "IA local · Qwen3 4B"
                : "Regras locais · sem IA"}
            </span>
          </section>
          <ol className="steps">
            <li className="active">
              <span>{plan ? <Check size={14} /> : "1"}</span> Escolher pasta
            </li>
            <li className={plan ? "active" : ""}>
              <span>2</span> Rever sugestões
            </li>
            <li>
              <span>3</span> Organizar e desfazer
            </li>
          </ol>
          <section className="source-panel">
            <div className="section-title">
              <div className="icon-box">
                <FolderOpen size={21} />
              </div>
              <div>
                <h2>Comece por uma pasta</h2>
                <p>
                  PDFs com texto e ficheiros TXT · até{" "}
                  {provider === "ollama" ? 20 : 100} documentos · 10 MB por
                  ficheiro
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
              <label htmlFor="folder-path">Caminho da pasta local</label>
              <div className="path-row">
                <div className="path-input">
                  <Folder size={18} />
                  <input
                    id="folder-path"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="C:\Users\OSeuNome\Documents\Por organizar"
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
                  {busy === "picker" ? "Janela aberta…" : "Escolher pasta"}
                </button>
                <button className="primary" disabled={!!busy || !path.trim()}>
                  {busy === "analyze" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}{" "}
                  Analisar pasta
                </button>
              </div>
              {folderMessage && (
                <p className="folder-message" aria-live="polite">
                  {folderMessage}
                </p>
              )}
            </form>
            <OcrControls
              enabled={useOcr}
              onChange={setUseOcr}
              disabled={!!busy}
            />
            <div className="source-bottom">
              <span>
                <LockKeyhole size={13} /> A análise não altera os originais.
              </span>
              <button
                className="text-button"
                onClick={() => void analyze(true)}
                disabled={!!busy}
              >
                <Play size={14} /> Experimentar demonstração{" "}
                <ArrowRight size={14} />
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
                ? "A analisar com IA local… O primeiro documento pode demorar enquanto o modelo carrega."
                : "A extrair texto e a preparar sugestões locais…"}
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
              <h2>Da pasta desorganizada ao plano claro.</h2>
              <p>
                Escolha uma pasta ou explore documentos fictícios.
                <br />
                Reveja nomes e destinos antes de qualquer alteração.
              </p>
              <button className="secondary" onClick={() => void analyze(true)}>
                <Play size={15} /> Explorar exemplo
              </button>
              <div className="preview-example">
                <span>scan_001.pdf</span>
                <ArrowRight size={16} />
                <strong>Financas/2026-09-01_fatura.pdf</strong>
              </div>
            </section>
          )}
          {plan && (
            <section className="results" aria-busy={!!busy}>
              <div className="results-heading">
                <div>
                  <h2>
                    O seu plano de organização{" "}
                    <span className="count">{plan.items.length}</span>
                  </h2>
                  <p className="root-path">
                    {isDemo
                      ? "Documentos fictícios · examples/demo"
                      : plan.root}
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
                  <RotateCcw size={14} /> Repor sugestões
                </button>
              </div>
              <div className="demo-notice">
                <span className="rule-tag">
                  {plan.provider === "ollama" ? "IA LOCAL" : "REGRAS LOCAIS"}
                </span>
                {plan.provider === "ollama"
                  ? `${plan.items.filter((i) => i.status === "ready" && i.suggestion_source === "ollama").length} sugestão(ões) da IA · ${plan.items.filter((i) => i.status === "ready" && i.suggestion_source === "demo-rules").length} por regras. Reveja os resultados: a IA pode errar.`
                  : "Sugestões determinísticas por palavras-chave. Não são resultados de inteligência artificial."}
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
                    Todos <span>{plan.items.length}</span>
                  </button>
                  <button
                    className={filter === "attention" ? "selected" : ""}
                    onClick={() => setFilter("attention")}
                  >
                    A rever <span>{attention}</span>
                  </button>
                </div>
                <span>{selected} incluídos no plano</span>
              </div>
              {!plan.items.length ? (
                <div className="empty">
                  <FolderOpen size={32} />
                  <h3>Nenhum documento compatível</h3>
                  <p>
                    Esta pasta não contém PDFs ou TXT no primeiro nível.
                    <br />
                    Escolha outra pasta ou experimente a demonstração.
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
                        className={`file-card ${!item.included ? "excluded" : ""}`}
                        key={item.id}
                      >
                        <div className="file-top">
                          <label className="file-select">
                            <input
                              type="checkbox"
                              aria-label={`Incluir ${item.current_path}`}
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
                            <span className="category">{item.category}</span>
                            {item.status === "ready" && (
                              <span
                                className={`source-badge ${item.suggestion_source === "ollama" ? "ai" : ""}`}
                              >
                                {item.suggestion_source === "ollama"
                                  ? "IA local"
                                  : "Regras locais"}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.status === "ready" ? (
                          <>
                            <div className="comparison">
                              <div className="current">
                                <span className="field-label">
                                  CAMINHO ATUAL
                                </span>
                                <p>{item.current_path}</p>
                                <small>
                                  {(item.size / 1024).toFixed(1)} KB
                                </small>
                              </div>
                              <ArrowRight className="compare-arrow" size={18} />
                              <div className="destination">
                                <span className="field-label">
                                  DESTINO PROPOSTO
                                </span>
                                <div className="destination-fields">
                                  <label>
                                    <span>Subpasta</span>
                                    <input
                                      aria-label={`Subpasta de ${item.current_path}`}
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
                                    <span>Nome do ficheiro</span>
                                    <input
                                      aria-label={`Nome proposto de ${item.current_path}`}
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
                                Texto reconhecido por OCR
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
                                  {dirty && <small> · revalidar</small>}
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
                      <h3>Nada a rever nesta lista</h3>
                      <p>
                        {dirty
                          ? "Valide as suas edições para atualizar os avisos."
                          : "Não foram detetados problemas no plano."}
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
                        ? "Existem edições por validar"
                        : validated
                          ? "Validação concluída"
                          : "Tudo começa com uma boa revisão."}
                    </strong>
                    <p role="status">
                      {validated
                        ? `${attention} ficheiro(s) a rever. Nenhum original foi alterado.`
                        : "Valide nomes e colisões antes de preparar a organização."}
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
                    Validar plano
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
            <ShieldCheck size={14} /> Privado por natureza. Seguro por decisão.
            <span>
              Extração local <ArrowDown size={12} /> Regras{" "}
              <ArrowDown size={12} /> Revisão
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
