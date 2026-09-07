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
        raise ValueError("Introduza o caminho absoluto de uma pasta local.")
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError("O caminho deve ser absoluto, por exemplo C:\\Documentos.")
    if any(is_link(part) for part in [path, *path.parents]):
        raise ValueError("Escolha uma pasta real, sem ligações simbólicas ou junções.")
    if not path.is_dir():
        raise ValueError("A pasta não existe ou não está acessível.")
    if os.name == "nt":
        import ctypes
        if ctypes.windll.kernel32.GetDriveTypeW(path.anchor) == 4:
            raise ValueError("Unidades de rede não são suportadas. Escolha uma pasta local.")
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
            item.issues.append("Nome ou subpasta inválidos. Use nomes simples e / entre subpastas.")
            continue
        if Path(item.proposed_name).suffix.lower() != Path(item.current_path).suffix.lower():
            item.issues.append("Mantenha a extensão original do ficheiro.")
        target = root.joinpath(*parts, item.proposed_name)
        if len(str(target)) > 240:
            item.issues.append("O caminho proposto excede 240 caracteres.")
        cursor = root
        for part in [*parts, item.proposed_name]:
            # Case-insensitive lookup also catches Windows collisions on Linux.
            if cursor.is_dir():
                try:
                    entries = {p.name.casefold(): p for p in cursor.iterdir()}
                except OSError:
                    item.issues.append("Não foi possível verificar o destino.")
                    break
                cursor = entries.get(part.casefold(), cursor / part)
            else:
                cursor = cursor / part
            if is_link(cursor):
                item.issues.append("O destino contém uma ligação simbólica ou junção.")
                break
            if cursor.exists() and (part == item.proposed_name or not cursor.is_dir()):
                item.issues.append("O destino já existe ou uma pasta está ocupada por um ficheiro.")
                break
        if not target.resolve().is_relative_to(root):
            item.issues.append("O destino tem de ficar dentro da pasta selecionada.")
        targets.setdefault(str(target).casefold(), []).append(item)
    for group in targets.values():
        if len(group) > 1:
            for item in group:
                item.issues.append("Dois ou mais ficheiros têm o mesmo destino proposto.")
    for target, group in targets.items():
        for other, other_group in targets.items():
            if other.startswith(target + os.sep):
                for item in [*group, *other_group]:
                    issue = "Um destino proposto ocupa uma subpasta necessária a outro ficheiro."
                    if issue not in item.issues:
                        item.issues.append(issue)
    return plan
