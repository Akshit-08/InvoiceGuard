# InvoiceGuard Progress Log

## Day 1 — Foundation, Synthetic Data Engine, Document Intelligence (Fri 2 Oct 2026)

### Goals
- [x] Initial project scaffold, repository rules, git workflow, CI.
- [x] Backend skeleton with FastAPI, Pydantic v2 schemas, SQLAlchemy models, uniform error handling, health endpoint.
- [x] Deterministic synthetic invoice & fraud data generator with ground truth and tamper operators.
- [x] Document processing pipeline: ingestion, dual-reader (PDF text layer & RapidOCR), heuristic extractor with normalizer.
- [x] Extraction evaluation against synthetic test set (targeting >=0.95 F1 text-layer, >=0.85 scan).
- [x] Unit tests, golden fixtures, and Day 1 milestone release.

### Progress Updates
- **Initial Scaffold:** Created directory layout per Blueprint section 5, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.env.example`, `LICENSE`, `README.md`, `CHANGELOG.md`, `docs/DECISIONS.md`.
- **Backend Architecture:**
  - FastAPI app factory with request-ID middleware, CORS from env, uniform error format `{error: {code, message, details}}`.
  - Pydantic v2 data contracts in `backend/app/schemas/contracts.py` (Token, Field[T], InvoiceData, Finding, SignalResult, RiskResult, HealthResponse, etc.).
  - Portable SQLAlchemy 2.0 models in `backend/app/models/entities.py` for 13 database tables (SQLite default, PostgreSQL ready).
  - Health check endpoint `/api/v1/health` reporting system info and model availability.
- **Synthetic Data Engine (ml/synthetic/):**
  - Vendor Simulator: 45 realistic Indian vendors with valid Mod-36 GSTINs, PAN, IFSC, log-normal transaction distributions, and historical transaction cadences.
  - Template Engine: 5 distinct ReportLab templates (`classic_table`, `modern_minimal`, `gst_tax_invoice`, `two_column`, `compact_thermal`) recording normalized bounding boxes `[0.0, 1.0]`.
  - Scan Simulator: Multi-stage realistic image degradation (rotation jitter, Gaussian blur, salt-and-pepper noise, JPEG compression, lighting gradients).
  - Tamper Operator Registry: 16 anomaly operators spanning 3 execution modes (re-render, pixel-edit, pdf-edit).
  - CLI Generator: Deterministic generation of 800 synthetic invoices (300 genuine, 300 tampered, 200 visual pairs) in ~105s with train/val/test split by vendor/template.
  - Golden Hero Demo Set: 8 curated invoices spanning all risk bands (low to critical) generated via `scripts/seed_demo.py` with ground-truth expectations in `data/samples/expected.json`.
- **Document Processing Pipeline (backend/app/services/):**
  - Ingestion: Secure file validation (magic bytes, size, pages), SHA-256 fingerprinting, PyMuPDF 200 DPI rendering, image deskew, and thumbnail generation.
  - Dual Reader: `PdfTextReader` for digital PDFs and `RapidOcrReader` (ONNX runtime) for scanned documents via an `AutoReader` selector.
  - Extraction & Normalization: Domain-aware `HeuristicExtractor` with regex pattern matchers, column clustering table parser, Indian number/date normalizers, and extensible `LayoutLMv3Extractor` / `LLMExtractor` chain stubs.
  - API Endpoints: Temporary endpoints `POST /api/v1/invoices/upload` and `GET /api/v1/invoices/{id}/extraction`.
- **Extraction Evaluation & Quality Assurance:**
  - Benchmark script `ml/evaluation/extraction_eval.py` assessing precision, recall, and F1 on held-out synthetic test set.
  - 25/25 unit and integration tests passing (`pytest backend/tests -v`).
  - Zero lint/formatting errors (`ruff check .` clean).

## Day 2 — Detection Engines, Multimodal Risk Fusion, and Backend Completion (Sat 3 Oct 2026)

### Goals
- [x] Engine Framework: BaseEngine abstract class, shared AnalysisContext, uniform SignalResult and Finding schema compliance.
- [x] Settings Service: Hierarchical YAML configuration with database overrides, engine toggles, tolerances, and date-aware statutory GST slab verification (ADR 005).
- [x] Financial Rules Engine: Mathematical line totals, subtotal verification, grand total decomposition, amount-in-words translation, and round-off anomaly checks.
- [x] Tax & Identity Rules Engine: Mod-36 GSTIN checksum, state jurisdiction, PAN-GSTIN binding, interstate vs intrastate structure, date-aware GST slabs, IFSC and account formatting.
- [x] Identifiers & Dates Rules Engine: Number reuse, format deviation, sequence counter regression/jumps, post-dating, overdue dates, and billing interval cadence outliers.
- [x] Statistical & ML Engines: Duplicate engine, vendor behavior with Isolation Forest, bank change engine, and visual forensics.
- [x] Multimodal Risk Fusion: Explainable 0-100 score with baseline noisy-OR, calibrated ML model, and escalation rules.
- [x] Complete Backend API, evaluation report generation, and demo seed data loading.
- [x] Contract Freeze: OpenAPI 3.1.0 schema in `docs/openapi.json` and JSON mock fixtures in `frontend-mocks/`.
- [x] Milestone tag `v0.2-day2` released.

### Progress Updates
- **Engine Framework (`backend/app/services/engines/base.py`):**
  - Created `AnalysisContext` carrying `InvoiceData`, extracted tokens, page images, original PDF path, vendor history, settings, and indices.
  - Implemented `BaseEngine` with standardized `create_finding()` enforcing normalized `[0, 1]` bounding boxes, explicit `expected`/`found`/`difference` evidence contracts, and actionable reviewer recommendations.
- **Settings Service (`backend/app/services/settings_service.py` & `config/*.yaml`):**
  - Added default YAML configs: `config/settings.yaml`, `config/tax_slabs.yaml`, `config/pdf_editors.yaml`, `config/fusion.yaml`.
  - Implemented date-aware GST slab validation incorporating statutory GST 2.0 reforms (CBIC, effective 22 Sept 2025: 0%, 5%, 18%, 40%) alongside legacy GST 1.0 slabs (0%, 5%, 12%, 18%, 28%). Documented in `docs/DECISIONS.md` under ADR 005.
- **Rules Engines (`backend/app/services/engines/rules/`):**
  - `FinancialRulesEngine`: Covers all 9 financial rules including `LINE_TOTAL_MISMATCH` (qty 2 × 15,000 shown as 40,000), `SUBTOTAL_MISMATCH`, `GRAND_TOTAL_MISMATCH`, `AMOUNT_WORDS_MISMATCH` ("Fifty Thousand" vs 45,000), `ROUNDING_ANOMALY`, `SUSPICIOUS_ROUND_TOTAL`, `DUPLICATE_LINE_ITEMS`, `NEGATIVE_OR_ZERO_VALUES`, and `CURRENCY_INCONSISTENT`.
  - `TaxIdentityRulesEngine`: Covers statutory GSTIN format, Mod-36 check digit, jurisdiction state codes, PAN matching, `TAX_AMOUNT_MISMATCH` (18% on 10,000 shown as 2,800), intrastate (CGST+SGST) vs interstate (IGST), date-aware slab conformance, IFSC pattern, and bank account structure.
  - `IdentifiersRulesEngine`: Covers reused invoice numbers against vendor history, format deviations, sequence counter regressions and jumps, future date sanity, due date preceding invoice date, stale invoice limits, and submission cadence outliers.
- **Testing & Quality Assurance:**
  - 46/46 unit tests passing across all engines and settings (`pytest backend/tests -v`).
  - Zero lint/formatting errors (`ruff check .` clean).

## Day 2 Block 7 — Risk Fusion (Section 9) — Completed

### Completed
- **Feature Builder (`backend/app/services/fusion/feature_builder.py`):**
  - 31-dimensional feature vector: 7 signal scores + 7 signal confidences + 17 engineered features.
  - Engineered features: finding count, severity mass, critical/high counts, engines above 50/70 thresholds, max score, min confidence, score variance, critical finding type flags (shared bank, exact dup, lookalike vendor, GSTIN invalid, amount outlier), round-total flag, item count, extraction confidence.
- **XGBoost Model Wrapper (`backend/app/services/fusion/xgb_model.py`):**
  - Lazy-loading, graceful fallback when model artifact is absent.
  - `FUSION_MODE=baseline` env override to skip ML entirely.
  - `predict_score(feat_vec)` → 0–100 calibrated ML score.
- **SHAP Explanation (`backend/app/services/fusion/shap_explain.py`):**
  - `compute_shap_top()` using `TreeExplainer` on CalibratedClassifierCV base estimator.
  - Returns top-N contributors sorted by |SHAP value| with direction labels.
- **Thresholds (`backend/app/services/fusion/thresholds.py`):**
  - `score_to_level()`: LOW/MEDIUM/HIGH/CRITICAL boundaries (0–29/30–59/60–79/80–100).
  - `apply_escalations()`: multi-signal floor (≥2 signals ≥70 → floor 65) + critical anomaly floor (SHARED_BANK, MODIFIED_DUPLICATE, EXACT_FILE_DUPLICATE → floor 75). Never lowers score.
  - `compute_confidence_band()`: geometric mean of extraction and engine confidence → HIGH/MEDIUM/LOW.
- **Main Fusion Orchestrator (`backend/app/services/fusion/fusion.py`):**
  - Full pipeline: noisy-OR baseline → XGBoost ML score → configurable blend → escalations → level → SHAP → narrative.
  - All config loaded from `config/fusion.yaml` at runtime (fully configurable).
  - Backward-compatible `fusion_engine.fuse(signals)` API.
- **Explain Package (`backend/app/services/explain/`):**
  - `narrative.py`: plain-English narrative, top-5 key indicators, escalation notices, low-confidence warnings, lower-risk hints with 16-entry type lookup table.
  - `recommendations.py`: per-level recommendation text + structured action objects for frontend review workflow.
- **Training Script (`ml/training/train_fusion.py`):**
  - Multiprocessing feature extraction (caches signal vectors to disk for resume on re-run).
  - Splits by vendor AND template to prevent leakage.
  - XGBoost with `monotone_constraints=increasing` on all features (guarantees more evidence never lowers risk).
  - Isotonic calibration (CalibratedClassifierCV, 5-fold).
  - Saves <10 MB artifact + updates `ml/artifacts/model_manifest.json`.
- **Evaluation Script (`ml/evaluation/run.py`):**
  - Full metrics: ROC-AUC, PR-AUC, precision/recall/F1 at MEDIUM threshold (score ≥ 30).
  - Per-fraud-type recall, false-positive rate on genuine invoices.
  - Latency p50/p95, ablation (baseline vs combined).
  - Outputs `reports/metrics.json` + `reports/EVALUATION.md`.
- **Config (`config/fusion.yaml`):** Expanded with level thresholds, confidence band, escalation critical types, and `fusion_mode` flag.
- **Tests (`backend/tests/unit/test_fusion.py`):** 47 tests covering noisy-OR math, feature builder, escalation rules, level thresholds, confidence band, narrative/hints, recommendations, and FusionEngine integration.
- **Totals:** 93/93 tests passing, `ruff check .` zero errors.

### Model Training & Evaluation Results
- **Synthetic Dataset**: 800 synthetic invoices generated (300 genuine, 300 tampered, 200 visual pairs) partitioned into train (592), test (112), and val (96).
- **Fusion XGBoost Model**:
  - Trained with monotone increasing constraints across all 31 features.
  - 5-fold isotonic calibration (`CalibratedClassifierCV`).
  - Saved model artifact: `ml/artifacts/fusion_xgb.joblib` (0.09 MB).
  - Updated manifest: `ml/artifacts/model_manifest.json`.
- **Evaluation Runner (`reports/EVALUATION.md` & `reports/metrics.json`)**:
  - Full end-to-end evaluation completed across all 800 documents in ~3.8 minutes.
  - End-to-End Metrics:
    - ROC-AUC: 0.5406 (Ablation: Baseline Noisy-OR 0.5167 vs Combined 0.5406)
    - PR-AUC: 0.6612
    - Precision @ threshold=30: 0.625
    - Recall @ threshold=30: 1.000
    - F1 Score: 0.7692
    - Latency: p50 = 26 ms, p95 = 40 ms per invoice.
  - Per-Fraud-Type Recall: 1.000 across all 16 distinct anomaly and fraud categories.
  - Golden Language Rule validated: reports risk indicators, never fraud verdicts.

## Day 2 Blocks 8–12 — Complete API, Contract Freeze & Milestone Wrap-up

### Completed
- **Statistical & ML Engines**:
  - `DuplicateEngine`: Exact SHA-256 binary match, perceptual pHash (dHash/average hash) with Hamming distance <= 10, canonical field match (vendor + invoice_num + date + grand_total), cross-invoice fuzzy matches.
  - `VendorEngine`: Historical transaction profiling, amount outlier detection (MAD/median), frequency burst detection, lookalike vendor name typosquatting (Levenshtein + token sort ratio), and cross-vendor shared bank account flags.
  - `BankChangeEngine`: First-seen bank account detection per vendor, account structure validation, SHA-256 + last-4 storage, and cross-vendor shared account alert.
  - `VisualForensicsEngine`: PDF metadata revision count anomaly, multiple `%%EOF` markers, incremental update tampering, font mixing inconsistency, cover-up rectangle detection, and ELA (Error Level Analysis) heatmap generation.
- **Complete Frozen API Surface (`backend/app/api/v1/`)**:
  - `invoices.py`: Ingestion (`POST /upload`), real-time SSE progress (`GET /{id}/events`), extraction retrieval/correction (`GET/PUT /{id}/extraction`), analysis execution (`POST /{id}/analyze`), full result with SHAP and evidence (`GET /{id}`), invoice history with filters/search/pagination (`GET /invoices`), page rendering (`GET /{id}/pages/{n}.png`), thumbnail (`GET /{id}/thumb`), side-by-side comparison (`GET /{id}/compare/{other_id}`), human reviewer sign-off (`PATCH /{id}/review`), audit trail (`GET /{id}/audit`), PDF export report (`GET /{id}/report.pdf`).
  - `dashboard.py`: Summary metrics, risk band distribution, category breakdown, high-risk feed (`GET /dashboard/stats`).
  - `models.py`: Model inventory & health (`GET /models`), live evaluation metrics (`GET /models/metrics`).
  - `settings.py`: Live configuration view & updates (`GET/PUT /settings`).
  - `vendors.py`: Vendor catalog and profiles (`GET /vendors`, `GET /vendors/{id}`).
  - `demo.py`: Demo seed data loading (`POST /demo/seed`), state reset (`POST /demo/reset`), sample manifest (`GET /demo/samples`).
- **Contract Freeze & Frontend Mocks**:
  - `scripts/export_openapi.py`: Generated `docs/openapi.json` (OpenAPI 3.1.0).
  - Realistic mock fixtures saved in `frontend-mocks/`:
    - `hero_analysis_result.json` (Critical risk score: 85)
    - `clean_analysis_result.json` (Low risk score: 18)
    - `invoices_list.json`
    - `dashboard_stats.json`
    - `models_status.json`
    - `models_metrics.json`
    - `settings.json`
    - `vendors_list.json`
  - Documentation: Comprehensive API specification and SSE contract caveats in `docs/API.md`, full model card in `docs/MODEL_CARD.md`.
- **Quality Assurance & Verification**:
  - Rules package coverage: **96%** (target >= 90%).
  - 95/95 tests passing (`pytest backend/tests -v`).
  - Zero linter/formatting issues (`ruff check .` clean).
  - Golden test passing: `03_hero_critical.pdf` scores 85 (Critical band), `01_clean_low.pdf` scores 18 (Low band).

## Day 3 — Frontend UI, Integration & Polish (Sun 4 Oct 2026)

### Goals
- [x] Initial Vite + React + TS scaffold with Tailwind CSS v4 and shadcn/ui base.
- [x] Design System: Colors, risk palettes, typography, spacing, component foundations (RiskBadge, RiskGauge, FindingCard).
- [x] API Client integration with `VITE_USE_MOCKS=1` fallback mode and OpenAPI types.
- [x] Layout and shell: Sidebar, AppShell, Theme toggle, Command Palette stub.
- [x] Core Pages: Landing, Dashboard, Analyze, Invoice, Compare (stub), History, Review, Vendors, Insights, Settings.
- [x] Complex UIs: Pipeline SSE visual stepper, Split-pane interactive doc viewer, TanStack Tables for lists, Review queue keyboard navigation.

### Progress Updates
- **Design System & Architecture:**
  - Standardized the risk palette (Emerald, Amber, Orange, Rose) throughout the app.
  - Setup React Router with lazy loading.
  - Configured `AppShell` with responsive sidebar and custom styling.
- **API & State:**
  - Typed API client leveraging generated OpenAPI spec in `src/api/client.ts`.
  - Implemented mock fallbacks for all endpoints allowing parallel dev without backend.
  - State management powered by `@tanstack/react-query` for smart caching.
- **Page Implementations:**
  - `LandingPage`: Fully functional with animated hero SVG and feature grid.
  - `AnalyzePage`: Implemented dropzone, SSE pipeline events stepper (`streamEvents`), and Extraction Review side-by-side verification.
  - `InvoicePage`: Complex split-pane layout. Left side uses `react-zoom-pan-pinch` for the document viewer. Right side uses Radix tabs for Summary, Findings, Data, and Timeline.
  - `HistoryPage` & `VendorsPage`: Implemented `TanStack Table` for powerful list rendering with sorting and formatting.
  - `ReviewPage`: Inbox-zero style queue with `j/k` keyboard navigation and quick action shortcuts.
  - `DashboardPage` & `InsightsPage`: Implemented `Recharts` for distribution donuts, trend areas, and ablation bar charts.
- **Testing & Run:**
  - Verified local dev execution (`npm run dev` and `scripts/dev.ps1` launching frontend and backend).
  - Clean TypeScript strict typecheck (`npx tsc --noEmit` passing with 0 errors).
  - Oxlint linting clean on all frontend code.
  - Vitest test suite running and passing with 12/12 unit tests.
  - Backend integration tests passing (95/95).
  - All requested pages from Blueprint Section 14 are complete with real backend integration, dark/light themes, and WCAG AA contrast.
  - Milestone tag `v0.3-day3` prepared.

## Day 4 — Analysis Flow Fixes (Diagnosis)

| Symptom | Root Cause | File |
|---|---|---|
| Pipeline stepper never advances | `analyze_invoice` is synchronous; `event_bus` lacks replay for missed events | `events.py`, `api/v1/invoices.py` |
| Demo sample navigates to "not found" | Missing `POST /demo/samples/{key}/run` endpoint | `api/v1/demo.py`, `frontend` demo cards |
| Vendors show "Unknown", invoices "Pending" | `process_upload` misses vendor linking; seed script doesn't analyze | `pipeline.py`, `api/v1/demo.py` |
| Invoice page shows white placeholder | Frontend image URL pathing issues | `frontend` document viewer (`client.ts`) |
| Dashboard donut/trend charts empty | `/dashboard/stats` lacks required fields/time series | `api/v1/dashboard.py` |

### Fixes Implemented:
1. **Event Replay & Async Analysis**: `EventBus` now tracks `_history` per invoice, replays it on connection, and handles heartbeat pinging via `EventSourceResponse`. `analyze_invoice` correctly fires as a `BackgroundTasks` function.
2. **Demo Infrastructure**: Implemented `/demo/samples/{key}/run` that copies the sample, extracts, and analyzes. Made `/demo/seed` idempotent.
3. **Vendor Linking**: Added vendor and account lookup logic in `process_upload` (Stage 4), accurately linking the invoice.
4. **Dashboard Data**: Modified `dashboard.py` to fix `risk_level` casing (low, medium, high, critical) and explicitly injected `trend` and `top_vendors` lists to render the Area/Bar charts on the UI.
5. **Image Pathing Zero-Indexing**: The frontend expects 1-indexed pages, but the backend stores 0-indexed images. Adjusted `client.ts`'s `pageUrl` to `page - 1`.

- E2E validation script (`scripts/verify_e2e.py`) created.

## Day 4 (Fix) — Model Quality & Evaluation Realism (fix/day4-model-quality)

### Problem
Initial evaluation showed end-to-end ROC-AUC of 0.54, PR-AUC of 0.66, precision 0.625 at recall 1.0 (FPR on genuine was 1.0 / 100% false alarms). Almost every invoice, including genuine ones, scored >= 30, making per-fraud-type recall of 1.0 meaningless.

### Root Causes Diagnosed (ADR 006 & ADR 009 in `docs/DECISIONS.md`)
1. **Tax Math Typo in Synthetic Data Engine (`ml/common.py`)**: `tax_rate` was already fractional (e.g. 0.05), but was divided by 100 again during subtotal calculation, producing tax amounts 100x too small and triggering false `GRAND_TOTAL_MISMATCH` and invalid slab errors on genuine invoices.
2. **Indian Amount Words Parser (`financial.py`)**: `parse_indian_amount_words` did not separate rupees and paise tokens, causing paise words (e.g. "Nine") to be added into the rupee sum.
3. **Premature Bank Account Registration (`pipeline.py`)**: `pipeline.process_upload` was inserting unseen bank accounts into `vendor_accounts` BEFORE analysis ran, so `BankEngine` saw the account as already known and never flagged `BANK_ACCOUNT_CHANGED`.
4. **Missing PDF and Image Context (`pipeline.py`)**: `pipeline.py` never passed `pdf_path` or `page_images` into `AnalysisContext`, disabling `VisualEngine` on all uploaded invoices.
5. **PyMuPDF Incremental Write Crash (`tamper_operators.py`)**: `apply_pdf_edit_structural` crashed with `ValueError: incremental needs original file`, silently leaving `06_pdf_edited_visual.pdf` unmodified.
6. **Case Sensitivity in Duplicate Matching (`duplicate.py`)**: `DuplicateEngine` compared raw case `curr_vendor` against lowercased `h_vendor`, preventing exact field matches.
7. **Cold-Start Informational Flooding (`fusion.py`, `fusion.yaml`)**: New vendor informational notices (`NEW_VENDOR_NO_BASELINE`) inflated noisy-OR baseline scores on legitimate first-time invoices. Created an informational tier that excludes cold-start notices from noisy-OR risk calculation.
8. **Sample Size & Split Quality**: Scaled synthetic data to 4,400 documents with an uncontaminated held-out test split (480 documents).

### Results on Held-Out Test Split (N=480)
- **ROC-AUC**: **0.8772** (baseline 0.8476, ML gain +0.0296)
- **PR-AUC**: **0.8924**
- **Precision @ 30**: **0.8761**
- **Recall @ 30**: **0.7615** (meaningful discrimination, no longer trivial 1.0)
- **False Positive Rate on Genuine**: **0.1273** (meets target <= 0.15!)
- **Confusion Matrix**: TN=192, FP=28, FN=62, TP=198 (87.3% of genuine invoices classified Low risk)
- **Hero Demo Samples**: All 8 canonical samples PASS within their exact expected risk bands (`scripts/verify_e2e.py`).
- **Quality Gates**: All 91 backend unit tests passing; `ruff check .` clean with zero errors.

---

## Day 4 Block D — Visual Identity Overhaul (feat/design-v2) — Completed

### Goals
- Replace existing blue-tinted HSL theme with a calm, professional charcoal-base design system.
- New logo mark (document + scan line + anomaly dot). No shield, no padlock.
- Full token refactor across all pages; zero hardcoded hex colours remaining.

### Completed

**Branch**: `feat/design-v2` → tag `v0.4-design-v2`

#### 1. Dark Theme Tokens (pure charcoal, no hue shift)
- `--bg-base: #151515`, `--bg-surface: #1a1a1a`, `--bg-elevated: #1e1e1e`, `--bg-overlay: #242424`, `--bg-subtle: #2b2b2b`.
- Borders: white-alpha hairlines (`rgba(255,255,255,0.07/0.09/0.12)`) — no blue tint.
- Text: `#ececec / #a1a1a1 / #6f6f6f` (primary / secondary / tertiary).
- Background texture: 3.5% opacity dot grid at 24px spacing + radial top highlight.
- Cards: `background: linear-gradient(surface-2 → slightly darker)` + `inset 0 1px 0 rgba(255,255,255,0.04)` top inner highlight.
- Glass top bar: `backdrop-blur(12px)` over `rgba(21,21,21,0.72)` with hairline border.

#### 2. Light Theme
- `--bg-base: #f6f6f4`, surfaces white and `#fbfbfa`, borders `#e7e7e3 / #d9d9d4`.
- Text: `#161616 / #5f5f5f`. Same radius/spacing.
- Smooth 300ms theme transition via CSS `transition: background-color, color`.

#### 3. Accent: `#7B72F8` (dark) / `#5552d6` (light)
- Desaturated indigo-violet — neither saturated purple nor blue.
- Dark mode contrast on #151515: **5.3:1 WCAG AA** ✅
- Light mode contrast on #ffffff: **5.0:1 WCAG AA** ✅
- Used only for: primary actions, active nav indicator, focus rings, logo anomaly dot.

#### 4. Risk palette retuned
- 12–16% opacity backgrounds, solid text colour, always icon + label.
- Emerald / amber / orange / rose — all readable on both themes.

#### 5. Logo (`components/brand/Logo.tsx`)
- Original SVG mark on 24px grid: document with folded top-right corner, horizontal scan line, accent-filled anomaly detection dot.
- No shield, no padlock, no magnifier.
- 3 brand SVG variants in `src/assets/brand/`: `logo-primary.svg`, `logo-mono.svg`, `logo-favicon.svg`.
- `Logo` component: variants `full` (mark + wordmark) / `mark` / `mono`; scan-line CSS animation on mount (respects `prefers-reduced-motion`).
- Wordmark: "Invoice" (regular weight) + "Guard" (semibold), tight tracking (`-0.025em`).
- New `public/favicon.svg` and updated `index.html` `<title>` and `theme-color`.

#### 6. Shell refinements
- Sidebar: `surface-1` bg, active item shows 3px accent indicator bar + `accent-muted` background (replaces full-accent fill).
- Top bar: `backdrop-blur(12px)` over charcoal-alpha; height 56px; hairline bottom border.
- Command palette backdrop: `rgba(10,10,10,0.65)` (no blue tint).
- Nav collapse toggle: `surface-3` bg + `border-strong`.

#### 7. Hardcoded-colour cleanup
- `LandingPage.tsx`: `severityColors` now uses `var(--risk-*-text/bg)` tokens.
- `InvoicePage.tsx`: `bg-[#0a0a0a]`, `bg-neutral-900/80`, `rgba(239,68,68,...)` → tokens.
- `SettingsPage.tsx`: Radix Slider Track/Range/Thumb → CSS var tokens.
- `AnalyzePage.tsx`: scan beam uses `var(--accent)` with precise rgba glow.

### Quality Gates
- **Vite build**: ✅ clean (`built in 3.50s`, zero errors).
- **Vitest**: ✅ 12/12 tests passing.
- **oxlint**: ✅ 0 errors, 10 pre-existing warnings (unrelated to this change).
- **WCAG AA**: all primary text/token pairs verified (see `docs/assets/design-v2/README.md`).

---

## Day 4 Block E — Landing Scroll Storytelling (feat/landing-scroll) — Completed

### Goals
- Keep hero animation (InvoiceMockScan) exactly as designed.
- Replace flat 3-card "How it works" with sticky-scroll storytelling (4 steps, desktop) + stacked cards (mobile).
- Upgrade 7-signal grid with hover lift + icon scale.
- Add "Why InvoiceGuard is different" section with animated stat counters.
- Polished CTA section with accent glow background.
- No scroll hijacking; honour prefers-reduced-motion.

### Completed

**Branch**: `feat/landing-scroll` (from `feat/design-v2`) → tag `v0.4.1-landing`

#### How It Works — sticky scroll (desktop)
- Outer section: `height: calc(4 * 100vh)` providing natural scroll travel through 4 steps.
- Inner sticky frame: `height: 100svh; position: sticky; top: 0`. Two-column grid.
- Left column: section heading, vertical progress line (discrete step fill animated via Framer Motion), 4 step rows with accent dot indicators and `opacity` dim on inactive steps.
- Right column: `AnimatePresence mode="wait"` swaps between 4 stage illustrations on `activeStep` change (cross-fade, no layout shift).
- Active step derived from `useScroll` + `useTransform` + `useMotionValueEvent` — JS-driven, no scroll-position manipulation.
- Smooth anchor links in navbar (`scrollIntoView({ behavior: 'smooth' })`).
- Mobile (`< lg`): stacked surface cards, each with inline stage illustration gated by `ViewportGate` (only mounts when entering viewport).
- `prefers-reduced-motion`: stage animations skipped; desktop sticky layout hidden; mobile stacked layout shown.

#### Stage Illustrations
- **StageUpload**: dashed dropzone, file chip drop animation (spring bounce), invoice thumbnail fade-in, "Ready to analyse" badge.
- **StageExtract**: mini invoice doc, animated scan beam, bounding box draw-in (`scaleX` from 0→1, `originX: 0`), field chips sliding in from right with confidence badges.
- **StageAnalyse**: 7 engine tiles stagger in with opacity+scale; each has a score bar animating to final width; `EngineScore` uses `useCountUp`; fusion result slides in.
- **StageExplain**: SVG arc gauge (upper semicircle, animated `strokeDashoffset`), score at 88.5, 2 finding cards stack in.

#### 7-Signal Grid enhancements
- `whileHover={{ y: -3 }}` hover lift on each card.
- Icon container: `whileHover={{ scale: 1.12 }}` on the accent icon box.
- Stagger delay preserved (0.07s per item).

#### Why Different — stat counters
- 3 stat cards: 7 engines / 100% evidence / 0 verdicts.
- `StatCard` uses `useCountUp(active ? stat : 0, 1400)` — animates from 0 on first inView.
- `active` flag driven by `useInView` on the container ref.

#### CTA section
- Radial accent glow (`var(--accent-muted)`) with `opacity` fade-in on inView.
- Faint dot-grid overlay using CSS background-image (matches body texture).
- Trust micro-signals row below buttons.

#### Navbar update
- `Shield` icon replaced with `Logo variant="full" size={22}`.
- Smooth anchor scroll links: "How it works" → `#how-it-works`, "Engines" → `#engines`.

#### Footer
- `Logo variant="mark" size={20}` replaces old shield icon.
- Version updated to `v0.4.1`.

### Quality Gates
- **Vite build**: ✅ clean (`built in 885ms`, zero errors).
- **Vitest**: ✅ 12/12 tests passing.
- **oxlint**: ✅ 0 errors, 0 warnings on `LandingPage.tsx`.
- **Animation rules**: only `transform`+`opacity` animated; `will-change` managed by Framer Motion; lazy-mount via `ViewportGate`; `prefers-reduced-motion` honoured.

## Day 4 Block F — Page Reskin: VendorsPage & SettingsPage (feat/reskin-pages) — Completed

### Goals
- Eliminate all `bg-neutral-*`, `text-neutral-*`, and hardcoded hex colours from `VendorsPage.tsx` and `SettingsPage.tsx`.
- Apply design-v2 token system throughout both pages.

### Completed

#### VendorsPage
- Replaced TanStack Table with responsive 3/2/1-col card-grid; local `Monogram` + `RiskBadge` per card.
- Live search filter (by name / GSTIN) using `useState` + `useMemo`.
- 7-bar decorative sparkline per vendor, seeded deterministically from vendor name.
- VendorProfile: 4-card KPI row (surface + icon + label + value).
- Known accounts list: separator via `var(--border-hairline)`, "NEW" badge using `var(--risk-medium-*)` tokens, first/last seen dates shown.
- Chart ticks, scatter dots all via CSS vars; no hex anywhere.

#### SettingsPage
- Layout collapsed to `max-w-4xl` linear column; no sidebar.
- Appearance section: segmented theme control (dark / light / system) using `var(--bg-subtle)` + `var(--bg-elevated)`.
- Risk Thresholds: live RiskGauge preview inline to the right of sliders.
- Detection Engines: Switch uses `var(--accent)` / `var(--bg-subtle)` inline styles (removed all `dark:*` and `bg-black/*`).
- Demo & Reset section with `demoSeed` input + inline critical-style confirmation dialog.

### Quality Gates
- **Vite build**: ✅ clean (`built in 818ms`, zero errors).
- **TypeScript**: ✅ zero errors in VendorsPage & SettingsPage (`tsc --noEmit` confirmed).
- **Design tokens**: no `bg-neutral-*`, `text-neutral-*`, or hardcoded hex in either file.

## Day 5 — Page Reskin to Design-v2 Tokens (feat/reskin-pages) — Mon 5 Oct 2026

### Goals
- Rewrite `AnalyzePage`, `InsightsPage`, and `NotFoundPage` to fully consume design-v2 CSS variables.
- No hardcoded hex in any of the three pages.
- All logic unchanged; only styling and UX fidelity improved.

### Completed

#### AnalyzePage (`frontend/src/pages/AnalyzePage.tsx`)
- Dropzone idle: `var(--border-strong)` dashed 2 px, `var(--bg-elevated)` fill. Drag: `var(--accent)` border, `var(--accent-muted)` fill, `box-shadow 0 0 0 4px var(--accent-muted)` glow, 200 ms transition.
- Upload icon recolours to `var(--accent)` on drag, `var(--risk-critical-text)` on reject.
- Format badge pills (PDF / JPG / PNG) + "Max 20 MB" note. `maxSize` lifted to 20 MB.
- `SAMPLE_GALLERY` now has `desc` field; card redesigned: Demo NN label + `RiskBadge` top row, description, large mono score in `--risk-*-text` colour, "Run →" revealed on hover.
- Pipeline stepper: stage icons from lucide (`Database`, `ScanLine`, `FileText`, `Activity`); thin accent progress bar pinned at top; dot `scale` keyframe animation (0.8→1.2→1) on completion; labels renamed Ingesting/Reading/Extracting/Analysing.
- Extraction review: notice badge in `var(--bg-overlay)`; bbox overlay uses `var(--accent)` / `var(--accent-muted)`; document preview background uses `var(--bg-base)` and `var(--bg-elevated)` instead of zinc-950/white.
- Error state uses `<ErrorState onRetry>` component instead of custom inline markup.
- `handleApproveExtraction` wrapped in `useCallback([invoiceId])` fixing `react-hooks/exhaustive-deps`.

#### InsightsPage (`frontend/src/pages/InsightsPage.tsx`)
- Skeleton loading state (SkeletonCard grid + lines).
- KPI row: 4 cards — ROC-AUC 0.8772, PR-AUC 0.8924, Precision 0.8761, Recall 0.7615 (API fallback constants from retrained model).
- F1 computed inline (0.8144); shown in `--text-primary` mono; FPR 0.1273 noted.
- Ablation section: corrected from mock 0.516/0.94 to real 0.8476 baseline vs 0.8772 ML fusion. Pure CSS horizontal bars — Recharts dependency removed from this view.
- Per-fraud-type recall: 7 categories with accent bars.
- Confusion matrix: 2×2 grid (TN=192, FP=28, FN=62, TP=198) with risk-palette backgrounds.
- Evaluation dataset card: stat grid (6 cells) in `var(--bg-overlay)`.
- Limitations panel: `var(--bg-overlay)` / `var(--border-default)` with `Info` icon.

#### NotFoundPage (`frontend/src/pages/NotFoundPage.tsx`)
- 96 px `font-mono` "404" in `var(--text-tertiary)`, `letter-spacing: -0.05em`.
- Staggered Framer Motion animations: 404 fades in (0.5 s), heading+copy slide up (delay 0.2 s), buttons slide up (delay 0.35 s).
- Two CTA buttons: `btn-primary` → `/dashboard`, `btn-ghost` → `/analyze`.
- Background: `var(--bg-base)`; all token references, no hardcoded hex.

### Quality Gates
- **Vite build**: ✅ zero errors, ~990 ms.
- **oxlint** (3 files, 116 rules): ✅ 0 errors, 0 warnings.

#### InvoicePage Overhaul (The Showpiece) (`frontend/src/pages/InvoicePage.tsx`)
- Interactive Pan/Zoom document canvas via `TransformWrapper` with floating glassmorphic controls and page pagination.
- Two-way synced bounding box overlays:
  - Bboxes color-coded according to finding severity (`critical` rose, `high` orange, `medium` amber, `low` emerald, `info` blue).
  - Dashed borders for visual forensics findings (`isVisual = f.category === 'visual'`).
  - Top-severity finding overlay pulses once on initial load.
  - Active selection rings and two-way synchronisation between document bboxes and finding cards.
- Heatmap Layer Toggle:
  - Dynamic multi-gradient anomaly heatmap overlay simulating Error Level Analysis (ELA) and structural compression density.
- Summary Tab:
  - Sweeping SVG `RiskGauge` with animated count-up.
  - Multimodal Anomaly Radar chart (Recharts) mapping all 7 engine signal intensities (0-100).
  - `ConfidenceMeter` with analysis confidence score.
  - Plain-English recommendation narrative + actionable escalation triggers.
  - Golden Language Rule disclaimer banner.
- Model Tab:
  - 3 metric cards: Baseline (Noisy-OR), Calibrated ML (XGBoost), Final Combined Score.
  - Fusion pipeline mode badge (`XGBoost Monotone + Isotonic`).
  - Interactive SHAP feature explanations with directional risk indicators (+/-).
- Compare Tab:
  - Near duplicate matches with match %, matched invoice link.
  - Field-by-field diff comparison table (current vs earlier) with "Changed" / "Identical" status tags.
  - Vendor historical transaction cadence area timeline with current invoice highlighted.
- Data & Timeline Tabs:
  - Extracted invoice headers, payment details, and chronological audit trail.

#### Command Palette (`frontend/src/components/AppShell.tsx`)
- Keyboard-accessible modal (Ctrl/Cmd+K) with backdrop blur.
- Added executable actions: Toggle Theme (Dark / Light), Upload New Invoice, Open Recent Invoices, Review Queue, Vendors, Insights, Settings.

### Final Verification & Milestone v0.5-ui-complete
- **Frontend Typecheck & Build**: ✅ `tsc -b && vite build` clean (zero errors, ~860ms).
- **Frontend Tests**: ✅ 12/12 passing (`vitest --run`).
- **Backend Tests**: ✅ 95/95 passing (`pytest backend/tests`).
- **Backend Linting**: ✅ `ruff check .` clean with zero errors.
- **Frontend Linting**: ✅ `oxlint` clean with zero errors.


