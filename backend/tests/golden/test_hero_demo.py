"""Golden tests asserting the Hero Demo Sample Set integrity."""

import json
from pathlib import Path


def test_hero_demo_samples_and_expected_bands():
    samples_dir = Path("data/samples")
    expected_file = samples_dir / "expected.json"

    assert expected_file.exists(), "data/samples/expected.json must exist"

    with open(expected_file, "r") as f:
        expected_bands = json.load(f)

    assert len(expected_bands) == 8, f"Expected 8 demo invoices, found {len(expected_bands)}"

    for doc_id, config in expected_bands.items():
        pdf_path = samples_dir / f"{doc_id}.pdf"
        png_path = samples_dir / f"{doc_id}.png"

        assert pdf_path.exists(), f"PDF missing for {doc_id}"
        assert png_path.exists(), f"PNG missing for {doc_id}"
        assert "expected_level" in config
        assert "score_range" in config
        assert len(config["score_range"]) == 2
        assert config["score_range"][0] <= config["score_range"][1]


def test_hero_critical_and_clean_end_to_end_scoring():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    client = TestClient(app)
    # Reset and seed DB to ensure clean baseline with demo vendor profiles
    client.post("/api/v1/demo/reset")
    client.post("/api/v1/demo/seed")

    # 1. Upload and analyze Hero Critical Sample
    hero_pdf = Path("data/samples/03_hero_critical.pdf")
    assert hero_pdf.exists()

    with open(hero_pdf, "rb") as f:
        up_resp = client.post(
            "/api/v1/invoices/upload",
            files={"file": ("03_hero_critical.pdf", f, "application/pdf")},
        )
    assert up_resp.status_code == 201
    hero_id = up_resp.json()["invoice_id"]

    analyze_resp = client.post(f"/api/v1/invoices/{hero_id}/analyze")
    assert analyze_resp.status_code == 200
    hero_result = analyze_resp.json()

    # Hero sample must score in High or Critical band
    assert hero_result["overall_score"] >= 60.0, f"Expected >= 60, got {hero_result['overall_score']}"
    assert hero_result["level"].lower() in ("high", "critical")
    assert len(hero_result["signals"]) >= 5
    assert len(hero_result["shap_top"]) >= 1

    # 2. Upload and analyze Clean Sample
    clean_pdf = Path("data/samples/01_clean_low.pdf")
    assert clean_pdf.exists()

    with open(clean_pdf, "rb") as f:
        clean_up_resp = client.post(
            "/api/v1/invoices/upload",
            files={"file": ("01_clean_low.pdf", f, "application/pdf")},
        )
    assert clean_up_resp.status_code == 201
    clean_id = clean_up_resp.json()["invoice_id"]

    clean_an_resp = client.post(f"/api/v1/invoices/{clean_id}/analyze")
    assert clean_an_resp.status_code == 200
    clean_result = clean_an_resp.json()

    # Clean sample must score in Low band
    assert clean_result["level"].lower() == "low", f"Expected low, got {clean_result['level']} ({clean_result['overall_score']})"
    assert clean_result["overall_score"] < 30.0

