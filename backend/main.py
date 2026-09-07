import os
import sqlite3
from pathlib import Path
from threading import Lock
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from .extraction import extract_text, ExtractionError
from .models import AnalyzeRequest, FileItem, Plan
from .providers import DemoProvider
from .safety import local_root, is_link, validate_plan
from . import operations
from pydantic import BaseModel

app = FastAPI(title="FileNest", version="0.2.0", docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
analysis_lock = Lock()
DEMO_ROOT = Path(__file__).resolve().parents[1] / "examples" / "demo"


@app.middleware("http")
async def local_client(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.method == "POST" and request.headers.get("x-filenest-client") != "local-preview":
        return JSONResponse(status_code=403, content={"detail": "Pedido não autorizado. Abra a interface local do FileNest."})
    origin = request.headers.get("origin")
    if origin and origin not in {"http://127.0.0.1:5173", "http://localhost:5173", os.environ.get("FILENEST_FRONTEND_ORIGIN")}:
        return JSONResponse(status_code=403, content={"detail": "Origem não autorizada."})
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": "demo-rules", "read_only": False}


@app.post("/api/analyze", response_model=Plan)
def analyze(request: AnalyzeRequest):
    try:
        root = local_root(str(DEMO_ROOT) if request.demo else request.path)
    except (ValueError, OSError):
        raise HTTPException(400, "Escolha uma pasta local existente com caminho absoluto, sem ligações ou unidades de rede.") from None
    if not analysis_lock.acquire(blocking=False):
        raise HTTPException(409, "Já existe uma análise em curso. Aguarde e tente novamente.")
    try:
        items = []
        warnings = []
        provider = DemoProvider()
        # Shallow scan is intentional: suggested folders are not reanalysed.
        with os.scandir(root) as entries:
            paths = []
            for index, entry in enumerate(entries):
                if index >= 2000:
                    raise HTTPException(400, "A pasta excede 2000 entradas. Escolha uma pasta mais pequena.")
                path = Path(entry.path)
                if is_link(path):
                    warnings.append(f"Ligação ignorada: {path.name}")
                elif entry.is_file(follow_symlinks=False) and path.suffix.lower() in {".pdf", ".txt"}:
                    paths.append(path)
                    if len(paths) > 100:
                        raise HTTPException(400, "A pasta excede 100 documentos PDF/TXT. Escolha uma pasta mais pequena.")
        for path in sorted(paths, key=lambda p: p.name.casefold()):
            try:
                if is_link(path) or path.resolve().parent != root:
                    raise ExtractionError("unreadable", "O ficheiro mudou ou é uma ligação. Volte a analisar.")
                size = path.stat().st_size
                identity = operations.fingerprint(path)
                suggestion = provider.suggest(extract_text(path), path.suffix)
                if operations.fingerprint(path) != identity:
                    raise ExtractionError("unreadable", "O ficheiro mudou durante a análise. Tente novamente.")
                item = FileItem(id=path.name, current_path=path.name, size=size, fingerprint=identity, **suggestion.model_dump())
            except (ValueError, OSError) as error:
                item = FileItem(id=path.name, current_path=path.name, size=0, category="Por analisar",
                                proposed_name=path.name, proposed_folder="", status=getattr(error, "status", "unreadable"),
                                included=False, reason=str(error) if isinstance(error, ExtractionError) else "Não foi possível aceder ao ficheiro.")
            items.append(item)
        return validate_plan(Plan(root=str(root), items=items, warnings=warnings))
    except OSError:
        raise HTTPException(400, "Não foi possível ler a pasta. Verifique as permissões.") from None
    finally:
        analysis_lock.release()


@app.post("/api/validate", response_model=Plan)
def validate(plan: Plan):
    try:
        return validate_plan(plan)
    except (ValueError, OSError):
        raise HTTPException(400, "A pasta deixou de estar acessível. Volte a analisar.") from None


class Approval(BaseModel):
    approved: bool = False


def operation_response(callback, *args):
    try:
        return callback(*args)
    except ValueError as error:
        raise HTTPException(409, str(error)) from None
    except (OSError, sqlite3.Error):
        raise HTTPException(409, "Não foi possível aceder aos ficheiros ou ao histórico local.") from None


@app.post("/api/operations/prepare")
def prepare_operation(plan: Plan):
    return operation_response(operations.prepare, plan)


@app.post("/api/operations/history")
def operation_history():
    return operation_response(operations.history)


@app.post("/api/operations/{operation_id}/apply")
def apply_operation(operation_id: str, approval: Approval):
    if not approval.approved:
        raise HTTPException(400, "É necessária aprovação explícita para organizar.")
    return operation_response(operations.organize, operation_id)


@app.post("/api/operations/{operation_id}/undo")
def undo_operation(operation_id: str, approval: Approval):
    if not approval.approved:
        raise HTTPException(400, "Confirme que pretende restaurar os caminhos originais.")
    return operation_response(operations.undo, operation_id)


@app.post("/api/demo-copy")
def demo_copy():
    import shutil
    from uuid import uuid4
    def create_copy():
        # Ensure the private storage directory is real before creating a workspace.
        with operations.database():
            pass
        parent = operations.DATA_DIR / "demos"
        if is_link(parent):
            raise ValueError("A pasta de demonstrações não pode ser uma ligação.")
        root = parent / uuid4().hex
        # Preserve links as links so this helper never reads their external targets.
        # The analyzer will ignore them, just as in a user-selected folder.
        shutil.copytree(DEMO_ROOT, root, symlinks=True)
        return {"path": str(root)}
    return operation_response(create_copy)
