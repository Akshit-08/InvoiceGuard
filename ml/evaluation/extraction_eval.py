"""Extraction Evaluation Benchmark for InvoiceGuard.

Evaluates field-level precision, recall, and F1 across synthetic test split
for both native PDF text-layer and scanned OCR paths.
Generates reports/extraction_metrics.json and a markdown summary table.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pandas as pd

from backend.app.services.extraction.heuristic import heuristic_extractor
from backend.app.services.extraction.normalize import (
    normalize_date,
    normalize_gstin,
)
from backend.app.services.reading.reader import PdfTextReader, RapidOcrReader


def match_field(field_name: str, pred_val: Any, gt_val: Any) -> bool:
    """Determine whether extracted predicted value matches ground truth."""
    if gt_val is None:
        return pred_val is None

    if pred_val is None:
        return False

    # Numeric fields
    if field_name in {"subtotal", "tax.total", "grand_total"}:
        try:
            p_num = float(pred_val)
            g_num = float(gt_val)
            # Allow ₹1.0 or 0.5% tolerance
            tol = max(1.0, 0.005 * abs(g_num))
            return abs(p_num - g_num) <= tol
        except (ValueError, TypeError):
            return False

    # Date fields
    if "date" in field_name:
        p_d = normalize_date(str(pred_val))
        g_d = normalize_date(str(gt_val))
        return p_d == g_d

    # GSTIN
    if "gstin" in field_name:
        p_g = normalize_gstin(str(pred_val))
        g_g = normalize_gstin(str(gt_val))
        return p_g == g_g

    # Vendor / Buyer Name
    if "name" in field_name:
        p_s = str(pred_val).lower().strip()
        g_s = str(gt_val).lower().strip()
        if p_s == g_s or p_s in g_s or g_s in p_s:
            return True
        # Check first word match (e.g. Apex vs Apex Solutions)
        p_words = set(p_s.split())
        g_words = set(g_s.split())
        return len(p_words.intersection(g_words)) >= 1

    # Invoice number or general text
    p_s = str(pred_val).strip().upper()
    g_s = str(gt_val).strip().upper()
    return p_s == g_s


def run_evaluation(
    synthetic_dir: str = "data/synthetic",
    manifest_path: Optional[str] = None,
    out_metrics_json: str = "reports/extraction_metrics.json",
    max_eval_samples: int = 50,
) -> dict[str, Any]:
    syn_path = Path(synthetic_dir)
    m_path = Path(manifest_path or (syn_path / "manifest.csv"))

    if not m_path.exists():
        raise FileNotFoundError(f"Manifest not found at {m_path}. Run generate_data.py first.")

    df = pd.read_csv(m_path)
    test_df = df[df["split"] == "test"]
    if test_df.empty:
        test_df = df.sample(min(len(df), max_eval_samples), random_state=42)
    else:
        test_df = test_df.head(max_eval_samples)

    pdf_reader = PdfTextReader()
    ocr_reader = RapidOcrReader()

    critical_fields = [
        "invoice_number",
        "invoice_date",
        "vendor.name",
        "vendor.gstin",
        "subtotal",
        "tax.total",
        "grand_total",
    ]

    results = {
        "text_layer": {f: {"tp": 0, "fp": 0, "fn": 0} for f in critical_fields},
        "scanned_ocr": {f: {"tp": 0, "fp": 0, "fn": 0} for f in critical_fields},
    }

    per_template = {}

    print(f"Evaluating extraction on {len(test_df)} test documents...")

    for idx, row in test_df.iterrows():
        doc_id = str(row["id"])
        gt_json_path = syn_path / "gt" / f"{doc_id}.json"
        pdf_file = syn_path / "pdf" / f"{doc_id}.pdf"
        png_file = syn_path / "png" / f"{doc_id}.png"
        template_id = str(row["template_id"])

        if template_id not in per_template:
            per_template[template_id] = {"tp": 0, "total": 0}

        if not gt_json_path.exists() or not pdf_file.exists():
            continue

        with open(gt_json_path, "r") as f:
            gt_data = json.load(f)

        spec = gt_data.get("spec", {})

        gt_vals = {
            "invoice_number": spec.get("invoice_number"),
            "invoice_date": spec.get("invoice_date"),
            "vendor.name": spec.get("vendor_name"),
            "vendor.gstin": spec.get("vendor_gstin"),
            "subtotal": spec.get("subtotal"),
            "tax.total": spec.get("grand_total", 0) - spec.get("subtotal", 0),
            "grand_total": spec.get("grand_total"),
        }

        # 1. Native PDF Text-Layer Evaluation
        tokens_pdf, _ = pdf_reader.read(str(pdf_file), [str(png_file)])
        extracted_pdf = heuristic_extractor.extract(tokens_pdf)

        pred_pdf_vals = {
            "invoice_number": extracted_pdf.invoice_number.value,
            "invoice_date": extracted_pdf.invoice_date.value,
            "vendor.name": extracted_pdf.vendor.name.value,
            "vendor.gstin": extracted_pdf.vendor.gstin.value,
            "subtotal": extracted_pdf.subtotal.value,
            "tax.total": extracted_pdf.tax.total.value,
            "grand_total": extracted_pdf.grand_total.value,
        }

        for f in critical_fields:
            g_val = gt_vals[f]
            p_val = pred_pdf_vals[f]
            if g_val is not None:
                if match_field(f, p_val, g_val):
                    results["text_layer"][f]["tp"] += 1
                    per_template[template_id]["tp"] += 1
                else:
                    results["text_layer"][f]["fn"] += 1
                per_template[template_id]["total"] += 1
            elif p_val is not None:
                results["text_layer"][f]["fp"] += 1

        # 2. Scanned OCR Evaluation
        tokens_ocr, _ = ocr_reader.read(None, [str(png_file)])
        extracted_ocr = heuristic_extractor.extract(tokens_ocr)

        pred_ocr_vals = {
            "invoice_number": extracted_ocr.invoice_number.value,
            "invoice_date": extracted_ocr.invoice_date.value,
            "vendor.name": extracted_ocr.vendor.name.value,
            "vendor.gstin": extracted_ocr.vendor.gstin.value,
            "subtotal": extracted_ocr.subtotal.value,
            "tax.total": extracted_ocr.tax.total.value,
            "grand_total": extracted_ocr.grand_total.value,
        }

        for f in critical_fields:
            g_val = gt_vals[f]
            p_val = pred_ocr_vals[f]
            if g_val is not None:
                if match_field(f, p_val, g_val):
                    results["scanned_ocr"][f]["tp"] += 1
                else:
                    results["scanned_ocr"][f]["fn"] += 1
            elif p_val is not None:
                results["scanned_ocr"][f]["fp"] += 1

    # Compute metrics table
    def compute_p_r_f1(counts: dict[str, int]) -> dict[str, float]:
        tp = counts["tp"]
        fp = counts["fp"]
        fn = counts["fn"]
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0
        return {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}

    final_metrics: Dict[str, Any] = {
        "text_layer": {},
        "scanned_ocr": {},
        "overall": {},
        "per_template": {},
    }

    # Text layer summary
    tot_tp, tot_fp, tot_fn = 0, 0, 0
    for f in critical_fields:
        m = compute_p_r_f1(results["text_layer"][f])
        final_metrics["text_layer"][f] = m
        tot_tp += results["text_layer"][f]["tp"]
        tot_fp += results["text_layer"][f]["fp"]
        tot_fn += results["text_layer"][f]["fn"]

    final_metrics["overall"]["text_layer"] = compute_p_r_f1({"tp": tot_tp, "fp": tot_fp, "fn": tot_fn})

    # Scanned OCR summary
    tot_tp_ocr, tot_fp_ocr, tot_fn_ocr = 0, 0, 0
    for f in critical_fields:
        m = compute_p_r_f1(results["scanned_ocr"][f])
        final_metrics["scanned_ocr"][f] = m
        tot_tp_ocr += results["scanned_ocr"][f]["tp"]
        tot_fp_ocr += results["scanned_ocr"][f]["fp"]
        tot_fn_ocr += results["scanned_ocr"][f]["fn"]

    final_metrics["overall"]["scanned_ocr"] = compute_p_r_f1(
        {"tp": tot_tp_ocr, "fp": tot_fp_ocr, "fn": tot_fn_ocr}
    )

    # Per template accuracy
    for tmpl, stats in per_template.items():
        acc = (stats["tp"] / stats["total"]) if stats["total"] > 0 else 0.0
        final_metrics["per_template"][tmpl] = {
            "accuracy": round(acc, 4),
            "total_evals": stats["total"],
        }

    # Save metrics JSON
    out_path = Path(out_metrics_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(final_metrics, f, indent=2)

    # Print markdown table
    print("\n=== Extraction Performance Benchmark ===")
    print("| Field | PDF Text Layer F1 | Scanned OCR F1 | Target (PDF / Scan) |")
    print("|---|---|---|---|")
    for f in critical_fields:
        f1_pdf = final_metrics["text_layer"][f]["f1"]
        f1_ocr = final_metrics["scanned_ocr"][f]["f1"]
        print(f"| `{f}` | **{f1_pdf*100:.1f}%** | {f1_ocr*100:.1f}% | >=95% / >=85% |")

    ov_pdf = final_metrics["overall"]["text_layer"]["f1"]
    ov_ocr = final_metrics["overall"]["scanned_ocr"]["f1"]
    print(f"| **Overall Macro F1** | **{ov_pdf*100:.1f}%** | **{ov_ocr*100:.1f}%** | >=95% / >=85% |")

    # Generate reports/extraction_summary.md
    summary_md_path = out_path.parent / "extraction_summary.md"
    with open(summary_md_path, "w") as f:
        f.write("# Extraction Evaluation Summary\n\n")
        f.write(f"- **PDF Text Layer Overall F1:** {ov_pdf*100:.1f}%\n")
        f.write(f"- **Scanned OCR Overall F1:** {ov_ocr*100:.1f}%\n\n")
        f.write("| Field | PDF Text Layer F1 | Scanned OCR F1 |\n")
        f.write("|---|---|---|\n")
        for fld in critical_fields:
            f1_p = final_metrics["text_layer"][fld]["f1"]
            f1_o = final_metrics["scanned_ocr"][fld]["f1"]
            f.write(f"| `{fld}` | {f1_p*100:.1f}% | {f1_o*100:.1f}% |\n")

    return final_metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate invoice extraction performance")
    parser.add_argument("--synthetic", type=str, default="data/synthetic")
    parser.add_argument("--manifest", type=str, default=None)
    parser.add_argument("--out", type=str, default="reports/extraction_metrics.json")
    parser.add_argument("--samples", type=int, default=50)

    args = parser.parse_args()
    run_evaluation(
        synthetic_dir=args.synthetic,
        manifest_path=args.manifest,
        out_metrics_json=args.out,
        max_eval_samples=args.samples,
    )
