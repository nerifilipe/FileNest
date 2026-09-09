"""Generate an image-only, entirely fictional PDF for the OCR demonstration."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def create_scan(path: Path):
    image = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.load_default(size=48)
    body_font = ImageFont.load_default(size=34)
    draw.text((100, 120), "FILENEST | OCR SAMPLE", font=title_font, fill="#284C38")
    lines = ["FICTIONAL INVOICE", "Solar Stationery - fictional business", "Date: 2026-09-05",
             "School supplies: 18.90 EUR", "Payment completed", "NOT A TAX DOCUMENT",
             "Test document with no personal data."]
    for index, line in enumerate(lines):
        draw.text((100, 270 + index * 90), line, font=body_font, fill="#26352C")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PDF", resolution=150)
    image.close()


if __name__ == "__main__":
    create_scan(Path(__file__).resolve().parents[1] / "examples/demo/scanned.pdf")
