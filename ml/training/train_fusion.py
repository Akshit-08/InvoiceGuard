"""Train XGBoost fusion model — Blueprint section 9.

Usage:
    python ml/training/train_fusion.py \\
        --manifest data/synthetic/manifest.csv \\
        --out ml/artifacts/fusion_xgb.joblib

Pipeline:
  1. Load manifest → run full engine pipeline on each document (multiprocessing)
  2. Cache signal vectors to data/synthetic/fusion_cache.pkl (resume on re-run)
  3. Split by vendor AND template to prevent leakage (Blueprint §9.2)
  4. Train XGBoost with monotone_constraints=increasing on every signal feature
  5. Calibrate with isotonic regression (CalibratedClassifierCV)
  6. Save pipeline + metadata to ml/artifacts/fusion_xgb.joblib (<10 MB)
  7. Write ml/artifacts/model_manifest.json
"""

from __future__ import annotations

import argparse
import json
import logging
import multiprocessing as mp
import pickle
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ── Lazy imports (require package install) ────────────────────────────────────
def _require(pkg: str) -> Any:
    try:
        import importlib
        return importlib.import_module(pkg)
    except ImportError as exc:
        logger.error("Missing package '%s'. Run: pip install %s", pkg, pkg)
        raise SystemExit(1) from exc


# ── Constants ─────────────────────────────────────────────────────────────────
CACHE_FILE = Path("data/synthetic/fusion_cache.pkl")
MANIFEST_REQUIRED_COLS = {"id", "label", "vendor_id", "template_id", "split"}


# ── Worker: run engine pipeline on a single document ─────────────────────────
def _process_one(args: tuple) -> tuple[str, dict | None]:
    """Run the detection engines on one synthetic invoice and return its feature row.

    Returns (id, row_dict_or_None).
    """
    row, pdf_dir, gt_dir = args
    invoice_id = row["id"]

    # Label may be 'genuine'/'tampered' (strings) or 0/1 (integers)
    raw_label = row["label"]
    if isinstance(raw_label, str):
        label = 0 if raw_label.strip().lower() == "genuine" else 1
    else:
        label = int(raw_label)

    # Build PDF path
    pdf_path = Path(pdf_dir) / f"{invoice_id}.pdf"
    if not pdf_path.exists():
        pdf_path = Path(pdf_dir) / f"{invoice_id}.png"
        if not pdf_path.exists():
            logger.warning("Document not found for %s — skipping.", invoice_id)
            return invoice_id, None

    # Load ground truth JSON
    gt_path = Path(gt_dir) / f"{invoice_id}.json"
    if not gt_path.exists():
        logger.warning("GT JSON not found for %s — skipping.", invoice_id)
        return invoice_id, None

    try:
        from backend.app.services.engines.bank import BankEngine
        from backend.app.services.engines.duplicate import DuplicateEngine
        from backend.app.services.engines.extraction import ExtractionConfidenceEngine
        from backend.app.services.engines.rules.financial import FinancialRulesEngine
        from backend.app.services.engines.rules.identifiers import IdentifiersRulesEngine
        from backend.app.services.engines.rules.tax_identity import TaxIdentityRulesEngine
        from backend.app.services.engines.vendor import VendorEngine
        from backend.app.services.engines.visual.forensics import VisualEngine
        from backend.app.services.fusion.feature_builder import build_feature_vector
        from ml.common import analysis_context_from_gt, invoice_data_from_gt

        with open(gt_path, encoding="utf-8") as fh:
            gt = json.load(fh)

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

        signals = []
        for engine in engines:
            try:
                sig = engine.analyze(ctx)
                signals.append(sig)
            except Exception as eng_exc:  # noqa: BLE001
                logger.debug("Engine %s failed on %s: %s", engine.name, invoice_id, eng_exc)

        grand_total_val = float(data.grand_total.value) if data.grand_total and data.grand_total.value else 0.0
        invoice_meta = {
            "grand_total": grand_total_val,
            "item_count": len(data.items),
            "extraction_confidence": 1.0,  # GT data is perfect quality
        }

        feat_values, feat_names = build_feature_vector(signals, invoice_meta)

        row_dict = {name: val for name, val in zip(feat_names, feat_values)}
        row_dict["label"] = label
        row_dict["invoice_id"] = invoice_id
        row_dict["vendor_id"] = row.get("vendor_id", "")
        row_dict["template_id"] = row.get("template_id", "")
        row_dict["split"] = row.get("split", "train")
        return invoice_id, row_dict

    except Exception as exc:
        logger.warning("Processing failed for %s: %s", invoice_id, exc)
        return invoice_id, None


