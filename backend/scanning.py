"""Bounded document discovery, with optional traversal of real subdirectories."""
import os
from pathlib import Path

from .safety import is_link

MAX_ENTRIES = 2000
MAX_DOCUMENTS = 100
MAX_DEPTH = 20


def discover_documents(root: Path, recursive: bool = False) -> tuple[list[Path], list[str]]:
    paths, warnings = [], []
    pending = [(root, 0)]
    count = 0
    while pending:
        directory, depth = pending.pop()
        # Recheck ancestors before opening a directory queued earlier.
        if any(is_link(p) for p in [directory, *directory.parents]) or not directory.resolve().is_relative_to(root):
            raise ValueError("Uma pasta mudou ou contém uma ligação. Volte a analisar.")
        with os.scandir(directory) as entries:
            for entry in entries:
                count += 1
                if count > MAX_ENTRIES:
                    raise ValueError("A seleção excede 2000 entradas no total. Escolha uma pasta mais pequena.")
                path = Path(entry.path)
                relative = path.relative_to(root).as_posix()
                if is_link(path):
                    warnings.append(f"Ligação ignorada: {relative}")
                elif entry.is_dir(follow_symlinks=False) and recursive:
                    if depth >= MAX_DEPTH:
                        raise ValueError("A seleção excede 20 níveis de subpastas. Escolha uma pasta mais específica.")
                    pending.append((path, depth + 1))
                elif entry.is_file(follow_symlinks=False) and path.suffix.lower() in {".pdf", ".txt"}:
                    if len(relative) > 500:
                        raise ValueError("Um caminho relativo excede 500 caracteres. Escolha uma pasta mais específica.")
                    paths.append(path)
                    if len(paths) > MAX_DOCUMENTS:
                        raise ValueError("A seleção excede 100 documentos PDF/TXT no total. Escolha uma pasta mais pequena.")
    return sorted(paths, key=lambda p: p.relative_to(root).as_posix().casefold()), warnings
