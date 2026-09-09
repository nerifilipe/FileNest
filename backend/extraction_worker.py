"""Entrypoint only. Heavy parsers are imported after OS limits are assigned."""
import json
from .processes import read_payload


def main():
    payload = read_payload()
    from pathlib import Path
    from .extraction import extract_document, ExtractionError
    try:
        result = extract_document(Path(payload["path"]), payload.get("ocr", False), payload.get("scratch"))
    except ExtractionError as error:
        result = {"error": str(error), "status": error.status}
    except MemoryError:
        result = {"error": "Extraction exceeded the available memory.", "status": "resource_limit"}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
