from pathlib import Path
from pypdf import PdfReader

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 100
MAX_TEXT = 50_000


class ExtractionError(ValueError):
    def __init__(self, status: str, message: str):
        self.status = status
        super().__init__(message)


def extract_text(path: Path) -> str:
    """Read bounded local input; extracted content is data, never instructions."""
    try:
        with path.open("rb") as stream:
            data = stream.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ExtractionError("too_large", "O ficheiro excede o limite de 10 MB.")
        if path.suffix.lower() == ".txt":
            text = data.decode("utf-8-sig")
        else:
            from io import BytesIO
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted:
                raise ExtractionError("protected", "PDF protegido. Forneça uma cópia sem proteção.")
            if len(reader.pages) > MAX_PAGES:
                raise ExtractionError("too_large", "O PDF excede o limite de 100 páginas.")
            chunks = []
            length = 0
            for page in reader.pages:
                # Bound each decompressed page before text extraction.
                content = page.get_contents()
                if content is not None and len(content.get_data()) > MAX_BYTES:
                    raise ExtractionError("too_large", "Página PDF demasiado complexa para esta versão.")
                chunk = page.extract_text() or ""
                chunks.append(chunk)
                length += len(chunk)
                if length >= MAX_TEXT:
                    break
            text = "\n".join(chunks)
        if not text.strip():
            if path.suffix.lower() == ".pdf":
                raise ExtractionError("ocr_required", "Sem texto extraível. Pode ser necessário OCR.")
            raise ExtractionError("empty", "O ficheiro de texto está vazio.")
        return text[:MAX_TEXT]
    except ExtractionError:
        raise
    except (OSError, UnicodeError):
        raise ExtractionError("unreadable", "Não foi possível ler o ficheiro. Verifique as permissões e a codificação UTF-8.") from None
    except Exception:
        raise ExtractionError("unreadable", "PDF inválido ou ilegível.") from None
