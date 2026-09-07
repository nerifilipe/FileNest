"""Optional local OCR. No downloads and no writes to the source PDF."""
import os
import shutil
import subprocess
from pathlib import Path

MAX_OCR_PAGES = 20
MAX_PIXELS = 16_000_000


def language_args():
    directory = Path(os.environ.get("FILENEST_TESSDATA", str(Path(__file__).resolve().parents[1] / ".filenest/tessdata")))
    return ["--tessdata-dir", str(directory)] if directory.is_dir() else []


def executable():
    configured = os.environ.get("FILENEST_TESSERACT")
    candidates = [configured, shutil.which("tesseract"),
                  str(Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Tesseract-OCR/tesseract.exe"),
                  str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Tesseract-OCR/tesseract.exe")]
    return next((str(Path(p).absolute()) for p in candidates if p and Path(p).is_file()), None)


def status():
    command = executable()
    if not command:
        return {"available": False, "message": "OCR indisponível. Instale Tesseract com os idiomas português e inglês; consulte o README.", "languages": []}
    try:
        response = subprocess.run([command, *language_args(), "--list-langs"], capture_output=True, timeout=5,
                                  creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        languages = response.stdout.decode("utf-8", errors="replace").splitlines()
        if response.returncode != 0 or not {"por", "eng"}.issubset(languages):
            return {"available": False, "message": "Instale os idiomas por e eng no Tesseract para ativar OCR.", "languages": languages[1:]}
        return {"available": True, "message": "OCR local disponível · português e inglês.", "languages": ["por", "eng"]}
    except (OSError, subprocess.TimeoutExpired):
        return {"available": False, "message": "Não foi possível iniciar o Tesseract local.", "languages": []}


def recognize_page(pdf, index: int, scratch: Path) -> str:
    from .extraction import ExtractionError, MAX_TEXT
    page = pdf[index]
    bitmap = None
    try:
        width, height = page.get_size()
        scale = 2.0
        if width <= 0 or height <= 0 or width * height * scale * scale > MAX_PIXELS:
            raise ExtractionError("too_large", "A página excede o limite de 16 megapíxeis para OCR.")
        bitmap = page.render(scale=scale)
        image_path = scratch / "page.png"
        image = bitmap.to_pil()
        image.save(image_path)
        image.close()
        command = executable()
        if not command:
            raise ExtractionError("ocr_unavailable", "Tesseract indisponível. Consulte a configuração de OCR.")
        # Output is bounded by the worker job memory limit, then truncated for the app.
        result = subprocess.run([command, str(image_path), "stdout", *language_args(), "-l", "por+eng", "--psm", "3"],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode != 0:
            raise ExtractionError("ocr_failed", "O OCR não conseguiu ler esta página.")
        return result.stdout.decode("utf-8", errors="replace")[:MAX_TEXT]
    except subprocess.TimeoutExpired:
        raise ExtractionError("timeout", "O OCR excedeu 25 segundos numa página.") from None
    finally:
        if bitmap is not None:
            bitmap.close()
        page.close()
