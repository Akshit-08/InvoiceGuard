# InvoiceGuard — Agent Guidelines & Repository Rules

> **Critical Instruction for All AI Agents and Developers:**
> - **Read `docs/BLUEPRINT.md` and `docs/PROGRESS.md` at the start of every session.**
> - **Update `docs/PROGRESS.md` and `CHANGELOG.md` at the end of every session.**

---

## 1. Project Summary

**InvoiceGuard** is an explainable, multimodal invoice anomaly and fraud-risk detection web application.
- Pipeline: Upload PDF/image → extract fields with bounding boxes → run financial, tax, duplicate, vendor-behavior, bank-change, identifier, and visual-forensics checks → fuse signals into a 0–100 risk score → display highlighted evidence directly on the invoice interface for human review.

---

## 2. Golden Rule of Language

> **InvoiceGuard reports *risk indicators*, never fraud verdicts.**
> Every screen, report, and finding carries the explicit notice:
> *"InvoiceGuard flags anomalies for human review. It does not determine fraud."*

Never use definitive accusatory language like "this is fraudulent", "fake invoice", or "fraud verdict". Use terms like "risk indicator", "anomalous pattern", "high risk score", "discrepancy detected", or "requires manual verification".

---

## 3. Run Commands

### Backend
```bash
# Activate virtual environment
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Linux/macOS
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Start backend dev server
uvicorn backend.app.main:app --reload --port 8000
```

### Quick Dev Launchers
- **Windows (PowerShell):** `./scripts/dev.ps1`
- **Linux/macOS:** `./scripts/dev.sh`

### Data Generation & Evaluation
```bash
# Generate deterministic synthetic invoices
python scripts/generate_data.py --seed 42 --genuine 300 --tampered 300 --visual-pairs 200 --out data/synthetic

# Run extraction evaluation
python ml/evaluation/extraction_eval.py --manifest data/synthetic/manifest.csv --out reports/extraction_metrics.json

# Run tests & lint
pytest backend/tests
ruff check .
```

---

## 4. Engineering Rules (Blueprint Section 16)

- **Python 3.11+**, explicit type hints throughout, `ruff` for linting and formatting, `pytest` for unit/integration/golden tests.
- **TypeScript strict mode** on frontend (React 18, Vite, Tailwind CSS, shadcn/ui).
- **Architecture Integrity**:
  - Keep swappable interfaces: `Reader`, `Extractor`, `Engine`, `VectorIndex`, `Fusion`.
  - Bounding boxes are ALWAYS normalised to 0.0–1.0 relative to page width and height.
  - Every scalar extracted field must use the `Field[T]` contract (`value`, `raw`, `conf`, `source`, `bbox`, `page`).
  - Separation of concerns: rules are deterministic; statistics and ML power behavior/forensics/fusion.
  - Robust error handling: all API errors return uniform format `{ "error": { "code": str, "message": str, "details": any } }`.

---

## 5. Git & Commit Rules (Blueprint Section 16 & 17)

- **Branches:**
  - `main`: Always runnable and clean.
  - Short-lived feature branches: `feat/<name>`.
  - Merge into `main` using PRs or `--no-ff`.
  - Tag milestone releases: `v0.1-day1`, `v0.2-day2`, `v0.3-day3`, `v1.0.0`.
- **Commit Messages:**
  - Follow **Conventional Commits**: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.
  - Keep commits focused and granular.
- **Never Commit:**
  - `.env` files or credentials.
  - `.venv/`, `__pycache__/`, `node_modules/`, `dist/`, `coverage/`.
  - `data/uploads/`, `data/raw/`, `data/synthetic/` (only small fixtures in `backend/tests/fixtures` and `data/samples/`).
  - Large model binaries (> 10 MB). Store model weights on Hugging Face Hub and document them in `ml/artifacts/model_manifest.json`.

---

## 6. Definition of Done (Blueprint Section 17)

Every feature or daily milestone must meet:
1. Runs locally from a clean clone using README instructions.
2. Cross-platform support (Windows, macOS, Linux).
3. All unit and integration tests passing.
4. Clean linting (`ruff check .` with zero errors).
5. Loading, empty, and error states handled gracefully.
6. Progress and changes documented in `docs/PROGRESS.md` and `CHANGELOG.md`.
7. CI passing on GitHub.
