"""GSTIN (Goods and Services Tax Identification Number) utilities.

Implements official Indian GSTIN generation and Mod-36 checksum validation.
"""

import re
from typing import Optional, Tuple

GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
CHAR_TO_VAL = {c: i for i, c in enumerate(GST_CHARS)}
VAL_TO_CHAR = {i: c for i, c in enumerate(GST_CHARS)}

# Indian States & Union Territories GST State Codes
STATE_CODES = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "36": "Telangana",
    "37": "Andhra Pradesh",
}

GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")


def compute_gstin_check_digit(base_14: str) -> str:
    """Compute the 15th character (Mod-36 check digit) for a 14-character GSTIN base.

    Algorithm:
    - Characters 0-9 have values 0-9, A-Z have values 10-35.
    - Weights alternate 1, 2 for indices 0 to 13.
    - factor = val * weight
    - sum += (factor // 36) + (factor % 36)
    - check_val = (36 - (sum % 36)) % 36
    """
    if len(base_14) != 14:
        raise ValueError(f"Base GSTIN string must be exactly 14 characters, got {len(base_14)}")

    base_14 = base_14.upper()
    total_sum = 0
    for i, char in enumerate(base_14):
        if char not in CHAR_TO_VAL:
            raise ValueError(f"Invalid character '{char}' in GSTIN base")
        val = CHAR_TO_VAL[char]
        weight = 1 if (i % 2 == 0) else 2
        product = val * weight
        total_sum += (product // 36) + (product % 36)

    check_val = (36 - (total_sum % 36)) % 36
    return VAL_TO_CHAR[check_val]


def generate_valid_gstin(state_code: str, pan: str, entity_num: str = "1") -> str:
    """Generate a 15-character GSTIN with valid format and checksum.

    Args:
        state_code: 2-digit state code (e.g. '27', '07')
        pan: 10-character PAN string (e.g. 'ABCDE1234F')
        entity_num: 1-character entity count (usually '1')
    """
    state_code = str(state_code).zfill(2)
    pan = pan.upper().strip()
    entity_num = str(entity_num).upper()
    base_14 = f"{state_code}{pan}{entity_num}Z"
    check_digit = compute_gstin_check_digit(base_14)
    return f"{base_14}{check_digit}"


def validate_gstin(gstin: Optional[str]) -> Tuple[bool, str]:
    """Validate GSTIN format, state code, and Mod-36 checksum.

    Returns (is_valid, reason).
    """
    if not gstin:
        return False, "GSTIN is missing or empty"

    cleaned = gstin.upper().strip()
    if len(cleaned) != 15:
        return False, f"Expected 15 characters, got {len(cleaned)}"

    if not GSTIN_REGEX.match(cleaned):
        return False, "GSTIN format does not match official structure (2 digits + 10 char PAN + 1 entity + Z + 1 check digit)"

    state = cleaned[:2]
    if state not in STATE_CODES:
        return False, f"State code '{state}' is not a recognized Indian GST state code"

    expected_check = compute_gstin_check_digit(cleaned[:14])
    actual_check = cleaned[14]
    if expected_check != actual_check:
        return False, f"Checksum verification failed: expected '{expected_check}', found '{actual_check}'"

    return True, "Valid GSTIN"
