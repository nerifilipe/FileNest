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
    void pending.then(() => inFlight.delete(key), () => inFlight.delete(key));
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
            e instanceof TypeError ? "Servidor local indisponível." : e.message,
          );
      });
    return () => {
      active = false;
    };
  }, [token, page, attempt]);
  return (
    <section
      className="document-preview"
      aria-label={`Pré-visualização de ${name}`}
    >
      <strong>Documento original · apenas leitura</strong>
      {!data && !error && <p role="status">A carregar a pré-visualização…</p>}
      {error && (
        <div>
          <p role="alert">{error}</p>
          <button className="secondary" onClick={() => setAttempt(attempt + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {data?.kind === "text" && (
        <>
          <pre>{data.text || "O ficheiro está vazio."}</pre>
          {data.truncated && (
            <p>Pré-visualização limitada aos primeiros 50 000 caracteres.</p>
          )}
        </>
      )}
      {data?.kind === "image" && (
        <>
          <img
            src={`data:image/png;base64,${data.image}`}
            alt={`Página ${data.page} de ${name}`}
          />
          <nav aria-label={`Páginas de ${name}`}>
            <button
              className="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Página anterior
            </button>
            <span>
              {page} / {data.pages}
            </span>
            <button
              className="secondary"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
            >
              Página seguinte
            </button>
          </nav>
          <p>Imagem da página. Links e scripts do PDF não são executados.</p>
        </>
      )}
    </section>
  );
}
