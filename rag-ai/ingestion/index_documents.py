from __future__ import annotations

"""
This is a placeholder entrypoint for ingestion pipelines.

Recommended flow:
1. Load raw source docs (S3, DB, APIs, files)
2. Normalize + chunk
3. Embed with the configured embedding model
4. Upsert to Qdrant collection scoped by environment
"""


def main() -> None:
    print("Implement ingestion pipeline here.")


if __name__ == "__main__":
    main()
