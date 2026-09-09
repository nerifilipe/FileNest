"""Approved, journalled local moves. No replacement of existing files."""
import hashlib
import json
import os
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from uuid import uuid4

from .extraction import MAX_BYTES, ExtractionError
from .models import Plan
from .safety import is_link, local_root, valid_component, validate_plan

DATA_DIR = Path(os.environ.get("FILENEST_DATA_DIR", str(Path(__file__).resolve().parents[1] / ".filenest")))
DEMO_ROOT = Path(__file__).resolve().parents[1] / "examples" / "demo"
operation_lock = RLock()


def fingerprint(path: Path) -> dict:
    if is_link(path) or not path.is_file():
        raise ValueError("The file no longer exists or is a link. Analyze it again.")
    before = path.stat()
    if before.st_size > MAX_BYTES:
        raise ExtractionError("too_large", "The file exceeds the 10 MB limit.")
    with path.open("rb") as stream:
        data = stream.read(MAX_BYTES + 1)
    after = path.stat()
    if len(data) > MAX_BYTES or (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError("The file changed while reading. Analyze it again.")
    # File IDs may exceed JavaScript's exact integer range. Transport as strings.
    return {"sha256": hashlib.sha256(data).hexdigest(), "device": str(after.st_dev), "inode": str(after.st_ino)}


def safe_path(root: Path, relative: str) -> Path:
    parts = relative.split("/")
    if not all(valid_component(part) for part in parts):
        raise ValueError("Invalid path in the plan.")
    cursor = root
    for index, part in enumerate(parts):
        if cursor.is_dir():
            matches = [p for p in cursor.iterdir() if p.name.casefold() == part.casefold()]
            if len(matches) > 1:
                raise ValueError("Ambiguous names exist at the destination.")
            cursor = matches[0] if matches else cursor / part
        else:
            cursor = cursor / part
        if is_link(cursor):
            raise ValueError("A symbolic link or junction blocks the operation.")
        if index < len(parts) - 1 and cursor.exists() and not cursor.is_dir():
            raise ValueError("A file occupies a required folder path.")
    if not cursor.resolve().is_relative_to(root):
        raise ValueError("The path is outside the approved folder.")
    return cursor


@contextmanager
def database():
    # Do not allow the history itself to be redirected through a junction.
    if any(is_link(p) for p in [DATA_DIR, *DATA_DIR.parents]):
        raise ValueError("The history directory contains a link.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db_path = DATA_DIR / "history.sqlite3"
    if is_link(db_path):
        raise ValueError("History cannot be a link.")
    with sqlite3.connect(db_path) as db:
        db.execute("PRAGMA synchronous=FULL")
        db.execute("CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, record TEXT NOT NULL)")
        yield db


@contextmanager
def execution_lock():
    """Serialize writes across threads and backend processes; release on crash."""
    with operation_lock:
        with database():
            pass
        path = DATA_DIR / "execution.lock"
        if is_link(path):
            raise ValueError("The execution lock cannot be a link.")
        with path.open("a+b") as stream:
            if stream.seek(0, os.SEEK_END) == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise ValueError("Another operation is running. Wait before continuing.") from None
            try:
                yield
            finally:
                stream.seek(0)
                if os.name == "nt":
                    msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(stream, fcntl.LOCK_UN)


def save(record: dict) -> None:
    with database() as db:
        db.execute("INSERT OR REPLACE INTO operations VALUES (?, ?)", (record["id"], json.dumps(record)))


def get_operation(operation_id: str) -> dict:
    with database() as db:
        row = db.execute("SELECT record FROM operations WHERE id = ?", (operation_id,)).fetchone()
    if row is None:
        raise ValueError("Operation not found in local history.")
    return json.loads(row[0])


def history() -> list[dict]:
    with operation_lock, database() as db:
        rows = db.execute("SELECT record FROM operations ORDER BY rowid DESC LIMIT 50").fetchall()
    return [json.loads(row[0]) for row in rows]


def search_history(search: str = "", status: str = "all", page: int = 1, page_size: int = 10, export: bool = False) -> dict:
    def fold(text):
        return "".join(c for c in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(c)).casefold()
    where = """(? = 'all' OR json_extract(record, '$.status') = ?) AND
        instr(fold(json_extract(record, '$.root') || ' ' || coalesce((
            SELECT group_concat(json_extract(value, '$.source') || ' ' || json_extract(value, '$.destination'), ' ')
            FROM json_each(record, '$.actions')
        ), '')), fold(?)) > 0"""
    args = (status, status, search.strip())
    with operation_lock, database() as db:
        db.create_function("fold", 1, fold, deterministic=True)
        db.execute("BEGIN")
        total = db.execute(f"SELECT count(*) FROM operations WHERE {where}", args).fetchone()[0]
        if export and total > 10_000:
            raise ValueError("Export exceeds 10,000 operations. Narrow the search or status filter.")
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        limit, offset = (10_000, 0) if export else (page_size, (page - 1) * page_size)
        rows = db.execute(f"SELECT record FROM operations WHERE {where} ORDER BY rowid DESC LIMIT ? OFFSET ?", (*args, limit, offset)).fetchall()
    return {"items": [json.loads(row[0]) for row in rows], "total": total, "page": page, "pages": pages, "page_size": page_size}


def checked_root(record: dict) -> Path:
    root = local_root(record["root"])
    info = root.stat()
    if [info.st_dev, info.st_ino] != record["root_identity"]:
        raise ValueError("The folder was replaced. The operation was blocked.")
    return root


def prepare(plan: Plan) -> dict:
    with execution_lock():
        root = local_root(plan.root)
        if root.is_relative_to(DEMO_ROOT):
            raise ValueError("Create a demo copy before organizing the samples.")
        checked = validate_plan(plan.model_copy(deep=True))
        chosen = [i for i in checked.items if i.included]
        if not chosen or any(i.status != "ready" or i.issues for i in chosen):
            raise ValueError("Include at least one valid file and resolve all conflicts.")
        seen = set()
        actions = []
        for item in chosen:
            if not all(valid_component(part) for part in item.current_path.split("/")) or item.current_path.casefold() in seen:
                raise ValueError("Invalid or duplicate source in the plan.")
            seen.add(item.current_path.casefold())
            source = safe_path(root, item.current_path)
            if source.suffix.lower() not in {".pdf", ".txt"}:
                raise ValueError("Only PDF and TXT files can be organized.")
            identity = fingerprint(source)
            if not item.fingerprint or identity != item.fingerprint:
                raise ValueError("An original changed since analysis. Analyze the folder again.")
            destination = f"{item.proposed_folder}/{item.proposed_name}"
            target = safe_path(root, destination)
            if target.exists():
                raise ValueError("The destination already exists. Validate again.")
            actions.append({"source": item.current_path, "destination": destination,
                            "fingerprint": identity, "state": "pending", "error": ""})
        info = root.stat()
        record = {"id": uuid4().hex, "root": str(root), "root_identity": [info.st_dev, info.st_ino],
                  "created_at": datetime.now(timezone.utc).isoformat(), "status": "prepared",
                  "actions": actions, "error": ""}
        save(record)
        return record


def move_no_replace(source: Path, target: Path) -> None:
    if os.name == "nt":
        # Windows rename fails atomically when the destination exists.
        os.rename(source, target)
    else:
        # Same-volume hard link creation is atomic and never replaces a target.
        # If interrupted before unlink, undo recognises the two identical links.
        os.link(source, target, follow_symlinks=False)
        source.unlink()


def verify(path: Path, expected: dict) -> None:
    if fingerprint(path) != expected:
        raise ValueError("The file was changed or replaced. No files will be overwritten.")


def organize(operation_id: str) -> dict:
    with execution_lock():
        record = get_operation(operation_id)
        if record["status"] != "prepared":
            return record  # Retry after a lost response never executes twice.
        root = checked_root(record)
        # Validate the whole batch before the first mutation.
        for action in record["actions"]:
            verify(safe_path(root, action["source"]), action["fingerprint"])
            if safe_path(root, action["destination"]).exists():
                raise ValueError("A destination now exists. Prepare a new plan.")
        record["status"] = "applying"
        save(record)
        for action in record["actions"]:
            try:
                checked_root(record)
                source = safe_path(root, action["source"])
                target = safe_path(root, action["destination"])
                verify(source, action["fingerprint"])
                if target.exists():
                    raise ValueError("The destination already exists.")
                target.parent.mkdir(parents=True, exist_ok=True)
                # Check newly created/existing parents again immediately before moving.
                target = safe_path(root, action["destination"])
                action["state"] = "moving"
                save(record)
                move_no_replace(source, target)
                action["state"] = "moved"
                save(record)
            except (OSError, ValueError) as error:
                action["error"] = str(error) if isinstance(error, ValueError) else "Could not move the file. Check permissions and available disk space."
                record["status"] = "partial"
                record["error"] = "Operation interrupted. Check the files and use Undo to restore those already moved."
                save(record)
                return record
        record["status"] = "completed"
        save(record)
        return record


def undo(operation_id: str) -> dict:
    with execution_lock():
        record = get_operation(operation_id)
        if record["status"] in {"prepared", "undone"}:
            return record
        root = checked_root(record)
        record["status"] = "undoing"
        record["error"] = ""
        save(record)
        for action in reversed(record["actions"]):
            if action["state"] in {"pending", "undone"}:
                continue
            try:
                checked_root(record)
                source = safe_path(root, action["source"])
                target = safe_path(root, action["destination"])
                if source.exists():
                    verify(source, action["fingerprint"])
                    if target.exists():
                        # Only clean up a confirmed duplicate link from a POSIX interruption.
                        if not os.path.samefile(source, target):
                            raise ValueError("The original path is occupied. Free it and try undo again.")
                        verify(target, action["fingerprint"])
                        target.unlink()
                else:
                    verify(target, action["fingerprint"])
                    action["state"] = "restoring"
                    save(record)
                    move_no_replace(target, source)
                action["state"] = "undone"
                action["error"] = ""
                save(record)
            except (OSError, ValueError) as error:
                action["error"] = str(error) if isinstance(error, ValueError) else "Could not restore the file. Check permissions."
                save(record)
        blocked = any(a["state"] not in {"pending", "undone"} for a in record["actions"])
        record["status"] = "undo_partial" if blocked else "undone"
        record["error"] = "Some files could not be restored. Resolve the warnings and try again." if blocked else ""
        # Keep empty folders: they may now belong to the user or another process.
        save(record)
        return record
