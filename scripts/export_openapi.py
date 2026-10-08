"""Export OpenAPI specification and generate realistic frontend mock fixtures."""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.main import create_app


def export_openapi() -> None:
    app = create_app()
    openapi_schema = app.openapi()

    docs_dir = REPO_ROOT / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    out_file = docs_dir / "openapi.json"

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(openapi_schema, f, indent=2)

    print(f"Exported OpenAPI specification to {out_file}")


def export_frontend_mocks() -> None:
    mocks_dir = REPO_ROOT / "frontend-mocks"
    mocks_dir.mkdir(parents=True, exist_ok=True)

    # 1. Upload Response Mock
    upload_mock = {
        "invoice_id": "inv-hero-03-critical",
        "status": "extracted",
        "filename": "03_hero_critical.pdf",
        "page_count": 1,
        "content_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
    }
    with open(mocks_dir / "upload_response.json", "w", encoding="utf-8") as f:
        json.dump(upload_mock, f, indent=2)

    # 2. Extraction Response Mock
    extraction_mock = {
        "invoice_id": "inv-hero-03-critical",
        "data": {
            "vendor": {
                "name": {"value": "Apex Cloud Technologies Pvt Ltd", "conf": 0.98, "bbox": [0.10, 0.08, 0.45, 0.12]},
                "gstin": {"value": "27AABCA1234F1Z9", "conf": 0.97, "bbox": [0.10, 0.13, 0.35, 0.15]},
                "pan": {"value": "AABCA1234F", "conf": 0.95, "bbox": [0.10, 0.16, 0.28, 0.18]},
                "address": {"value": "Unit 402, Trade Tower, Mumbai 400051", "conf": 0.92, "bbox": [0.10, 0.19, 0.50, 0.22]},
            },
            "buyer": {
                "name": {"value": "Acme Global Solutions India Ltd", "conf": 0.97, "bbox": [0.55, 0.08, 0.90, 0.12]},
                "gstin": {"value": "07AAACG1234M1Z2", "conf": 0.96, "bbox": [0.55, 0.13, 0.80, 0.15]},
                "address": {"value": "Barakhamba Road, Connaught Place, New Delhi 110001", "conf": 0.93, "bbox": [0.55, 0.16, 0.90, 0.20]},
            },
            "invoice_number": {"value": "INV-2026-0042", "conf": 0.99, "bbox": [0.65, 0.22, 0.88, 0.25]},
            "invoice_date": {"value": "2026-03-15", "conf": 0.98, "bbox": [0.65, 0.26, 0.88, 0.28]},
            "currency": {"value": "INR", "conf": 0.99, "bbox": [0.65, 0.29, 0.75, 0.31]},
            "items": [
                {
                    "description": {"value": "Enterprise Cloud Migration Consulting", "conf": 0.96, "bbox": [0.10, 0.38, 0.50, 0.41]},
                    "quantity": {"value": 2.0, "conf": 0.98, "bbox": [0.52, 0.38, 0.58, 0.41]},
                    "unit_price": {"value": 15000.0, "conf": 0.97, "bbox": [0.60, 0.38, 0.72, 0.41]},
                    "line_total": {"value": 40000.0, "conf": 0.95, "bbox": [0.75, 0.38, 0.90, 0.41]},
                },
                {
                    "description": {"value": "Dedicated Kubernetes Infrastructure", "conf": 0.95, "bbox": [0.10, 0.43, 0.50, 0.46]},
                    "quantity": {"value": 1.0, "conf": 0.98, "bbox": [0.52, 0.43, 0.58, 0.46]},
                    "unit_price": {"value": 65000.0, "conf": 0.97, "bbox": [0.60, 0.43, 0.72, 0.46]},
                    "line_total": {"value": 65000.0, "conf": 0.96, "bbox": [0.75, 0.43, 0.90, 0.46]},
                },
            ],
            "subtotal": {"value": 105000.0, "conf": 0.97, "bbox": [0.75, 0.52, 0.90, 0.55]},
            "tax": {
                "total": {"value": 18900.0, "conf": 0.96, "bbox": [0.75, 0.56, 0.90, 0.59]},
                "igst": {"value": 18900.0, "conf": 0.96, "bbox": [0.75, 0.56, 0.90, 0.59]},
            },
            "grand_total": {"value": 153900.0, "conf": 0.98, "bbox": [0.75, 0.62, 0.92, 0.66]},
            "payment": {
                "bank_name": {"value": "HDFC Bank", "conf": 0.92, "bbox": [0.10, 0.72, 0.30, 0.75]},
                "account_number": {"value": "50100987658891", "conf": 0.95, "bbox": [0.10, 0.76, 0.38, 0.79]},
                "ifsc": {"value": "HDFC0001234", "conf": 0.96, "bbox": [0.10, 0.80, 0.28, 0.83]},
            },
        },
        "confidences": {
            "invoice_number": 0.99,
            "invoice_date": 0.98,
            "grand_total": 0.98,
            "vendor_name": 0.98,
        },
        "missing_critical_fields": [],
        "needs_manual_verification": False,
        "read_quality": 0.98,
    }
    with open(mocks_dir / "extraction_response.json", "w", encoding="utf-8") as f:
        json.dump(extraction_mock, f, indent=2)

    # 3. Hero Critical Analysis Result (The Golden Demo Mock)
    hero_analysis_mock = {
        "id": "inv-hero-03-critical",
        "original_filename": "03_hero_critical.pdf",
        "page_count": 1,
        "invoice_number": "INV-2026-0042",
        "invoice_date": "2026-03-15",
        "grand_total": 153900.0,
        "currency": "INR",
        "status": "analyzed",
        "risk_level": "CRITICAL",
        "overall_score": 88.5,
        "review_status": "needs_review",
        "review_note": None,
        "read_quality": 0.98,
        "extraction_confidence": 0.98,
        "needs_manual_verification": False,
        "created_at": "2026-03-15T10:30:00Z",
        "data": extraction_mock["data"],
        "risk": {
            "overall_score": 88.5,
            "level": "CRITICAL",
            "probability": 0.932,
            "confidence": 0.95,
            "baseline_score": 86.2,
            "ml_score": 90.8,
            "signals": {
                "financial": 82.0,
                "tax_identity": 45.0,
                "identifiers": 35.0,
                "duplicate": 74.0,
                "vendor": 78.0,
                "bank_change": 85.0,
                "visual": 70.0,
                "extraction": 10.0,
            },
            "shap_top": [
                {"feature": "bank_change_score", "importance": 0.28, "direction": "increases_risk", "value": 85.0},
                {"feature": "financial_score", "importance": 0.24, "direction": "increases_risk", "value": 82.0},
                {"feature": "vendor_score", "importance": 0.19, "direction": "increases_risk", "value": 78.0},
                {"feature": "duplicate_score", "importance": 0.15, "direction": "increases_risk", "value": 74.0},
                {"feature": "finding_count", "importance": 0.11, "direction": "increases_risk", "value": 5.0},
            ],
            "escalations": [
                "Multiple high-risk signals (financial=82.0, bank_change=85.0, vendor=78.0, duplicate=74.0) enforced floor 65",
                "New bank account discrepancy on established vendor enforced risk floor 75",
            ],
            "recommendation": "Block automated payment release immediately. Requires senior controller sign-off and verbal bank verification.",
            "disclaimer": "InvoiceGuard flags anomalies for human review. It does not determine fraud.",
        },
        "signals": {
            "financial": 82.0,
            "tax_identity": 45.0,
            "identifiers": 35.0,
            "duplicate": 74.0,
            "vendor": 78.0,
            "bank_change": 85.0,
            "visual": 70.0,
            "extraction": 10.0,
        },
        "findings": [
            {
                "id": "find-1",
                "engine": "financial",
                "category": "rule",
                "type": "LINE_TOTAL_MISMATCH",
                "severity": "high",
                "score": 75.0,
                "confidence": 0.95,
                "title": "Line Item #1 Arithmetic Mismatch",
                "summary": "Line 1 specifies quantity 2 @ ₹15,000.00 yielding expected ₹30,000.00, but line total shows ₹40,000.00 (difference +₹10,000.00).",
                "evidence": {"expected": 30000.0, "found": 40000.0, "difference": 10000.0},
                "field": "items[0].line_total",
                "bbox": [0.75, 0.38, 0.90, 0.41],
                "recommended_action": "Verify line item rate and billed quantity against quotation.",
            },
            {
                "id": "find-2",
                "engine": "financial",
                "category": "rule",
                "type": "GRAND_TOTAL_MISMATCH",
                "severity": "critical",
                "score": 85.0,
                "confidence": 0.96,
                "title": "Grand Total Summation Mismatch",
                "summary": "Calculated total from subtotal and tax is ₹123,900.00, but stated grand total is ₹153,900.00 (unexplained difference +₹30,000.00).",
                "evidence": {"expected": 123900.0, "found": 153900.0, "difference": 30000.0},
                "field": "grand_total",
                "bbox": [0.75, 0.62, 0.92, 0.66],
                "recommended_action": "Review invoice arithmetic and verify whether unauthorized surcharges were added.",
            },
            {
                "id": "find-3",
                "engine": "bank_change",
                "category": "statistical",
                "type": "BANK_ACCOUNT_CHANGED",
                "severity": "high",
                "score": 85.0,
                "confidence": 0.98,
                "title": "Unseen Bank Account for Established Vendor",
                "summary": "Vendor Apex Cloud previously remitted to account ending in 1234 across 18 invoices. Current invoice directs payment to unseen account XXXXXX8891.",
                "evidence": {"expected": "XXXXXX1234", "found": "XXXXXX8891", "difference": "New unverified account"},
                "field": "payment.account_number",
                "bbox": [0.10, 0.76, 0.38, 0.79],
                "recommended_action": "Perform out-of-band verbal callback to vendor finance contact before remitting funds.",
            },
            {
                "id": "find-4",
                "engine": "vendor",
                "category": "statistical",
                "type": "AMOUNT_OUTLIER",
                "severity": "medium",
                "score": 68.0,
                "confidence": 0.90,
                "title": "Billed Amount 3.8x Above Vendor Median",
                "summary": "Invoice amount of ₹153,900.00 is 3.8x higher than vendor's historical median transaction (₹40,500.00; MAD z-score: 4.1).",
                "evidence": {"expected": 40500.0, "found": 153900.0, "difference": 113400.0},
                "field": "grand_total",
                "bbox": [0.75, 0.62, 0.92, 0.66],
                "recommended_action": "Obtain secondary managerial approval for volume spike.",
            },
            {
                "id": "find-5",
                "engine": "duplicate",
                "category": "ml",
                "type": "NEAR_DUPLICATE",
                "severity": "medium",
                "score": 72.0,
                "confidence": 0.92,
                "title": "High Similarity to Previous Invoice",
                "summary": "Invoice matches 94% text and structure of prior invoice INV-2025-0089 with modified grand total.",
                "evidence": {"similarity": 0.94, "matched_invoice_id": "inv-past-089"},
                "field": "invoice_number",
                "bbox": [0.65, 0.22, 0.88, 0.25],
                "recommended_action": "Confirm whether this is a revised rebill or duplicate claim.",
            },
        ],
        "matches": [
            {
                "matched_invoice_id": "inv-past-089",
                "matched_invoice_number": "INV-2025-0089",
                "similarity": 0.94,
                "status": "near_duplicate",
                "date": "2025-11-20",
                "total": 48500.0,
            }
        ],
        "vendor": {
            "id": "vend-apex-01",
            "name": "Apex Cloud Technologies Pvt Ltd",
            "gstin": "27AABCA1234F1Z9",
            "pan": "AABCA1234F",
            "category": "Cloud & IT Services",
        },
    }
    with open(mocks_dir / "hero_analysis_result.json", "w", encoding="utf-8") as f:
        json.dump(hero_analysis_mock, f, indent=2)

    # 4. Dashboard Stats Mock
    dashboard_mock = {
        "kpis": {
            "total_invoices": 128,
            "analyzed_count": 124,
            "needs_review_count": 14,
            "high_critical_count": 18,
            "duplicate_alerts": 7,
        },
        "risk_distribution": {"low": 82, "medium": 24, "high": 12, "critical": 6},
        "anomaly_categories": {
            "financial": 24,
            "tax_identity": 11,
            "identifiers": 8,
            "duplicate": 9,
            "vendor": 15,
            "bank_change": 7,
            "visual": 12,
        },
        "recent_analyses": [
            {
                "id": "inv-hero-03-critical",
                "invoice_number": "INV-2026-0042",
                "vendor_name": "Apex Cloud Technologies Pvt Ltd",
                "grand_total": 153900.0,
                "status": "analyzed",
                "risk_level": "CRITICAL",
                "overall_score": 88.5,
                "created_at": "2026-03-15T10:30:00Z",
            },
            {
                "id": "inv-hero-01-clean",
                "invoice_number": "INV-2026-0112",
                "vendor_name": "Kiran Office Supplies",
                "grand_total": 14500.0,
                "status": "analyzed",
                "risk_level": "LOW",
                "overall_score": 12.0,
                "created_at": "2026-03-15T09:15:00Z",
            },
        ],
    }
    with open(mocks_dir / "dashboard_stats.json", "w", encoding="utf-8") as f:
        json.dump(dashboard_mock, f, indent=2)

    # 5. Invoices History Mock
    history_mock = {
        "total": 2,
        "limit": 50,
        "offset": 0,
        "items": dashboard_mock["recent_analyses"],
    }
    with open(mocks_dir / "invoices_history.json", "w", encoding="utf-8") as f:
        json.dump(history_mock, f, indent=2)

    # 6. Vendor Profile Mock
    vendor_profile_mock = {
        "id": "vend-apex-01",
        "name": "Apex Cloud Technologies Pvt Ltd",
        "gstin": "27AABCA1234F1Z9",
        "pan": "AABCA1234F",
        "address": "Unit 402, Trade Tower, Mumbai 400051",
        "email": "billing@apexcloud.in",
        "phone": "+91 22 2847 9900",
        "category": "Cloud & IT Services",
        "known_accounts": [
            {
                "id": "acc-1",
                "masked_account": "XXXXXX1234",
                "bank_name": "HDFC Bank",
                "ifsc": "HDFC0001234",
                "invoice_count": 18,
                "first_seen": "2024-06-10T00:00:00Z",
                "last_seen": "2026-01-15T00:00:00Z",
            },
            {
                "id": "acc-2",
                "masked_account": "XXXXXX8891",
                "bank_name": "HDFC Bank",
                "ifsc": "HDFC0001234",
                "invoice_count": 1,
                "first_seen": "2026-03-15T10:30:00Z",
                "last_seen": "2026-03-15T10:30:00Z",
            },
        ],
        "recent_invoices": dashboard_mock["recent_analyses"][:1],
    }
    with open(mocks_dir / "vendor_profile.json", "w", encoding="utf-8") as f:
        json.dump(vendor_profile_mock, f, indent=2)

    # 7. Compare Mock
    compare_mock = {
        "invoice_a_id": "inv-hero-03-critical",
        "invoice_b_id": "inv-past-089",
        "differences": [
            {"field": "invoice_number", "invoice_a_value": "INV-2026-0042", "invoice_b_value": "INV-2025-0089", "status": "changed"},
            {"field": "grand_total", "invoice_a_value": 153900.0, "invoice_b_value": 48500.0, "status": "changed"},
            {"field": "subtotal", "invoice_a_value": 105000.0, "invoice_b_value": 40500.0, "status": "changed"},
        ],
    }
    with open(mocks_dir / "compare_invoices.json", "w", encoding="utf-8") as f:
        json.dump(compare_mock, f, indent=2)

    # 8. Settings Mock
    settings_mock = {
        "thresholds": {"low": 30.0, "medium": 60.0, "high": 80.0},
        "tolerances": {
            "line_total_abs": 1.0,
            "line_total_pct": 0.5,
            "subtotal_abs": 1.0,
            "grand_total_abs": 1.0,
            "tax_amount_abs": 1.0,
            "rounding_max_abs": 1.0,
        },
        "engine_toggles": {
            "financial": True,
            "tax_identity": True,
            "identifiers": True,
            "duplicate": True,
            "vendor": True,
            "bank_change": True,
            "visual": True,
        },
        "fusion": {
            "weights": {
                "financial": 0.85,
                "tax_identity": 0.60,
                "duplicate": 0.80,
                "vendor": 0.60,
                "bank_change": 0.80,
                "identifiers": 0.40,
                "visual": 0.50,
            },
            "combination_ratio": {"baseline": 0.5, "ml": 0.5},
        },
    }
    with open(mocks_dir / "settings.json", "w", encoding="utf-8") as f:
        json.dump(settings_mock, f, indent=2)

    print(f"Exported 8 frontend mock fixtures to {mocks_dir}")


def main() -> None:
    export_openapi()
    export_frontend_mocks()


if __name__ == "__main__":
    main()
