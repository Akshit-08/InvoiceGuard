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
