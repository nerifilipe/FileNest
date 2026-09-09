import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import operations
from backend.main import app
from backend.models import Plan

HEADERS = {"X-FileNest-Client": "local-preview"}
client = TestClient(app)


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(operations, "DATA_DIR", tmp_path / "history")
    root = tmp_path / "documents"
    root.mkdir()
    (root / "first.txt").write_text("Fatura 2026-09-01", encoding="utf-8")
    (root / "second.txt").write_text("Aula 2026-09-02", encoding="utf-8")
    return root


def analyze(root):
    response = client.post("/api/analyze", json={"path": str(root)}, headers=HEADERS)
    assert response.status_code == 200
    return Plan(**response.json())


def test_prepare_apply_undo_and_idempotency(workspace):
    before = {p.name: p.read_bytes() for p in workspace.iterdir()}
    record = operations.prepare(analyze(workspace))
    assert record["status"] == "prepared"
    assert {p.name: p.read_bytes() for p in workspace.iterdir()} == before
    result = operations.organize(record["id"])
    assert result["status"] == "completed"
    for action in result["actions"]:
        assert not (workspace / action["source"]).exists()
        assert (workspace / action["destination"]).read_bytes() == before[action["source"]]
    assert operations.organize(record["id"]) == result
    restored = operations.undo(record["id"])
    assert restored["status"] == "undone"
    assert operations.undo(record["id"]) == restored
    assert {p.name: p.read_bytes() for p in workspace.iterdir() if p.is_file()} == before
    assert operations.history()[0]["status"] == "undone"


def test_explicit_approval_required(workspace):
    plan = analyze(workspace)
    response = client.post("/api/operations/prepare", json=plan.model_dump(), headers=HEADERS)
    assert response.status_code == 200
    operation_id = response.json()["id"]
    url = f"/api/operations/{operation_id}"
    assert client.post(url + "/apply", json={"approved": False}, headers=HEADERS).status_code == 400
    assert (workspace / "first.txt").exists()
    assert client.post(url + "/apply", json={"approved": True}, headers=HEADERS).json()["status"] == "completed"
    assert client.post(url + "/undo", json={}, headers=HEADERS).status_code == 400
    assert client.post(url + "/undo", json={"approved": True}, headers=HEADERS).json()["status"] == "undone"
    assert client.post("/api/operations/history", json={}).status_code == 403


def test_file_identity_is_safe_to_roundtrip_through_browser(workspace):
    identity = operations.fingerprint(workspace / "first.txt")
    assert isinstance(identity["device"], str)
    assert isinstance(identity["inode"], str)


def test_excluded_files_remain_untouched(workspace):
    plan = analyze(workspace)
    plan.items[1].included = False
    before = (workspace / "second.txt").read_bytes()
    record = operations.prepare(plan)
    assert len(record["actions"]) == 1
    operations.organize(record["id"])
    assert (workspace / "second.txt").read_bytes() == before


def test_replaced_root_is_rejected(workspace):
    record = operations.prepare(analyze(workspace))
    previous = workspace.with_name("previous")
    workspace.rename(previous)
    workspace.mkdir()
    with pytest.raises(ValueError, match="replaced"):
        operations.organize(record["id"])
    assert (previous / "first.txt").exists()


def test_execution_lock_prevents_a_second_writer(workspace):
    record = operations.prepare(analyze(workspace))
    with operations.execution_lock():
        with pytest.raises(ValueError, match="is running"):
            operations.organize(record["id"])
    assert (workspace / "first.txt").exists()


@pytest.mark.parametrize("stage", ["analyzed", "prepared"])
def test_changed_original_blocks_entire_batch(workspace, stage):
    plan = analyze(workspace)
    record = operations.prepare(plan) if stage == "prepared" else None
    (workspace / "second.txt").write_text("Alterado depois da revisão", encoding="utf-8")
    with pytest.raises(ValueError):
        operations.organize(record["id"]) if record else operations.prepare(plan)
    assert (workspace / "first.txt").exists()
    assert not (workspace / "Finance").exists()


def test_new_collision_after_approval_is_not_overwritten(workspace):
    record = operations.prepare(analyze(workspace))
    target = workspace / record["actions"][0]["destination"]
    target.parent.mkdir()
    target.write_text("Não sobrescrever", encoding="utf-8")
    with pytest.raises(ValueError):
        operations.organize(record["id"])
    assert target.read_text(encoding="utf-8") == "Não sobrescrever"
    assert (workspace / "first.txt").exists()


