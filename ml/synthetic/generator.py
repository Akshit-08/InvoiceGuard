"""Deterministic Synthetic Invoice & Fraud Data Engine for InvoiceGuard.

Generates genuine and tampered invoices across 5 templates with ground truth
bounding boxes, multi-mode tampering (re-render, pixel-edit, pdf-edit),
and stratified train/val/test splits.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Tuple

import numpy as np
import pandas as pd
from PIL import Image

from ml.synthetic.formatters import amount_to_words_inr, format_inr
from ml.synthetic.gstin import generate_valid_gstin
from ml.synthetic.scan_simulator import ScanSimulator
from ml.synthetic.tamper_operators import (
    TAMPER_OPERATORS,
    apply_pdf_edit_structural,
    apply_pixel_edit_to_image,
)
from ml.synthetic.templates import InvoiceSpec, render_invoice_pdf
from ml.synthetic.vendor_simulator import VendorProfile, VendorSimulator

# Catalog of realistic B2B products and services
ITEM_CATALOG = [
    ("Cloud Infrastructure Compute (AWS/Azure)", 998313, 24000.0, "Month"),
    ("Enterprise SaaS Software License (per seat)", 997331, 4500.0, "Seat"),
    ("Network Security Audit & Penetration Testing", 998311, 85000.0, "Service"),
    ("Ergonomic Mesh Office Chairs", 940310, 8500.0, "Unit"),
    ("Executive Solid Oak Conference Desk", 940330, 32000.0, "Unit"),
    ("High-Speed Dedicated Fiber Internet (1 Gbps)", 998422, 18000.0, "Month"),
    ("LaserJet High-Yield Toner Cartridges (Black)", 844399, 6200.0, "Pack"),
    ("Commercial Facility Deep Cleaning & Sanitization", 998533, 14500.0, "Visit"),
    ("Armed Security Personnel Deployment (8hr Shift)", 998525, 22000.0, "Month"),
    ("Corporate Event Executive Buffet Catering", 996331, 650.0, "Pax"),
    ("Express Inter-City Air Freight Logistics", 996511, 4800.0, "Shipment"),
    ("Server Rack Enclosure 42U with PDU", 853710, 42000.0, "Unit"),
    ("Legal Compliance & Regulatory Advisory Retainer", 998211, 50000.0, "Month"),
    ("Creative Digital Advertising & Media Campaign", 998361, 35000.0, "Campaign"),
    ("Industrial Diesel Generator Maintenance & AMC", 998719, 16000.0, "Quarter"),
]

BUYER_CORP_POOL = [
    ("Apex Global Logistics India Pvt Ltd", "07", "AABCA1234F", "DLF Cyber City, Tower B, Gurugram, Haryana"),
    ("Bharat Heavy Manufacturing Corp", "27", "AABCB5678G", "Bandra Kurla Complex, Bandra East, Mumbai, MH"),
    ("Kavach Financial Technologies Ltd", "29", "AABCK9012H", "Outer Ring Road, Bellandur, Bengaluru, KA"),
    ("Trident Retail & Consumer Goods LLP", "33", "AABCT3456J", "Mount Road, Anna Salai, Chennai, TN"),
    ("Indus Software Systems Pvt Ltd", "36", "AABCI7890K", "HITEC City, Madhapur, Hyderabad, TS"),
    ("Nova Telecom & Infrastructure Ltd", "24", "AABCN2345L", "SG Highway, Prahlad Nagar, Ahmedabad, GJ"),
    ("Sterling Health & Pharma Labs", "19", "AABCS6789M", "Sector V, Salt Lake, Kolkata, WB"),
    ("Pragati Commercial Real Estate Ltd", "09", "AABCP0123N", "Noida Expressway, Sector 125, Noida, UP"),
]

TEMPLATES = [
    "classic_table",
    "modern_minimal",
    "gst_tax_invoice",
    "two_column",
    "compact_thermal",
]


class InvoiceDatasetGenerator:
    """Orchestrates high-throughput, deterministic synthetic invoice dataset creation."""

    def __init__(self, seed: int = 42, out_dir: str = "data/synthetic") -> None:
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)
        self.out_dir = Path(out_dir)
        self.pdf_dir = self.out_dir / "pdf"
        self.png_dir = self.out_dir / "png"
        self.gt_dir = self.out_dir / "gt"

        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.png_dir.mkdir(parents=True, exist_ok=True)
        self.gt_dir.mkdir(parents=True, exist_ok=True)

        self.vendor_sim = VendorSimulator(seed=seed)
        self.vendors = self.vendor_sim.generate_vendors(count=45)
        self.scan_sim = ScanSimulator(seed=seed)

    def _generate_spec(
        self,
        vendor: VendorProfile,
        invoice_seq: int,
        invoice_date_dt: datetime,
        template_id: str,
    ) -> InvoiceSpec:
        """Create a clean, mathematically consistent InvoiceSpec."""
        buyer_tuple = random.choice(BUYER_CORP_POOL)
        buyer_name = buyer_tuple[0]
        buyer_state = buyer_tuple[1]
        buyer_pan = buyer_tuple[2]
        buyer_addr = buyer_tuple[3]
        buyer_gstin = generate_valid_gstin(buyer_state, buyer_pan, "1")

        fy = f"{invoice_date_dt.year % 100:02d}-{(invoice_date_dt.year + 1) % 100:02d}"
        inv_number = vendor.numbering_pattern.format(
            FY=fy,
            YYYY=invoice_date_dt.year,
            seq=invoice_seq,
            prefix=vendor.prefix,
        )

        due_date_dt = invoice_date_dt + timedelta(days=vendor.cadence_days)

        # Generate 2 to 5 line items
        num_items = random.randint(2, 5)
        selected_items = random.sample(ITEM_CATALOG, k=num_items)
        items = []
        subtotal = 0.0

        for desc, hsn, base_price, unit in selected_items:
            qty = float(random.choice([1, 2, 3, 5, 10, 12]))
            price_variation = random.uniform(0.9, 1.15)
            unit_price = round(base_price * price_variation, 2)
            line_total = round(qty * unit_price, 2)
            subtotal += line_total

            items.append({
                "description": desc,
                "hsn_sac": str(hsn),
                "quantity": qty,
                "unit": unit,
                "unit_price": unit_price,
                "line_total": line_total,
            })

        subtotal = round(subtotal, 2)
        tax_amt = round(subtotal * vendor.tax_rate, 2)
        grand_total = round(subtotal + tax_amt, 2)
        amount_words = amount_to_words_inr(grand_total)

        return InvoiceSpec(
            invoice_number=inv_number,
            invoice_date=invoice_date_dt.strftime("%Y-%m-%d"),
            due_date=due_date_dt.strftime("%Y-%m-%d"),
            vendor_id=vendor.id,
            vendor_name=vendor.name,
            vendor_gstin=vendor.gstin,
            vendor_pan=vendor.pan,
            vendor_address=vendor.address,
            vendor_email=vendor.email,
            vendor_phone=vendor.phone,
            vendor_state_code=vendor.state_code,
            buyer_name=buyer_name,
            buyer_gstin=buyer_gstin,
            buyer_address=buyer_addr,
            buyer_state_code=buyer_state,
            currency="INR",
            items=items,
            subtotal=subtotal,
            tax_rate=vendor.tax_rate,
            discount=0.0,
            shipping=0.0,
            grand_total=grand_total,
            amount_in_words=amount_words,
            bank_name=vendor.bank_name,
            account_number=vendor.account_number,
            ifsc=vendor.ifsc,
            template_id=template_id,
        )

    def _render_and_save(
        self,
        doc_id: str,
        spec: InvoiceSpec,
        is_scanned: bool = False,
    ) -> Tuple[str, str, dict[str, Any]]:
        """Render spec to PDF, generate PNG preview (optionally scanned), and return ground truth."""
        pdf_path = self.pdf_dir / f"{doc_id}.pdf"
        png_path = self.png_dir / f"{doc_id}.png"

        # 1. Render PDF and get bounding boxes
        gt = render_invoice_pdf(spec, str(pdf_path))

        # 2. Render PNG preview via PyMuPDF
        try:
            import fitz

            doc = fitz.open(str(pdf_path))
            page = doc[0]
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()
        except Exception:
            # Fallback if fitz not installed
            img = Image.new("RGB", (800, 1130), color="white")

        if is_scanned:
            img = self.scan_sim.simulate_scan(img)

        img.save(png_path)
        return str(pdf_path), str(png_path), gt

    def generate_dataset(
        self,
        genuine_count: int = 300,
        tampered_count: int = 300,
        visual_pairs_count: int = 200,
    ) -> pd.DataFrame:
        """Generate full synthetic benchmark dataset with manifest.

        ADR 009 change: vendor context (history summary) is now written into
        each GT JSON so the evaluation harness can provide realistic prior-invoice
        context to every engine (bank, identifiers, vendor, duplicate).
        """
        manifest_rows = []
        op_keys = list(TAMPER_OPERATORS.keys())

        # ── Vendor split: 75% train, 12.5% val, 12.5% test ──────────────────
        # With 45 vendors: 34 train, 6 val, 5 test (approx.)
        n_vendors = len(self.vendors)
        n_val = max(4, int(n_vendors * 0.125))
        n_test = max(4, int(n_vendors * 0.125))
        n_train = n_vendors - n_val - n_test

        train_vendors = self.vendors[:n_train]
        val_vendors = self.vendors[n_train:n_train + n_val]
        test_vendors = self.vendors[n_train + n_val:]

        vendor_split_map: dict[str, str] = {}
        for v in train_vendors:
            vendor_split_map[v.id] = "train"
        for v in val_vendors:
            vendor_split_map[v.id] = "val"
        for v in test_vendors:
            vendor_split_map[v.id] = "test"

        now = datetime.now(timezone.utc)

        # ── Build per-vendor simulated prior history ──────────────────────────
        # Each vendor gets 8–20 synthetic prior invoices spanning 18 months.
        # These are NOT rendered as PDFs; they are lightweight spec summaries
        # stored in the GT JSON as vendor_history so engines can profile the vendor.
        vendor_history_pool: dict[str, list[dict]] = {}
        for vendor in self.vendors:
            history_entries = []
            n_prior = random.randint(8, 20)
            for h_idx in range(n_prior):
                h_date = now - timedelta(days=random.randint(30, 540))
                h_spec = self._generate_spec(vendor, h_idx, h_date, TEMPLATES[h_idx % len(TEMPLATES)])
                history_entries.append({
                    "id": f"HIST_{vendor.id}_{h_idx:03d}",
                    "invoice_id": f"HIST_{vendor.id}_{h_idx:03d}",
                    "invoice_number": h_spec.invoice_number,
                    "invoice_date": h_spec.invoice_date,
                    "grand_total": {
                        "value": float(h_spec.grand_total),
                        "raw": str(h_spec.grand_total),
                        "conf": 1.0,
                    },
                    "label": "genuine",
                })
            vendor_history_pool[vendor.id] = history_entries

        # ── 1. Generate Genuine Invoices ────────────────────────────────────
        for i in range(genuine_count):
            doc_id = f"GEN_{i+1:05d}"
            vendor = self.vendors[i % len(self.vendors)]
            template_id = TEMPLATES[i % len(TEMPLATES)]
            inv_date = now - timedelta(days=random.randint(5, 360))
            is_scanned = (i % 4 == 0)  # 25% scanned

            spec = self._generate_spec(vendor, i + 1, inv_date, template_id)
            pdf_path, png_path, gt = self._render_and_save(doc_id, spec, is_scanned=is_scanned)

            # Save GT JSON (now includes vendor context)
            gt_payload = {
                "id": doc_id,
                "label": "genuine",
                "fraud_types": [],
                "mode": "clean",
                "is_scanned": is_scanned,
                "spec": spec.__dict__,
                "ground_truth": gt,
                # ── Context for the evaluation harness (ADR 009) ──────────
                "vendor_id": vendor.id,
                "vendor_history": vendor_history_pool.get(vendor.id, []),
                "vendor_accounts": [
                    {
                        "account_hash": None,  # filled by ml/common.py using hashlib
                        "last4": str(vendor.account_number)[-4:],
                        "ifsc": vendor.ifsc,
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                    }
                ],
                "all_vendors": [
                    {"id": v.id, "name": v.name, "gstin": v.gstin}
                    for v in self.vendors
                ],
            }
            with open(self.gt_dir / f"{doc_id}.json", "w") as f:
                json.dump(gt_payload, f, indent=2)

            manifest_rows.append({
                "id": doc_id,
                "filename": f"{doc_id}.pdf",
                "label": "genuine",
                "fraud_types": "",
                "mode": "clean",
                "vendor_id": vendor.id,
                "template_id": template_id,
                "is_scanned": is_scanned,
                "split": vendor_split_map[vendor.id],
                "grand_total": spec.grand_total,
            })

        # ── 2. Generate Tampered Invoices ───────────────────────────────────
        for j in range(tampered_count):
            doc_id = f"TAM_{j+1:05d}"
            vendor = self.vendors[j % len(self.vendors)]
            template_id = TEMPLATES[j % len(TEMPLATES)]
            inv_date = now - timedelta(days=random.randint(5, 360))
            is_scanned = (j % 4 == 0)

            base_spec = self._generate_spec(vendor, j + 500, inv_date, template_id)

            # Pick operator
            op_name = op_keys[j % len(op_keys)]
            op_func = TAMPER_OPERATORS[op_name]
            tamper_res = op_func(base_spec)

            # Pick mode (cycle: re-render, pixel-edit, pdf-edit, re-render, re-render)
            mode_choice = "re-render"
            if j % 5 == 1:
                mode_choice = "pixel-edit"
            elif j % 5 == 2:
                mode_choice = "pdf-edit"

            pdf_path, png_path, gt = self._render_and_save(doc_id, tamper_res.spec, is_scanned=is_scanned)

            # Apply pixel-edit or pdf-edit if requested
            if mode_choice == "pixel-edit":
                try:
                    img = Image.open(png_path)
                    if "grand_total" in gt.get("fields", {}):
                        bbox = gt["fields"]["grand_total"]["bbox"]
                        img = apply_pixel_edit_to_image(img, bbox, format_inr(tamper_res.spec.grand_total))
                        img.save(png_path)
                except Exception:
                    pass
            elif mode_choice == "pdf-edit":
                try:
                    with open(pdf_path, "rb") as pf:
                        pbytes = pf.read()
                    if "grand_total" in gt.get("fields", {}):
                        bbox = gt["fields"]["grand_total"]["bbox"]
                        edited_bytes = apply_pdf_edit_structural(pbytes, bbox, format_inr(tamper_res.spec.grand_total))
                        with open(pdf_path, "wb") as pf:
                            pf.write(edited_bytes)
                except Exception:
                    pass

            # For bank_swap / shared_bank operators: add OLD account to vendor history
            # so the engine can detect the account change correctly
            augmented_history = list(vendor_history_pool.get(vendor.id, []))
            if op_name in ("bank_swap", "shared_bank_across_vendors"):
                # Inject the *original* account into vendor_accounts so the engine
                # sees a changed account on the tampered doc
                base_acct = base_spec.account_number
                augmented_acct = [
                    {
                        "account_hash": None,
                        "last4": str(base_acct)[-4:],
                        "ifsc": base_spec.ifsc,
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                    }
                ]
            elif op_name == "invoice_no_reuse" and augmented_history:
                # Put the reused number into history so the engine detects it
                augmented_history = list(augmented_history)
                augmented_history.append({
                    "id": "HIST_REUSE_REF",
                    "invoice_id": "HIST_REUSE_REF",
                    "invoice_number": tamper_res.spec.invoice_number,
                    "invoice_date": (now - timedelta(days=180)).strftime("%Y-%m-%d"),
                    "grand_total": {
                        "value": float(base_spec.grand_total) + 10000.0,
                        "raw": str(base_spec.grand_total),
                        "conf": 1.0,
                    },
                    "label": "genuine",
                })
                augmented_acct = [
                    {
                        "account_hash": None,
                        "last4": str(vendor.account_number)[-4:],
                        "ifsc": vendor.ifsc,
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                    }
                ]
            else:
                augmented_acct = [
                    {
                        "account_hash": None,
                        "last4": str(vendor.account_number)[-4:],
                        "ifsc": vendor.ifsc,
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                    }
                ]

            gt_payload = {
                "id": doc_id,
                "label": "tampered",
                "fraud_types": tamper_res.labels,
                "mode": mode_choice,
                "affected_fields": tamper_res.affected_fields,
                "is_scanned": is_scanned,
                "spec": tamper_res.spec.__dict__,
                "ground_truth": gt,
                # ── Context for the evaluation harness (ADR 009) ──────────
                "vendor_id": vendor.id,
                "vendor_history": augmented_history,
                "vendor_accounts": augmented_acct,
                "all_vendors": [
                    {"id": v.id, "name": v.name, "gstin": v.gstin}
                    for v in self.vendors
                ],
            }
            with open(self.gt_dir / f"{doc_id}.json", "w") as f:
                json.dump(gt_payload, f, indent=2)

            manifest_rows.append({
                "id": doc_id,
                "filename": f"{doc_id}.pdf",
                "label": "tampered",
                "fraud_types": ";".join(tamper_res.labels),
                "mode": mode_choice,
                "vendor_id": vendor.id,
                "template_id": template_id,
                "is_scanned": is_scanned,
                "split": vendor_split_map[vendor.id],
                "grand_total": tamper_res.spec.grand_total,
            })

        # ── 3. Visual Pairs ──────────────────────────────────────────────────
        for k in range(visual_pairs_count):
            doc_id = f"VIS_{k+1:05d}"
            vendor = self.vendors[k % len(self.vendors)]
            template_id = TEMPLATES[k % len(TEMPLATES)]
            inv_date = now - timedelta(days=random.randint(5, 360))

            base_spec = self._generate_spec(vendor, k + 1000, inv_date, template_id)
            pdf_path, png_path, gt = self._render_and_save(doc_id, base_spec, is_scanned=False)

            # Apply subtle pixel modification
            try:
                img = Image.open(png_path)
                if "grand_total" in gt.get("fields", {}):
                    bbox = gt["fields"]["grand_total"]["bbox"]
                    altered_total = round(base_spec.grand_total * 1.25, 2)
                    img = apply_pixel_edit_to_image(img, bbox, format_inr(altered_total))
                    img.save(png_path)
            except Exception:
                pass

            gt_payload = {
                "id": doc_id,
                "label": "tampered",
                "fraud_types": ["VISUAL_TAMPER_PATCH", "GRAND_TOTAL_MISMATCH"],
                "mode": "pixel-edit",
                "affected_fields": ["grand_total"],
                "is_scanned": False,
                "spec": base_spec.__dict__,
                "ground_truth": gt,
                # ── Context for the evaluation harness (ADR 009) ──────────
                "vendor_id": vendor.id,
                "vendor_history": vendor_history_pool.get(vendor.id, []),
                "vendor_accounts": [
                    {
                        "account_hash": None,
                        "last4": str(vendor.account_number)[-4:],
                        "ifsc": vendor.ifsc,
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                    }
                ],
                "all_vendors": [
                    {"id": v.id, "name": v.name, "gstin": v.gstin}
                    for v in self.vendors
                ],
            }
            with open(self.gt_dir / f"{doc_id}.json", "w") as f:
                json.dump(gt_payload, f, indent=2)

            manifest_rows.append({
                "id": doc_id,
                "filename": f"{doc_id}.pdf",
                "label": "tampered",
                "fraud_types": "VISUAL_TAMPER_PATCH;GRAND_TOTAL_MISMATCH",
                "mode": "pixel-edit",
                "vendor_id": vendor.id,
                "template_id": template_id,
                "is_scanned": False,
                "split": vendor_split_map[vendor.id],
                "grand_total": base_spec.grand_total,
            })

        df = pd.DataFrame(manifest_rows)
        manifest_csv_path = self.out_dir / "manifest.csv"
        df.to_csv(manifest_csv_path, index=False)
        return df


