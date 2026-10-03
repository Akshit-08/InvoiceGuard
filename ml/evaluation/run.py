"""End-to-end evaluation runner — Blueprint section 11.

Produces:
  reports/metrics.json        — machine-readable metrics
  reports/EVALUATION.md       — human-readable tables (auto-generated)

Usage:
    python ml/evaluation/run.py \\
        --manifest data/synthetic/manifest.csv \\
        --pdf-dir  data/synthetic/pdf \\
        --gt-dir   data/synthetic/gt

Metrics computed:
  - End-to-end: ROC-AUC, PR-AUC, precision/recall/F1 at MEDIUM threshold (score >= 30)
  - Per-fraud-type recall
  - False-positive rate on genuine invoices
  - Latency p50/p95 (per invoice, seconds)
  - Ablation: baseline-only vs ML vs combined
  - Limitations section
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MEDIUM_THRESHOLD = 30.0   # scores >= 30 are flagged


def _run_pipeline_for_row(row: dict, pdf_dir: str, gt_dir: str) -> dict[str, Any] | None:
    """Run full fusion pipeline on one synthetic document, return score dict."""
    invoice_id = row["id"]
    gt_path = Path(gt_dir) / f"{invoice_id}.json"
    pdf_path = Path(pdf_dir) / f"{invoice_id}.pdf"
    if not pdf_path.exists():
        pdf_path = Path(pdf_dir) / f"{invoice_id}.png"

    if not gt_path.exists() or not pdf_path.exists():
        return None

    try:
        from backend.app.services.engines.bank import BankEngine
        from backend.app.services.engines.duplicate import DuplicateEngine
        from backend.app.services.engines.extraction import ExtractionConfidenceEngine
        from backend.app.services.engines.rules.financial import FinancialRulesEngine
        from backend.app.services.engines.rules.identifiers import IdentifiersRulesEngine
        from backend.app.services.engines.rules.tax_identity import TaxIdentityRulesEngine
        from backend.app.services.engines.vendor import VendorEngine
        from backend.app.services.engines.visual.forensics import VisualEngine
        from backend.app.services.fusion.fusion import FusionEngine
        from ml.common import analysis_context_from_gt, invoice_data_from_gt

        with open(gt_path, encoding="utf-8") as f:
            gt = json.load(f)

        data = invoice_data_from_gt(gt)
        ctx = analysis_context_from_gt(invoice_id, gt, data, pdf_path)

        engines = [
            FinancialRulesEngine(),
            TaxIdentityRulesEngine(),
            IdentifiersRulesEngine(),
            DuplicateEngine(),
            VendorEngine(),
            BankEngine(),
            VisualEngine(),
            ExtractionConfidenceEngine(),
        ]

        t0 = time.perf_counter()
        signals = []
        for engine in engines:
            try:
                sig = engine.analyze(ctx)
                signals.append(sig)
            except Exception as e:
                logger.debug("Engine %s failed: %s", engine.name, e)

        # Full pipeline (baseline + ml if available)
        fusion = FusionEngine()
        invoice_meta = {
            "grand_total": data.grand_total.value if data.grand_total else 0.0,
            "item_count": len(data.items),
            "extraction_confidence": gt.get("extraction_confidence", 1.0),
        }
        result = fusion.fuse(
            signals,
            invoice_meta=invoice_meta,
            extraction_confidence=gt.get("extraction_confidence", 1.0),
        )
        latency = time.perf_counter() - t0


        fraud_types = str(row.get("fraud_types", "") or "")

        return {
            "invoice_id": invoice_id,
            "label": 0 if str(row["label"]).strip().lower() == "genuine" else (1 if str(row["label"]).strip().lower() == "tampered" else int(row["label"])),
            "fraud_types": fraud_types,
            "split": row.get("split", "test"),
            "final_score": result.overall_score,
            "baseline_score": result.baseline_score,
            "ml_score": result.ml_score,
            "level": result.level,
            "confidence": result.confidence,
            "latency_s": round(latency, 4),
            "signal_scores": {s.name: s.score for s in signals},
        }

    except Exception as exc:
        logger.warning("Evaluation failed for %s: %s", invoice_id, exc)
        return None


def compute_metrics(df_results: pd.DataFrame) -> dict[str, Any]:
    """Compute the full evaluation metrics dictionary."""
    try:
        from sklearn.metrics import (
            average_precision_score,
            precision_recall_fscore_support,
            roc_auc_score,
        )
    except ImportError:
        logger.error("scikit-learn not installed.")
        sys.exit(1)

    metrics: dict[str, Any] = {}
    test_df = df_results[df_results["split"] == "test"].copy()

    if len(test_df) == 0:
        logger.warning("No test-split rows in results. Using all rows.")
        test_df = df_results.copy()

    y_true = test_df["label"].values
    y_score = test_df["final_score"].values / 100.0
    y_pred = (test_df["final_score"] >= MEDIUM_THRESHOLD).astype(int).values

    # ── End-to-end metrics ────────────────────────────────────────────────────
    if len(np.unique(y_true)) > 1:
        metrics["roc_auc"] = round(float(roc_auc_score(y_true, y_score)), 4)
        metrics["pr_auc"] = round(float(average_precision_score(y_true, y_score)), 4)
    else:
        metrics["roc_auc"] = None
        metrics["pr_auc"] = None
        logger.warning("Only one class in test set — ROC/PR-AUC not computable.")

    p, r, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="binary", zero_division=0)
    metrics["precision"] = round(float(p), 4)
    metrics["recall"] = round(float(r), 4)
    metrics["f1"] = round(float(f1), 4)
    metrics["threshold_used"] = MEDIUM_THRESHOLD

    # ── Confusion matrix ──────────────────────────────────────────────────────
    from sklearn.metrics import confusion_matrix as sk_confusion_matrix
    from sklearn.metrics import precision_recall_curve, roc_curve

    cm = sk_confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])
    metrics["confusion_matrix"] = {
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "tp": tp,
    }

    # ── Curve data (sampled for JSON charting in UI) ───────────────────────────
    if len(np.unique(y_true)) > 1:
        fpr, tpr, _ = roc_curve(y_true, y_score)
        step_roc = max(1, len(fpr) // 25)
        prec, rec, _ = precision_recall_curve(y_true, y_score)
        step_pr = max(1, len(prec) // 25)
        metrics["curve_data"] = {
            "roc": [{"fpr": round(float(f), 4), "tpr": round(float(t), 4)} for f, t in zip(fpr[::step_roc], tpr[::step_roc])],
            "pr": [{"precision": round(float(p), 4), "recall": round(float(r), 4)} for p, r in zip(prec[::step_pr], rec[::step_pr])],
        }

    # ── False positive rate on genuine invoices ───────────────────────────────
    genuine_df = test_df[test_df["label"] == 0]
    if len(genuine_df) > 0:
        fp_rate = float((genuine_df["final_score"] >= MEDIUM_THRESHOLD).mean())
        metrics["false_positive_rate_on_genuine"] = round(fp_rate, 4)
    else:
        metrics["false_positive_rate_on_genuine"] = None

    # ── Per-fraud-type recall ─────────────────────────────────────────────────
    per_type: dict[str, float] = {}
    tampered_df = test_df[test_df["label"] == 1]
    fraud_types_seen: set[str] = set()
    for ft_str in tampered_df["fraud_types"].dropna():
        for ft in str(ft_str).split(","):
            fraud_types_seen.add(ft.strip())

    for ft in sorted(fraud_types_seen):
        if not ft:
            continue
        subset = tampered_df[tampered_df["fraud_types"].str.contains(ft, na=False)]
        if len(subset) > 0:
            detected = (subset["final_score"] >= MEDIUM_THRESHOLD).sum()
            per_type[ft] = round(float(detected) / len(subset), 4)

    metrics["per_fraud_type_recall"] = per_type

    # ── Ablation: baseline vs combined ───────────────────────────────────────
    if len(np.unique(y_true)) > 1:
        baseline_scores = test_df["baseline_score"].values / 100.0
        try:
            metrics["ablation"] = {
                "baseline_roc_auc": round(float(roc_auc_score(y_true, baseline_scores)), 4),
                "combined_roc_auc": metrics["roc_auc"],
            }
        except Exception:
            metrics["ablation"] = {}
    else:
        metrics["ablation"] = {}

    # ── Latency ───────────────────────────────────────────────────────────────
    latencies = df_results["latency_s"].dropna().values
    if len(latencies) > 0:
        metrics["latency"] = {
            "p50_s": round(float(np.percentile(latencies, 50)), 3),
            "p95_s": round(float(np.percentile(latencies, 95)), 3),
            "mean_s": round(float(np.mean(latencies)), 3),
        }

    # ── Dataset info ─────────────────────────────────────────────────────────
    metrics["dataset"] = {
        "total": int(len(df_results)),
        "genuine": int((df_results["label"] == 0).sum()),
        "tampered": int((df_results["label"] == 1).sum()),
        "test_total": int(len(test_df)),
    }

    return metrics


def generate_evaluation_md(metrics: dict[str, Any]) -> str:
    """Generate a Markdown evaluation report."""
    lines = [
        "# InvoiceGuard — Evaluation Report",
        "",
        "> Auto-generated by `ml/evaluation/run.py`. Do not edit manually.",
        "> **Limitation:** All metrics are computed on synthetic data generated by the same "
        "pipeline. Real-world performance may differ substantially.",
        "",
        "## Dataset",
        "",
        "| Split | Count |",
        "|-------|-------|",
        f"| Total | {metrics.get('dataset', {}).get('total', '-')} |",
        f"| Genuine (label=0) | {metrics.get('dataset', {}).get('genuine', '-')} |",
        f"| Tampered (label=1) | {metrics.get('dataset', {}).get('tampered', '-')} |",
        f"| Test set | {metrics.get('dataset', {}).get('test_total', '-')} |",
        "",
        "## End-to-End Metrics",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| ROC-AUC | {metrics.get('roc_auc', '-')} |",
        f"| PR-AUC | {metrics.get('pr_auc', '-')} |",
        f"| Precision @ threshold={metrics.get('threshold_used', 30)} | "
        f"{metrics.get('precision', '-')} |",
        f"| Recall @ threshold | {metrics.get('recall', '-')} |",
        f"| F1 @ threshold | {metrics.get('f1', '-')} |",
        f"| False-positive rate (genuine invoices) | "
        f"{metrics.get('false_positive_rate_on_genuine', '-')} |",
        "",
        "## Confusion Matrix (@ threshold=30)",
        "",
        "| | Predicted Genuine (<30) | Predicted Tampered (>=30) |",
        "|---|---|---|",
        f"| **Actual Genuine** | TN = {metrics.get('confusion_matrix', {}).get('tn', 0)} | FP = {metrics.get('confusion_matrix', {}).get('fp', 0)} |",
        f"| **Actual Tampered** | FN = {metrics.get('confusion_matrix', {}).get('fn', 0)} | TP = {metrics.get('confusion_matrix', {}).get('tp', 0)} |",
        "",
        "## Latency",
        "",
    ]

    latency = metrics.get("latency", {})
    if latency:
        lines += [
            "| Metric | Value |",
            "|--------|-------|",
            f"| p50 | {latency.get('p50_s', '-')} s |",
            f"| p95 | {latency.get('p95_s', '-')} s |",
            f"| mean | {latency.get('mean_s', '-')} s |",
            "",
        ]

    lines += [
        "## Per-Fraud-Type Recall",
        "",
        "| Fraud Type | Recall |",
        "|------------|--------|",
    ]
    for ft, recall in sorted(metrics.get("per_fraud_type_recall", {}).items()):
        lines.append(f"| {ft} | {recall:.3f} |")

    abl = metrics.get("ablation", {})
    if abl:
        lines += [
            "",
            "## Ablation Study",
            "",
            "| System | ROC-AUC |",
            "|--------|---------|",
            f"| Baseline (noisy-OR only) | {abl.get('baseline_roc_auc', '-')} |",
            f"| Combined (baseline + XGBoost) | {abl.get('combined_roc_auc', '-')} |",
        ]

    lines += [
        "",
        "## Limitations",
        "",
        "- All metrics are computed on synthetic invoices generated by the same pipeline that "
          "created the training data. Performance on real-world invoices is unknown and likely lower.",
        "- Synthetic tamper operators may not fully replicate the diversity of real fraud patterns.",
        "- Visual forensics performance degrades on low-resolution or highly compressed scans.",
        "- Vendor behavioural anomalies require >= 5 historical invoices per vendor; "
          "cold-start vendors have reduced detection.",
        "- The model does not determine fraud — it flags anomalies for human review.",
    ]

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run InvoiceGuard evaluation pipeline.")
    parser.add_argument("--manifest", default="data/synthetic/manifest.csv")
    parser.add_argument("--pdf-dir", default="data/synthetic/pdf")
    parser.add_argument("--gt-dir", default="data/synthetic/gt")
    parser.add_argument("--out", default="reports/metrics.json")
    parser.add_argument("--eval-md", default="reports/EVALUATION.md")
    parser.add_argument("--docs-md", default="docs/EVALUATION.md")
    parser.add_argument("--split", default="test",
                        help="Split to evaluate (default: test; use 'all' for entire dataset).")
    parser.add_argument("--max-rows", type=int, default=None,
                        help="Limit number of rows processed (for quick smoke test).")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        logger.error("Manifest not found: %s. Run generate_data.py first.", manifest_path)
        sys.exit(1)

    df_manifest = pd.read_csv(manifest_path)
    if args.split and args.split.lower() != "all":
        df_manifest = df_manifest[df_manifest["split"] == args.split.lower()].copy()

    if args.max_rows:
        df_manifest = df_manifest.head(args.max_rows)

    logger.info("Evaluating on %d documents (split=%s) …", len(df_manifest), args.split)

    results = []
    for _, row in df_manifest.iterrows():
        r = _run_pipeline_for_row(row.to_dict(), args.pdf_dir, args.gt_dir)
        if r is not None:
            results.append(r)

    if len(results) == 0:
        logger.error("No results produced. Check pdf-dir and gt-dir paths.")
        sys.exit(1)

    logger.info("Collected %d result rows.", len(results))
    df_results = pd.DataFrame(results)

    # Compute metrics
    metrics = compute_metrics(df_results)

    # Save JSON
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics saved to %s.", out_path)

    # Save reports/EVALUATION.md and docs/EVALUATION.md
    md_content = generate_evaluation_md(metrics)
    for p_str in (args.eval_md, args.docs_md):
        md_path = Path(p_str)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md_content)
        logger.info("Evaluation report saved to %s.", md_path)

    # Print summary
    print("\n" + "=" * 60)
    print("           INVOICEGUARD EVALUATION SUMMARY")
    print("=" * 60)
    print(f"ROC-AUC:                {metrics.get('roc_auc', 'N/A')}")
    print(f"PR-AUC:                 {metrics.get('pr_auc', 'N/A')}")
    print(f"Precision @ 30:         {metrics.get('precision', 'N/A')}")
    print(f"Recall @ 30:            {metrics.get('recall', 'N/A')}")
    print(f"F1 Score:               {metrics.get('f1', 'N/A')}")
    print(f"False Positive Rate:    {metrics.get('false_positive_rate_on_genuine', 'N/A')}")
    cm = metrics.get("confusion_matrix", {})
    print(f"Confusion Matrix:       TN={cm.get('tn', 0)}, FP={cm.get('fp', 0)}, FN={cm.get('fn', 0)}, TP={cm.get('tp', 0)}")
    latency = metrics.get("latency", {})
    if latency:
        print(f"Latency:                p50={latency.get('p50_s')}s, p95={latency.get('p95_s')}s")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()

