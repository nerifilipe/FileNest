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
            raise ValueError("A folder changed or contains a link. Analyze again.")
        with os.scandir(directory) as entries:
            for entry in entries:
                count += 1
                if count > MAX_ENTRIES:
                    raise ValueError("The selection exceeds 2,000 total entries. Choose a smaller folder.")
                path = Path(entry.path)
                relative = path.relative_to(root).as_posix()
                if is_link(path):
                    warnings.append(f"Link skipped: {relative}")
                elif entry.is_dir(follow_symlinks=False) and recursive:
                    if depth >= MAX_DEPTH:
                        raise ValueError("The selection exceeds 20 subfolder levels. Choose a more specific folder.")
                    pending.append((path, depth + 1))
                elif entry.is_file(follow_symlinks=False) and path.suffix.lower() in {".pdf", ".txt"}:
                    if len(relative) > 500:
                        raise ValueError("A relative path exceeds 500 characters. Choose a more specific folder.")
                    paths.append(path)
                    if len(paths) > MAX_DOCUMENTS:
                        raise ValueError("The selection exceeds 100 PDF/TXT documents. Choose a smaller folder.")
    return sorted(paths, key=lambda p: p.relative_to(root).as_posix().casefold()), warnings
