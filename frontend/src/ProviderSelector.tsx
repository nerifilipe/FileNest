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
          "Could not check Ollama. Make sure the updated backend is running.",
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
      <label htmlFor="suggestion-provider">Suggestion engine</label>
      <select
        id="suggestion-provider"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Provider)}
      >
        <option value="demo-rules">Local rules · fast, no AI</option>
        <option value="ollama">Local AI · Qwen3 4B via Ollama</option>
      </select>
      {value === "ollama" ? (
        <>
          <p>
            Up to 20 documents, one at a time. Only the first 6,000 characters
            are sent to Ollama on this computer. No documents leave your device.
          </p>
          <div className="provider-status">
            <span className={status?.available ? "available" : ""}>
              {checking ? "Checking Ollama…" : status?.message}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={disabled || checking}
              onClick={() => void check()}
            >
              Check Ollama
            </button>
            {status && !status.available && (
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => onChange("demo-rules")}
              >
                Use local rules
              </button>
            )}
          </div>
        </>
      ) : (
        <p>Predictable keyword matching. No Ollama or model needed.</p>
      )}
    </div>
  );
}
