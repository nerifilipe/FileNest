import os
import re
import stat
from pathlib import Path
from .models import Plan

RESERVED = re.compile(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", re.I)


def is_link(path: Path) -> bool:
    try:
        info = path.lstat()
        # Also handles Windows junctions on Python 3.11, before Path.is_junction.
        return stat.S_ISLNK(info.st_mode) or bool(
            getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        )
    except OSError:
        return False


def local_root(raw: str) -> Path:
    # UNC/network shares are excluded: this release only reads local drives.
    if not raw.strip() or raw.startswith(("\\\\", "//")):
        raise ValueError("Enter the absolute path of a local folder.")
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError("The path must be absolute, for example C:\\Documents.")
    if any(is_link(part) for part in [path, *path.parents]):
        raise ValueError("Choose a real folder without symbolic links or junctions.")
    if not path.is_dir():
        raise ValueError("The folder does not exist or is not accessible.")
    if os.name == "nt":
        import ctypes
        if ctypes.windll.kernel32.GetDriveTypeW(path.anchor) == 4:
            raise ValueError("Network drives are not supported. Choose a local folder.")
    return path.resolve()


def valid_component(value: str) -> bool:
    return bool(value and len(value) <= 120 and value not in (".", "..")
                and not value.endswith((".", " ")) and not RESERVED.match(value)
                and not re.search(r'[<>:"/\\|?*\x00-\x1f]', value))


def validate_plan(plan: Plan) -> Plan:
    root = local_root(plan.root)
    targets: dict[str, list] = {}
    for item in plan.items:
        item.issues = []
        if not item.included or item.status != "ready":
            continue
        parts = item.proposed_folder.split("/")
        if not valid_component(item.proposed_name) or not all(valid_component(p) for p in parts):
            item.issues.append("Invalid name or folder. Use simple names and / between subfolders.")
            continue
        if Path(item.proposed_name).suffix.lower() != Path(item.current_path).suffix.lower():
            item.issues.append("Keep the original file extension.")
        target = root.joinpath(*parts, item.proposed_name)
        if len(str(target)) > 240:
            item.issues.append("The proposed path exceeds 240 characters.")
        cursor = root
        for part in [*parts, item.proposed_name]:
            # Case-insensitive lookup also catches Windows collisions on Linux.
            if cursor.is_dir():
                try:
                    entries = {p.name.casefold(): p for p in cursor.iterdir()}
                except OSError:
                    item.issues.append("Could not check the destination.")
                    break
                cursor = entries.get(part.casefold(), cursor / part)
            else:
                cursor = cursor / part
            if is_link(cursor):
                item.issues.append("The destination contains a symbolic link or junction.")
                break
            if cursor.exists() and (part == item.proposed_name or not cursor.is_dir()):
                item.issues.append("The destination exists or a file occupies a required folder.")
                break
        if not target.resolve().is_relative_to(root):
            item.issues.append("The destination must stay inside the selected folder.")
        targets.setdefault(str(target).casefold(), []).append(item)
    for group in targets.values():
        if len(group) > 1:
            for item in group:
                item.issues.append("Two or more files have the same proposed destination.")
    for target, group in targets.items():
        for other, other_group in targets.items():
            if other.startswith(target + os.sep):
                for item in [*group, *other_group]:
                    issue = "A proposed destination occupies a subfolder required by another file."
                    if issue not in item.issues:
                        item.issues.append(issue)
    return plan
