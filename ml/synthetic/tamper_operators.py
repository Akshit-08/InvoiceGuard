"""Tamper Operator Registry for Synthetic Invoice Anomaly Generation.

Implements all 16 tamper operators and 3 modes (re-render, pixel-edit, pdf-edit)
per Blueprint section 10.
"""

from __future__ import annotations

import copy
import random
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

from PIL import Image, ImageDraw

from ml.synthetic.formatters import amount_to_words_inr
from ml.synthetic.templates import InvoiceSpec


@dataclass
class TamperResult:
    spec: InvoiceSpec
    labels: list[str]
    affected_fields: list[str]
    mode: str = "re-render"  # re-render, pixel-edit, pdf-edit
    details: Optional[dict[str, Any]] = None


# Operator functions: operate on InvoiceSpec and return TamperResult
def op_line_total_edit(spec: InvoiceSpec) -> TamperResult:
    """Modify a single line item total without modifying subtotal/grand total."""
    s = copy.deepcopy(spec)
    if not s.items:
        return TamperResult(s, [], [])

    idx = random.randint(0, len(s.items) - 1)
    orig_total = s.items[idx]["line_total"]
    # Inflate line total by e.g. 5,000 to 25,000
    inflation = random.choice([5000.0, 10000.0, 15000.0, 25000.0])
    s.items[idx]["line_total"] = round(orig_total + inflation, 2)

    return TamperResult(
        spec=s,
        labels=["LINE_TOTAL_MISMATCH"],
        affected_fields=[f"items[{idx}].line_total"],
        details={"line_index": idx, "original": orig_total, "tampered": s.items[idx]["line_total"]},
    )


def op_grand_total_edit(spec: InvoiceSpec) -> TamperResult:
    """Tamper the grand total so subtotal + tax != grand total."""
    s = copy.deepcopy(spec)
    orig_total = s.grand_total
    diff = random.choice([10000.0, 25000.0, 50000.0, -15000.0])
    s.grand_total = round(orig_total + diff, 2)

    return TamperResult(
        spec=s,
        labels=["GRAND_TOTAL_MISMATCH"],
        affected_fields=["grand_total"],
        details={"original": orig_total, "tampered": s.grand_total, "difference": diff},
    )


def op_amount_inflate(spec: InvoiceSpec) -> TamperResult:
    """Inflate total amount to 3x-4x of vendor's historical median."""
    s = copy.deepcopy(spec)
    factor = random.uniform(2.8, 4.2)
    s.subtotal = round(s.subtotal * factor, 2)
    tax_amt = round(s.subtotal * s.tax_rate, 2)
    s.grand_total = round(s.subtotal + tax_amt, 2)
    s.amount_in_words = amount_to_words_inr(s.grand_total)

    # Scale line items proportionally
    for item in s.items:
        item["unit_price"] = round(item["unit_price"] * factor, 2)
        item["line_total"] = round(item["quantity"] * item["unit_price"], 2)

    return TamperResult(
        spec=s,
        labels=["AMOUNT_OUTLIER"],
        affected_fields=["grand_total", "subtotal"],
        details={"inflation_factor": factor, "tampered_total": s.grand_total},
    )


def op_tax_rate_change(spec: InvoiceSpec) -> TamperResult:
    """Alter the tax rate to an invalid slab or mismatch reported tax."""
    s = copy.deepcopy(spec)
    orig_rate = s.tax_rate
    # Set to invalid slab like 23% or swap 18% to 28% without adjusting total
    invalid_rates = [0.23, 0.17, 0.31]
    s.tax_rate = random.choice(invalid_rates)

    return TamperResult(
        spec=s,
        labels=["TAX_RATE_INVALID_SLAB", "TAX_AMOUNT_MISMATCH"],
        affected_fields=["tax.total", "tax.rate"],
        details={"original_rate": orig_rate, "invalid_rate": s.tax_rate},
    )


def op_tax_amount_edit(spec: InvoiceSpec) -> TamperResult:
    """Modify tax amount so rate * taxable != tax."""
    s = copy.deepcopy(spec)
    orig_total = s.grand_total
    # Modify grand total by random tax slippage
    s.grand_total = round(orig_total + random.choice([2450.0, 5200.0, -1800.0]), 2)

    return TamperResult(
        spec=s,
        labels=["TAX_AMOUNT_MISMATCH", "GRAND_TOTAL_MISMATCH"],
        affected_fields=["tax.total", "grand_total"],
    )


