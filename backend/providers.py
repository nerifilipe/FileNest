import re
import unicodedata
from typing import Protocol
from .models import Suggestion


class SuggestionProvider(Protocol):
    def suggest(self, text: str, extension: str) -> Suggestion: ...


def normalize(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


class DemoProvider:
    """Deterministic keyword matching. No model, network or document execution."""
    rules = [
        ("Finance", "Finance", "invoice", ("invoice", "payment", "iban", "fatura", "pagamento")),
        ("Education", "Education", "notes", ("lecture", "course", "exam", "aula", "disciplina", "exame")),
        ("Work", "Work", "meeting", ("meeting", "project", "client", "reuniao", "projeto", "cliente")),
        ("Personal", "Personal", "travel", ("travel", "booking", "hotel", "viagem", "reserva")),
    ]

    def suggest(self, text: str, extension: str) -> Suggestion:
        normalized = normalize(text)
        for category, folder, stem, keywords in self.rules:
            matches = [word for word in keywords if re.search(r"\b" + word + r"\b", normalized)]
            if matches:
                date = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", normalized)
                name = f"{date.group(1)}_{stem}" if date else stem
                return Suggestion(category=category, proposed_folder=folder,
                                  proposed_name=name + extension.lower(),
                                  reason="Local rule: keywords «" + "», «".join(matches) + "» found in the text.")
        return Suggestion(category="Other", proposed_folder="Other", proposed_name="document" + extension.lower(),
                          reason="No specific rule matched. Review the name and category.")
