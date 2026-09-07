from pydantic import BaseModel, Field
from typing import Literal


class Suggestion(BaseModel):
    category: str = Field(max_length=120)
    proposed_name: str = Field(max_length=500)
    proposed_folder: str = Field(max_length=500)
    reason: str = Field(max_length=2000)


class FileItem(Suggestion):
    id: str = Field(max_length=500)
    current_path: str = Field(max_length=500)
    size: int
    status: str = "ready"
    included: bool = True
    issues: list[str] = Field(default_factory=list)
    fingerprint: dict[str, str] | None = None
    suggestion_source: Literal["demo-rules", "ollama"] = "demo-rules"
    provider_note: str = ""


class AnalyzeRequest(BaseModel):
    path: str = Field(default="", max_length=4096)
    demo: bool = False
    provider: Literal["demo-rules", "ollama"] = "demo-rules"


class Plan(BaseModel):
    root: str = Field(max_length=4096)
    provider: str = "demo-rules"
    items: list[FileItem] = Field(max_length=100)
    warnings: list[str] = Field(default_factory=list)
