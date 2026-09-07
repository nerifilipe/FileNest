import { useEffect, useState } from "react";
import { request } from "./api";

export default function OcrControls({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      setMessage(
        (await request<{ message: string }>("ocr/status", {})).message,
      );
    } catch {
      setMessage(
        "Não foi possível verificar o OCR. Reinicie o backend e tente novamente.",
      );
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    if (enabled) void check();
  }, [enabled]);
  return (
    <div className="ocr-controls">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />{" "}
        Reconhecer PDFs digitalizados com OCR local
      </label>
      <p>
        Português e inglês · até 20 páginas sem texto por documento. O PDF
        original não é regravado.
      </p>
      {enabled && (
        <div className="provider-status">
          <span>{checking ? "A verificar o OCR…" : message}</span>
          <button
            type="button"
            className="text-button"
            disabled={checking || disabled}
            onClick={() => void check()}
          >
            Verificar OCR
          </button>
        </div>
      )}
    </div>
  );
}
