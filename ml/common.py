"""Shared utilities for ML training and evaluation scripts.

Key change (ADR 009): analysis_context_from_gt now accepts a vendor_registry
so that the evaluation harness can provide realistic vendor history, account
history, and duplicate candidates — mirroring how the production pipeline
builds context from the database.
"""

from __future__ import annotations

import hashlib
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
                line_total=_field(float(it.get("line_total", it.get("total", 0)))),
                discount=_field(float(it.get("discount", 0))) if it.get("discount") is not None else None,
            )
        )

    tax_rate = float(spec.get("tax_rate", 0))
    grand_total_val = float(spec.get("grand_total", 0))
    subtotal = float(spec.get("subtotal", grand_total_val))
    discount_val = float(spec.get("discount", 0)) if spec.get("discount") is not None else None
    buyer_state = str(spec.get("buyer_state_code", "") or "")
    vendor_state = str(spec.get("vendor_state_code", "") or "")
    is_interstate = bool(buyer_state and vendor_state and buyer_state != vendor_state)

    # Use the spec's pre-computed grand_total to derive tax correctly
    # rather than recomputing, to avoid rounding mismatches causing false
    # TAX_AMOUNT_MISMATCH findings on genuine invoices (ADR 006 root cause C).
    taxable = subtotal - (discount_val or 0.0)
    # Handle tax_rate given as fraction (e.g. 0.05, 0.18) vs percentage (e.g. 5.0, 18.0)
    if 0.0 < tax_rate <= 1.0:
        tax_rate_pct = round(tax_rate * 100.0, 2)
        tax_amount = round(taxable * tax_rate, 2)
    else:
        tax_rate_pct = tax_rate
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
        rate=_field(tax_rate_pct),
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


def _hash_account(account_number: str) -> str:
    """Hash bank account number for privacy (mirrors bank engine)."""
    return hashlib.sha256(account_number.encode("utf-8")).hexdigest()


def build_vendor_registry(
    manifest_rows: list[dict[str, Any]],
    gt_dir: str,
) -> dict[str, dict[str, Any]]:
    """Pre-build a per-vendor registry from the full manifest (all splits).

    Returns:
        {
            vendor_id: {
                "history": [  # lightweight history records for IdentifiersEngine / VendorEngine
                    {"id": ..., "invoice_number": ..., "invoice_date": ...,
                     "grand_total": ..., "spec": {...}}
                ],
                "accounts": [  # for BankEngine
                    {"account_hash": ..., "last4": ..., "ifsc": ..., "vendor_id": ...}
                ],
                "vendor_info": {  # for cross-vendor lookalike checks
                    "id": ..., "name": ..., "gstin": ...
                },
            }
        }
    """
    import json

    registry: dict[str, dict[str, Any]] = {}

    for row in manifest_rows:
        vendor_id = str(row.get("vendor_id", ""))
        if not vendor_id:
            continue

        gt_path = Path(gt_dir) / f"{row['id']}.json"
        if not gt_path.exists():
            continue

        try:
            with open(gt_path, encoding="utf-8") as f:
                gt = json.load(f)
            spec = gt.get("spec", {})
        except Exception:
            continue

        if vendor_id not in registry:
            registry[vendor_id] = {
                "history": [],
                "accounts": [],
                "vendor_info": {
                    "id": vendor_id,
                    "name": spec.get("vendor_name", ""),
                    "gstin": spec.get("vendor_gstin", ""),
                },
            }

        # Lightweight history entry (mirrors how pipeline saves invoice rows)
        registry[vendor_id]["history"].append({
            "id": row["id"],
            "invoice_id": row["id"],
            "invoice_number": spec.get("invoice_number"),
            "invoice_date": spec.get("invoice_date"),
            "grand_total": {
                "value": float(spec.get("grand_total", 0)),
                "raw": str(spec.get("grand_total", 0)),
                "conf": 1.0,
            },
            "label": row.get("label", "genuine"),
        })

        # Account entry
        acct_num = str(spec.get("account_number") or "")
        if acct_num:
            acct_h = _hash_account(acct_num)
            last4 = acct_num[-4:] if len(acct_num) >= 4 else acct_num
            existing_hashes = [a["account_hash"] for a in registry[vendor_id]["accounts"]]
            if acct_h not in existing_hashes:
                registry[vendor_id]["accounts"].append({
                    "account_hash": acct_h,
                    "last4": last4,
                    "ifsc": str(spec.get("ifsc") or ""),
                    "vendor_id": vendor_id,
                    "vendor_name": spec.get("vendor_name", ""),
                })

    return registry


