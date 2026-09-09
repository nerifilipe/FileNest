"""Short-lived worker processes with a wall timeout and an OS memory limit."""
import ctypes
import json
import os
import signal
import subprocess
import sys
from pathlib import Path


class WorkerError(ValueError):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def windows_job(process, memory_mb):
    from ctypes import wintypes as w
    class Basic(ctypes.Structure):
        _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                    ("flags", w.DWORD), ("min_ws", ctypes.c_size_t), ("max_ws", ctypes.c_size_t),
                    ("active", w.DWORD), ("affinity", ctypes.c_size_t), ("priority", w.DWORD), ("scheduling", w.DWORD)]
    class Counters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in ("read", "write", "other", "read_bytes", "write_bytes", "other_bytes")]
    class Extended(ctypes.Structure):
        _fields_ = [("basic", Basic), ("io", Counters), ("process_memory", ctypes.c_size_t),
                    ("job_memory", ctypes.c_size_t), ("peak_process", ctypes.c_size_t), ("peak_job", ctypes.c_size_t)]
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    kernel.CloseHandle.argtypes = [w.HANDLE]
    job = kernel.CreateJobObjectW(None, None)
    limits = Extended()
    # Memory applies to the whole job, including Tesseract descendants.
    limits.basic.flags = 0x2000 | 0x200  # KILL_ON_JOB_CLOSE | JOB_MEMORY
    limits.job_memory = memory_mb * 1024 * 1024
    if not job or not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.AssignProcessToJobObject(job, int(process._handle)):
        if job:
            kernel.CloseHandle(job)
        raise WorkerError("isolation_unavailable", "Could not isolate extraction. Restart the app outside restricted environments.")
    return lambda: kernel.CloseHandle(job)


def run_worker(module: str, payload: dict, timeout: float = 30, memory_mb: int = 768, max_output_bytes: int = 400_000) -> dict:
    process = subprocess.Popen(
        [sys.executable, "-X", "utf8", "-m", module],
        cwd=Path(__file__).resolve().parents[1], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        start_new_session=os.name != "nt",
    )
    close_job = None
    try:
        # Worker waits for stdin: assign limits before giving it document data.
        if os.name == "nt":
            close_job = windows_job(process, memory_mb)
        payload = {**payload, "memory_mb": memory_mb}
        try:
            output, _ = process.communicate(json.dumps(payload).encode(), timeout=timeout)
        except subprocess.TimeoutExpired:
            raise WorkerError("timeout", "Extraction timed out. Try a smaller document.") from None
        if process.returncode != 0 or len(output) > max_output_bytes:
            raise WorkerError("resource_limit", "The extraction process stopped unexpectedly or exceeded available resources.")
        try:
            result = json.loads(output)
            if not isinstance(result, dict):
                raise ValueError()
        except (ValueError, UnicodeError):
            raise WorkerError("unreadable", "The extraction process returned an invalid response.") from None
        return result
    finally:
        if close_job:
            close_job()  # Terminates worker and its descendants, even after a timeout.
        if os.name != "nt":
            # Clean up descendants even if the main worker has already exited.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        elif process.poll() is None:
            process.kill()
        process.communicate()


def read_payload():
    payload = json.loads(sys.stdin.buffer.read(32_000))
    if os.name != "nt":
        import resource
        limit = payload["memory_mb"] * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    return payload
