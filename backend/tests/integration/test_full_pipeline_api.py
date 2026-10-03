"""Integration test verifying full end-to-end API pipeline: upload -> extract -> analyze -> result -> review -> audit."""

import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from ml.synthetic.templates import InvoiceSpec, render_invoice_pdf

client = TestClient(app)


def test_complete_api_lifecycle():
    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = Path(tmpdir) / "hero_sample.pdf"
        # Create an invoice with an anomaly (2 x 15000 = 30000, but shown as 40000)
        spec = InvoiceSpec(
            invoice_number="INV-2026-HERO",
            invoice_date="2026-03-10",
            due_date="2026-03-25",
            vendor_id="VND-HERO",
            vendor_name="Hero Tech Solutions",
            vendor_gstin="27AABCT1332L1ZE",
            vendor_pan="AABCT1332L",
            vendor_address="MIDC Andheri, Mumbai",
            vendor_email="billing@herotech.in",
            vendor_phone="+91 9876543210",
            vendor_state_code="27",
            buyer_name="Enterprise Corp",
            buyer_gstin="27AABCB9999K1Z1",
            buyer_address="Nariman Point, Mumbai",
            buyer_state_code="27",
            currency="INR",
            items=[
                {
                    "description": "Cloud Architecture Assessment",
                    "hsn_sac": "998313",
                    "quantity": 2.0,
                    "unit": "Days",
                    "unit_price": 15000.0,
                    "line_total": 40000.0,  # Line total arithmetic anomaly (+10,000)
                }
            ],
            subtotal=40000.0,
            tax_rate=0.18,
            discount=0.0,
            shipping=0.0,
            grand_total=47200.0,
            amount_in_words="Forty-Seven Thousand Two Hundred Rupees Only",
            bank_name="HDFC Bank",
            account_number="50100998877665",
            ifsc="HDFC0001234",
            template_id="classic_table",
        )
        render_invoice_pdf(spec, str(pdf_path))

        # 1. Upload Invoice
        with open(pdf_path, "rb") as f:
            upload_resp = client.post(
                "/api/v1/invoices/upload",
                files={"file": ("hero_sample.pdf", f, "application/pdf")},
            )
        assert upload_resp.status_code == 201
        upload_data = upload_resp.json()
        invoice_id = upload_data["invoice_id"]
        assert upload_data["status"] == "extracted"

        # 2. Get Extraction
        ext_resp = client.get(f"/api/v1/invoices/{invoice_id}/extraction")
        assert ext_resp.status_code == 200
        ext_data = ext_resp.json()
        assert ext_data["invoice_id"] == invoice_id
        assert ext_data["data"]["invoice_number"]["value"] == "INV-2026-HERO"

        # 3. Analyze Invoice (runs 8 engines + multimodal fusion)
        analyze_resp = client.post(f"/api/v1/invoices/{invoice_id}/analyze")
        assert analyze_resp.status_code == 200
        analyze_result = analyze_resp.json()
        assert "overall_score" in analyze_result
        assert "signals" in analyze_result
        assert "shap_top" in analyze_result

        # 4. Get Full Result
        full_resp = client.get(f"/api/v1/invoices/{invoice_id}")
        assert full_resp.status_code == 200
        full_result = full_resp.json()
        assert full_result["id"] == invoice_id
        assert full_result["status"] == "analyzed"
        assert full_result["risk"] is not None
        assert "overall_score" in full_result["risk"]
        assert "signals" in full_result["risk"]
        assert len(full_result["findings"]) >= 1

        # Assert finding contains bboxes, evidence, and recommendations
        finding = full_result["findings"][0]
        assert "type" in finding
        assert "severity" in finding
        assert "recommended_action" in finding
        assert "evidence" in finding
        assert "expected" in finding["evidence"]
        assert "found" in finding["evidence"]

        # 5. History Endpoint
        history_resp = client.get("/api/v1/invoices")
        assert history_resp.status_code == 200
        history_data = history_resp.json()
        assert history_data["total"] >= 1
        assert any(item["id"] == invoice_id for item in history_data["items"])

        # 6. Dashboard Stats
        stats_resp = client.get("/api/v1/dashboard/stats")
        assert stats_resp.status_code == 200
        stats = stats_resp.json()
        assert "kpis" in stats
        assert stats["kpis"]["total_invoices"] >= 1

        # 7. Review Endpoint
        review_resp = client.patch(
            f"/api/v1/invoices/{invoice_id}/review",
            json={"status": "confirmed_issue", "note": "Verified line total discrepancy with supplier."},
        )
        assert review_resp.status_code == 200
        assert review_resp.json()["review_status"] == "confirmed_issue"

        # 8. Audit Trail Endpoint
        audit_resp = client.get(f"/api/v1/invoices/{invoice_id}/audit")
        assert audit_resp.status_code == 200
        audit_events = audit_resp.json()
        assert len(audit_events) >= 1
        assert any(e["action"] == "review_status_updated" for e in audit_events)

        # 9. PDF Report Download
        report_resp = client.get(f"/api/v1/invoices/{invoice_id}/report.pdf")
        assert report_resp.status_code == 200
        assert report_resp.headers["content-type"] == "application/pdf"
        assert len(report_resp.content) > 100
