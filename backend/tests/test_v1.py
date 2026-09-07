import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from backend import main, operations, ocr
from backend.extraction import extract_document, isolated_extract, ExtractionError
from backend.processes import run_worker, WorkerError
from scripts.create_demo import text_pdf
from scripts.create_ocr_demo import create_scan

client = TestClient(main.app)
HEADERS = {"X-FileNest-Client": "local-preview"}


@pytest.fixture
def history_data(tmp_path, monkeypatch):
    monkeypatch.setattr(operations, "DATA_DIR", tmp_path / "history")
    for i in range(61):
        operations.save({"id": f"record-{i}", "created_at": "2026-09-01T12:00:00Z", "root": str(tmp_path / "Formação"),
                         "status": "undone" if i % 2 else "completed", "error": "",
                         "actions": [{"source": f"reunião-{i}.txt", "destination": f"Trabalho/ata-{i}.txt", "state": "moved", "error": ""}]})


def test_history_pagination_search_and_export_preserve_old_records(history_data):
    result = client.post("/api/operations/search", headers=HEADERS, json={}).json()
    assert result["total"] == 61 and result["pages"] == 7 and len(result["items"]) == 10
    last = client.post("/api/operations/search", headers=HEADERS, json={"page": 7}).json()
    assert last["items"][0]["id"] == "record-0"
    search = {"search": "REUNIAO-5", "status": "undone", "page_size": 1}
    matched = client.post("/api/operations/search", headers=HEADERS, json=search).json()
    assert matched["total"] == 6
    exported = client.post("/api/operations/export", headers=HEADERS, json=search).json()
    assert exported["format"] == "filenest-history-v1"
    assert len(exported["operations"]) == 6  # All matches, not just the visible page.
    assert all(r["status"] == "undone" for r in exported["operations"])
    assert client.post("/api/operations/search", headers=HEADERS, json={"search": "' OR 1=1 --"}).json()["total"] == 0
    assert client.post("/api/operations/search", headers=HEADERS, json={"search": "formacao"}).json()["total"] == 61
    assert client.post("/api/operations/search", headers=HEADERS, json={"page": 0}).status_code == 422
    assert client.post("/api/operations/export", json={}).status_code == 403


def test_picker_selection_cancellation_failure_and_security(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "run_worker", lambda *args, **kw: {"path": str(tmp_path)})
    assert client.post("/api/folders/pick", headers=HEADERS).json()["path"] == str(tmp_path.resolve())
    monkeypatch.setattr(main, "run_worker", lambda *args, **kw: {"path": None})
    assert client.post("/api/folders/pick", headers=HEADERS).json() == {"path": None}
    def fail(*args, **kw):
        raise WorkerError("timeout", "expired")
    monkeypatch.setattr(main, "run_worker", fail)
    assert client.post("/api/folders/pick", headers=HEADERS).status_code == 400
    assert not main.picker_lock.locked()
    assert client.post("/api/folders/pick").status_code == 403


def test_worker_timeout_kills_process():
    started = time.monotonic()
    with pytest.raises(WorkerError) as error:
        run_worker("backend.tests.worker_probe", {"action": "sleep"}, timeout=0.5)
    assert error.value.status == "timeout"
    assert time.monotonic() - started < 10


def test_worker_memory_limit_is_enforced():
    result = run_worker("backend.tests.worker_probe", {"action": "memory"}, timeout=10, memory_mb=128)
    assert result["limited"] is True


def test_isolated_extraction_preserves_text_and_errors(tmp_path):
    path = tmp_path / "text.pdf"
    text_pdf(path, ["Fatura ficticia"])
    assert "Fatura ficticia" in isolated_extract(path)["text"]
    path.write_bytes(b"not pdf")
    with pytest.raises(ExtractionError) as error:
        isolated_extract(path)
    assert error.value.status == "unreadable"


def test_missing_ocr_is_actionable(tmp_path, monkeypatch):
    monkeypatch.setattr(ocr, "executable", lambda: None)
    assert client.post("/api/ocr/status", headers=HEADERS).json()["available"] is False
    assert client.post("/api/analyze", headers=HEADERS, json={"path": str(tmp_path), "ocr": True}).status_code == 400


def test_mixed_pdf_reports_unread_pages(tmp_path):
    text = tmp_path / "text.pdf"
    text_pdf(text, ["Fatura ficticia"])
    writer = PdfWriter()
    writer.append(text)
    writer.add_blank_page(width=595, height=842)
    path = tmp_path / "mixed.pdf"
    writer.write(path)
    result = isolated_extract(path)
    assert result["text"].strip() == "Fatura ficticia"
    assert "não foram analisadas" in result["notes"][0]


def test_real_ocr_mixed_pdf_and_unchanged_original(tmp_path):
    if not ocr.status()["available"]:
        pytest.skip("Tesseract with por+eng is optional on contributor machines")
    scan = tmp_path / "scan.pdf"
    create_scan(scan)
    before = scan.read_bytes()
    assert not PdfReader(scan).pages[0].extract_text().strip()
    result = isolated_extract(scan, True)
    assert "FATURA" in result["text"] and "18,90" in result["text"]
    assert result["method"] == "ocr" and scan.read_bytes() == before
    text = tmp_path / "text.pdf"
    text_pdf(text, ["Pagina com texto extraivel"])
    writer = PdfWriter()
    writer.append(text)
    writer.append(scan)
    mixed = tmp_path / "mixed.pdf"
    writer.write(mixed)
    result = isolated_extract(mixed, True)
    assert "Pagina com texto extraivel" in result["text"] and "FATURA" in result["text"]


def test_ocr_page_limit_before_excess_rendering(tmp_path, monkeypatch):
    path = tmp_path / "many.pdf"
    writer = PdfWriter()
    for _ in range(21):
        writer.add_blank_page(width=100, height=100)
    writer.write(path)
    calls = []
    def recognize(*args):
        calls.append(args[1])
        return ""
    monkeypatch.setattr(ocr, "recognize_page", recognize)
    with pytest.raises(ExtractionError) as error:
        extract_document(path, True)
    assert error.value.status == "too_large" and len(calls) == 20
