from __future__ import annotations

import logging
from collections.abc import Sequence

from ingestion.interfaces.sparse_embedder import SparseEmbedder, SparseEmbedding

logger = logging.getLogger(__name__)

try:
    from fastembed import SparseTextEmbedding as _SparseTextEmbedding
except ImportError:  # pragma: no cover
    _SparseTextEmbedding = None  # type: ignore[assignment]


class FastEmbedSparseEmbedder(SparseEmbedder):
    """BM25 sparse embedder backed by FastEmbed's ``Qdrant/bm25`` model.

    The client computes Term Frequency (TF) components only.
    Qdrant applies the IDF factor at query time via ``modifier=Modifier.IDF``
    in the collection's sparse vector config — together they form full BM25.

    Install:
        pip install fastembed
    """

    def __init__(self, model_name: str = "Qdrant/bm25") -> None:
        if _SparseTextEmbedding is None:
            raise RuntimeError(
                "FastEmbedSparseEmbedder requires the `fastembed` package. "
                "Install it with: pip install fastembed"
            )
        self.model_name = model_name
        self._model = _SparseTextEmbedding(model_name=model_name)
        logger.info("Loaded sparse embedder model: %s", model_name)

    def embed(self, texts: Sequence[str]) -> list[SparseEmbedding]:
        """Return one ``SparseEmbedding`` per input text.

        Args:
            texts: Input strings to encode.

        Returns:
            List of ``SparseEmbedding(indices, values)`` in the same order.
        """
        if not texts:
            return []

        results: list[SparseEmbedding] = []
        for emb in self._model.embed(list(texts)):
            results.append(
                SparseEmbedding(
                    indices=list(emb.indices),
                    values=list(emb.values),
                )
            )
        return results
