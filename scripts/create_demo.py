"""Rebuild only the synthetic fixtures shipped with the repository."""
from pathlib import Path
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

ROOT = Path(__file__).resolve().parents[1] / "examples" / "demo"


def text_pdf(path: Path, lines: list[str]) -> None:
    writer = PdfWriter()
    page = writer.add_blank_page(width=595, height=842)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    safe_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    stream.set_data(("BT /F1 14 Tf 50 770 Td 24 TL " + " T* ".join(f"({line}) Tj" for line in safe_lines) + " ET").encode("latin-1"))
    page[NameObject("/Contents")] = writer._add_object(stream)
    writer.write(path)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    text_pdf(ROOT / "scan_001.pdf", ["FILENEST | DOCUMENTO FICTICIO", "Fatura de demonstracao", "2026-09-01", "Entidade ficticia: Papelaria Lua Verde", "Pagamento: 24,50 EUR", "Sem validade fiscal. Sem dados pessoais."])
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.write(ROOT / "sem_texto.pdf")
    writer.encrypt("filenest-demo")
    writer.write(ROOT / "protegido.pdf")
