# InvoiceGuard — Master Blueprint v2 (Source of Truth)

> Commit this file to the repo as `docs/BLUEPRINT.md`. The original `InvoiceGuard_Project_Plan.md` goes in `docs/original-plan.md`.
> Where this blueprint and the original plan differ, **this blueprint wins**. Section 2 explains every change.

**One-liner:** InvoiceGuard is an explainable, multimodal invoice investigation platform. Upload a PDF/image → extract fields → run financial, tax, duplicate, vendor-behaviour, bank-change, identifier and visual-forensics checks → fuse them into a 0–100 risk score → show highlighted evidence on the invoice itself → human review.

**Golden rule of language:** the product reports *risk indicators*, never "this is fraud". Every screen and report carries the line: *"InvoiceGuard flags anomalies for human review. It does not determine fraud."*

---

## 1. Principles

1. **Demo-safe first.** The app must always work end to end on a laptop with no GPU and no internet. Heavy/optional models plug in behind interfaces and degrade gracefully.
2. **Rules where rules fit, ML where patterns exist.** Arithmetic and tax logic are deterministic. Vendor behaviour, duplicates, visual forensics and fusion use ML/statistics.
3. **Every signal explains itself.** A finding = what was found, what was expected, evidence, where on the page, how confident, how severe.
4. **Risk ≠ confidence.** Bad OCR does not mean fraud. Extraction quality lowers *confidence* and triggers "verify manually"; it does not raise risk.
5. **Ground truth through synthesis.** We generate invoices + tampering with known labels, so every claim we make in evaluation is measurable.
6. **Human in the loop.** Reviewer decisions are stored, audited and exportable as labels.
7. **Product-grade UI.** Dark/light, animated, keyboard friendly, accessible, no jank.

---

## 2. Decision log — changes vs the original plan

| # | Original plan | Blueprint v2 | Why |
|---|---|---|---|
| 1 | PostgreSQL mandatory | SQLAlchemy 2.0, **SQLite by default**, PostgreSQL via `docker compose --profile pg` or Supabase | Zero-setup in a 4-day window; same models work on both |
| 2 | PaddleOCR | **PyMuPDF text layer first** (digital PDFs = perfect text + boxes) → **RapidOCR** (PaddleOCR models on ONNX, no paddlepaddle install pain) for scans/images → Tesseract optional | Fast, pip-installable, far fewer environment failures |
| 3 | LayoutLMv3 as the extractor | **Extractor chain**: heuristic/layout extractor (always on) → LayoutLMv3 (fine-tuned in parallel on Colab, plugged in when weights exist) → optional LLM extractor behind an env flag | Guarantees the product works even if training slips; LayoutLMv3 still real and demonstrable |
| 4 | OCR confidence as a risk input | OCR/extraction quality = **confidence modifier + "verify manually" flag** | Avoids false positives on bad scans |
| 5 | Weighted score → XGBoost "later" | **Both on day 2**: noisy-OR baseline + monotone-constrained XGBoost trained on synthetic data + calibration + SHAP | Explainable AND learned; monotonicity guarantees more evidence never lowers risk |
| 6 | Isolation Forest for vendors | **Robust stats (median/MAD) + Isolation Forest + cold-start handling + cross-vendor entity links** | IF alone is weak with few invoices per vendor |
| 7 | FAISS / pgvector | **NumPy cosine behind a `VectorIndex` interface** (faiss-cpu optional) | <10k vectors; fewer dependencies |
| 8 | sentence-transformers | **fastembed** (ONNX, no torch) with `BAAI/bge-small-en-v1.5` | Lighter, deployable on free tiers |
| 9 | Visual CNN in MVP | **P0: OpenCV + PDF-structure forensics.** CNN = P2 stretch (Colab) | Reliable signal, explainable, no training dependency |
| 10 | `users` table / auth | Dropped for MVP (single-tenant demo mode, documented as limitation) | Not valuable for the core story |
| 11 | Fixed GST slabs (18/28) | **Date-aware, configurable GST slabs.** Verify current slabs at build time (GST slabs were restructured in Sept 2025; 12% and 28% were largely retired). Legacy rates are valid only for older invoice dates | Keeps the rule engine correct and credible |
| 12 | — | **Added:** amount-in-words vs figures check, GSTIN checksum + state-code logic, CGST/SGST vs IGST logic, IFSC/PAN validation | High-value, cheap, India-specific rules |
| 13 | — | **Added:** PDF structural forensics (producer/editor tags, mod-date gaps, incremental saves, font mixing, cover-up rectangles, hidden text) | Real forensic signals that work on real PDFs |
| 14 | — | **Added:** cross-vendor links (same bank/GSTIN/address under different vendors) and look-alike vendor names | Classic shell-vendor / typosquat fraud patterns |
| 15 | — | **Added:** extraction review step (edit fields before analysis) | Real-world robustness + human-in-the-loop |
| 16 | — | **Added:** live pipeline progress via SSE, "Try a sample" demo set, Model Insights page, audit log, PDF report | Demo power and viva-readiness |
| 17 | Batch upload advanced | P1 (day 4) | Nice, not core |

