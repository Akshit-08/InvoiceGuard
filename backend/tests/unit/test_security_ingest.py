"""Unit tests for file upload security and ingest validation."""

import io

import pytest
from fastapi import HTTPException, UploadFile

from backend.app.core.security import sanitize_filename, validate_file_upload


def test_sanitize_filename():
    assert sanitize_filename("../../../etc/passwd.pdf") == "passwd.pdf"
    assert sanitize_filename("invoice*#($@!.pdf") == "invoice______.pdf"
    assert sanitize_filename("") == "unnamed_document"


def test_reject_empty_file():
    upload = UploadFile(filename="empty.pdf", file=io.BytesIO(b""))
    with pytest.raises(HTTPException) as exc:
        validate_file_upload(upload, b"")
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "FILE_EMPTY"


def test_reject_disguised_exe_as_pdf():
    # Windows MZ executable header renamed to .pdf
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00"
    upload = UploadFile(filename="malicious_payload.pdf", file=io.BytesIO(fake_exe))
    with pytest.raises(HTTPException) as exc:
        validate_file_upload(upload, fake_exe)
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "CORRUPTED_OR_DISGUISED_FILE"


def test_reject_oversized_file():
    huge_bytes = b"0" * (16 * 1024 * 1024)  # 16 MB > 15 MB limit
    upload = UploadFile(filename="large.pdf", file=io.BytesIO(huge_bytes))
    with pytest.raises(HTTPException) as exc:
        validate_file_upload(upload, huge_bytes)
    assert exc.value.status_code == 413
    assert exc.value.detail["code"] == "FILE_TOO_LARGE"


def test_accept_valid_pdf_magic():
    valid_pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n"
    upload = UploadFile(filename="invoice_clean.pdf", file=io.BytesIO(valid_pdf))
    filename, sha256 = validate_file_upload(upload, valid_pdf)
    assert filename == "invoice_clean.pdf"
    assert len(sha256) == 64