def op_gstin_corrupt(spec: InvoiceSpec) -> TamperResult:
    """Corrupt GSTIN checksum or state code."""
    s = copy.deepcopy(spec)
    gstin = s.vendor_gstin
    # Change check digit
    last_char = gstin[-1]
    corrupted_char = "0" if last_char != "0" else "X"
    s.vendor_gstin = gstin[:-1] + corrupted_char

    return TamperResult(
        spec=s,
        labels=["GSTIN_CHECKSUM_FAIL"],
        affected_fields=["vendor.gstin"],
        details={"original": gstin, "corrupted": s.vendor_gstin},
    )


def op_bank_swap(spec: InvoiceSpec) -> TamperResult:
    """Swap vendor bank account to an unrecognized account (account takeover)."""
    s = copy.deepcopy(spec)
    orig_acc = s.account_number
    # Generate new random account
    s.account_number = f"99{random.randint(100000000, 999999999)}"
    s.bank_name = "Equitas Small Finance Bank"
    s.ifsc = f"ESFB000{random.randint(1000, 9999)}"

    return TamperResult(
        spec=s,
        labels=["BANK_ACCOUNT_CHANGED"],
        affected_fields=["payment.account_number", "payment.bank_name", "payment.ifsc"],
        details={"original_last4": orig_acc[-4:], "new_last4": s.account_number[-4:]},
    )


def op_vendor_lookalike(spec: InvoiceSpec) -> TamperResult:
    """Create a lookalike typosquatted vendor name."""
    s = copy.deepcopy(spec)
    orig_name = s.vendor_name
    # Subtle character replacement
    subs = {"i": "1", "o": "0", "e": "a", "s": "z", "l": "1"}
    tampered_name = orig_name
    for orig_char, rep_char in subs.items():
        if orig_char in tampered_name.lower():
            idx = tampered_name.lower().find(orig_char)
            tampered_name = tampered_name[:idx] + rep_char + tampered_name[idx + 1 :]
            break

    s.vendor_name = tampered_name
    return TamperResult(
        spec=s,
        labels=["LOOKALIKE_VENDOR_NAME"],
        affected_fields=["vendor.name"],
        details={"original": orig_name, "lookalike": tampered_name},
    )


def op_invoice_no_reuse(spec: InvoiceSpec) -> TamperResult:
    """Simulate invoice number reused by resetting to a fixed prior sequence."""
    s = copy.deepcopy(spec)
    s.invoice_number = "INV/25-26/0001"

    return TamperResult(
        spec=s,
        labels=["INVOICE_NUMBER_REUSED"],
        affected_fields=["invoice_number"],
    )


def op_invoice_no_jump(spec: InvoiceSpec) -> TamperResult:
    """Simulate implausible sequence jump (e.g. from 0045 to 9882)."""
    s = copy.deepcopy(spec)
    s.invoice_number = f"INV/25-26/{random.randint(8800, 9999):04d}"

    return TamperResult(
        spec=s,
        labels=["INVOICE_NUMBER_SEQUENCE_ANOMALY"],
        affected_fields=["invoice_number"],
    )


def op_date_shift(spec: InvoiceSpec) -> TamperResult:
    """Shift invoice date to future or set due date before invoice date."""
    s = copy.deepcopy(spec)
    s.invoice_date = "2028-11-20"  # Far in the future
    s.due_date = "2026-01-10"

    return TamperResult(
        spec=s,
        labels=["DATE_IN_FUTURE", "DUE_BEFORE_INVOICE"],
        affected_fields=["invoice_date", "due_date"],
    )


def op_qty_inflate(spec: InvoiceSpec) -> TamperResult:
    """Inflate quantity without updating line total or subtotal."""
    s = copy.deepcopy(spec)
    if s.items:
        s.items[0]["quantity"] = round(s.items[0]["quantity"] * 4.0, 2)

    return TamperResult(
        spec=s,
        labels=["LINE_TOTAL_MISMATCH"],
        affected_fields=["items[0].quantity"],
    )


def op_words_mismatch(spec: InvoiceSpec) -> TamperResult:
    """Amount in words does not match the numeric grand total."""
    s = copy.deepcopy(spec)
    s.amount_in_words = "Ten Thousand Rupees Only"

    return TamperResult(
        spec=s,
        labels=["AMOUNT_WORDS_MISMATCH"],
        affected_fields=["amount_in_words"],
        details={"numeric_total": s.grand_total, "words": s.amount_in_words},
    )


