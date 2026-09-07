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

  async function refresh() {
    setRecords(await request<Operation[]>("operations/history", {}));
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
      await refresh();
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
          <p>As últimas 50 operações, guardadas neste computador.</p>
        </div>
        <button
          className="text-button"
          disabled={disabled || pending}
          onClick={() =>
            void refresh()
              .then(() => setError(""))
              .catch(() => setError("Não foi possível atualizar o histórico."))
          }
        >
          <RotateCcw size={14} /> Atualizar histórico
        </button>
      </div>
      {!records.length && (
        <p className="history-empty">
          Ainda não existem operações. O histórico aparecerá aqui quando
          preparar uma organização.
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
    </section>
  );
}