def analysis_context_from_gt(
    invoice_id: str,
    gt: dict[str, Any],
    data: InvoiceData,
    pdf_path: Path | str | None,
    vendor_registry: dict[str, dict[str, Any]] | None = None,
) -> AnalysisContext:
    """Build AnalysisContext from ground-truth data and invoice metadata.

    Args:
        invoice_id: Unique ID of the invoice being evaluated.
        gt: Ground-truth JSON for this document.
        data: Already-built InvoiceData object.
        pdf_path: Path to the PDF/PNG file.
        vendor_registry: Pre-built registry from build_vendor_registry().
            If provided, the context will have realistic vendor history,
            accounts, and duplicate candidates — mirroring production.
            If None (backward-compat), falls back to what's in gt (usually empty).
    """
    spec = gt.get("spec", {})
    vendor_id = spec.get("vendor_id") or gt.get("vendor_id")

    acct_num = spec.get("account_number") or (
        data.payment.account_number.value if data.payment and data.payment.account_number else None
    )

    # ── 1. Vendor history (curated prior invoices for this vendor) ────────────
    gt_history = gt.get("vendor_history", [])
    if gt_history:
        vendor_history = list(gt_history)
    elif vendor_registry and vendor_id and vendor_id in vendor_registry:
        vendor_history = [
            h for h in vendor_registry[vendor_id]["history"]
            if h.get("id") != invoice_id and h.get("invoice_id") != invoice_id
        ]
    else:
        vendor_history = []

    # ── 2. Vendor accounts (known historical accounts for this vendor) ────────
    gt_accounts = gt.get("vendor_accounts", [])
    if gt_accounts:
        vendor_accounts = []
        for vac in gt_accounts:
            if isinstance(vac, dict):
                v_copy = dict(vac)
                if not v_copy.get("account_hash"):
                    ref_acc = spec.get("account_number") or acct_num
                    if ref_acc:
                        v_copy["account_hash"] = _hash_account(str(ref_acc))
                vendor_accounts.append(v_copy)
            elif isinstance(vac, str):
                vendor_accounts.append({
                    "account_hash": _hash_account(vac),
                    "last4": vac[-4:],
                    "ifsc": spec.get("ifsc", ""),
                    "vendor_id": vendor_id,
                })
    elif vendor_registry and vendor_id and vendor_id in vendor_registry:
        vendor_accounts = vendor_registry[vendor_id]["accounts"]
    else:
        vendor_accounts = []

    # ── 3. Cross-vendor indices (all vendors & all accounts across system) ────
    if vendor_registry:
        all_accounts_flat = []
        all_vendors = []
        for vid, vd in vendor_registry.items():
            all_vendors.append(vd["vendor_info"])
            for acct in vd["accounts"]:
                all_accounts_flat.append(acct)
    else:
        all_vendors = gt.get("all_vendors", [])
        all_accounts_flat = []
        for vac in gt.get("all_accounts", []):
            if isinstance(vac, dict):
                all_accounts_flat.append(vac)
            elif isinstance(vac, str):
                all_accounts_flat.append({
                    "account_hash": _hash_account(vac),
                    "last4": vac[-4:],
                    "vendor_id": "other",
                })

    # ── 4. Duplicate history (prior invoices from same vendor) ────────────────
    duplicate_history = [
        {
            "id": h.get("id") or h.get("invoice_id"),
            "invoice_id": h.get("id") or h.get("invoice_id"),
            "invoice_number": h.get("invoice_number"),
            "invoice_date": h.get("invoice_date"),
            "grand_total": h.get("grand_total"),
        }
        for h in vendor_history
    ]

    return AnalysisContext(
        invoice_id=invoice_id,
        data=data,
        tokens=[],
        page_images=[],
        pdf_path=str(pdf_path) if pdf_path and str(pdf_path).endswith(".pdf") else None,
        vendor_history=vendor_history,
        indices={
            "vendor_id": vendor_id,
            "vendor_accounts": vendor_accounts,
            "all_accounts": all_accounts_flat,
            "duplicate_history": duplicate_history,
            "embeddings": {},
        },
        all_vendors=all_vendors,
        content_hash=gt.get("content_hash"),
    )
