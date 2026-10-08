# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-10-09

### Changed
- **UI Refinements**:
  - `LandingPage`: Upgraded CTA buttons with rounded-full pill shapes, hover animations, and solid background colors.
  - `LandingPage`: Added solid backgrounds and borders to trust micro-signals.
  - `LandingPage`: Increased Logo size in the Navbar and updated background to base color.
  - `globals.css`: Adjusted accent variables (`--accent`) to use charcoal tones (`#222222`) instead of violet, enhancing the professional look.

## [0.5.1] - 2026-10-06

### Changed
- **UI Refinements & Styling**:
  - Unified accent colors across settings, navigation, and badges to use `var(--sidebar-bg)`.
  - Removed "Appearance" section from Settings (now managed centrally).
  - Standardized "Dashboard" style partition boxes (rounded-24px, `#EAE5DB` background) across `InsightsPage`, `InvoicePage`, and `AnalyzePage`.
  - Adjusted RiskGauge and ConfidenceMeter background tracks to slightly darker transparent overlays for better visibility.
  - Set RadarChart web grid color to `var(--sidebar-bg)` with 0.25 opacity.
- **Backend Data Sync**:
  - `DashboardPage`: "Needs Review" and "Value at Risk" now pull live data from the backend instead of using hardcoded fallbacks.
  - Dynamic content updates applied for trend deltas on the dashboard.

## [0.5.0] - 2026-10-05

