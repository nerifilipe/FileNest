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
      setMessage("Could not check OCR. Restart the backend and try again.");
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
        Read scanned PDFs with local OCR
      </label>
      <p>
        English text recognition · up to 20 scanned pages per document. Original
        PDFs stay untouched.
      </p>
      {enabled && (
        <div className="provider-status">
          <span>{checking ? "Checking OCR…" : message}</span>
          <button
            type="button"
            className="text-button"
            disabled={checking || disabled}
            onClick={() => void check()}
          >
            Check OCR
          </button>
        </div>
      )}
    </div>
  );
}