def test_atomic_move_rejects_destination_created_at_last_instant(workspace, monkeypatch):
    record = operations.prepare(analyze(workspace))
    real_move = operations.move_no_replace
    def raced_move(source, target):
        target.write_text("Outro processo", encoding="utf-8")
        real_move(source, target)
    monkeypatch.setattr(operations, "move_no_replace", raced_move)
    result = operations.organize(record["id"])
    assert result["status"] == "partial"
    assert (workspace / "first.txt").exists()
    assert (workspace / result["actions"][0]["destination"]).read_text(encoding="utf-8") == "Outro processo"


def test_partial_failure_can_restore_completed_moves(workspace, monkeypatch):
    record = operations.prepare(analyze(workspace))
    real_move = operations.move_no_replace
    def fail_second(source, target):
        if source.name == "second.txt":
            raise PermissionError("locked")
        real_move(source, target)
    monkeypatch.setattr(operations, "move_no_replace", fail_second)
    result = operations.organize(record["id"])
    assert result["status"] == "partial"
    assert result["actions"][0]["state"] == "moved"
    monkeypatch.setattr(operations, "move_no_replace", real_move)
    assert operations.undo(record["id"])["status"] == "undone"
    assert (workspace / "first.txt").exists() and (workspace / "second.txt").exists()


@pytest.mark.parametrize("conflict", ["edited", "occupied", "missing"])
def test_undo_preserves_modified_or_conflicting_files(workspace, conflict):
    record = operations.prepare(analyze(workspace))
    operations.organize(record["id"])
    target = workspace / record["actions"][0]["destination"]
    source = workspace / "first.txt"
    if conflict == "edited":
        target.write_text("Edição posterior", encoding="utf-8")
    elif conflict == "occupied":
        source.write_text("Outro ficheiro", encoding="utf-8")
    else:
        target.unlink()
    result = operations.undo(record["id"])
    assert result["status"] == "undo_partial"
    assert (workspace / "second.txt").exists()
    if conflict == "edited":
        assert target.read_text(encoding="utf-8") == "Edição posterior"
    elif conflict == "occupied":
        assert source.read_text(encoding="utf-8") == "Outro ficheiro"
        source.unlink()
        assert operations.undo(record["id"])["status"] == "undone"


def test_crash_after_move_recovers_from_durable_journal(workspace, monkeypatch):
    record = operations.prepare(analyze(workspace))
    real_move = operations.move_no_replace
    def crash_after_move(source, target):
        real_move(source, target)
        raise KeyboardInterrupt("simulated process interruption")
    monkeypatch.setattr(operations, "move_no_replace", crash_after_move)
    with pytest.raises(KeyboardInterrupt):
        operations.organize(record["id"])
    persisted = operations.get_operation(record["id"])
    assert persisted["status"] == "applying"
    assert persisted["actions"][0]["state"] == "moving"
    monkeypatch.setattr(operations, "move_no_replace", real_move)
    assert operations.undo(record["id"])["status"] == "undone"
    assert (workspace / "first.txt").exists()


def test_crash_during_undo_can_be_retried(workspace, monkeypatch):
    record = operations.prepare(analyze(workspace))
    operations.organize(record["id"])
    real_move = operations.move_no_replace
    def crash(source, target):
        real_move(source, target)
        raise KeyboardInterrupt()
    monkeypatch.setattr(operations, "move_no_replace", crash)
    with pytest.raises(KeyboardInterrupt):
        operations.undo(record["id"])
    monkeypatch.setattr(operations, "move_no_replace", real_move)
    assert operations.undo(record["id"])["status"] == "undone"


@pytest.mark.parametrize("mutation", ["escape", "duplicate", "missing_fingerprint"])
def test_forged_plan_is_rejected(workspace, mutation):
    plan = analyze(workspace)
    if mutation == "escape":
        plan.items[0].current_path = "../outside.txt"
    elif mutation == "duplicate":
        plan.items[1].current_path = plan.items[0].current_path
    else:
        plan.items[0].fingerprint = None
    with pytest.raises(ValueError):
        operations.prepare(plan)


def test_demo_requires_copy_and_originals_stay_unchanged(workspace):
    response = client.post("/api/analyze", json={"demo": True}, headers=HEADERS)
    with pytest.raises(ValueError):
        operations.prepare(Plan(**response.json()))
    original = {p.name: p.read_bytes() for p in operations.DEMO_ROOT.iterdir()}
    copy = client.post("/api/demo-copy", json={}, headers=HEADERS)
    assert copy.status_code == 200
    root = Path(copy.json()["path"])
    record = operations.prepare(analyze(root))
    assert operations.organize(record["id"])["status"] == "completed"
    assert operations.undo(record["id"])["status"] == "undone"
    assert original == {p.name: p.read_bytes() for p in operations.DEMO_ROOT.iterdir()}