---

## 3. Scope tiers

**P0 (must ship):** upload (PDF/JPG/PNG) · render pages · text/OCR · extraction chain with review step · rule engine (financial, tax/identity, dates, invoice number) · duplicate engine · vendor engine · bank-change engine · visual forensics (OpenCV + PDF structure) · risk fusion with explanations · synthetic data engine + evaluation report · full UI (landing, dashboard, upload+pipeline, analysis with highlighted viewer, compare, vendors, history, review workflow, model insights, settings) · demo seed · PDF report · tests + CI · README/docs · GitHub repo with clean history.

**P1 (should):** LayoutLMv3 plugged in · batch upload · Docker compose · deployment (Vercel + HF Spaces/Render) · Playwright smoke test · command palette · SHAP panel polish.

**P2 (stretch):** visual-tamper CNN (ONNX) · LLM extractor · multi-language · multi-currency · purchase-order matching · email ingestion.

---

## 4. Architecture

```text
React (Vite, TS, Tailwind, shadcn/ui, Framer Motion, TanStack Query)
        │  REST + SSE (typed client generated from OpenAPI)
        ▼
FastAPI  ── background analysis job (thread pool) ── emits stage events
        │
        ├─ Ingest      : validate → store → render pages (PyMuPDF) → thumbnails
        ├─ Read        : PDF text layer | RapidOCR  → tokens(text, bbox, conf, page)
        ├─ Extract     : HeuristicExtractor → (LayoutLMv3) → (LLM) → merge → Normalizer → InvoiceData
        ├─ Engines     : Rules · Duplicate · Vendor · Bank · Identifiers/Dates · VisualForensics
        │                 each returns SignalResult { score, confidence, findings[] }
        ├─ Fusion      : noisy-OR baseline + XGBoost (monotone, calibrated) → score, level, SHAP
        ├─ Explain     : ordered findings, plain-English summary, recommendation
        └─ Store       : SQLAlchemy (SQLite | PostgreSQL) + files on disk (data/uploads)
```

**Interfaces (all engines are swappable and independently testable):**
`Reader.read(doc) -> list[Token]` · `Extractor.extract(tokens, doc) -> InvoiceData` · `Engine.run(ctx) -> SignalResult` · `VectorIndex.add/search` · `Fusion.score(signals) -> RiskResult`.

**Performance targets (CPU laptop):** digital PDF p50 ≤ 6 s end to end, scanned image p50 ≤ 15 s. Models load once at startup (lazy for heavy optional ones). Pipeline runs off the request thread; progress via SSE.

---

## 5. Repository structure

```text
InvoiceGuard/
├── AGENTS.md                  # rules for any AI/dev working here (copy to CLAUDE.md)
├── README.md  CHANGELOG.md  LICENSE  .gitignore  .env.example  Makefile
├── .github/workflows/ci.yml   # backend lint+tests, frontend lint+typecheck+build
├── docs/
│   ├── BLUEPRINT.md  original-plan.md  PROGRESS.md  ARCHITECTURE.md
│   ├── API.md  MODEL_CARD.md  EVALUATION.md  DEMO_SCRIPT.md  DECISIONS.md
│   └── assets/                # screenshots, gifs, diagrams
├── backend/
│   ├── app/
│   │   ├── main.py  config.py  deps.py  logging.py
│   │   ├── api/v1/            # routers: invoices, vendors, dashboard, review, models, settings, demo, health
│   │   ├── core/              # db.py, security.py (upload validation), events.py (SSE bus)
│   │   ├── models/            # SQLAlchemy ORM
│   │   ├── schemas/           # Pydantic v2 (API + internal contracts)
│   │   └── services/
│   │       ├── ingest/        # validate, store, render
│   │       ├── reading/       # pdf_text.py, ocr_rapid.py, tesseract.py
│   │       ├── extraction/    # heuristic.py, layoutlm.py, llm.py, normalize.py, chain.py
│   │       ├── engines/       # rules/, duplicate.py, vendor.py, bank.py, identifiers.py, visual/
│   │       ├── fusion/        # baseline.py, xgb_model.py, shap_explain.py, thresholds.py
│   │       ├── explain/       # narrative.py, recommendations.py
│   │       ├── reports/       # pdf_report.py
│   │       └── pipeline.py    # orchestrator
│   ├── tests/  (unit/, integration/, golden/)
│   ├── pyproject.toml  requirements.txt  requirements-ml.txt
├── ml/
│   ├── synthetic/             # generator, templates, tamper operators, vendor simulator
│   ├── training/              # train_fusion.py, train_vendor_if.py
│   ├── evaluation/            # run.py, metrics, plots → reports/
│   ├── layoutlm/              # colab notebook + inference adapter docs
│   └── artifacts/             # small trained models committed (<10 MB each) + model_manifest.json
├── data/ (raw/ processed/ synthetic/ samples/ uploads/)   # only samples/ + tiny fixtures committed
├── reports/                   # metrics.json, curves, confusion matrices (committed)
├── scripts/                   # dev.sh, dev.ps1, seed_demo.py, generate_data.py, train_all.py, export_openapi.py
├── docker/                    # Dockerfile.api, Dockerfile.web, nginx.conf
├── docker-compose.yml
└── frontend/
    ├── src/{app,components,components/ui,features,pages,lib,hooks,styles,mocks,api}/
    ├── index.html  package.json  vite.config.ts  tailwind config / css
```

