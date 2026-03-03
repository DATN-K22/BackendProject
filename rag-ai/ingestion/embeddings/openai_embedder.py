from __future__ import annotations

from collections.abc import Sequence

from langchain_openai import OpenAIEmbeddings

from ingestion.interfaces.embedder import Embedder


class OpenAIEmbedder(Embedder):
    def __init__(self, model: str) -> None:
        pass

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        pass
