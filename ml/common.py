"""Shared utilities for ML training and evaluation scripts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.app.schemas.contracts import (
    BuyerParty,
    Field,
    InvoiceData,
    LineItem,
    PaymentDetail,
    TaxDetail,
    VendorParty,
)
from backend.app.services.engines.base import AnalysisContext


def _field(val: Any, conf: float = 1.0) -> Field:
    return Field(value=val, raw=str(val) if val is not None else "", conf=conf, source="gt")


def invoice_data_from_gt(gt: dict[str, Any]) -> InvoiceData:
    """Build a validated InvoiceData object from synthetic ground-truth JSON."""
    if "invoice_data" in gt and gt["invoice_data"]:
        return InvoiceData.model_validate(gt["invoice_data"])

    spec = gt.get("spec", {})

    raw_items = spec.get("items", [])
    items: list[LineItem] = []
    for it in raw_items:
        items.append(
            LineItem(
                description=_field(it.get("description", "")),
                quantity=_field(float(it.get("quantity", 1))),
                unit_price=_field(float(it.get("unit_price", 0))),
                line_total=_field(float(it.get("total", 0))),
                discount=_field(float(it.get("discount", 0))) if it.get("discount") is not None else None,
            )
        )

    tax_rate = float(spec.get("tax_rate", 0))
    grand_total_val = float(spec.get("grand_total", 0))
    buyer_state = str(spec.get("buyer_state_code", "") or "")
    vendor_state = str(spec.get("vendor_state_code", "") or "")
    is_interstate = bool(buyer_state and vendor_state and buyer_state != vendor_state)

    subtotal = float(spec.get("subtotal", grand_total_val))
    discount_val = float(spec.get("discount", 0)) if spec.get("discount") is not None else None
    taxable = subtotal - (discount_val or 0.0)
    tax_amount = round(taxable * tax_rate / 100.0, 2)
    if is_interstate:
        igst, cgst, sgst = tax_amount, 0.0, 0.0
    else:
        cgst = sgst = round(tax_amount / 2.0, 2)
        igst = 0.0

    vendor = VendorParty(
        name=_field(spec.get("vendor_name")),
        gstin=_field(spec.get("vendor_gstin")),
        pan=_field(spec.get("vendor_pan")),
        address=_field(spec.get("vendor_address")),
        email=_field(spec.get("vendor_email")),
        phone=_field(spec.get("vendor_phone")),
    )

    buyer = BuyerParty(
        name=_field(spec.get("buyer_name")),
        gstin=_field(spec.get("buyer_gstin")),
        address=_field(spec.get("buyer_address")),
    )

    tax = TaxDetail(
        cgst=_field(cgst),
        sgst=_field(sgst),
        igst=_field(igst),
        total=_field(tax_amount),
        rate=_field(tax_rate),
    )

    payment = PaymentDetail(
        bank_name=_field(spec.get("bank_name")),
        account_number=_field(spec.get("account_number")),
        ifsc=_field(spec.get("ifsc")),
    )

    return InvoiceData(
        vendor=vendor,
        buyer=buyer,
        invoice_number=_field(spec.get("invoice_number")),
        invoice_date=_field(spec.get("invoice_date")),
        due_date=_field(spec.get("due_date")) if spec.get("due_date") else None,
        currency=_field(spec.get("currency", "INR")),
        items=items,
        subtotal=_field(subtotal),
        discount_total=_field(discount_val) if discount_val is not None else None,
        shipping=_field(float(spec.get("shipping", 0))) if spec.get("shipping") is not None else None,
        tax=tax,
        grand_total=_field(grand_total_val),
        amount_in_words=_field(spec.get("amount_in_words")) if spec.get("amount_in_words") else None,
        payment=payment,
    )


def analysis_context_from_gt(
    invoice_id: str,
    gt: dict[str, Any],
    data: InvoiceData,
    pdf_path: Path | str | None,
) -> AnalysisContext:
    """Build AnalysisContext from ground-truth data and invoice metadata."""
    spec = gt.get("spec", {})
    acct_num = spec.get("account_number") or (
        data.payment.account_number.value if data.payment.account_number else None
    )
    vendor_id = spec.get("vendor_id") or gt.get("vendor_id")

    return AnalysisContext(
        invoice_id=invoice_id,
        data=data,
        tokens=[],
        page_images=[],
        pdf_path=str(pdf_path) if pdf_path and str(pdf_path).endswith(".pdf") else None,
        vendor_history=gt.get("vendor_history", []),
        indices={
            "vendor_id": vendor_id,
            "vendor_accounts": [acct_num] if acct_num else gt.get("vendor_accounts", []),
            "all_accounts": [acct_num] if acct_num else gt.get("all_accounts", []),
            "duplicate_history": gt.get("duplicate_history", []),
            "embeddings": {},
        },
        all_vendors=gt.get("all_vendors", []),
        content_hash=gt.get("content_hash"),
    )
