from __future__ import annotations

import urllib.error
from typing import Any, Mapping
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from interfaces.source_connector import SourceConnector
from models.document import DocumentBlob


class HttpPresignedUrlSource(SourceConnector):
    def __init__(self, timeout_seconds: int = 30, max_bytes: int = 25_000_000, fallback_to_s3: bool = True) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes
        self.fallback_to_s3 = fallback_to_s3
        self._s3_client = None

    def fetch(
        self,
        source_uri: str,
        *,
        document_id: str,
        metadata: Mapping[str, Any] | None = None,
    ) -> DocumentBlob:
        try: 
            request = Request(source_uri, method="GET")
            with urlopen(request, timeout=self.timeout_seconds) as response:
                content = response.read(self.max_bytes + 1)
                if len(content) > self.max_bytes:
                    raise ValueError(
                        f"File exceeds {self.max_bytes} bytes limit from source {source_uri}"
                    )
                content_type = response.headers.get_content_type()
                filename = _resolve_filename(response.headers.get("Content-Disposition"), source_uri)

            return DocumentBlob(
                document_id=document_id,
                source_uri=source_uri,
                content=content,
                content_type=content_type,
                filename=filename,
                metadata=dict(metadata or {}),
            )
        except urllib.error.HTTPError as e:
            # Fallback to direct S3 download if URL is forbidden/expired
            if e.code in (401, 403) and self.fallback_to_s3 and self._is_s3_url(source_uri):
                print(f"[Fallback] Presigned URL expired (HTTP {e.code}) for doc {document_id}. Using boto3 direct download.")
                return self._fetch_s3_direct(source_uri, document_id, metadata)
            raise ValueError(f"Failed to fetch document from {source_uri}: {str(e)}") from e
        except Exception as e:
            raise ValueError(f"Failed to fetch document from {source_uri}: {str(e)}") from e

    def _is_s3_url(self, url: str) -> bool:
        """Check if the URL looks like an S3 URL."""
        parsed = urlparse(url)
        return "s3.amazonaws.com" in parsed.netloc or ".s3." in parsed.netloc

    def _fetch_s3_direct(self, url: str, document_id: str, metadata: Mapping[str, Any] | None) -> DocumentBlob:
        if not self._s3_client:
            import boto3
            self._s3_client = boto3.client('s3')

        parsed = urlparse(url)
        netloc = parsed.netloc
        path = unquote(parsed.path.lstrip('/'))

        # Extract Bucket and Key based on S3 URL format
        if netloc.startswith('s3.'): # Path-style URL (https://s3.region.amazonaws.com/bucket-name/key-name)
            parts = path.split('/', 1)
            if len(parts) != 2:
                raise ValueError(f"Cannot parse path-style S3 URL: {url}")
            bucket_name, object_key = parts
        else: # Virtual-hosted style URL (https://bucket-name.s3.region.amazonaws.com/key-name)
            bucket_name = netloc.split('.s3')[0]
            object_key = path

        try:
            response = self._s3_client.get_object(Bucket=bucket_name, Key=object_key)
            content = response['Body'].read(self.max_bytes + 1)
            
            if len(content) > self.max_bytes:
                raise ValueError(f"File exceeds {self.max_bytes} bytes limit")

            content_type = response.get('ContentType', 'application/octet-stream')
            filename = _resolve_filename(None, url)

            return DocumentBlob(
                document_id=document_id,
                source_uri=url,
                content=content,
                content_type=content_type,
                filename=filename,
                metadata=dict(metadata or {}),
            )
        except Exception as e:
            raise ValueError(f"Direct S3 fallback failed for {document_id}: {str(e)}") from e


def _resolve_filename(content_disposition: str | None, source_uri: str) -> str:
    if content_disposition and "filename=" in content_disposition:
        filename = content_disposition.split("filename=", 1)[1].strip('" ')
        if filename:
            return filename

    path = urlparse(source_uri).path
    tail = path.rsplit("/", 1)[-1]
    return unquote(tail) if tail else "document"
