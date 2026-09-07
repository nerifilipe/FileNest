"""Approved, journalled local moves. No replacement of existing files."""
import hashlib
import json
import os
import sqlite3
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
        raise ValueError("O ficheiro não existe ou é uma ligação. Volte a analisar.")
    before = path.stat()
    if before.st_size > MAX_BYTES:
        raise ExtractionError("too_large", "O ficheiro excede o limite de 10 MB.")
    with path.open("rb") as stream:
        data = stream.read(MAX_BYTES + 1)
    after = path.stat()
    if len(data) > MAX_BYTES or (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
        raise ValueError("O ficheiro mudou durante a leitura. Volte a analisar.")
    # File IDs may exceed JavaScript's exact integer range. Transport as strings.
    return {"sha256": hashlib.sha256(data).hexdigest(), "device": str(after.st_dev), "inode": str(after.st_ino)}


def safe_path(root: Path, relative: str) -> Path:
    parts = relative.split("/")
    if not all(valid_component(part) for part in parts):
        raise ValueError("Caminho inválido no plano.")
    cursor = root
    for index, part in enumerate(parts):
        if cursor.is_dir():
            matches = [p for p in cursor.iterdir() if p.name.casefold() == part.casefold()]
            if len(matches) > 1:
                raise ValueError("Existem nomes ambíguos no destino.")
            cursor = matches[0] if matches else cursor / part
        else:
            cursor = cursor / part
        if is_link(cursor):
            raise ValueError("Uma ligação simbólica ou junção bloqueia a operação.")
        if index < len(parts) - 1 and cursor.exists() and not cursor.is_dir():
            raise ValueError("Um ficheiro ocupa uma pasta necessária.")
    if not cursor.resolve().is_relative_to(root):
        raise ValueError("O caminho fica fora da pasta aprovada.")
    return cursor


@contextmanager
def database():
    # Do not allow the history itself to be redirected through a junction.
    if any(is_link(p) for p in [DATA_DIR, *DATA_DIR.parents]):
        raise ValueError("A pasta do histórico contém uma ligação.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db_path = DATA_DIR / "history.sqlite3"
    if is_link(db_path):
        raise ValueError("O histórico não pode ser uma ligação.")
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
            raise ValueError("O bloqueio de execução não pode ser uma ligação.")
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
                raise ValueError("Outra operação está em curso. Aguarde antes de continuar.") from None
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
        raise ValueError("Operação não encontrada no histórico local.")
    return json.loads(row[0])


def history() -> list[dict]:
    with operation_lock, database() as db:
        rows = db.execute("SELECT record FROM operations ORDER BY rowid DESC LIMIT 50").fetchall()
    return [json.loads(row[0]) for row in rows]


def checked_root(record: dict) -> Path:
    root = local_root(record["root"])
    info = root.stat()
    if [info.st_dev, info.st_ino] != record["root_identity"]:
        raise ValueError("A pasta foi substituída. A operação foi bloqueada.")
    return root


def prepare(plan: Plan) -> dict:
    with execution_lock():
        root = local_root(plan.root)
        if root.is_relative_to(DEMO_ROOT):
            raise ValueError("Crie uma cópia de demonstração antes de organizar os exemplos.")
        checked = validate_plan(plan.model_copy(deep=True))
        chosen = [i for i in checked.items if i.included]
        if not chosen or any(i.status != "ready" or i.issues for i in chosen):
            raise ValueError("Inclua pelo menos um ficheiro válido e resolva todos os conflitos.")
        seen = set()
        actions = []
        for item in chosen:
            if not valid_component(item.current_path) or item.current_path.casefold() in seen:
                raise ValueError("Origem inválida ou repetida no plano.")
            seen.add(item.current_path.casefold())
            source = safe_path(root, item.current_path)
            if source.suffix.lower() not in {".pdf", ".txt"}:
                raise ValueError("Apenas PDF e TXT podem ser organizados.")
            identity = fingerprint(source)
            if not item.fingerprint or identity != item.fingerprint:
                raise ValueError("Um original mudou desde a análise. Volte a analisar a pasta.")
            destination = f"{item.proposed_folder}/{item.proposed_name}"
            target = safe_path(root, destination)
            if target.exists():
                raise ValueError("O destino já existe. Volte a validar.")
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
        raise ValueError("O ficheiro foi alterado ou substituído. Nenhum ficheiro será sobrescrito.")


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
                raise ValueError("Um destino passou a existir. Prepare um novo plano.")
        record["status"] = "applying"
        save(record)
        for action in record["actions"]:
            try:
                checked_root(record)
                source = safe_path(root, action["source"])
                target = safe_path(root, action["destination"])
                verify(source, action["fingerprint"])
                if target.exists():
                    raise ValueError("O destino já existe.")
                target.parent.mkdir(parents=True, exist_ok=True)
                # Check newly created/existing parents again immediately before moving.
                target = safe_path(root, action["destination"])
                action["state"] = "moving"
                save(record)
                move_no_replace(source, target)
                action["state"] = "moved"
                save(record)
            except (OSError, ValueError) as error:
                action["error"] = str(error) if isinstance(error, ValueError) else "Não foi possível mover o ficheiro. Verifique permissões e espaço disponível."
                record["status"] = "partial"
                record["error"] = "Operação interrompida. Consulte os ficheiros e use Desfazer para recuperar os já movidos."
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
                            raise ValueError("O nome original está ocupado. Liberte-o e tente desfazer novamente.")
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
                action["error"] = str(error) if isinstance(error, ValueError) else "Não foi possível restaurar o ficheiro. Verifique as permissões."
                save(record)
        blocked = any(a["state"] not in {"pending", "undone"} for a in record["actions"])
        record["status"] = "undo_partial" if blocked else "undone"
        record["error"] = "Alguns ficheiros não puderam ser restaurados. Resolva os avisos e tente novamente." if blocked else ""
        # Keep empty folders: they may now belong to the user or another process.
        save(record)
        return record
