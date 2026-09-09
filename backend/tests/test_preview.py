import base64
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter

from backend import main, operations, preview

client = TestClient(main.app)
HEADERS = {"X-FileNest-Client": "local-preview"}


def test_preview_requires_analysis_token_and_unchanged_document(tmp_path):
    path = tmp_path / "note.txt"
    path.write_text("<script>alert('data only')</script>", encoding="utf-8")
    plan = client.post("/api/analyze", headers=HEADERS, json={"path": str(tmp_path)}).json()
    token = plan["items"][0]["preview_token"]
    result = client.post("/api/preview", headers=HEADERS, json={"token": token})
    assert result.status_code == 200 and result.headers["cache-control"] == "no-store"
    assert result.json()["text"] == path.read_text(encoding="utf-8")
    assert client.post("/api/preview", json={"token": token}).status_code == 403
    assert client.post("/api/preview", headers=HEADERS, json={"token": "0" * 32}).status_code == 400
    assert client.post("/api/preview", headers=HEADERS, json={"path": str(path)}).status_code == 422
    path.write_text("changed", encoding="utf-8")
    assert client.post("/api/preview", headers=HEADERS, json={"token": token}).status_code == 400


def test_scanned_pdf_preview_pages_and_original_integrity(tmp_path):
    path = tmp_path / "pages.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=300, height=400)
    writer.add_blank_page(width=500, height=200)
    writer.write(path)
    original = path.read_bytes()
    plan = client.post("/api/analyze", headers=HEADERS, json={"path": str(tmp_path)}).json()
    item = plan["items"][0]
    assert item["status"] == "ocr_required" and item["preview_token"]
    response = client.post("/api/preview", headers=HEADERS, json={"token": item["preview_token"], "page": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["pages"] == 2 and data["page"] == 2 and data["kind"] == "image"
    with Image.open(BytesIO(base64.b64decode(data["image"]))) as image:
        assert image.width > image.height
    assert path.read_bytes() == original
    assert client.post("/api/preview", headers=HEADERS, json={"token": item["preview_token"], "page": 3}).status_code == 400


def test_preview_expiration_and_nested_link_revalidation(tmp_path, monkeypatch):
    directory = tmp_path / "nested"
    directory.mkdir()
    path = directory / "note.txt"
    path.write_text("data", encoding="utf-8")
    token = preview.register(tmp_path, "nested/note.txt", operations.fingerprint(path))
    original = operations.is_link
    monkeypatch.setattr(operations, "is_link", lambda p: p == directory or original(p))
    assert client.post("/api/preview", headers=HEADERS, json={"token": token}).status_code == 400
    monkeypatch.setattr(preview.time, "monotonic", lambda: 10**15)
    assert "expired" in client.post("/api/preview", headers=HEADERS, json={"token": token}).json()["detail"]
