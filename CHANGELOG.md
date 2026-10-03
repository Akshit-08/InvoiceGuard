# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — Day 2 Block 7

### Added
- **Risk Fusion System (Blueprint §9)**:
  - `feature_builder.py`: 31-feature vector (7 scores + 7 confidences + 17 engineered) for XGBoost input.
  - `xgb_model.py`: Lazy-loading XGBoost + isotonic calibration wrapper with `FUSION_MODE=baseline` env override and graceful fallback when model artifact is absent.
  - `shap_explain.py`: SHAP TreeExplainer for CalibratedClassifierCV — returns top-N ordered contributors with direction labels.
  - `thresholds.py`: `score_to_level()` (LOW/MEDIUM/HIGH/CRITICAL), `apply_escalations()` (multi-signal floor 65 + critical anomaly floor 75, never lowers score), `compute_confidence_band()` (geometric mean → HIGH/MEDIUM/LOW).
  - `fusion.py`: Complete orchestrator (noisy-OR baseline + XGBoost blend + escalations + SHAP + narrative). Replaces the stub in `baseline.py`. Config read from `config/fusion.yaml` at runtime.
  - `explain/narrative.py`: Plain-English narrative builder, top-5 key risk indicators, escalation notices, 16-entry hint lookup table for "what would lower the risk".
  - `explain/recommendations.py`: Per-level recommendation text and structured action objects for frontend review workflow.
- **Training Pipeline** (`ml/training/train_fusion.py`):
  - Multiprocessing feature extraction with disk cache (resume on re-run).
  - Train/test split by vendor AND template to prevent leakage.
  - XGBoost `monotone_constraints=increasing` on all features (guarantees more evidence never lowers risk score).
  - Isotonic calibration (CalibratedClassifierCV, 5-fold cross-validation).
  - Saves <10 MB joblib artifact + updates `ml/artifacts/model_manifest.json`.
- **Evaluation Script** (`ml/evaluation/run.py`):
  - Metrics: ROC-AUC, PR-AUC, Precision/Recall/F1 at MEDIUM threshold (score ≥ 30).
  - Per-fraud-type recall, false-positive rate on genuine invoices.
  - Latency p50/p95, ablation table (baseline vs combined).
  - Outputs `reports/metrics.json` + auto-generated `reports/EVALUATION.md`.
- **Config** (`config/fusion.yaml`): Expanded with level thresholds, confidence band, escalation critical types, and `fusion_mode` flag.
- **Tests** (`backend/tests/unit/test_fusion.py`): 47 new tests — 93 total now passing.

- **Evaluation Reports**:
  - `reports/metrics.json` and `reports/EVALUATION.md` benchmark reports generated.
  - Per-fraud-type recall: 1.000 across 16 categories; latency p50 = 26 ms, p95 = 40 ms.
- **Trained Fusion Model**:
  - Saved `ml/artifacts/fusion_xgb.joblib` (0.09 MB) and updated `ml/artifacts/model_manifest.json`.

### Changed
- `pipeline.py`: Updated to use the new `fusion.py` orchestrator and passes `extraction_confidence` + `invoice_meta` for accurate confidence band.
- `config/fusion.yaml`: Extended with level thresholds, confidence band config, critical anomaly types.
- `ml/training/train_fusion.py`: Uses standard zlib compression for artifact portability.
- `shap_explain.py`: Added compatibility patch for SHAP tree explainer with XGBoost 2.x and caching.

## [0.1.0] - 2026-10-02

### Added
- **Repository & Engineering Infrastructure**:
  - Full repo layout per Blueprint Section 5 with CI workflow (`.github/workflows/ci.yml`).
  - Strict typing, `ruff` configuration, cross-platform launchers (`dev.sh`, `dev.ps1`, `Makefile`).
  - Repository operating guidelines and Golden Language Rule ("risk indicators, never fraud verdicts") in `AGENTS.md` and `CLAUDE.md`.
- **Backend Architecture & Data Contracts**:
  - FastAPI application factory with request-ID tracking, CORS, uniform error handling (`{error: {code, message, details}}`).
  - Complete frozen Pydantic v2 schemas in `app/schemas/contracts.py` (`Token`, `Field[T]`, `InvoiceData`, `Finding`, `SignalResult`, `RiskResult`).
  - Complete SQLAlchemy 2.0 schema in `app/models/entities.py` covering all 13 core tables.
  - System health endpoint `GET /api/v1/health`.
- **Deterministic Synthetic Data Engine**:
  - Vendor simulator with Mod-36 GSTIN checksum validation, log-normal transactions, and realistic cadences.
  - 5 ReportLab invoice templates (`classic_table`, `modern_minimal`, `gst_tax_invoice`, `two_column`, `compact_thermal`) recording normalized bounding boxes.
  - Multi-stage scan simulator (rotation, blur, noise, compression, shading).
  - Tamper operator registry with 16 anomaly operators across re-render, pixel-edit, and pdf-edit modes.
  - Data generator CLI producing 800 synthetic invoices (300 genuine, 300 tampered, 200 visual pairs) in ~105 seconds.
  - 8-document Golden Hero Demo set generated via `scripts/seed_demo.py` with ground truth in `data/samples/expected.json`.
- **Document Processing Pipeline**:
  - Secure ingest service with MIME/magic byte validation, PyMuPDF 200 DPI rendering, and deskew.
  - Dual reader architecture (`PdfTextReader` + `RapidOcrReader`) with automated reader selection (`AutoReader`).
  - Layout-aware `HeuristicExtractor`, Indian currency/date `Normalizer`, and extensible extractor chain.
  - Temporary endpoints `POST /api/v1/invoices/upload` and `GET /api/v1/invoices/{id}/extraction`.
- **Evaluation & Test Suite**:
  - Evaluation harness `ml/evaluation/extraction_eval.py` benchmarking field-level precision, recall, and F1.
  - 25 unit, golden, and integration tests passing.
