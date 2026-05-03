from __future__ import annotations

from collections.abc import Sequence

from langchain_openai import OpenAIEmbeddings

from interfaces.embedder import Embedder


class OpenAIEmbedder(Embedder):
    def __init__(self, model: str) -> None:
        self.model = model
        self._embedder = OpenAIEmbeddings(model=model)

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._embedder.embed_documents(list(texts))
