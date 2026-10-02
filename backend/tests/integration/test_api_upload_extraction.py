"""Integration test for upload and extraction endpoints."""

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from ml.synthetic.templates import InvoiceSpec, render_invoice_pdf

client = TestClient(app)


def test_upload_and_extraction_flow():
    # 1. Render a clean temporary PDF
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = Path(tmpdir) / "test_inv.pdf"
        spec = InvoiceSpec(
            invoice_number="INV/25-26/0999",
            invoice_date="2026-09-20",
            due_date="2026-10-20",
            vendor_id="VND-001",
            vendor_name="Apex Solutions Pvt Ltd",
            vendor_gstin="27AABCT1332L1ZE",
            vendor_pan="AABCT1332L",
            vendor_address="Plot 44, MIDC, Mumbai",
            vendor_email="billing@apex.co.in",
            vendor_phone="+91 9876543210",
            vendor_state_code="27",
            buyer_name="Client India Corp",
            buyer_gstin="27AABCB9999K1Z1",
            buyer_address="Sector 12, Pune",
            buyer_state_code="27",
            currency="INR",
            items=[
                {"description": "IT Support Services", "hsn_sac": "998313", "quantity": 1.0, "unit": "Month", "unit_price": 20000.0, "line_total": 20000.0}
            ],
            subtotal=20000.0,
            tax_rate=0.18,
            discount=0.0,
            shipping=0.0,
            grand_total=23600.0,
            amount_in_words="Twenty-Three Thousand Six Hundred Rupees Only",
            bank_name="HDFC Bank",
            account_number="123456789012",
            ifsc="HDFC0001234",
            template_id="classic_table",
        )
        render_invoice_pdf(spec, str(pdf_path))

        # 2. Upload file via POST /api/v1/invoices/upload
        with open(pdf_path, "rb") as f:
            response = client.post(
                "/api/v1/invoices/upload",
                files={"file": ("test_inv.pdf", f, "application/pdf")},
            )

        assert response.status_code == 201
        upload_data = response.json()
        assert "invoice_id" in upload_data
        inv_id = upload_data["invoice_id"]
        assert upload_data["status"] == "extracted"

        # 3. Retrieve extraction via GET /api/v1/invoices/{id}/extraction
        ext_response = client.get(f"/api/v1/invoices/{inv_id}/extraction")
        assert ext_response.status_code == 200
        ext_data = ext_response.json()

        assert ext_data["invoice_id"] == inv_id
        data = ext_data["data"]
        assert data["invoice_number"]["value"] == "INV/25-26/0999"
        assert data["vendor"]["gstin"]["value"] == "27AABCT1332L1ZE"
        assert data["subtotal"]["value"] == 20000.0
        assert data["grand_total"]["value"] == 23600.0
        assert "confidences" in ext_data
        assert ext_data["needs_manual_verification"] is False
