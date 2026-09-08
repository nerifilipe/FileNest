"""Short-lived capabilities for documents actually encountered by analysis."""
import time
from collections import OrderedDict
from threading import Lock
from uuid import uuid4

from . import operations
from .processes import run_worker
from .safety import local_root

_documents = OrderedDict()
_lock = Lock()


def register(root, relative, identity):
    info = root.stat()
    token = uuid4().hex
    with _lock:
        _documents[token] = (str(root), relative, identity, (info.st_dev, info.st_ino), time.monotonic())
        while len(_documents) > 200:
            _documents.popitem(last=False)
    return token


def read(token, page=1):
    with _lock:
        record = _documents.get(token)
    if not record or time.monotonic() - record[4] > 3600:
        raise ValueError("Pré-visualização expirada. Volte a analisar a pasta.")
    raw_root, relative, identity, root_identity, _ = record
    root = local_root(raw_root)
    info = root.stat()
    if (info.st_dev, info.st_ino) != root_identity:
        raise ValueError("A pasta mudou. Volte a analisar.")
    path = operations.safe_path(root, relative)
    operations.verify(path, identity)
    result = run_worker("backend.preview_worker", {"path": str(path), "page": page}, max_output_bytes=8_000_000)
    operations.verify(operations.safe_path(root, relative), identity)
    if "error" in result:
        raise ValueError(result["error"])
    return result
