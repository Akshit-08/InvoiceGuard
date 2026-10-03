"""Unit tests for GSTIN checksum generation and validation."""

from ml.synthetic.gstin import (
    generate_valid_gstin,
    validate_gstin,
)


def test_valid_gstin_generation_and_validation():
    # 27 = Maharashtra, PAN = AABCT1332L, Entity = 1
    gstin = generate_valid_gstin("27", "AABCT1332L", "1")
    assert len(gstin) == 15
    assert gstin.startswith("27AABCT1332L1Z")

    is_valid, msg = validate_gstin(gstin)
    assert is_valid is True, f"Failed validation: {msg}"


def test_corrupted_check_digit():
    gstin = generate_valid_gstin("07", "AAACG1234M", "1")
    # Change the last check digit
    corrupted_char = "0" if gstin[-1] != "0" else "1"
    corrupted_gstin = gstin[:-1] + corrupted_char

    is_valid, msg = validate_gstin(corrupted_gstin)
    assert is_valid is False
    assert "Checksum verification failed" in msg


def test_invalid_state_code():
    # 99 is invalid state code
    is_valid, msg = validate_gstin("99AABCT1332L1Z5")
    assert is_valid is False
    assert "State code" in msg


def test_malformed_gstin():
    is_valid, msg = validate_gstin("INVALID_SHORT")
    assert is_valid is False
