import os
import sqlite3
import time
from pathlib import Path
from threading import Lock
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from .extraction import isolated_extract, ExtractionError
from . import ocr
from .processes import run_worker, WorkerError
from .models import AnalyzeRequest, FileItem, Plan, HistoryQuery
from .providers import DemoProvider
from .ollama_provider import OllamaProvider, ProviderError, MODEL, MAX_AI_FILES, MAX_AI_TEXT
from .safety import local_root, is_link, validate_plan
from . import operations
from .scanning import discover_documents
from pydantic import BaseModel
from .analysis_jobs import jobs
from . import preview
from pydantic import Field

app = FastAPI(title="FileNest", version="1.0.0", docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
analysis_lock = Lock()
picker_lock = Lock()
DEMO_ROOT = Path(__file__).resolve().parents[1] / "examples" / "demo"


@app.middleware("http")
async def local_client(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.method == "POST" and request.headers.get("x-filenest-client") != "local-preview":
        return JSONResponse(status_code=403, content={"detail": "Unauthorized request. Open the local FileNest interface."})
    origin = request.headers.get("origin")
    if origin and origin not in {"http://127.0.0.1:5173", "http://localhost:5173", os.environ.get("FILENEST_FRONTEND_ORIGIN")}:
        return JSONResponse(status_code=403, content={"detail": "Unauthorized origin."})
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"status": "ok", "provider": "demo-rules", "read_only": False}


class PreviewRequest(BaseModel):
    token: str = Field(min_length=32, max_length=32, pattern=r"^[a-f0-9]+$")
    page: int = Field(default=1, ge=1, le=100)


preview_lock = Lock()


@app.post("/api/preview")
def preview_document(request: PreviewRequest):
    from fastapi.responses import JSONResponse
    if not preview_lock.acquire(blocking=False):
        raise HTTPException(409, "A preview is already loading. Try again.")
    try:
        return JSONResponse(preview.read(request.token, request.page), headers={"Cache-Control": "no-store"})
    except (ValueError, OSError) as error:
        raise HTTPException(400, str(error) if isinstance(error, ValueError) else "Could not read the document. Analyze it again.") from None
    finally:
        preview_lock.release()


@app.post("/api/analyze")
def start_analysis(request: AnalyzeRequest):
    if request.background:
        return jobs.start(lambda progress: analyze(request, progress))
    return analyze(request)


@app.post("/api/analysis/{job_id}/status")
def analysis_status(job_id: str):
    return jobs.snapshot(job_id)


@app.post("/api/analysis/{job_id}/cancel")
def cancel_analysis(job_id: str):
    return jobs.snapshot(job_id, cancel=True)


def analyze(request: AnalyzeRequest, progress=None):
    try:
        root = local_root(str(DEMO_ROOT) if request.demo else request.path)
    except (ValueError, OSError):
        raise HTTPException(400, "Choose an existing local folder with an absolute path, without links or network drives.") from None
    if not analysis_lock.acquire(blocking=False):
        raise HTTPException(409, "An analysis is already running. Wait and try again.")
    ai = None
    try:
        items = []
        warnings = []
        rules = DemoProvider()
        if request.ocr:
            ocr_state = ocr.status()
            if not ocr_state["available"]:
                raise HTTPException(400, ocr_state["message"])
        try:
            paths, warnings = discover_documents(root, request.recursive)
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        if progress and progress(total=len(paths)):
            return Plan(root=str(root), provider=request.provider, items=[], warnings=["Analysis cancelled before processing documents."])
        if request.provider == "ollama":
            if len(paths) > MAX_AI_FILES:
                raise HTTPException(400, "Local AI is limited to 20 documents per analysis. Choose a smaller folder or use local rules.")
            if paths:
                ai = OllamaProvider()
                try:
                    ai.check()
                except ProviderError as error:
                    raise HTTPException(503, str(error)) from None
        fallback_reason = ""
        started = time.monotonic()
        for path in paths:
            relative = path.relative_to(root).as_posix()
            identity = None
            if progress and progress(current=relative):
                break
            try:
                path = operations.safe_path(root, relative)
                size = path.stat().st_size
                identity = operations.fingerprint(path)
                extraction = isolated_extract(path, request.ocr)
                extracted = extraction["text"]
                source = "demo-rules"
                note = ""
                if ai and not fallback_reason:
                    if time.monotonic() - started >= 180:
                        fallback_reason = "The AI time budget for this analysis was reached."
                    else:
                        try:
                            suggestion = ai.suggest(extracted, path.suffix)
                            source = "ollama"
                            if len(extracted) > MAX_AI_TEXT:
                                note = "AI analyzed only the first 6,000 extracted characters."
                        except ProviderError as error:
                            fallback_reason = str(error)
                if source == "demo-rules":
                    suggestion = rules.suggest(extracted, path.suffix)
                    if ai:
                        note = "Local rules fallback: " + fallback_reason
                if operations.fingerprint(operations.safe_path(root, relative)) != identity:
                    raise ExtractionError("unreadable", "The file changed during analysis. Try again.")
                item = FileItem(id=relative, current_path=relative, size=size, fingerprint=identity,
                                suggestion_source=source, provider_note=note, extraction_method=extraction["method"],
                                extraction_notes=extraction["notes"], **suggestion.model_dump())
            except (ValueError, OSError) as error:
                item = FileItem(id=relative, current_path=relative, size=0, category="Not analyzed",
                                proposed_name=path.name, proposed_folder="", status=getattr(error, "status", "unreadable"),
                                included=False, reason=str(error) if isinstance(error, ExtractionError) else "Could not access the file.")
            if identity and item.status in {"ready", "ocr_required", "ocr_no_text", "empty"}:
                item.preview_token = preview.register(root, relative, identity)
            items.append(item)
            if progress:
                progress(completed=len(items))
        if progress and progress(current=""):
            warnings.append(f"Analysis cancelled: {len(items)} of {len(paths)} documents completed. The plan contains only those results.")
        if fallback_reason:
            warnings.append("AI processing stopped; fallback suggestions are labeled as local rules.")
        return validate_plan(Plan(root=str(root), provider=request.provider, items=items, warnings=warnings))
    except OSError:
        raise HTTPException(400, "Could not read the folder. Check permissions.") from None
    finally:
        if ai:
            ai.close()
        analysis_lock.release()


@app.post("/api/ai/status")
def ai_status():
    provider = OllamaProvider()
    try:
        provider.check()
        return {"available": True, "model": MODEL, "message": "Ollama and local model are available."}
    except ProviderError as error:
        return {"available": False, "model": MODEL, "message": str(error)}
    finally:
        provider.close()


@app.post("/api/ocr/status")
def ocr_status():
    return ocr.status()


@app.post("/api/folders/pick")
def pick_folder():
    if not picker_lock.acquire(blocking=False):
        raise HTTPException(409, "A folder selection dialog is already open.")
    try:
        result = run_worker("backend.folder_picker", {}, timeout=180, memory_mb=256)
        if result.get("path"):
            result["path"] = str(local_root(result["path"]))
        return result
    except (WorkerError, OSError, ValueError):
        raise HTTPException(400, "The folder dialog failed or timed out. You can enter the path manually.") from None
    finally:
        picker_lock.release()


@app.post("/api/validate", response_model=Plan)
def validate(plan: Plan):
    try:
        return validate_plan(plan)
    except (ValueError, OSError):
        raise HTTPException(400, "The folder is no longer accessible. Analyze it again.") from None


class Approval(BaseModel):
    approved: bool = False


def operation_response(callback, *args, **kwargs):
    try:
        return callback(*args, **kwargs)
    except ValueError as error:
        raise HTTPException(409, str(error)) from None
    except (OSError, sqlite3.Error):
        raise HTTPException(409, "Could not access the files or local history.") from None


@app.post("/api/operations/prepare")
def prepare_operation(plan: Plan):
    return operation_response(operations.prepare, plan)


@app.post("/api/operations/history")
def operation_history():
    return operation_response(operations.history)


@app.post("/api/operations/search")
def search_operations(query: HistoryQuery):
    return operation_response(operations.search_history, **query.model_dump())


@app.post("/api/operations/export")
def export_operations(query: HistoryQuery):
    from datetime import datetime, timezone
    result = operation_response(operations.search_history, **query.model_dump(), export=True)
    return {"format": "filenest-history-v1", "exported_at": datetime.now(timezone.utc).isoformat(),
            "filters": {"search": query.search, "status": query.status}, "total": result["total"], "operations": result["items"]}


@app.post("/api/operations/{operation_id}/apply")
def apply_operation(operation_id: str, approval: Approval):
    if not approval.approved:
        raise HTTPException(400, "Explicit approval is required to organize files.")
    return operation_response(operations.organize, operation_id)


@app.post("/api/operations/{operation_id}/undo")
def undo_operation(operation_id: str, approval: Approval):
    if not approval.approved:
        raise HTTPException(400, "Confirm that you want to restore the original paths.")
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
            raise ValueError("The demo folder cannot be a link.")
        root = parent / uuid4().hex
        # Preserve links as links so this helper never reads their external targets.
        # The analyzer will ignore them, just as in a user-selected folder.
        shutil.copytree(DEMO_ROOT, root, symlinks=True)
        return {"path": str(root)}
    return operation_response(create_copy)
