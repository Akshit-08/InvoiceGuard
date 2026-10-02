"""Unit tests for Normalizer service."""

from backend.app.services.extraction.normalize import (
    normalize_account_number,
    normalize_date,
    normalize_gstin,
    normalize_ifsc,
    normalize_inr_amount,
    normalize_pan,
)


def test_normalize_inr_amount():
    assert normalize_inr_amount("1,00,000.00") == 100000.0
    assert normalize_inr_amount("Rs. 45,250.50") == 45250.50
    assert normalize_inr_amount("₹ 12,34,567.89") == 1234567.89
    assert normalize_inr_amount("INR 5,000") == 5000.0
    assert normalize_inr_amount("-2,500.00") == -2500.0
    assert normalize_inr_amount("(1,200.00)") == -1200.0
    assert normalize_inr_amount("invalid") is None


def test_normalize_date():
    assert normalize_date("15/09/2026") == "2026-09-15"
    assert normalize_date("15-09-2026") == "2026-09-15"
    assert normalize_date("2026-09-15") == "2026-09-15"
    assert normalize_date("15-Sep-2026") == "2026-09-15"
    assert normalize_date("Invoice Date: 22/10/2026") == "2026-10-22"
    assert normalize_date("Dated: 05-11-2025") == "2025-11-05"


def test_normalize_gstin():
    assert normalize_gstin("27AABCT1332L1ZE") == "27AABCT1332L1ZE"
    assert normalize_gstin("gstin: 27AABCT1332L1ZE ") == "27AABCT1332L1ZE"
    assert normalize_gstin("27aabct1332l1ze") == "27AABCT1332L1ZE"


def test_normalize_pan():
    assert normalize_pan("AABCT1332L") == "AABCT1332L"
    assert normalize_pan("pan: aabct1332l ") == "AABCT1332L"


def test_normalize_ifsc():
    assert normalize_ifsc("HDFC0001234") == "HDFC0001234"
    assert normalize_ifsc("ifsc: hdfc0001234") == "HDFC0001234"


def test_normalize_account_number():
    assert normalize_account_number("987654321012") == "987654321012"
    assert normalize_account_number("A/c No: 987654321012") == "987654321012"
    assert normalize_account_number("Account: 1234-5678-9012") == "123456789012"