---

## 6. Data contracts (Pydantic v2 — define on Day 1, freeze at end of Day 2)

**Token:** `text, bbox(x0,y0,x1,y1 normalised 0–1), page, conf, source("pdf"|"ocr")`

**InvoiceData:** `vendor{name, gstin, pan, address, email, phone}` · `buyer{name, gstin, address}` · `invoice_number` · `invoice_date` · `due_date` · `po_number?` · `currency` · `items[{description, hsn_sac?, quantity, unit, unit_price, discount?, tax_rate?, tax_amount?, line_total}]` · `subtotal` · `discount_total` · `shipping` · `tax{cgst, sgst, igst, other, total, rate?}` · `grand_total` · `amount_in_words?` · `payment{bank_name, account_number, ifsc, upi?, payment_terms}`.
Every scalar is a `Field[T]` = `{value, raw, conf, source, bbox?, page?}` so every value can be highlighted and edited.

**Finding:** `id, engine, category("rule"|"statistical"|"ml"|"visual"), type (stable code e.g. LINE_TOTAL_MISMATCH), severity("info"|"low"|"medium"|"high"|"critical"), score(0–100), confidence(0–1), title, summary, evidence{expected, found, difference, details{}, history_refs[]}, field?, bbox?{page,x,y,w,h}, related_invoice_ids[], recommended_action`.

**SignalResult:** `name, score, confidence, findings[], features{}` (features feed fusion).

**RiskResult:** `overall_score, level, level_thresholds, probability, signals{name→score}, confidence, baseline_score, ml_score, shap_top[], escalations[], recommendation, disclaimer`.

Bounding boxes are always **normalised to the page (0–1)** so the UI is resolution independent.

---

## 7. Document pipeline

