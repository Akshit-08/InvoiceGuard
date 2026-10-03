"""File upload security and validation utilities."""

import hashlib
import re
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile, status

from backend.app.config import settings

# Supported magic bytes headers
MAGIC_BYTES = {
    b"%PDF-": ".pdf",
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",  # JPEG matches .jpg and .jpeg
}

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal or script injection."""
    filename = Path(filename).name
    # Keep alphanumeric, dot, underscore, dash
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)
    return clean[:200] if clean else "unnamed_document"


def validate_file_upload(file: UploadFile, content: bytes) -> Tuple[str, str]:
    """Validate file extension, magic bytes, and file size.

    Returns (sanitized_filename, sha256_hash).
    Raises HTTPException 400 or 413 if invalid.
    """
    # 1. Size check
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB",
                "details": {"size_bytes": len(content), "max_bytes": max_bytes},
            },
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "FILE_EMPTY",
                "message": "Uploaded file is empty (0 bytes)",
                "details": None,
            },
        )

    # 2. Extension check
    filename = sanitize_filename(file.filename or "invoice")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UNSUPPORTED_FILE_TYPE",
                "message": f"Unsupported file extension '{ext}'. Allowed: {sorted(list(ALLOWED_EXTENSIONS))}",
                "details": {"extension": ext},
            },
        )

    # 3. Magic bytes verification (prevent .exe renamed to .pdf)
    is_valid_magic = False
    for magic, mapped_ext in MAGIC_BYTES.items():
        if content.startswith(magic):
            if mapped_ext == ".jpg" and ext in {".jpg", ".jpeg"}:
                is_valid_magic = True
                break
            elif mapped_ext == ext:
                is_valid_magic = True
                break

    if not is_valid_magic:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CORRUPTED_OR_DISGUISED_FILE",
                "message": "File header magic bytes do not match the expected extension.",
                "details": {"extension": ext},
            },
        )

    # 4. Compute SHA-256
    sha256 = hashlib.sha256(content).hexdigest()
    return filename, sha256
