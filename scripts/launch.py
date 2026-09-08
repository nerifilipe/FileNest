"""Windows launcher: owns its children, never stops existing servers."""
import argparse
import ctypes
from importlib import metadata
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import build_opener, ProxyHandler
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def requirements():
    if sys.version_info < (3, 11):
        raise ValueError("Instale Python 3.11 ou superior e recrie .venv.")
    missing = []
    for line in (ROOT / "backend/requirements-lock.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        name, expected = line.strip().split("==", 1)
        try:
            installed = metadata.version(name)
        except metadata.PackageNotFoundError:
            installed = None
        if installed != expected:
            missing.append(name)
    if missing:
        raise ValueError("Atualize as dependências Python: " + ", ".join(missing) + "\n.\\.venv\\Scripts\\python -m pip install -r backend/requirements-lock.txt")
    node = shutil.which("node")
    if not node or not shutil.which("npm.cmd"):
        raise ValueError("Instale Node.js 22.12 ou superior (com npm) e abra um terminal novo.")
    version = subprocess.check_output([node, "--version"], text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW).strip()
    if tuple(map(int, version.lstrip("v").split(".")[:2])) < (22, 12):
        raise ValueError("Atualize Node.js para 22.12 ou superior.")
    vite = ROOT / "frontend/node_modules/vite/bin/vite.js"
    if not vite.is_file() or not (ROOT / "frontend/node_modules/react/package.json").is_file():
        raise ValueError("Faltam dependências da interface. Execute na raiz:\ncd frontend\nnpm ci")
    return node, vite


def check_ports():
    for port in (8000, 5173):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            try:
                listener.bind(("127.0.0.1", port))
            except OSError:
                raise ValueError(f"A porta {port} está ocupada. Feche a instância anterior ou o programa que a utiliza e tente novamente. Nenhum processo foi terminado.") from None


class ChildJob:
    """KILL_ON_JOB_CLOSE also cleans up children when the launcher window closes."""
    def __init__(self):
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
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, w.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        limits = Extended()
        limits.basic.flags = 0x2000
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            self.close()
            raise OSError("Não foi possível preparar os servidores locais.")

    def add(self, process):
        if not self.kernel.AssignProcessToJobObject(self.handle, int(process._handle)):
            process.kill()
            process.wait()
            raise OSError("Não foi possível supervisionar o servidor local.")

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def wait_ready(processes, timeout=45):
    opener = build_opener(ProxyHandler({}))
    pending = {"http://127.0.0.1:8000/api/health", "http://127.0.0.1:5173"}
    deadline = time.monotonic() + timeout
    while pending and time.monotonic() < deadline:
        if any(process.poll() is not None for process in processes):
            raise ValueError("Um servidor terminou durante o arranque. Consulte os logs em .filenest/logs.")
        for url in list(pending):
            try:
                with opener.open(url, timeout=0.5) as response:
                    if response.status == 200:
                        pending.remove(url)
            except OSError:
                pass
        time.sleep(0.2)
    if pending:
        raise ValueError("O arranque excedeu 45 segundos. Consulte os logs em .filenest/logs.")


def launch(node, vite, smoke=False):
    check_ports()
    logs = ROOT / ".filenest/logs"
    logs.mkdir(parents=True, exist_ok=True)
    job = ChildJob()
    processes, streams = [], []
    try:
        commands = [("backend", [sys.executable, "-X", "utf8", "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"], ROOT),
                    ("frontend", [node, str(vite), "--host", "127.0.0.1", "--port", "5173", "--strictPort"], ROOT / "frontend")]
        for name, command, directory in commands:
            stream = (logs / f"{name}.log").open("w", encoding="utf-8")
            streams.append(stream)
            process = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
            processes.append(process)
            job.add(process)
        print("A iniciar o FileNest…", flush=True)
        wait_ready(processes)
        print("FileNest disponível em http://127.0.0.1:5173", flush=True)
        if smoke:
            return
        webbrowser.open("http://127.0.0.1:5173")
        print("Mantenha esta janela aberta. Prima Q ou Ctrl+C para parar os dois servidores.")
        print("Termine qualquer organização/restauro antes de sair. Logs: .filenest/logs")
        import msvcrt
        while True:
            if any(process.poll() is not None for process in processes):
                raise ValueError("Um servidor terminou. Consulte .filenest/logs antes de voltar a iniciar.")
            if msvcrt.kbhit() and msvcrt.getwch().lower() == "q":
                break
            time.sleep(0.2)
    finally:
        job.close()
        for process in processes:
            process.wait(timeout=10)
        for stream in streams:
            stream.close()
        print("Servidores iniciados por este script terminados.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Verificar requisitos sem iniciar servidores")
    parser.add_argument("--smoke-test", action="store_true", help="Iniciar, verificar e terminar sem abrir o navegador")
    args = parser.parse_args()
    try:
        if os.name != "nt":
            raise ValueError("Este arranque simplificado destina-se ao Windows. Consulte o README para execução manual.")
        node, vite = requirements()
        if args.check:
            check_ports()
            print("Requisitos e portas disponíveis. Pronto para iniciar.")
        else:
            launch(node, vite, args.smoke_test)
        return 0
    except KeyboardInterrupt:
        return 0
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Não foi possível iniciar o FileNest: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
