import { useEffect, useState } from "react";
import { request } from "./api";

export type Provider = "demo-rules" | "ollama";
type Status = { available: boolean; model: string; message: string };

export default function ProviderSelector({
  value,
  onChange,
  disabled,
}: {
  value: Provider;
  onChange: (value: Provider) => void;
  disabled: boolean;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      setStatus(await request<Status>("ai/status", {}));
    } catch {
      setStatus({
        available: false,
        model: "qwen3:4b",
        message:
          "Não foi possível verificar o Ollama. Confirme que reiniciou o backend atualizado.",
      });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (value === "ollama") void check();
  }, [value]);
  return (
    <div className="provider-selector">
      <label htmlFor="suggestion-provider">Como gerar sugestões</label>
      <select
        id="suggestion-provider"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Provider)}
      >
        <option value="demo-rules">Regras locais · rápido, sem IA</option>
        <option value="ollama">IA local · Qwen3 4B via Ollama</option>
      </select>
      {value === "ollama" ? (
        <>
          <p>
            Até 20 documentos, um de cada vez. Apenas os primeiros 6000
            caracteres são enviados ao Ollama neste computador. Nenhum serviço
            externo recebe os documentos.
          </p>
          <div className="provider-status">
            <span className={status?.available ? "available" : ""}>
              {checking ? "A verificar o Ollama…" : status?.message}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={disabled || checking}
              onClick={() => void check()}
            >
              Verificar Ollama
            </button>
            {status && !status.available && (
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => onChange("demo-rules")}
              >
                Usar regras locais
              </button>
            )}
          </div>
        </>
      ) : (
        <p>
          Classificação determinística por palavras-chave. Funciona sem Ollama e
          sem modelo.
        </p>
      )}
    </div>
  );
}
