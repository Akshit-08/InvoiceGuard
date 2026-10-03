"""Indian currency, numeral, and tax formatters."""

from typing import Tuple


def format_inr(amount: float, symbol: bool = True, use_ascii: bool = True) -> str:
    """Format float into Indian numeral system: e.g. 12,34,567.89.

    Last 3 digits are grouped, preceding digits are grouped in pairs of 2.
    """
    is_negative = amount < 0
    amount = abs(amount)
    parts = f"{amount:.2f}".split(".")
    integer_part = parts[0]
    decimal_part = parts[1]

    if len(integer_part) <= 3:
        formatted_int = integer_part
    else:
        last3 = integer_part[-3:]
        remaining = integer_part[:-3]
        # Group remaining digits in pairs from right to left
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        formatted_int = ",".join(groups) + "," + last3

    prefix = "-" if is_negative else ""
    curr = "Rs. " if use_ascii else "₹ "
    if not symbol:
        curr = ""

    return f"{prefix}{curr}{formatted_int}.{decimal_part}"


def amount_to_words_inr(amount: float) -> str:
    """Convert float amount to Indian currency words format.

    Example: 1,45,200.00 -> 'One Lakh Forty-Five Thousand Two Hundred Rupees Only'
    """
    try:
        from num2words import num2words

        int_part = int(amount)
        dec_part = int(round((amount - int_part) * 100))

        words = num2words(int_part, lang="en_IN").replace(",", "").title()
        res = f"{words} Rupees"
        if dec_part > 0:
            paise_words = num2words(dec_part, lang="en_IN").title()
            res += f" and {paise_words} Paise"
        res += " Only"
        return res
    except Exception:
        # Fallback if num2words not loaded yet
        return f"Rupees {format_inr(amount, symbol=False)} Only"


def compute_tax_breakdown(
    subtotal: float,
    tax_rate: float,
    vendor_state: str,
    buyer_state: str,
) -> Tuple[float, float, float, float]:
    """Compute CGST, SGST, IGST amounts based on interstate vs intrastate transaction.

    Returns: (cgst_amount, sgst_amount, igst_amount, total_tax)
    """
    total_tax = round(subtotal * tax_rate, 2)
    if vendor_state == buyer_state:
        # Intrastate: Equal split of CGST and SGST
        half_tax = round(total_tax / 2.0, 2)
        return (half_tax, half_tax, 0.0, total_tax)
    else:
        # Interstate: Entirely IGST
        return (0.0, 0.0, total_tax, total_tax)