1. **Validate:** extension + magic bytes + size ≤ 15 MB + ≤ 10 pages (analyse first 3 by default, configurable). Sanitise filename, store as `uploads/{uuid}/original.ext`. Compute SHA-256.
2. **Render:** PyMuPDF → PNG at 200 DPI (cap longest side 2400 px) + 400 px thumbnails. Images are normalised (EXIF orientation, convert RGB). Light deskew for scans (OpenCV minAreaRect on text mask, only if |angle| > 0.5°).
3. **Read:** if PDF has a usable text layer (≥ 30 words) → words with boxes via `page.get_text("words")`; else RapidOCR on the page image. Store token list. Record per-document `read_quality`.
4. **Extract (chain, merge by confidence):**
   - **HeuristicExtractor** — anchor/regex on key-value labels (Invoice No / Inv #, Date, Due, GSTIN, PAN, IFSC, A/c No, Total, Grand Total, Subtotal, CGST/SGST/IGST, Discount, Shipping, Amount in words); header block detection for vendor/buyer; **table parser**: find header row by keyword sets (Description/Item, Qty, Rate/Price, Amount/Total, HSN, GST %), cluster columns by x-position, read rows until the totals block.
   - **LayoutLMv3Extractor** (optional) — token classification with fine-tuned weights from HF Hub / `ml/artifacts`; map dataset labels → our schema; use to fill/override low-confidence fields.
   - **LLMExtractor** (optional, `EXTRACTOR_LLM=1` + key) — strict JSON schema output; never required.
   - **Normalizer:** Indian numbering (1,00,000.00), `₹ / Rs / INR`, decimal commas, date formats (dd/mm/yyyy, dd-MMM-yy, ISO), currency detection, GSTIN/IFSC/PAN uppercase + whitespace cleanup, account number digits only.
5. **Extraction report:** per-field confidence, missing critical fields (`invoice_number, vendor.name, invoice_date, grand_total`), `needs_manual_verification` if any critical field conf < 0.6 or missing.
6. **Review step (UI):** user can correct values; corrections are stored (`extraction_edits`) and the corrected data is what gets analysed. Edits are logged in the audit trail.

---

## 8. Detection engines

Each rule has a stable `type` code, default severity, configurable tolerance in `settings`, and **unit tests with pass + fail cases**.

### 8.1 Rules engine — Financial (`financial`)
- `LINE_TOTAL_MISMATCH`: qty × unit_price (− line discount) vs line_total. Tolerance `max(₹1, 0.5%)`.
- `SUBTOTAL_MISMATCH`: Σ line totals vs subtotal.
- `GRAND_TOTAL_MISMATCH`: subtotal − discount + shipping + tax vs grand_total (report expected, found, difference, and which component most plausibly explains it).
- `AMOUNT_WORDS_MISMATCH`: parse amount-in-words (`num2words`, `en_IN`) vs numeric total.
- `ROUNDING_ANOMALY`: grand total inconsistent with legitimate round-off (> ₹1) · `SUSPICIOUS_ROUND_TOTAL` (low weight).
- `DUPLICATE_LINE_ITEMS`, `NEGATIVE_OR_ZERO_VALUES`, `CURRENCY_INCONSISTENT`.

### 8.2 Rules engine — Tax & identity (`tax_identity`)
- `GSTIN_INVALID_FORMAT`, `GSTIN_CHECKSUM_FAIL` (mod-36 check digit), `GSTIN_STATE_INVALID`, `GSTIN_PAN_MISMATCH` (chars 3–12 vs stated PAN).
- `TAX_AMOUNT_MISMATCH`: rate × taxable value per rate/line vs reported tax.
- `TAX_STRUCTURE_INCONSISTENT`: same-state parties must use CGST+SGST (equal halves); different states → IGST.
- `TAX_RATE_INVALID_SLAB`: date-aware slab table from config (see decision #11). Verify current slabs when building; keep legacy slabs with validity dates.
- `IFSC_INVALID` (`^[A-Z]{4}0[A-Z0-9]{6}$`), `ACCOUNT_NUMBER_FORMAT`, `PAN_INVALID`.

### 8.3 Identifiers & dates (`identifiers`)
- `INVOICE_NUMBER_REUSED` (same vendor), `INVOICE_NUMBER_FORMAT_DEVIATION` (learn vendor's pattern: prefix, separators, zero padding, FY segment), `INVOICE_NUMBER_SEQUENCE_ANOMALY` (regression or implausible jump relative to vendor cadence).
- `DATE_IN_FUTURE`, `DUE_BEFORE_INVOICE`, `DATE_TOO_OLD`, `UNUSUAL_SUBMISSION_INTERVAL` (vs vendor's typical days-between-invoices).

### 8.4 Duplicate engine (`duplicate`) — returns top-K matches with a **field-level diff**
- L0 `EXACT_FILE_DUPLICATE` (SHA-256) · L0b `NEAR_IMAGE_DUPLICATE` (pHash Hamming ≤ 6).
- L1 exact fields: same (vendor, invoice_number) · same (vendor, date, total).
- L2 fuzzy: rapidfuzz `token_set_ratio` on a **canonical string** (normalised vendor | number | date | total | sorted item descriptions) ≥ 90.
- L3 semantic: fastembed embedding of the canonical string, cosine ≥ 0.92 (tunable) via `VectorIndex`.
- Score = max over levels with level weights; findings list which fields differ ("same invoice, total changed ₹48,500 → ₹185,000"). Classify as *exact*, *near-duplicate*, *modified duplicate*.

### 8.5 Vendor behaviour (`vendor`)
- Known vendor (≥ 5 invoices): `AMOUNT_OUTLIER` (modified z-score using median/MAD and ratio to median, e.g. "3.8× median"), `FREQUENCY_ANOMALY`, `TAX_RATE_DEVIATION`, `NEW_ITEM_CATEGORY` (embedding similarity of item descriptions vs vendor centroid), and **Isolation Forest** score on engineered features: `amount_ratio_to_median, amount_mad_z, days_since_prev, interval_z, tax_rate_delta, new_account_flag, new_item_flag, item_count_ratio, round_total_flag`.
- Cold start (< 5 invoices): `NEW_VENDOR_NO_BASELINE` (info/low) + population-level IF only; confidence reduced.
- Cross-vendor: `LOOKALIKE_VENDOR_NAME` (rapidfuzz ratio ≥ 88 against *other* vendors), `SHARED_BANK_ACCOUNT_ACROSS_VENDORS` (high), `SHARED_GSTIN/ADDRESS/CONTACT`.

### 8.6 Bank change (`bank`)
- `BANK_ACCOUNT_CHANGED` (existing vendor, account never seen — high), `BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR` (critical), `IFSC_CHANGED_SAME_ACCOUNT`, `BANK_DETAILS_MISSING`. Accounts stored only as **hash + last 4 digits**; UI shows `XXXXXX1234`. Never auto-classify as fraud; increases risk.

### 8.7 Visual forensics (`visual`)
**PDF structure (only for PDFs):** `PDF_EDITOR_PRODUCER` (Photoshop/Canva/iLovePDF/Sejda/Smallpdf/PDFescape… list in config), `PDF_MODIFIED_AFTER_CREATION` (ModDate − CreationDate gap), `PDF_INCREMENTAL_UPDATE` (multiple `%%EOF`), `FONT_MIX_IN_NUMERIC_FIELD` (span font name/size differs from neighbours in the same column/line — via `get_text("dict")`), `COVER_UP_RECTANGLE` (filled rect from `get_drawings()` overlapping text), `HIDDEN_TEXT`, `IMAGE_OVER_TEXT`, `SIGNATURE_INVALIDATED` if a signature exists.
**Pixel level (images and rendered PDF pages):** Error-Level Analysis (JPEG re-save q≈90, per-pixel diff), residual-noise variance map (image − median filter), local stroke-width and ink-intensity stats, baseline/height deviation vs neighbouring tokens, background texture continuity, optional ORB/SIFT copy-move check. For each **key field region** (total, tax, invoice no, date, bank, vendor) compute a feature vector and a **z-score vs all other text regions on the page** → `REGION_STATISTICALLY_INCONSISTENT` with a heatmap overlay PNG per page.
**Honesty:** visual findings carry capped confidence (≤ 0.85), explicit caveat ("can occur with legitimate edits or re-exports"), and are never *critical* on their own.
P2: tiny CNN (MobileNetV3/EfficientNet-B0) trained on synthetic patch pairs, exported to ONNX; if `ml/artifacts/visual_cnn.onnx` exists it adds `ML_TAMPER_PROBABILITY`.

### 8.8 Extraction confidence (`extraction`) — not a risk signal
Outputs `confidence` only, plus `OCR_LOW_CONFIDENCE` / `CRITICAL_FIELD_MISSING` info findings and the manual-verification flag.

---

## 9. Risk fusion

Signals (0–100 each, with confidence): `financial, tax_identity, duplicate, vendor, bank_change, identifiers, visual`. (`extraction` feeds only the confidence figure.)

1. **Baseline (deterministic, explainable):** noisy-OR `1 − Π(1 − w_i·s_i/100)` ×100, with weights in `config/fusion.yaml` (initial: financial .85, tax_identity .6, duplicate .8, vendor .6, bank_change .8, identifiers .4, visual .5).
2. **ML model:** XGBoost on `[7 signal scores + 25 engineered features]` trained on synthetic data, **monotone constraints = increasing** on every signal, probability calibrated (isotonic). Split by vendor *and* template to avoid leakage.
3. **Final:** `0.5·baseline + 0.5·ml` (configurable). **Escalation rules:** ≥ 2 independent signals ≥ 70 → floor 65; `SHARED_BANK_ACCOUNT_ACROSS_VENDORS` or exact duplicate + changed amount → floor 75. Escalations are listed in the explanation.
4. **Levels (configurable):** 0–29 LOW · 30–59 MEDIUM · 60–79 HIGH · 80–100 CRITICAL.
5. **Explanation:** top-N findings by `score × confidence`, SHAP top contributors (TreeExplainer), plain-English narrative, "what would lower the risk" hints, recommended action per level.
6. **Confidence band** (High/Medium/Low) from extraction confidence × evidence agreement.

---

## 10. Synthetic data engine (`ml/synthetic`) — the backbone of evaluation and the demo

- **Vendors:** ≥ 40 simulated vendors (Faker `en_IN`), categories, valid GSTINs (generate with correct checksum), stable bank accounts, tax rate, typical amount distribution (log-normal), cadence, numbering pattern. History: 12–40 invoices/vendor over ~18 months stored as `vendor_history.csv` and loaded to DB by the seed.
- **Templates (≥ 5):** classic table, modern minimal, GST tax-invoice with HSN, two-column, compact/thermal-style. Vary fonts (bundled OFL fonts), logo (generated monogram), colours, number formats, date formats, column order.
- **Rendering:** ReportLab (or fpdf2) with **coordinates recorded for every field** → ground-truth JSON with normalised bboxes. Optional scan simulation: rotation ±1.5°, gaussian noise, blur, JPEG q 55–90, shadow gradient.
- **Tamper operators (registry, each returns new spec + labels + affected fields):** `amount_inflate`, `line_total_edit`, `grand_total_edit`, `tax_rate_change`, `tax_amount_edit`, `gstin_corrupt`, `bank_swap`, `vendor_lookalike`, `invoice_no_reuse`, `invoice_no_jump`, `date_shift`, `qty_inflate`, `words_mismatch`, `exact_duplicate`, `near_duplicate`, `shared_bank_across_vendors`, plus three **modes**: (a) *re-render* clean tamper (data-level), (b) *pixel-edit* (cover + retype in raster with slightly different font/size/antialiasing), (c) *pdf-edit* (PyMuPDF redact + insert → leaves producer/font/structure traces).
- **Volume:** ≥ 300 genuine + ≥ 300 tampered covering ≥ 12 types, plus 200 visual pairs; generation < 10 min; deterministic via `--seed`.
- **Outputs:** `data/synthetic/{pdf|png}/…`, `data/synthetic/gt/{id}.json`, `manifest.csv (id, label, fraud_types, mode, vendor_id, template_id, split)`.
- **Hero demo set (`data/samples/`)**, regenerated deterministically by `scripts/seed_demo.py`: `01_clean_low`, `02_minor_warning_medium`, `03_hero_critical` (line-item 2×15,000 shown 40,000; grand total off by ₹30,000; bank XXXX1234→XXXX8891; tax rate deviates from the vendor's history; amount 3.8× median; visual edit near total; near-duplicate of an earlier invoice at ~94 % similarity), `04_near_duplicate`, `05_bank_change_only`, `06_pdf_edited_visual`, `07_new_vendor`, `08_scanned_noisy_genuine`. Expected score bands are asserted in a golden test.

---

## 11. Evaluation (`ml/evaluation/run.py` → `reports/`)

Produce `reports/metrics.json`, PNG curves, `EVALUATION.md` (auto-generated tables). Metrics: field-level extraction P/R/F1 (synthetic test + LayoutLMv3 dataset test if available) · duplicate Precision/Recall/Recall@K · vendor IF ROC-AUC on injected outliers · visual region-level AUC & confusion matrix · end-to-end ROC-AUC, PR-AUC, precision/recall/F1 at the Medium threshold · **per-fraud-type recall** · false-positive rate on genuine invoices · latency p50/p95 · ablation (baseline vs ML vs combined; with/without each engine). Include an honest **Limitations** section (synthetic data is optimistic; real-world performance unmeasured). The UI "Model Insights" page reads `metrics.json`.

---

## 12. API (prefix `/api/v1`, OpenAPI exported to `docs/openapi.json`, TS types generated)

| Method | Path | Purpose |
|---|---|---|
| POST | `/invoices/upload` | multipart upload → `{invoice_id, status}` (also starts read+extract) |
| GET | `/invoices/{id}/events` | **SSE** stage events `{stage, status, message, progress, ts}` |
| GET | `/invoices/{id}/extraction` | InvoiceData + confidences + flags |
| PUT | `/invoices/{id}/extraction` | save user corrections |
| POST | `/invoices/{id}/analyze` | run engines + fusion (async job) |
| GET | `/invoices/{id}` | full analysis (invoice, signals, findings, risk, vendor summary, matches) |
| GET | `/invoices/{id}/pages/{n}.png` · `/thumb` · `/heatmap/{n}.png` | images |
| GET | `/invoices` | history: search, filters (vendor, date range, level, anomaly type, amount range, status), sort, pagination |
| GET | `/invoices/{id}/compare/{other_id}` | field-level diff |
| PATCH | `/invoices/{id}/review` | status (`needs_review|confirmed_issue|false_positive|approved`) + note; writes audit event |
| GET | `/invoices/{id}/audit` | audit trail |
| GET | `/invoices/{id}/report.pdf` | PDF report |
| GET | `/vendors` · `/vendors/{id}` | list + profile (stats, accounts, history series, linked entities) |
| GET | `/dashboard/stats` | KPIs, distributions, trends, top vendors |
| GET | `/models/metrics` | `metrics.json` + model manifest |
| GET/PUT | `/settings` | thresholds, tolerances, slabs, engine toggles |
| POST | `/demo/seed` · `/demo/reset` · GET `/demo/samples` | demo data |
| POST | `/batch/upload` · GET `/batch/{id}` | P1 |
| GET | `/health` | status + model availability |

Errors: `{error:{code, message, details}}` with proper HTTP codes. CORS from env. Request-ID middleware. Simple per-IP rate limit on upload.

---

## 13. Database (SQLAlchemy 2.0; portable types)

`vendors` · `vendor_accounts (account_hash, last4, bank_name, ifsc, first_seen, last_seen, invoice_count)` · `invoices (… status, risk_level, overall_score, review_status, content_hash, phash, read_quality, extraction_confidence, created_at)` · `invoice_items` · `invoice_documents (page, image_path, width, height)` · `invoice_tokens (JSON per doc)` · `invoice_embeddings (vector blob, model)` · `extraction_edits` · `findings` · `risk_scores` · `audit_events (invoice_id, actor, action, payload, ts)` · `settings (key, json)` · `batches` (P1). Indexes on `(vendor_id, invoice_number)`, `(vendor_id, invoice_date)`, `content_hash`, `phash`, `overall_score`.

---

## 14. Frontend

**Stack:** React 18 + Vite + TypeScript (strict) · Tailwind CSS v4 · shadcn/ui (Radix) · Framer Motion · TanStack Query & Table · React Router · Recharts · Lucide · cmdk · sonner · react-dropzone · react-zoom-pan-pinch · openapi-typescript. Fonts (self-hosted via Fontsource): **Inter** (UI) + **JetBrains Mono** (numbers, IDs, accounts).

### 14.1 Design system
- **Look:** calm, precise, "security-ops meets fintech". Dark default (near-black zinc, subtle grid/noise), full light theme, theme toggle with smooth transition. One accent (indigo→violet gradient) used sparingly. Radius 12–16, soft layered shadows, hairline borders, glass blur on the top bar only.
- **Risk palette (never colour-only; always icon + label):** low emerald · medium amber · high orange · critical rose. Verified = green outline; info = slate.
- **Type scale:** 12/13/14/16/20/28/40; tabular-nums on every figure.
- **Motion rules:** 150–250 ms for UI feedback, 500–1000 ms for hero moments; spring `{stiffness 260, damping 28}`; ease-out for entrances; stagger 40 ms; animate only `transform/opacity`; page transitions with `AnimatePresence`; shared-element transitions with `layoutId` (history row → analysis header); **`prefers-reduced-motion` disables non-essential motion**.
- **Signature animations:** animated radial **risk gauge** (sweep + count-up + colour morph) · **pipeline stepper** with scan-beam over the document and live log lines · findings **stagger-in** · bounding boxes **draw in** and pulse on hover/selection · animated KPI counters + sparklines · radar chart morph · skeleton shimmer loaders · toast micro-interactions · drag-over dropzone glow.
- **States:** every screen has loading (skeleton), empty (illustrated, with CTA), and error (retry) states.
- **A11y:** WCAG AA contrast, focus rings, full keyboard operation, ARIA labels on overlays, `aria-live` for pipeline progress.
- **Responsive:** desktop-first, fully usable ≥ 360 px (stacked layout, bottom sheet for finding details).

### 14.2 Pages
1. **Landing (`/`)** — hero with an invoice mock being "scanned" and anomalies lighting up (pure SVG/CSS/Framer), three-step explainer, signal grid, CTA buttons *Try a sample* / *Upload invoice*; disclaimer in footer.
2. **Dashboard (`/dashboard`)** — KPI cards (Total, Analysed, Needs review, High/Critical, Duplicate alerts) · risk distribution donut · 30-day anomalies area chart · anomaly categories bar · top suspicious vendors · recent analyses feed · compact dropzone.
3. **Analyze (`/analyze`)** — large dropzone + sample gallery; after upload: **pipeline view** (doc thumbnail + scan beam + stepper + live log via SSE) → **extraction review** (side-by-side: editable fields with confidence chips ↔ document with field boxes; click a field to highlight it; "Looks good — Analyze" primary button) → navigate to result.
4. **Invoice analysis (`/invoices/:id`)** — header (invoice no, vendor, status chip, review actions, export PDF). **Left 60 %: interactive viewer** (pan/zoom, page switcher, layer toggles *Findings / Extracted fields / Forensic heatmap*, legend, hover tooltip, click selects). **Right 40 % tabs:** *Summary* (gauge, radar of 7 signals, breakdown bars, confidence band, recommendation card) · *Findings* (filter chips Rule/Statistical/ML/Visual, severity sort, expandable evidence with expected-vs-found, linked to viewer both ways) · *Compare* (vendor history sparkline + diff vs previous / matched invoice) · *Data* (extracted table with confidence) · *Model* (SHAP bars, baseline vs ML, escalations) · *Timeline* (pipeline durations + audit trail).
5. **Compare (`/compare/:a/:b`)** — side-by-side fields; changed values chipped amber/red with delta; masked bank accounts; visual overlay slider (P1).
6. **Vendors (`/vendors`, `/vendors/:id`)** — table with risk trend; profile: KPIs, amount timeline with median ± 2·MAD band and flagged points, known accounts (first/last seen, "new" badge), tax-rate history, recent invoices, linked-entities card.
7. **History (`/history`)** — TanStack table: search, filters (vendor, date, level, anomaly type, amount, status), column sort, pagination, row→analysis shared-element transition, CSV export.
8. **Review queue (`/review`)** — inbox of Needs-review invoices sorted by risk; keyboard: `j/k` move, `c` confirm issue, `f` false positive, `a` approve, `Enter` open.
9. **Model Insights (`/insights`)** — metric cards, ROC & PR curves (Recharts from `metrics.json`), confusion matrix heatmap, per-fraud-type recall bars, latency, ablation table, animated "how scoring works" flow, dataset card, limitations.
10. **Settings (`/settings`)** — thresholds (sliders with live distribution preview), tolerances, GST slab table, engine toggles, demo seed/reset, theme.
11. **Global:** collapsible sidebar, top bar with search + `Ctrl/⌘+K` command palette (navigate, open recent invoice, upload, toggle theme), toasts, 404 page, persistent disclaimer.

### 14.3 Frontend engineering
Typed API client from OpenAPI · TanStack Query with sensible caches & optimistic review updates · `src/mocks` fixtures so UI can be developed before backend finishes · feature folders · ESLint + Prettier · Vitest for utils · (P1) Playwright smoke: sample → analysis → score visible.

---

## 15. Security, privacy, ethics

Validate magic bytes/size/page count · never execute or render user HTML · UUID storage paths, no user filenames on disk · CORS allowlist · upload rate limit · bank accounts stored hashed + last4 · no invoice content in logs · `.env` never committed · `.env.example` documented · dataset licences recorded in `docs/DATASETS.md` · disclaimer about risk-not-verdict · demo data is synthetic (state clearly) · optional "purge uploads" in settings.

---

## 16. Engineering & Git process (also copied into `AGENTS.md`)

- Python 3.11, type hints, `ruff` (lint+format), `pytest`; TypeScript strict, ESLint, Prettier.
- Branches: `main` (always runnable) + short-lived `feat/<area>`; merge with `--no-ff` or PR; tag milestones `v0.1-day1`, `v0.2-day2`, `v0.3-day3`, `v1.0.0`.
- **Conventional Commits** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`); small commits; push after every milestone and at the end of each day.
- Never commit: `.env`, `node_modules`, `.venv`, `data/uploads`, raw datasets, model weights > 10 MB (use Hugging Face Hub; record in `model_manifest.json`), generated bulk synthetic data (commit generator + seed, plus a small fixture set).
- Maintain `CHANGELOG.md` (Keep a Changelog), `docs/PROGRESS.md` (daily log: done / decisions / known issues / next), `docs/DECISIONS.md` (ADR-lite).
- CI (GitHub Actions) must be green before tagging.

---

## 17. Definition of done (every task)

Runs locally from a clean clone using README steps · tests written and passing · types/lint clean · no secrets · loading/empty/error states handled · documented in `PROGRESS.md` · committed and pushed.

## 18. Risk register & fallbacks

| Risk | Fallback |
|---|---|
| LayoutLMv3 fine-tune late/poor | Heuristic extractor remains primary; LayoutLM stays optional; show its eval honestly |
| RapidOCR install issues | Tesseract path, or restrict scanned support to images with PDF text layer disabled flag; synthetic scans still tested |
| XGBoost/SHAP slow or unstable | Use noisy-OR baseline only (flag `FUSION_MODE=baseline`) |
| Visual forensics noisy | Cap weights, lower confidence, keep as "indicator"; PDF-structure signals carry the demo |
| Deployment heavy | Run locally + record demo video; deploy only frontend + API on HF Spaces |
| Time overrun | Cut order: Playwright → batch → command palette → SHAP panel polish → heatmap layer → CNN |
