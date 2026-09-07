"""Opt-in smoke comparison using only the repository's fictional documents.

Run from the repository root: python -m scripts.evaluate_local_ai
Requires the local Ollama service and qwen3:4b. Never moves any files.
"""
import json
import time

from backend.main import analyze
from backend.models import AnalyzeRequest


def main():
    started = time.monotonic()
    rules = analyze(AnalyzeRequest(demo=True))
    ai = analyze(AnalyzeRequest(demo=True, provider="ollama"))
    by_name = {item.current_path: item for item in rules.items}
    print(json.dumps({"seconds": round(time.monotonic() - started, 2), "warnings": ai.warnings,
                      "documents": [{"file": item.current_path, "source": item.suggestion_source,
                                     "rules": by_name[item.current_path].proposed_name,
                                     "ai": item.proposed_name, "category": item.category,
                                     "issues": item.issues, "note": item.provider_note}
                                    for item in ai.items if item.status == "ready"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
