from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import main, operations, scanning
from backend.models import Plan

client = TestClient(main.app)
HEADERS = {"X-FileNest-Client": "local-preview"}


def analyze(root, **options):
    return client.post("/api/analyze", headers=HEADERS, json={"path": str(root), **options})


def write(root, relative, text="Reuniao de projeto em 2026-09-08"):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_opt_in_unique_paths_collisions_and_nested_round_trip(tmp_path, monkeypatch):
    root = tmp_path / "documents"
    first = write(root, "A/nota.txt")
    second = write(root, "B/Arquivo/nota.txt")
    originals = {p: p.read_bytes() for p in [first, second]}
    assert analyze(root).json()["items"] == []
    response = analyze(root, recursive=True)
    assert response.status_code == 200
    plan = Plan.model_validate(response.json())
    assert [i.id for i in plan.items] == ["A/nota.txt", "B/Arquivo/nota.txt"]
    assert all(i.issues for i in plan.items)  # Same proposed destination.
    for i, item in enumerate(plan.items):
        item.proposed_name = f"reuniao-{i}.txt"
    monkeypatch.setattr(operations, "DATA_DIR", tmp_path / "history")
    record = operations.prepare(plan)
    assert [a["source"] for a in record["actions"]] == [i.current_path for i in plan.items]
    assert operations.organize(record["id"])["status"] == "completed"
    assert not first.exists() and not second.exists()
    assert operations.undo(record["id"])["status"] == "undone"
    assert all(p.read_bytes() == content for p, content in originals.items())


@pytest.mark.parametrize("source", ["../outside.txt", "A/../../outside.txt", "A//nota.txt", "A/./nota.txt", "A\\nota.txt", "/nota.txt", "C:/nota.txt"])
def test_nested_source_traversal_is_rejected(tmp_path, monkeypatch, source):
    write(tmp_path, "A/nota.txt")
    plan = Plan.model_validate(analyze(tmp_path, recursive=True).json())
    monkeypatch.setattr(operations, "DATA_DIR", tmp_path / "history")
    plan.items[0].current_path = source
    with pytest.raises(ValueError):
        operations.prepare(plan)


def test_recursive_limits_are_global_and_depth_is_bounded(tmp_path, monkeypatch):
    write(tmp_path, "A/a.txt")
    write(tmp_path, "B/b.txt")
    monkeypatch.setattr(scanning, "MAX_DOCUMENTS", 1)
    assert analyze(tmp_path, recursive=True).status_code == 400
    monkeypatch.setattr(scanning, "MAX_DOCUMENTS", 100)
    monkeypatch.setattr(scanning, "MAX_ENTRIES", 3)
    assert analyze(tmp_path, recursive=True).status_code == 400
    monkeypatch.setattr(scanning, "MAX_ENTRIES", 2000)
    monkeypatch.setattr(scanning, "MAX_DEPTH", 1)
    write(tmp_path, "A/deeper/c.txt")
    assert analyze(tmp_path, recursive=True).status_code == 400
    assert not main.analysis_lock.locked()


def test_link_directory_is_skipped_without_traversal(tmp_path, monkeypatch):
    write(tmp_path, "linked/secret.txt")
    write(tmp_path, "normal/ok.txt")
    original = scanning.is_link
    monkeypatch.setattr(scanning, "is_link", lambda p: p.name == "linked" or original(p))
    result = analyze(tmp_path, recursive=True).json()
    assert [i["id"] for i in result["items"]] == ["normal/ok.txt"]
    assert any("linked" in warning for warning in result["warnings"])


def test_unreadable_subfolder_does_not_return_an_incomplete_plan(tmp_path, monkeypatch):
    write(tmp_path, "blocked/a.txt")
    original = scanning.os.scandir
    def denied(path):
        if Path(path).name == "blocked":
            raise PermissionError()
        return original(path)
    monkeypatch.setattr(scanning.os, "scandir", denied)
    assert analyze(tmp_path, recursive=True).status_code == 400


def test_nested_changed_file_blocks_undo(tmp_path, monkeypatch):
    write(tmp_path, "A/nota.txt")
    plan = Plan.model_validate(analyze(tmp_path, recursive=True).json())
    monkeypatch.setattr(operations, "DATA_DIR", tmp_path / "history")
    record = operations.prepare(plan)
    operations.organize(record["id"])
    destination = tmp_path / record["actions"][0]["destination"]
    destination.write_text("Changed after organization", encoding="utf-8")
    assert operations.undo(record["id"])["status"] == "undo_partial"
    assert destination.read_text(encoding="utf-8") == "Changed after organization"
