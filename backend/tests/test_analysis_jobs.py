import time
from threading import Event

from fastapi.testclient import TestClient

from backend import main
from backend.analysis_jobs import AnalysisJobs

client = TestClient(main.app)
HEADERS = {"X-FileNest-Client": "local-preview"}


def poll(job_id):
    for _ in range(200):
        result = client.post(f"/api/analysis/{job_id}/status", headers=HEADERS).json()
        if result["status"] != "running":
            return result
        time.sleep(0.01)
    raise AssertionError("Job did not terminate")


def test_progress_cancel_partial_results_and_restart(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "jobs", AnalysisJobs())
    for name in ["a.txt", "b.txt"]:
        (tmp_path / name).write_text("Reuniao de projeto", encoding="utf-8")
    entered, release = Event(), Event()
    calls = []
    def extraction(path, ocr):
        calls.append(path.name)
        entered.set()
        assert release.wait(5)
        return {"text": "Reuniao de projeto", "method": "text", "notes": []}
    monkeypatch.setattr(main, "isolated_extract", extraction)
    body = {"path": str(tmp_path), "background": True}
    response = client.post("/api/analyze", headers=HEADERS, json=body)
    job_id = response.json()["id"]
    try:
        assert entered.wait(3)
        current = client.post(f"/api/analysis/{job_id}/status", headers=HEADERS).json()
        assert current["total"] == 2 and current["completed"] == 0 and current["current"] == "a.txt"
        assert client.post("/api/analyze", headers=HEADERS, json=body).status_code == 409
        assert client.post(f"/api/analysis/{job_id}/cancel").status_code == 403
        cancelled = client.post(f"/api/analysis/{job_id}/cancel", headers=HEADERS).json()
        assert cancelled["cancel_requested"] and cancelled["status"] == "running"
    finally:
        release.set()
    result = poll(job_id)
    assert result["status"] == "cancelled" and result["completed"] == 1
    assert calls == ["a.txt"]
    assert len(result["plan"]["items"]) == 1 and result["plan"]["warnings"]
    assert (tmp_path / "a.txt").read_text(encoding="utf-8") == "Reuniao de projeto"
    second = client.post("/api/analyze", headers=HEADERS, json=body).json()
    assert poll(second["id"])["status"] == "completed"
    assert client.post(f"/api/analysis/{job_id}/status", headers=HEADERS).status_code == 404


def test_background_errors_and_empty_folder(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "jobs", AnalysisJobs())
    job = client.post("/api/analyze", headers=HEADERS, json={"path": str(tmp_path / "missing"), "background": True}).json()
    result = poll(job["id"])
    assert result["status"] == "failed" and result["error"]
    job = client.post("/api/analyze", headers=HEADERS, json={"path": str(tmp_path), "background": True}).json()
    result = poll(job["id"])
    assert result["status"] == "completed" and result["total"] == 0 and result["plan"]["items"] == []
    assert client.post(f"/api/analysis/{job['id']}/status").status_code == 403
