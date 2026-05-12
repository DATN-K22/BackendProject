from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class SparseEmbedding:
    """Sparse BM25 embedding result for one text."""
    indices: list[int]   # token / vocabulary indices
    values: list[float]  # TF scores (IDF applied server-side by Qdrant)


class SparseEmbedder(ABC):
    @abstractmethod
    def embed(self, texts: Sequence[str]) -> list[SparseEmbedding]:
        """Embed a list of texts into sparse BM25 representations.

        Args:
            texts: Input strings to encode.

        Returns:
            One ``SparseEmbedding`` per input text, in order.
        """
        raise NotImplementedError