# ── Main training entrypoint ──────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Train XGBoost fusion model for InvoiceGuard.")
    parser.add_argument("--manifest", default="data/synthetic/manifest.csv",
                        help="Path to the synthetic data manifest CSV.")
    parser.add_argument("--pdf-dir", default="data/synthetic/pdf",
                        help="Directory containing synthetic PDFs.")
    parser.add_argument("--gt-dir", default="data/synthetic/gt",
                        help="Directory containing ground-truth JSON files.")
    parser.add_argument("--out", default="ml/artifacts/fusion_xgb.joblib",
                        help="Output path for the trained model artifact.")
    parser.add_argument("--cache", default=str(CACHE_FILE),
                        help="Path to feature cache pickle (resume on re-run).")
    parser.add_argument("--workers", type=int, default=max(1, mp.cpu_count() - 1),
                        help="Number of parallel worker processes.")
    parser.add_argument("--no-cache", action="store_true",
                        help="Ignore existing cache and recompute all features.")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        logger.error("Manifest not found: %s", manifest_path)
        sys.exit(1)

    # ── Load manifest ─────────────────────────────────────────────────────────
    df_manifest = pd.read_csv(manifest_path)
    missing = MANIFEST_REQUIRED_COLS - set(df_manifest.columns)
    if missing:
        logger.error("Manifest is missing required columns: %s", missing)
        sys.exit(1)

    logger.info("Loaded manifest: %d rows.", len(df_manifest))

    # ── Load or build feature cache ───────────────────────────────────────────
    cache_path = Path(args.cache)
    feature_rows: dict[str, dict] = {}

    if not args.no_cache and cache_path.exists():
        logger.info("Loading feature cache from %s …", cache_path)
        with open(cache_path, "rb") as fh:
            feature_rows = pickle.load(fh)  # noqa: S301
        logger.info("Cache has %d entries.", len(feature_rows))

    uncached_rows = [
        row for _, row in df_manifest.iterrows()
        if row["id"] not in feature_rows
    ]
    logger.info("%d documents need feature extraction.", len(uncached_rows))

    if uncached_rows:
        worker_args = [
            (row, args.pdf_dir, args.gt_dir)
            for row in uncached_rows
        ]

        t0 = time.time()
        if args.workers > 1:
            with mp.Pool(args.workers) as pool:
                results = pool.map(_process_one, worker_args)
        else:
            results = [_process_one(a) for a in worker_args]

        elapsed = time.time() - t0
        logger.info("Feature extraction done in %.1f s.", elapsed)

        new_count = 0
        for inv_id, row_dict in results:
            if row_dict is not None:
                feature_rows[inv_id] = row_dict
                new_count += 1

        logger.info("Successfully extracted %d/%d features.", new_count, len(uncached_rows))

        # Save updated cache
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_path, "wb") as fh:
            pickle.dump(feature_rows, fh)
        logger.info("Cache saved to %s.", cache_path)

    # ── Build feature DataFrame ───────────────────────────────────────────────
    rows = list(feature_rows.values())
    if len(rows) < 50:
        logger.error(
            "Too few samples (%d) to train a meaningful model. "
            "Run the data generator first.", len(rows)
        )
        sys.exit(1)

    df = pd.DataFrame(rows)
    logger.info("Feature DataFrame: %s", df.shape)

    # ── Train/test split: by vendor_id AND template_id ────────────────────────
    # Use the 'split' column from manifest to prevent leakage
    train_mask = df["split"] == "train"
    test_mask = df["split"] == "test"

    feature_cols = [
        c for c in df.columns
        if c not in ("label", "invoice_id", "vendor_id", "template_id", "split")
    ]

    X_train = df.loc[train_mask, feature_cols].fillna(0.0).values
    y_train = df.loc[train_mask, "label"].values
    X_test = df.loc[test_mask, feature_cols].fillna(0.0).values
    y_test = df.loc[test_mask, "label"].values

    logger.info(
        "Train: %d samples (pos=%d). Test: %d samples (pos=%d).",
        len(y_train), int(y_train.sum()), len(y_test), int(y_test.sum()),
    )

    if len(np.unique(y_train)) < 2:
        logger.error(
            "Training set has only one class — cannot train. "
            "Ensure tampered invoices are in the training split."
        )
        sys.exit(1)

    # ── Import ML packages ────────────────────────────────────────────────────
    # Verify packages are available (raises SystemExit if missing)
    _require("xgboost")
    joblib = _require("joblib")
    _require("sklearn.calibration")
    _require("sklearn.metrics")

    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.metrics import average_precision_score, classification_report, roc_auc_score
    from xgboost import XGBClassifier

    # ── Train XGBoost with monotone constraints ───────────────────────────────
    # Monotone constraint = +1 (increasing) on every feature:
    # more signal risk → more fusion risk. This is a crucial explainability guarantee.
    monotone = tuple([1] * len(feature_cols))

    xgb_clf = XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=5,
        gamma=1.0,
        reg_alpha=0.1,
        reg_lambda=1.0,
        monotone_constraints=monotone,
        eval_metric="auc",
        use_label_encoder=False,
        random_state=42,
        n_jobs=-1,
    )

    logger.info(
        "Training XGBoost (n_estimators=400, monotone_constraints on %d features) …",
        len(feature_cols),
    )
    xgb_clf.fit(X_train, y_train)

    # ── Isotonic calibration ──────────────────────────────────────────────────
    logger.info("Calibrating with isotonic regression (5-fold) …")
    calibrated = CalibratedClassifierCV(
        xgb_clf,
        method="isotonic",
        cv=5,
    )
    calibrated.fit(X_train, y_train)

    # ── Evaluate ──────────────────────────────────────────────────────────────
    if len(y_test) > 0 and len(np.unique(y_test)) > 1:
        y_prob = calibrated.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)
        roc = roc_auc_score(y_test, y_prob)
        pr = average_precision_score(y_test, y_prob)
        logger.info("Test ROC-AUC: %.4f | PR-AUC: %.4f", roc, pr)
        logger.info("\n%s", classification_report(y_test, y_pred))

        metrics = {
            "roc_auc": round(roc, 4),
            "pr_auc": round(pr, 4),
            "n_train": int(len(y_train)),
            "n_test": int(len(y_test)),
            "n_pos_train": int(y_train.sum()),
            "n_pos_test": int(y_test.sum()),
        }
    else:
        logger.warning("Test set has fewer than 2 classes — skipping ROC/PR evaluation.")
        metrics = {"n_train": int(len(y_train)), "n_test": int(len(y_test))}

    # ── Save model artifact ───────────────────────────────────────────────────
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    artifact = {
        "pipeline": calibrated,
        "feature_names": feature_cols,
        "metrics": metrics,
    }
    joblib.dump(artifact, out_path, compress=("lz4", 3))

    # Check size
    size_mb = out_path.stat().st_size / 1_048_576
    logger.info("Saved model to %s (%.2f MB).", out_path, size_mb)
    if size_mb > 10.0:
        logger.warning("Model exceeds 10 MB limit (%.2f MB) — reduce n_estimators.", size_mb)

    # ── Write model manifest ──────────────────────────────────────────────────
    manifest_out = out_path.parent / "model_manifest.json"
    existing: dict = {}
    if manifest_out.exists():
        with open(manifest_out, encoding="utf-8") as fh:
            existing = json.load(fh)

    existing["fusion_xgb"] = {
        "path": str(out_path),
        "size_mb": round(size_mb, 3),
        "feature_count": len(feature_cols),
        "monotone_constraints": "increasing_all",
        "calibration": "isotonic_5fold",
        "trained_on": pd.Timestamp.now().isoformat(),
        "metrics": metrics,
    }

    with open(manifest_out, "w", encoding="utf-8") as fh:
        json.dump(existing, fh, indent=2)
    logger.info("Model manifest updated: %s", manifest_out)


if __name__ == "__main__":
    main()