def op_exact_duplicate(spec: InvoiceSpec) -> TamperResult:
    """Exact duplicate invoice."""
    s = copy.deepcopy(spec)
    return TamperResult(
        spec=s,
        labels=["EXACT_FILE_DUPLICATE"],
        affected_fields=[],
    )


def op_near_duplicate(spec: InvoiceSpec) -> TamperResult:
    """Near duplicate: same invoice number & vendor, grand total slightly changed."""
    s = copy.deepcopy(spec)
    s.grand_total = round(s.grand_total * 1.15, 2)
    s.amount_in_words = amount_to_words_inr(s.grand_total)

    return TamperResult(
        spec=s,
        labels=["NEAR_DUPLICATE"],
        affected_fields=["grand_total", "amount_in_words"],
    )


def op_shared_bank_across_vendors(spec: InvoiceSpec) -> TamperResult:
    """Shared shell bank account across multiple distinct vendors."""
    s = copy.deepcopy(spec)
    s.account_number = "88910001234567"
    s.bank_name = "HDFC Bank"
    s.ifsc = "HDFC0001234"

    return TamperResult(
        spec=s,
        labels=["SHARED_BANK_ACCOUNT_ACROSS_VENDORS"],
        affected_fields=["payment.account_number", "payment.ifsc"],
    )


TAMPER_OPERATORS: Dict[str, Callable[[InvoiceSpec], TamperResult]] = {
    "line_total_edit": op_line_total_edit,
    "grand_total_edit": op_grand_total_edit,
    "amount_inflate": op_amount_inflate,
    "tax_rate_change": op_tax_rate_change,
    "tax_amount_edit": op_tax_amount_edit,
    "gstin_corrupt": op_gstin_corrupt,
    "bank_swap": op_bank_swap,
    "vendor_lookalike": op_vendor_lookalike,
    "invoice_no_reuse": op_invoice_no_reuse,
    "invoice_no_jump": op_invoice_no_jump,
    "date_shift": op_date_shift,
    "qty_inflate": op_qty_inflate,
    "words_mismatch": op_words_mismatch,
    "exact_duplicate": op_exact_duplicate,
    "near_duplicate": op_near_duplicate,
    "shared_bank_across_vendors": op_shared_bank_across_vendors,
}


# -------------------------------------------------------------
# Pixel-level and PDF-level Tamper execution functions
# -------------------------------------------------------------
def apply_pixel_edit_to_image(
    image: Image.Image,
    target_bbox_norm: list[float],
    new_text: str,
) -> Image.Image:
    """Raster pixel edit: cover field bbox with white patch and draw altered text."""
    img = image.copy().convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size

    x0 = int(target_bbox_norm[0] * w)
    y0 = int(target_bbox_norm[1] * h)
    x1 = int(target_bbox_norm[2] * w)
    y1 = int(target_bbox_norm[3] * h)

    # Draw white/off-white patch over old text
    patch_color = (253, 253, 254)
    draw.rectangle([x0 - 2, y0 - 2, x1 + 2, y1 + 2], fill=patch_color)

    # Draw replacement text in slightly different font rendering
    draw.text((x0, y0), new_text, fill=(20, 20, 20))
    return img


def apply_pdf_edit_structural(
    pdf_bytes: bytes,
    target_bbox_norm: list[float],
    new_text: str,
) -> bytes:
    """PyMuPDF structural redaction & text insertion leaving metadata/EOF traces."""
    try:
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        rect_fitz = fitz.Rect(
            target_bbox_norm[0] * page.rect.width,
            target_bbox_norm[1] * page.rect.height,
            target_bbox_norm[2] * page.rect.width,
            target_bbox_norm[3] * page.rect.height,
        )

        # PyMuPDF redact annotation
        page.add_redact_annot(rect_fitz, fill=(1, 1, 1))
        page.apply_redactions()

        # Insert new text
        page.insert_text(
            fitz.Point(rect_fitz.x0, rect_fitz.y1 - 2),
            new_text,
            fontsize=9,
            color=(0.1, 0.1, 0.1),
        )

        # Set modified producer tag and mod date
        meta = doc.metadata or {}
        c_date = meta.get("creationDate", "")
        doc.set_metadata({
            "producer": "iLovePDF Modified Engine v4",
            "creator": "Canva Editor",
            "creationDate": c_date,
            "modDate": "D:20261010120000+05'00'",
        })
        output_bytes = doc.tobytes()
        doc.close()
        # Append EOF to simulate incremental update
        output_bytes = output_bytes + b"\n%%EOF\n"
        return output_bytes
    except Exception:
        # Fallback if fitz not installed
        return pdf_bytes
