import { useEffect, useState } from "react";
import { request } from "./api";

// Share concurrent reads (including React StrictMode's effect replay), not content caches.
const inFlight = new Map<string, Promise<Preview>>();
function readPreview(token: string, page: number) {
  const key = `${token}:${page}`;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = request<Preview>("preview", { token, page });
    inFlight.set(key, pending);
    void pending.then(
      () => inFlight.delete(key),
      () => inFlight.delete(key),
    );
  }
  return pending;
}

type Preview = {
  kind: "text" | "image";
  text?: string;
  image?: string;
  truncated?: boolean;
  page: number;
  pages: number;
};

export default function DocumentPreview({
  token,
  name,
}: {
  token: string;
  name: string;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void readPreview(token, page)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof TypeError ? "Local server unavailable." : e.message,
          );
      });
    return () => {
      active = false;
    };
  }, [token, page, attempt]);
  return (
    <section className="document-preview" aria-label={`Preview of ${name}`}>
      <strong>Original document · read only</strong>
      {!data && !error && <p role="status">Loading preview…</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button className="secondary" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </button>
        </div>
      )}
      {data?.kind === "text" && (
        <>
          <pre>{data.text || "This file is empty."}</pre>
          {data.truncated && (
            <p>Preview limited to the first 50,000 characters.</p>
          )}
        </>
      )}
      {data?.kind === "image" && (
        <>
          <img
            src={`data:image/png;base64,${data.image}`}
            alt={`Page ${data.page} of ${name}`}
          />
          <nav aria-label={`Pages of ${name}`}>
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous page
            </button>
            <span>
              {page} / {data.pages}
            </span>
            <button
              className="secondary"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
            >
              Next page
            </button>
          </nav>
          <p>Page image. PDF links and scripts are not executed.</p>
        </>
      )}
    </section>
  );
}
