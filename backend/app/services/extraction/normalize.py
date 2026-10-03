"""Normalization utilities for Indian financial documents."""

import re
from datetime import datetime
from typing import Optional


def normalize_inr_amount(raw_val: Optional[str]) -> Optional[float]:
    """Parse string representations of currency and numbers into float.

    Handles Indian number formatting: '1,00,000.00', 'Rs. 45,000', '₹ 12,34,567.89'.
    """
    if raw_val is None:
        return None

    cleaned = str(raw_val).strip()
    # Strip percentage rates like (18%) or 18%
    cleaned = re.sub(r"\d+(?:\.\d+)?\s*%", "", cleaned)

    # Strip currency indicators
    cleaned = re.sub(r"(?i)(rs\.?|inr|₹)", "", cleaned).strip()

    # Remove commas
    cleaned = cleaned.replace(",", "")

    # Handle negative / parentheses
    is_neg = False
    if cleaned.startswith("(") and cleaned.endswith(")"):
        is_neg = True
        cleaned = cleaned[1:-1].strip()
    elif cleaned.startswith("-"):
        is_neg = True
        cleaned = cleaned[1:].strip()

    # Match all numeric float/int candidates and pick the last one (amounts are typically right-aligned)
    matches = re.findall(r"[-+]?\d*\.?\d+", cleaned)
    if not matches:
        return None

    valid = [m for m in matches if m and m not in (".", "-", "+")]
    if not valid:
        return None

    try:
        val = float(valid[-1])
        return -val if is_neg else val
    except ValueError:
        return None


def normalize_date(raw_date: Optional[str]) -> Optional[str]:
    """Parse various date formats into standard ISO 'YYYY-MM-DD'.

    Handles:
    - DD/MM/YYYY, DD-MM-YYYY
    - YYYY-MM-DD, YYYY/MM/DD
    - DD-MMM-YYYY (e.g. 15-Sep-2026)
    """
    if not raw_date:
        return None

    cleaned = str(raw_date).strip()
    # Clean leading labels like "Date:", "Dated"
    cleaned = re.sub(r"(?i)^(date|dated|inv date|invoice date)\s*[:#-]?\s*", "", cleaned).strip()

    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%Y/%m/%d",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Regex search for embedded date pattern
    match = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", cleaned)
    if match:
        d, m, y = match.groups()
        try:
            dt = datetime(int(y), int(m), int(d))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    match_iso = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", cleaned)
    if match_iso:
        y, m, d = match_iso.groups()
        try:
            dt = datetime(int(y), int(m), int(d))
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return cleaned


def normalize_gstin(raw_gstin: Optional[str]) -> Optional[str]:
    if not raw_gstin:
        return None
    cleaned = re.sub(r"(?i)^gstin\s*[:#-]?\s*", "", str(raw_gstin)).strip()
    cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned).upper()
    return cleaned if len(cleaned) == 15 else cleaned


def normalize_pan(raw_pan: Optional[str]) -> Optional[str]:
    if not raw_pan:
        return None
    cleaned = re.sub(r"(?i)^pan\s*[:#-]?\s*", "", str(raw_pan)).strip()
    cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned).upper()
    return cleaned if len(cleaned) == 10 else cleaned


def normalize_ifsc(raw_ifsc: Optional[str]) -> Optional[str]:
    if not raw_ifsc:
        return None
    cleaned = re.sub(r"(?i)^ifsc\s*[:#-]?\s*", "", str(raw_ifsc)).strip()
    cleaned = re.sub(r"[^A-Za-z0-9]", "", cleaned).upper()
    return cleaned if len(cleaned) == 11 else cleaned


def normalize_account_number(raw_acc: Optional[str]) -> Optional[str]:
    if not raw_acc:
        return None
    cleaned = re.sub(r"(?i)^(a/c\s*(no)?|account\s*(no)?)\s*[:#-]?\s*", "", str(raw_acc)).strip()
    digits = re.sub(r"[^0-9]", "", cleaned)
    return digits if len(digits) >= 8 else cleaned
