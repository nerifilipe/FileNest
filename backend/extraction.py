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
    """Convenience interface for unit tests. The API uses isolated_extract."""
    return extract_document(path)["text"]


def extract_document(path: Path, use_ocr: bool = False, scratch: str | None = None) -> dict:
    """Read bounded local input; extracted content is data, never instructions."""
    from contextlib import ExitStack
    from . import ocr
    notes = []
    ocr_pages = 0
    missing_pages = 0
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
            with ExitStack() as resources:
                rendered_pdf = None
                for index, page in enumerate(reader.pages):
                    content = page.get_contents()
                    if content is not None and len(content.get_data()) > MAX_BYTES:
                        raise ExtractionError("too_large", "Página PDF demasiado complexa para esta versão.")
                    chunk = page.extract_text() or ""
                    if not chunk.strip():
                        missing_pages += 1
                        if use_ocr:
                            if missing_pages > ocr.MAX_OCR_PAGES:
                                raise ExtractionError("too_large", "O documento excede 20 páginas que necessitam de OCR.")
                            if rendered_pdf is None:
                                import pypdfium2 as pdfium
                                rendered_pdf = resources.enter_context(pdfium.PdfDocument(data))
                                if not scratch:
                                    import tempfile
                                    scratch = resources.enter_context(tempfile.TemporaryDirectory(prefix="filenest-ocr-"))
                            chunk = ocr.recognize_page(rendered_pdf, index, Path(scratch))
                            ocr_pages += 1
                    chunks.append(chunk)
                    length += len(chunk)
                    if length >= MAX_TEXT:
                        notes.append("Texto limitado aos primeiros 50 000 caracteres extraídos.")
                        break
            text = "\n".join(chunks)
        if not text.strip():
            if path.suffix.lower() == ".pdf":
                if use_ocr:
                    raise ExtractionError("ocr_no_text", "O OCR não encontrou texto legível. O PDF pode estar vazio ou ter baixa qualidade.")
                raise ExtractionError("ocr_required", "Sem texto extraível. Pode ser necessário OCR.")
            raise ExtractionError("empty", "O ficheiro de texto está vazio.")
        if missing_pages and not use_ocr:
            notes.append(f"{missing_pages} página(s) sem texto extraível não foram analisadas. Ative OCR para as incluir.")
        if ocr_pages:
            notes.append(f"OCR local aplicado a {ocr_pages} página(s). Reveja possíveis erros de reconhecimento.")
        return {"text": text[:MAX_TEXT], "method": "ocr" if ocr_pages else "text", "notes": notes}
    except ExtractionError:
        raise
    except MemoryError:
        raise ExtractionError("resource_limit", "A extração excedeu a memória disponível.") from None
    except (OSError, UnicodeError):
        raise ExtractionError("unreadable", "Não foi possível ler o ficheiro. Verifique as permissões e a codificação UTF-8.") from None
    except Exception:
        raise ExtractionError("unreadable", "PDF inválido ou ilegível.") from None


def isolated_extract(path: Path, use_ocr: bool = False) -> dict:
    from tempfile import TemporaryDirectory
    from .processes import run_worker, WorkerError
    try:
        # Owned by parent so it is removed even when a worker times out/crashes.
        with TemporaryDirectory(prefix="filenest-extract-") as scratch:
            result = run_worker("backend.extraction_worker", {"path": str(path), "ocr": use_ocr, "scratch": scratch},
                                timeout=90 if use_ocr else 30, memory_mb=768)
        if "error" in result:
            raise ExtractionError(result["status"], result["error"])
        return result
    except WorkerError as error:
        raise ExtractionError(error.status, str(error)) from None
