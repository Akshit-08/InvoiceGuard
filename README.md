# InvoiceGuard

> **Explainable Multimodal Invoice Anomaly & Fraud-Risk Detection Platform**

[![CI](https://github.com/Akshit-08/InvoiceGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/Akshit-08/InvoiceGuard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10 | 3.11](https://img.shields.io/badge/Python-3.10%20%7C%203.11-blue.svg)](https://www.python.org/)

> **Notice:** *InvoiceGuard flags anomalies for human review. It does not determine fraud.*

---

## Overview

InvoiceGuard is a portfolio-grade, explainable multimodal platform for invoice anomaly inspection and audit assistance. It ingests digital and scanned invoices (PDF/PNG/JPG), extracts key structured entities with normalized bounding boxes, runs multidimensional financial, tax, duplicate, vendor behavioral, bank account change, and visual forensics checks, and fuses findings into an interpretable risk score (0–100) with interactive visual evidence overlays.

---

## Planned Features & Architecture

- **Intelligent Ingestion & OCR**:
  - Direct digital PDF text-layer extraction via PyMuPDF.
  - Fallback OCR using ONNX-accelerated RapidOCR for scans.
  - Normalized token bounding boxes mapped relative to original document dimensions.
- **Multimodal Field Extraction**:
  - Heuristic & regex rule-based extractor for key invoice anchors (GST, PAN, IFSC, amounts, tables).
  - Indian numbering conventions (`1,00,000.00`, ₹/INR, amount-in-words parity).
  - Pluggable fine-tuned LayoutLMv3 and LLM extractors.
- **Multi-Engine Anomaly Detection**:
  - **Financial**: Line total arithmetic, subtotal parity, tax and discount reconciliation, words vs figures mismatch.
  - **Tax & Identity**: GSTIN checksum (mod-36), PAN consistency, state-code CGST/SGST vs IGST rules, IFSC validation.
  - **Duplicates**: Multi-tier hashing (exact SHA-256, pHash perceptual hash, canonical fuzzy match, semantic embeddings).
  - **Vendor Behavior**: Historical amount outliers (MAD/median), frequency jumps, lookalike vendor typosquatting, cross-vendor shared bank accounts.
  - **Bank Change**: First-seen account alerts, hash + last-4 storage, cross-vendor link detection.
  - **Visual Forensics**: PDF metadata revision gaps, multiple EOF markers, font mixing, cover-up rectangles, error-level analysis (ELA).
- **Explainable Risk Fusion**:
  - Monotone-constrained XGBoost + deterministic noisy-OR baseline.
  - SHAP feature attributions and plain-English narrative summaries.
- **Human-in-the-Loop Review**:
  - Interactive document viewer with pan/zoom and bounding-box highlighting.
  - In-place field correction and audit logging.

---

## Quick Start & Setup

### Prerequisites
- Python 3.10+ (Python 3.11 recommended)
- Node.js 20+ (for frontend)
- Git

### Backend Setup
```bash
# 1. Clone the repository
git clone https://github.com/Akshit-08/InvoiceGuard.git
cd InvoiceGuard

# 2. Set up virtual environment
# Windows:
python -m venv .venv
.venv\Scripts\Activate.ps1
# Linux/macOS:
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Copy environment configuration
cp .env.example .env

# 5. Start the backend server
uvicorn backend.app.main:app --reload --port 8000
```

### Running Tests
```bash
pytest backend/tests
```

### Running Evaluation & Metrics
```bash
# Run full evaluation across test split
python ml/evaluation/run.py

# Export OpenAPI schema and frontend mock fixtures
python scripts/export_openapi.py
```

### Seeding Demo Data
```bash
# Seed 8 hero sample invoices across risk bands
python scripts/seed_demo.py
```

---

## Repository Documentation
- [Master Blueprint (Source of Truth)](docs/BLUEPRINT.md)
- [API Reference & Contracts](docs/API.md)
- [Evaluation Report & Metrics](docs/EVALUATION.md)
- [Model Card](docs/MODEL_CARD.md)
- [Daily Progress Log](docs/PROGRESS.md)
- [Architecture Decision Records](docs/DECISIONS.md)
- [Agent & Engineering Guidelines](AGENTS.md)