### Added / Changed
- **InvoicePage Overhaul (The Showpiece)** (`feat/reskin-pages`):
  - Zoom & Pan interactive document canvas (`react-zoom-pan-pinch`) with reset, zoom in/out, and page pagination.
  - Two-way synced bounding box overlays: severity color-coded (critical rose, high orange, medium amber, low emerald, info blue), dashed outlines for visual findings.
  - Heatmap layer toggle: rendered multi-gradient ELA & structural anomaly heatmap overlay.
  - Top finding initial entrance pulse animation for instant reviewer focus.
  - Two-way click synchronization between finding cards and document bounding boxes.
  - Summary Tab: sweeps `RiskGauge`, new Recharts Multimodal Anomaly Radar chart (7 engines), `ConfidenceMeter`, plain-English recommendation narrative, and active escalation triggers.
  - Model Tab: 3-metric score card (Baseline Noisy-OR, Calibrated ML, Final Risk Score), Fusion Pipeline mode badge, and directional SHAP feature contribution bars.
  - Compare Tab: Best matching earlier invoice diff table (Invoice #, Grand Total, Remittance) with modification badges, and vendor transaction cadence area timeline.
  - Data Tab: Extracted headers, payment details, and line items.
  - Timeline Tab: Chronological audit trail with lifecycle milestones.
- **Command Palette (`AppShell.tsx`)**:
  - Full keyboard-accessible command palette (Ctrl/Cmd+K) with live search.
  - Added executable quick actions: Toggle Theme (Dark / Light), Upload New Invoice, Open Recent Invoices, Review Queue, Vendors, Insights, Settings.
- **Backend Quality & Contract Integrity**:
  - `POST /api/v1/invoices/{id}/analyze` returns full `risk_result` contract directly for callers/tests while supporting `async_mode` background processing.
  - `POST /api/v1/demo/seed` supports `seed_invoices` parameter to prevent self-duplicate collision during unit/golden test execution.
  - 95/95 pytest unit/integration/golden tests passing; 12/12 vitest frontend tests passing.
  - Frontend TypeScript build clean (`tsc -b && vite build` in <900ms).

## [0.4.3] - 2026-10-05

### Changed
- **VendorsPage** (`feat/reskin-pages`):
  - VendorList: replaced TanStack Table with a responsive card-grid (3 cols lg / 2 md / 1 sm). Each card shows `Monogram` avatar + `RiskBadge`, font-mono GSTIN, stats row, and a 7-bar decorative sparkline seeded from vendor name.
  - Live search filter above the grid (filters by name or GSTIN).
  - Page title changed to "Vendors" with subtitle.
  - `Monogram` component extracted locally (mirrors `DashboardPage` pattern, HSL-based, no hex).
  - Removed all `divide-neutral-*`, `hover:bg-neutral-*`, `bg-neutral-*` classes; borders use `var(--border-hairline)`.
  - VendorProfile: 4-card KPI row added (Invoice Count / Total Volume / Avg Risk Score / Known Accounts) using `.surface` + icon + label + value pattern.
  - Known accounts list: replaced `bg-orange-500 text-white` "NEW" badge with `var(--risk-medium-bg/text/border)` tokens; added first_seen / last_seen dates; separator uses `var(--border-hairline)`.
  - Chart axis ticks now use `var(--text-tertiary)` via `fill` prop; normal scatter dots use `var(--accent)` instead of `var(--text-primary)`.
  - `Building2` unused import removed.
- **SettingsPage** (`feat/reskin-pages`):
  - Layout changed to `max-w-4xl mx-auto space-y-6` (linear column, no sidebar).
  - Reorganised into 4 section cards: Appearance · Risk Thresholds · Detection Engines · Demo & Reset.
  - Theme control replaced with segmented control (Moon / Sun / Monitor icons) using `var(--bg-subtle)` track, `var(--bg-elevated)` active pill — no Tailwind `bg-*` classes.
  - Risk Thresholds section: live RiskGauge preview placed inline to the right of the sliders via 2-col grid.
  - Detection Engine switches: removed `bg-black/30 dark:bg-white/10 dark:bg-accent`; switched to inline `var(--accent)` / `var(--bg-subtle)` styles.
  - Demo & Reset section: `demoSeed` input + inline confirmation dialog for "Reset demo data" using `var(--risk-critical-*)` tokens.
  - Renamed reset handler to `handleResetDefaults`; added `handleResetDemoData`.
  - All `bg-subtle`, hardcoded neutral, and opacity-based colour references replaced with CSS vars.

## [0.4.2] - 2026-10-05

### Changed
- **AnalyzePage** (`feat/reskin-pages`):
  - Dropzone redesigned: `var(--border-strong)` dashed border, `var(--bg-elevated)` idle fill, `var(--accent-muted)` drag-over glow (`box-shadow 0 0 0 4px`), 200 ms transition. Upload icon colour changes to accent on drag.
  - Format badge row (PDF / JPG / PNG pills) + "Max 20 MB" note added; maxSize lifted from 15 MB to 20 MB.
  - `SAMPLE_GALLERY` extended with `desc` field; cards rewritten with top-row label/badge, description, large mono score in risk colour, hover "Run →" arrow.
  - Pipeline stepper: per-stage lucide icons (`Database`, `ScanLine`, `FileText`, `Activity`); thin accent progress bar at absolute top; dot animates `scale(0.8→1.2→1)` on completion; stage labels renamed "Ingesting / Reading / Extracting / Analysing".
  - Extraction-review: document preview uses `var(--bg-base)` / `var(--bg-elevated)` (no hardcoded colours); bbox overlay uses `var(--accent)` / `var(--accent-muted)`; disclaimer notice added inside review pane.
  - Error state replaced with `<ErrorState onRetry>` component.
  - `handleApproveExtraction` wrapped in `useCallback([invoiceId])` to fix exhaustive-deps warning.
  - All `hover:bg-neutral-*` / `bg-neutral-*` / hardcoded hex removed.
- **InsightsPage** (`feat/reskin-pages`):
  - Skeleton loading state replaces plain text spinner.
  - KPI row updated: ROC-AUC 87, PR-AUC 89, Precision 88, Recall 76 (from real retrained model; API fallbacks 0.8772 / 0.8924).
  - Ablation bars corrected: baseline 0.8476 → ML fusion 0.8772 (horizontal CSS bars, no Recharts dependency).
  - Per-fraud-type recall section added (7 categories, horizontal accent bars).
  - Confusion matrix 2×2 grid: TN=192, FP=28, FN=62, TP=198 with risk-palette cell colours.
  - Evaluation dataset card: 4,400 docs · 45 vendors · 5 templates · seed 42 · 80/20 split.
  - Limitations panel with `Info` icon; uses `var(--bg-overlay)` / `var(--border-default)`.
- **NotFoundPage** (`feat/reskin-pages`):
  - Complete rewrite: 96 px monospace "404", staggered fade/slide-up animation (reduced-motion safe), two CTA buttons (`btn-primary` → `/dashboard`, `btn-ghost` → `/analyze`).

### Quality gates
- `vite build`: ✅ zero errors, built in ~990 ms.
- `oxlint`: ✅ 0 errors, 0 warnings across all three pages.

## [0.4.1] - 2026-10-04

### Added
- **Landing scroll storytelling** (`src/pages/LandingPage.tsx`):
  - "How It Works" replaced with a 4-step sticky-scroll section (desktop) and stacked inView cards (mobile).
  - Desktop: `height: calc(4 * 100vh)` scroll container, `100svh` sticky inner frame, two-column layout (steps + stage).
  - Vertical progress line fills discretely to the active step.
  - **StageUpload**: dashed dropzone, spring-animated file chip, invoice thumbnail fade-in, success badge.
  - **StageExtract**: scan beam sweeps, bounding boxes draw in with `scaleX` animation, field confidence chips slide in.
  - **StageAnalyse**: 7 engine tiles stagger in with score bars and `useCountUp` values; XGBoost fusion result.
  - **StageExplain**: SVG arc gauge (animated `strokeDashoffset`), 2 finding cards stacking in.
  - `ViewportGate` wrapper: lazily mounts heavy stage SVGs only when they enter the viewport.
  - `AnimatePresence mode="wait"` cross-fades between stages on step change.
  - `prefers-reduced-motion`: all stage animations disabled; static final states shown; desktop sticky scroll replaced with mobile stacked layout.
  - Smooth anchor navigation links in navbar (`#how-it-works`, `#engines`).
- **"Why InvoiceGuard is different"** section: 3 stat cards (7 engines / 100% evidence / 0 verdicts) with `useCountUp` animated on first inView.
- **CTA section**: accent radial glow + dot-grid background, trust micro-signals.

### Changed
- **7-signal grid**: `whileHover={{ y: -3 }}` lift + icon `scale: 1.12` on each card.
- **Navbar**: `Shield` icon → `Logo variant="full" size={22}` (new brand component).
- **Footer**: `Shield` icon → `Logo variant="mark" size={20}`; version `v0.4.1`.
- **Hero animation**: preserved exactly; only `Shield` eyebrow icon updated to `ShieldCheck`.

## [0.4.0] - 2026-10-04

### Added
- **New Logo & Brand Mark** (`components/brand/Logo.tsx`):
  - Original SVG mark on a 24px grid: document with folded top-right corner, horizontal scan line, accent-coloured anomaly dot. No shield, no padlock, no magnifier.
  - Three brand SVG variants in `src/assets/brand/`: `logo-primary.svg`, `logo-mono.svg`, `logo-favicon.svg`.
  - `Logo` component with `full` / `mark` / `mono` variants and optional scan-line animation (CSS keyframe, respects `prefers-reduced-motion`).
  - New `public/favicon.svg` using the optimised favicon mark; updated `index.html` `<title>` and `theme-color`.
- **Design System v2 Tokens** (`src/styles/globals.css`):
  - Dark theme: pure charcoal base (`#151515` / `#1a1a1a` / `#1e1e1e` / `#242424` / `#2b2b2b`). Zero hue shift toward blue in any neutral.
  - Borders: white-alpha hairlines (`rgba(255,255,255,0.07/0.09/0.12)`).
  - Text: `#ececec / #a1a1a1 / #6f6f6f` (primary / secondary / tertiary).
  - Light theme: `#f6f6f4` base, surfaces `#fbfbfa` and `#ffffff`, borders `#e7e7e3`.
  - Accent: `#7B72F8` (dark, 5.3:1 WCAG AA) / `#5552d6` (light, 5.0:1 WCAG AA) — desaturated indigo-violet.
  - Risk palette retuned: 12–16% opacity fills, solid text, emerald/amber/orange/rose.
  - Background texture: 3.5% dot grid at 24px + radial top highlight.
  - Card depth: linear-gradient surface-2→darker + `inset 0 1px 0 rgba(255,255,255,0.04)` inner highlight.
  - Glass top bar: `backdrop-blur(12px)` over `rgba(21,21,21,0.72)` with hairline border.
  - Smooth 300ms theme transition. Chart grid/axis tokens. `--inner-highlight` token.
  - `.nav-item-active` CSS: 3px accent indicator bar + `accent-muted` background.
  - `.input-base`, `.badge` utility classes.

### Changed
- **AppShell** (`components/AppShell.tsx`):
  - Replaced `Shield` icon with `Logo` component (collapsed: mark-only, expanded: full wordmark).
  - Sidebar active nav item: accent indicator bar + `accent-muted` bg with `layoutId` animation (replaces full-accent fill).
  - Top bar height 56px (was 64px); more refined search trigger with themed `esc` kbd.
  - Command palette backdrop: `rgba(10,10,10,0.65)` — no blue tint.
- **Page hardcoded colours eliminated**:
  - `LandingPage.tsx`: `severityColors` hardcoded hex → `var(--risk-*-text/bg)` tokens; radial gradient → `var(--accent-muted)`.
  - `InvoicePage.tsx`: `bg-[#0a0a0a]`, `bg-neutral-900/80`, `rgba(239,68,68,...)` → CSS var tokens.
  - `SettingsPage.tsx`: Radix Slider Track/Range/Thumb → `var(--bg-subtle)`, `var(--risk-*-text)`, `var(--text-primary)`.
  - `AnalyzePage.tsx`: scan beam `bg-accent/80 shadow-[0_0_15px_rgba(var(--accent-rgb)...)]` (broken) → explicit `style={{ background: 'var(--accent)', boxShadow: '...' }}`.

## [0.3.2] - 2026-10-04

### Fixed
- **Model Quality & Genuine Invoice Discrimination (ADR 006 & ADR 009)**:
  - Eliminated false positive grand total calculation errors on genuine synthetic invoices by correcting `tax_rate` normalization in `ml/common.py`.
  - Fixed Indian amount words parser in `financial.py` to properly partition rupees and paise tokens.
  - Resolved premature bank account recording in `pipeline.py`, ensuring new remittances trigger `BANK_ACCOUNT_CHANGED` correctly during analysis.
  - Linked `pdf_path` and `page_images` in `AnalysisContext` so `VisualEngine` runs forensic structure checks on uploaded invoices.
  - Fixed PyMuPDF structural redaction in `apply_pdf_edit_structural` without in-memory incremental write crashes.
  - Normalized string casing across `DuplicateEngine` exact field checks.
  - Introduced informational findings tier in `fusion.yaml` and `fusion.py` to decouple cold-start baseline notices from risk scores.
- **Model Retraining & Evaluation Realism**:
  - Scaled dataset to 4,400 synthetic documents across 45 business entities and 5 templates.
  - Retrained monotonically constrained XGBoost fusion model with 5-fold isotonic calibration and hyperparameter cross-validation search.
  - Achieved **0.8772 ROC-AUC** and **0.8924 PR-AUC** on the held-out test split, reducing genuine FPR from 1.000 to **0.1273** (meets target <= 0.15).
  - All 8 canonical hero demo samples verified passing within their exact expected risk bands via `scripts/verify_e2e.py`.

## [0.3.0] - 2026-10-03

### Added
- **Frontend Architecture & Design System (Blueprint §14)**:
  - React 18 + Vite + TypeScript strict mode with Tailwind CSS v4 and Radix UI / shadcn foundations.
  - Complete dark/light theming with security-ops design aesthetic, custom CSS tokens, and glassmorphism.
  - Variable font integration (`@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`).
  - Swappable API layer with automatic offline mock fallbacks and typed OpenAPI contracts.
- **Pages & User Workflows**:
  - `LandingPage`: Product presentation, animated invoice scan hero, feature grid, and live demo quick-launch.
  - `AnalyzePage`: Drag-and-drop file upload, SSE pipeline visual stepper, 8 curated demo hero samples, and split-pane human-in-the-loop extraction review.
  - `InvoicePage`: Full showpiece invoice analysis view with `react-zoom-pan-pinch` document viewer, interactive normalized bounding box overlays (`[0, 1]`), synchronized finding highlight cards, SVG radial risk gauge, signal breakdown bars, SHAP feature contributors, and reviewer actions.
  - `DashboardPage`: Overview analytics with animated KPI counters, Recharts risk distribution donut, 30-day anomaly trend area chart, top category bars, and quick dropzone.
  - `HistoryPage`: TanStack Table with multi-column sorting, search, risk badge indicators, and detail navigation.
  - `ReviewPage`: Keyboard-driven review queue (`j`/`k`/`c`/`f`/`a`/`Enter`) with quick decision logging.
  - `VendorsPage`: Vendor registry with MAD band timeline chart, known account tracking, and outlier flagging.
  - `ComparePage`: Side-by-side duplicate and anomaly diff comparison with currency deltas.
  - `InsightsPage`: Live ML evaluation metrics, ROC/PR AUC cards, and baseline vs fusion ablation bar charts.
  - `SettingsPage`: Interactive engine toggles, sensitivity sliders, and live risk threshold preview.
  - `NotFoundPage`: Custom 404 page with return routing.
- **Testing, Quality & Tooling**:
  - Vitest test suite for bounding box maths, currency formatting, and level mapping (12/12 passing).
  - Clean TypeScript compilation (`npx tsc --noEmit` clean).
  - Integrated dev runners (`scripts/dev.ps1`, `scripts/dev.sh`, root `npm run dev`) launching frontend and backend concurrently.
  - Updated GitHub Actions CI workflow with frontend lint, typecheck, unit tests, and production build.

## [0.2.0] - 2026-10-03

### Added
- **Engine Framework & Settings (Blueprint §7 & §8)**:
  - BaseEngine abstract class with normalized `[0, 1]` bounding boxes and uniform `Finding` schema.
  - Hierarchical settings system (`config/settings.yaml`, `config/tax_slabs.yaml`, `config/pdf_editors.yaml`, `config/fusion.yaml`).
  - Date-aware statutory Indian GST 2.0 (CBIC, Sept 2025: 0%, 5%, 18%, 40%) vs GST 1.0 slab validation (ADR 005).
- **Rule Engines**:
  - `financial.py`: Line totals, subtotal parity, grand total decomposition, amount-in-words reconciliation, rounding anomalies.
  - `tax_identity.py`: Mod-36 GSTIN checksum, jurisdiction states, PAN matching, CGST+SGST vs IGST validation, IFSC/account formatting.
  - `identifiers.py`: Invoice number reuse, regex format deviation, sequence regression/jumps, future/stale dates, submission intervals.
- **Statistical & ML Engines**:
  - `duplicate.py`: Exact SHA-256 match, perceptual pHash (dHash/average hash) with Hamming distance <= 10, canonical field match, fuzzy similarity.
  - `vendor.py`: Historical spending profiling (MAD/median), frequency bursts, lookalike vendor typosquatting, cross-vendor shared bank accounts.
  - `bank.py`: First-seen bank account detection per vendor, account structure validation, SHA-256 + last-4 storage.
  - `visual/forensics.py`: PDF metadata revision count anomaly, multiple `%%EOF` markers, incremental update tampering, font mixing inconsistency, cover-up rectangle detection, ELA heatmap generation.
- **Risk Fusion System (Blueprint §9)**:
  - `feature_builder.py`: 31-feature vector (7 scores + 7 confidences + 17 engineered) for XGBoost input.
  - `xgb_model.py`: Lazy-loading XGBoost + isotonic calibration wrapper with `FUSION_MODE=baseline` env override and fallback.
  - `shap_explain.py`: SHAP TreeExplainer returning top-N ordered contributors with direction labels.
  - `thresholds.py`: `score_to_level()` (LOW/MEDIUM/HIGH/CRITICAL), `apply_escalations()` (multi-signal floor 65 + critical anomaly floor 75), `compute_confidence_band()` (geometric mean → HIGH/MEDIUM/LOW).
  - `fusion.py`: Complete orchestrator (noisy-OR baseline + XGBoost blend + escalations + SHAP + narrative).
  - `explain/narrative.py`: Plain-English narrative builder, top-5 key risk indicators, escalation notices, 16-entry hint lookup table for "what would lower the risk".
  - `explain/recommendations.py`: Per-level recommendation text and structured action objects for frontend review workflow.
- **Complete Frozen API Surface (Blueprint §10)**:
  - `POST /api/v1/invoices/upload`: Multipart upload with validation.
  - `GET /api/v1/invoices/{id}/events`: Real-time Server-Sent Events (SSE) progress streaming.
  - `GET/PUT /api/v1/invoices/{id}/extraction`: Field retrieval and human-in-the-loop field edits.
  - `POST /api/v1/invoices/{id}/analyze`: Analysis execution trigger.
  - `GET /api/v1/invoices/{id}`: Complete analysis results with findings, evidence, SHAP, and recommendations.
  - `GET /api/v1/invoices`: History search, status/risk filters, pagination.
  - `GET /api/v1/invoices/{id}/pages/{n}.png`: Rendered page images.
  - `GET /api/v1/invoices/{id}/thumb`: Document thumbnail.
  - `GET /api/v1/invoices/{id}/compare/{other_id}`: Side-by-side duplicate comparison.
  - `PATCH /api/v1/invoices/{id}/review`: Human reviewer sign-off (`approved`/`rejected`/`needs_info`).
  - `GET /api/v1/invoices/{id}/audit`: Full immutable audit trail.
  - `GET /api/v1/invoices/{id}/report.pdf`: Audit report export.
  - `GET /api/v1/dashboard/stats`: Summary statistics and high-risk feed.
  - `GET /api/v1/models` & `GET /api/v1/models/metrics`: Engine inventory and evaluation metrics.
  - `GET/PUT /api/v1/settings`: Live system configuration.
  - `GET /api/v1/vendors` & `GET /api/v1/vendors/{id}`: Vendor catalog and risk profiles.
  - `POST /api/v1/demo/seed`, `POST /api/v1/demo/reset`, `GET /api/v1/demo/samples`: Demo utilities.
- **Contract Freeze & Documentation**:
  - `docs/openapi.json`: OpenAPI 3.1.0 schema generated via `scripts/export_openapi.py`.
  - `frontend-mocks/`: Decoupled JSON fixtures for all endpoints including hero and clean analysis results.
  - `docs/API.md`: Comprehensive API reference with SSE contract caveats.
  - `docs/MODEL_CARD.md`: Full model card with inputs, constraints, evaluation, and limitations.
  - `docs/EVALUATION.md` & `reports/metrics.json`: End-to-end evaluation metrics on held-out test split.
  - `docs/DECISIONS.md`: Added ADRs 006, 007, 008.


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
