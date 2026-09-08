"""Render PDF pages as inert images; never expose PDF scripts to the browser."""
import base64
from io import BytesIO
import json
from pathlib import Path

from .processes import read_payload


def render(payload):
    from .extraction import MAX_BYTES, MAX_PAGES, MAX_TEXT
    path = Path(payload["path"])
    with path.open("rb") as stream:
        data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("O ficheiro excede 10 MB.")
    if path.suffix.lower() == ".txt":
        text = data.decode("utf-8-sig")
        return {"kind": "text", "text": text[:MAX_TEXT], "truncated": len(text) > MAX_TEXT, "pages": 1, "page": 1}
    if path.suffix.lower() != ".pdf":
        raise ValueError("Formato não suportado.")
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(data) as pdf:
        count = len(pdf)
        number = payload["page"]
        if count > MAX_PAGES or not 1 <= number <= count:
            raise ValueError("Página inválida ou PDF com mais de 100 páginas.")
        page = pdf[number - 1]
        bitmap = None
        try:
            width, height = page.get_size()
            if width <= 0 or height <= 0:
                raise ValueError("Dimensões de página inválidas.")
            bitmap = page.render(scale=min(1.5, 1400 / max(width, height)))
            image = bitmap.to_pil()
            try:
                output = BytesIO()
                image.save(output, format="PNG")
            finally:
                image.close()
            return {"kind": "image", "image": base64.b64encode(output.getvalue()).decode("ascii"), "page": number, "pages": count}
        finally:
            if bitmap is not None:
                bitmap.close()
            page.close()


if __name__ == "__main__":
    payload = read_payload()
    try:
        result = render(payload)
    except Exception:
        result = {"error": "Não foi possível pré-visualizar este documento. Pode estar protegido, ilegível ou exceder os limites."}
    print(json.dumps(result))
