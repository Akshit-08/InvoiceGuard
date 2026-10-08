"""Hero Demo Invoices Generator for InvoiceGuard.

Generates the 8 canonical sample invoices defined in Blueprint section 10
with exact expected risk score bands and finding assertions.
"""

import json
import sys
from pathlib import Path
from typing import Any

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from PIL import Image

from ml.synthetic.formatters import amount_to_words_inr
from ml.synthetic.gstin import generate_valid_gstin
from ml.synthetic.scan_simulator import ScanSimulator
from ml.synthetic.tamper_operators import (
    apply_pdf_edit_structural,
    apply_pixel_edit_to_image,
)
from ml.synthetic.templates import InvoiceSpec, render_invoice_pdf
from ml.synthetic.vendor_simulator import VendorSimulator


def build_hero_demo_samples(out_dir: str = "data/samples") -> dict[str, Any]:
    samples_dir = Path(out_dir)
    samples_dir.mkdir(parents=True, exist_ok=True)

    vendor_sim = VendorSimulator(seed=101)
    vendors = vendor_sim.generate_vendors(10)
    v1 = vendors[0]  # Primary recurring vendor: Apex Solutions
    v2 = vendors[1]  # Secondary vendor: Zenith Tech
    v_new = vendors[8]  # Cold-start vendor

    scan_sim = ScanSimulator(seed=101)
    expected_bands = {}

    def save_doc(doc_id: str, spec: InvoiceSpec, is_scanned: bool = False) -> tuple[str, str, dict]:
        pdf_path = samples_dir / f"{doc_id}.pdf"
        png_path = samples_dir / f"{doc_id}.png"
        gt = render_invoice_pdf(spec, str(pdf_path))

        try:
            import fitz

            doc = fitz.open(str(pdf_path))
            page = doc[0]
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            doc.close()
        except Exception:
            img = Image.new("RGB", (800, 1130), color="white")

        if is_scanned:
            img = scan_sim.simulate_scan(img, rotation_deg=0.8, noise_level=0.02, blur_radius=0.5)

        img.save(png_path)
        return str(pdf_path), str(png_path), gt

    # 1. 01_clean_low: Perfect genuine invoice
    spec1 = InvoiceSpec(
        invoice_number="INV/25-26/0101",
        invoice_date="2026-09-15",
        due_date="2026-10-15",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Cloud Hosting Standard (AWS)", "hsn_sac": "998313", "quantity": 1.0, "unit": "Month", "unit_price": 25000.0, "line_total": 25000.0},
            {"description": "Database Backup Storage", "hsn_sac": "998313", "quantity": 2.0, "unit": "TB", "unit_price": 3000.0, "line_total": 6000.0},
        ],
        subtotal=31000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=36580.0,
        amount_in_words=amount_to_words_inr(36580.0),
        bank_name=v1.bank_name,
        account_number=v1.account_number,
        ifsc=v1.ifsc,
        template_id="classic_table",
    )
    save_doc("01_clean_low", spec1)
    expected_bands["01_clean_low"] = {
        "expected_level": "low",
        "score_range": [0, 25],
        "findings_expected": [],
        "description": "Legitimate, clean digital invoice with consistent arithmetic and verified vendor identity.",
    }

    # 2. 02_minor_warning_medium: Mild arithmetic round-off / minor warning
    spec2 = InvoiceSpec(
        invoice_number="INV/25-26/0102",
        invoice_date="2026-09-18",
        due_date="2026-10-18",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Server Maintenance Support", "hsn_sac": "998719", "quantity": 1.0, "unit": "Month", "unit_price": 40000.0, "line_total": 40000.0},
        ],
        subtotal=40000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=48500.0,  # Expected 47200, difference of ₹1,300
        amount_in_words=amount_to_words_inr(48500.0),
        bank_name=v1.bank_name,
        account_number=v1.account_number,
        ifsc=v1.ifsc,
        template_id="modern_minimal",
    )
    save_doc("02_minor_warning_medium", spec2)
    expected_bands["02_minor_warning_medium"] = {
        "expected_level": "medium",
        "score_range": [30, 59],
        "findings_expected": ["GRAND_TOTAL_MISMATCH"],
        "description": "Invoice with moderate grand total discrepancy.",
    }

    # 3. 03_hero_critical: Multi-vector attack per Blueprint section 10
    # line-item 2x15,000 shown 40,000; grand total off by 30,000; bank XXXX1234 -> XXXX8891;
    # tax rate deviates; amount 3.8x median; visual edit near total
    spec3 = InvoiceSpec(
        invoice_number="INV/25-26/0103",
        invoice_date="2026-09-22",
        due_date="2026-10-22",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Enterprise Security Consultation", "hsn_sac": "998311", "quantity": 2.0, "unit": "Session", "unit_price": 15000.0, "line_total": 40000.0},  # 2x15000 = 30000, shown 40000!
            {"description": "Firewall Rule Configuration", "hsn_sac": "998311", "quantity": 1.0, "unit": "Unit", "unit_price": 85000.0, "line_total": 85000.0},
        ],
        subtotal=125000.0,
        tax_rate=0.28,  # Deviates from historical 18%
        discount=0.0,
        shipping=0.0,
        grand_total=190000.0,  # 3.8x median, off by ~₹30,000
        amount_in_words="One Lakh Sixty Thousand Rupees Only",  # Mismatch words
        bank_name="Equitas Small Finance Bank",
        account_number="9988112233448891",  # Swapped to XXXX8891
        ifsc="ESFB0008891",
        template_id="gst_tax_invoice",
    )
    p3, img3_path, gt3 = save_doc("03_hero_critical", spec3)
    # Apply pixel patch edit on total
    try:
        im3 = Image.open(img3_path)
        if "grand_total" in gt3["fields"]:
            im3 = apply_pixel_edit_to_image(im3, gt3["fields"]["grand_total"]["bbox"], "Rs. 1,90,000.00")
            im3.save(img3_path)
    except Exception:
        pass

    expected_bands["03_hero_critical"] = {
        "expected_level": "critical",
        "score_range": [80, 100],
        "findings_expected": [
            "LINE_TOTAL_MISMATCH",
            "GRAND_TOTAL_MISMATCH",
            "AMOUNT_OUTLIER",
            "BANK_ACCOUNT_CHANGED",
            "TAX_RATE_DEVIATION",
            "AMOUNT_WORDS_MISMATCH",
        ],
        "description": "Signature Hero multi-anomaly invoice displaying line calculation errors, bank account swap, historical outlier, and word discrepancies.",
    }

    # 4. 04_near_duplicate: Near duplicate of 01_clean_low
    spec4 = InvoiceSpec(
        invoice_number="INV/25-26/0101",  # Same number as 01
        invoice_date="2026-09-16",
        due_date="2026-10-16",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Cloud Hosting Standard (AWS)", "hsn_sac": "998313", "quantity": 1.0, "unit": "Month", "unit_price": 30000.0, "line_total": 30000.0},
            {"description": "Database Backup Storage", "hsn_sac": "998313", "quantity": 2.0, "unit": "TB", "unit_price": 3000.0, "line_total": 6000.0},
        ],
        subtotal=36000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=42480.0,  # Modified amount transaction reusing previous invoice number
        amount_in_words=amount_to_words_inr(42480.0),
        bank_name=v1.bank_name,
        account_number=v1.account_number,
        ifsc=v1.ifsc,
        template_id="classic_table",
    )
    save_doc("04_near_duplicate", spec4)
    expected_bands["04_near_duplicate"] = {
        "expected_level": "high",
        "score_range": [60, 85],
        "findings_expected": ["INVOICE_NUMBER_REUSED", "NEAR_DUPLICATE"],
        "description": "Near-duplicate invoice reusing previous invoice number with modified amount.",
    }

    # 5. 05_bank_change_only: Pure account takeover attempt
    spec5 = InvoiceSpec(
        invoice_number="INV/25-26/0105",
        invoice_date="2026-09-25",
        due_date="2026-10-25",
        vendor_id=v2.id,
        vendor_name=v2.name,
        vendor_gstin=v2.gstin,
        vendor_pan=v2.pan,
        vendor_address=v2.address,
        vendor_email=v2.email,
        vendor_phone=v2.phone,
        vendor_state_code=v2.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Stationery & Office Consumables", "hsn_sac": "998533", "quantity": 5.0, "unit": "Pack", "unit_price": 3000.0, "line_total": 15000.0},
        ],
        subtotal=15000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=17700.0,
        amount_in_words=amount_to_words_inr(17700.0),
        bank_name="AU Small Finance Bank",
        account_number="77889900112233",  # Unseen account
        ifsc="AUBL0002233",
        template_id="two_column",
    )
    save_doc("05_bank_change_only", spec5)
    expected_bands["05_bank_change_only"] = {
        "expected_level": "high",
        "score_range": [60, 80],
        "findings_expected": ["BANK_ACCOUNT_CHANGED"],
        "description": "Clean arithmetic but unexpected new remittance bank account for an established vendor.",
    }

    # 6. 06_pdf_edited_visual: Structural PDF redaction and font mixing
    spec6 = InvoiceSpec(
        invoice_number="INV/25-26/0106",
        invoice_date="2026-09-26",
        due_date="2026-10-26",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "High-Speed Internet Leased Line", "hsn_sac": "998422", "quantity": 1.0, "unit": "Month", "unit_price": 28000.0, "line_total": 28000.0},
        ],
        subtotal=28000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=33040.0,
        amount_in_words=amount_to_words_inr(33040.0),
        bank_name=v1.bank_name,
        account_number=v1.account_number,
        ifsc=v1.ifsc,
        template_id="compact_thermal",
    )
    p6, img6_path, gt6 = save_doc("06_pdf_edited_visual", spec6)
    # Apply structural PDF edit
    try:
        with open(p6, "rb") as f:
            pdf_b = f.read()
        if "grand_total" in gt6["fields"]:
            edited_b = apply_pdf_edit_structural(pdf_b, gt6["fields"]["grand_total"]["bbox"], "98,000.00")
            with open(p6, "wb") as f:
                f.write(edited_b)
    except Exception:
        pass

    expected_bands["06_pdf_edited_visual"] = {
        "expected_level": "medium",
        "score_range": [40, 70],
        "findings_expected": ["PDF_MODIFIED_AFTER_CREATION", "PDF_EDITOR_PRODUCER"],
        "description": "Invoice showing PDF structural tampering, multiple EOFs, or suspicious producer metadata.",
    }

    # 7. 07_new_vendor: Cold-start vendor with no prior billing history
    spec7 = InvoiceSpec(
        invoice_number="FIRST/25-26/001",
        invoice_date="2026-09-28",
        due_date="2026-10-28",
        vendor_id=v_new.id,
        vendor_name=v_new.name,
        vendor_gstin=v_new.gstin,
        vendor_pan=v_new.pan,
        vendor_address=v_new.address,
        vendor_email=v_new.email,
        vendor_phone=v_new.phone,
        vendor_state_code=v_new.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Initial Onboarding Retainer", "hsn_sac": "998211", "quantity": 1.0, "unit": "Unit", "unit_price": 50000.0, "line_total": 50000.0},
        ],
        subtotal=50000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=59000.0,
        amount_in_words=amount_to_words_inr(59000.0),
        bank_name=v_new.bank_name,
        account_number=v_new.account_number,
        ifsc=v_new.ifsc,
        template_id="modern_minimal",
    )
    save_doc("07_new_vendor", spec7)
    expected_bands["07_new_vendor"] = {
        "expected_level": "low",
        "score_range": [15, 35],
        "findings_expected": ["NEW_VENDOR_NO_BASELINE"],
        "description": "First-time supplier invoice with clean math triggering cold-start informational flag.",
    }

    # 8. 08_scanned_noisy_genuine: Noisy scan of genuine invoice
    spec8 = InvoiceSpec(
        invoice_number="INV/25-26/0108",
        invoice_date="2026-09-29",
        due_date="2026-10-29",
        vendor_id=v1.id,
        vendor_name=v1.name,
        vendor_gstin=v1.gstin,
        vendor_pan=v1.pan,
        vendor_address=v1.address,
        vendor_email=v1.email,
        vendor_phone=v1.phone,
        vendor_state_code=v1.state_code,
        buyer_name="Acme Enterprise India Pvt Ltd",
        buyer_gstin=generate_valid_gstin("27", "AABCA9999K", "1"),
        buyer_address="Plot 55, Bandra Kurla Complex, Mumbai",
        buyer_state_code="27",
        currency="INR",
        items=[
            {"description": "Industrial Laser Toner Refills", "hsn_sac": "844399", "quantity": 4.0, "unit": "Pack", "unit_price": 4500.0, "line_total": 18000.0},
        ],
        subtotal=18000.0,
        tax_rate=0.18,
        discount=0.0,
        shipping=0.0,
        grand_total=21240.0,
        amount_in_words=amount_to_words_inr(21240.0),
        bank_name=v1.bank_name,
        account_number=v1.account_number,
        ifsc=v1.ifsc,
        template_id="gst_tax_invoice",
    )
    save_doc("08_scanned_noisy_genuine", spec8, is_scanned=True)
    expected_bands["08_scanned_noisy_genuine"] = {
        "expected_level": "low",
        "score_range": [0, 30],
        "findings_expected": [],
        "description": "Legitimate invoice subjected to realistic physical scanning noise, rotation, and compression.",
    }

    # Write expected.json
    with open(samples_dir / "expected.json", "w") as f:
        json.dump(expected_bands, f, indent=2)

    return expected_bands


if __name__ == "__main__":
    print("Generating Hero Demo Sample Set into data/samples/...")
    bands = build_hero_demo_samples("data/samples")
    print(f"Generated {len(bands)} canonical sample invoices with expected bands written to data/samples/expected.json")
