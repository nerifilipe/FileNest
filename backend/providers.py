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
        ("Finanças", "Financas", "fatura", ("fatura", "iban", "pagamento")),
        ("Formação", "Formacao", "apontamentos", ("aula", "disciplina", "exame")),
        ("Trabalho", "Trabalho", "reuniao", ("reuniao", "projeto", "cliente")),
        ("Pessoal", "Pessoal", "viagem", ("viagem", "reserva", "hotel")),
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
                                  reason="Regra local: palavras «" + "», «".join(matches) + "» encontradas no texto.")
        return Suggestion(category="Outros", proposed_folder="Outros", proposed_name="documento" + extension.lower(),
                          reason="Nenhuma regra específica correspondeu. Reveja o nome e a categoria.")
