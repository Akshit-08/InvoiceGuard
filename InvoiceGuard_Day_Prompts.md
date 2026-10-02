# InvoiceGuard — 4-Day Build Prompts

Hand these to your coding AI (Claude Code, Cursor, Antigravity, etc.), one day at a time.

- **Day 1:** Fri 2 Oct (today). Foundation, data engine, document intelligence.
- **Day 2:** Sat 3 Oct. Detection engines, risk fusion, API.
- **Day 3:** Sun 4 Oct. The full product UI.
- **Day 4:** Mon 5 Oct. Integration, polish, docs, deploy, ship.

---

## Before you start (your checklist, about 20 minutes)

1. Install or confirm: Git, Python 3.11, Node 20+, VS Code. Docker is optional.
2. GitHub: have an account and install the GitHub CLI (`gh`), then run `gh auth login`.
3. Hugging Face: make an account and create a **write** token (needed to store the LayoutLMv3 weights).
4. Google Colab: open it once so the free GPU is ready for the parallel LayoutLMv3 training.
5. Collect 5–10 real invoices (PDF or photo) with personal data redacted. They are for testing only and must **not** be committed.
6. Make a folder `InvoiceGuard/` and drop in `InvoiceGuard_Blueprint.md` and `InvoiceGuard_Project_Plan.md`.
7. Tell the AI your OS (Windows, Mac or Linux), because the dev scripts differ.

**End-of-day ritual:**
- Ask the AI for its "Day N handoff report".
- Run the app yourself.
- Check that CI is green on GitHub.
- Confirm the day's tag is pushed.

If the AI runs behind, use the **cut-line** listed in each prompt rather than letting the day slip.

---

## Colab track (run in parallel on Day 1; it costs you about 10 minutes of attention)

Give this to the AI in a separate chat, or run it yourself in Colab.

````text
Create a Google Colab-ready notebook at ml/layoutlm/train_layoutlmv3_invoices.ipynb that fine-tunes LayoutLMv3 for invoice key-information extraction (token classification).

Dataset:
- Find the Hugging Face dataset of invoices with words, bboxes, ner_tags and images. It has roughly 2,043 train / 70 validation / 125 test examples. Search the Hub for "layoutlmv3 invoices" and verify the exact id, license, and label list before using it.
- If it cannot be found, use an alternative such as a CORD/SROIE/invoice NER dataset and say so clearly in the notebook.

Requirements:
1. Install transformers, datasets, seqeval, accelerate, evaluate. Use a T4 GPU with fp16.
2. Load the dataset. Print the label list and class balance.
3. Use LayoutLMv3Processor with apply_ocr=False. Normalize boxes to 0–1000. Align labels to word pieces (label the first sub-token, mask the rest with -100). Truncate and stride long documents.
4. Fine-tune microsoft/layoutlmv3-base: lr 3e-5 (try 1e-5..5e-5), batch 4 with grad accumulation 2, 10–15 epochs, warmup 10%, eval each epoch, keep the best checkpoint by seqeval F1.
5. Report entity-level precision, recall and F1 on the test set, plus per-label F1 in a table. Save a confusion/label-wise bar chart.
6. Push the best model and processor to the Hugging Face Hub as a PRIVATE repo, using a token from Colab secrets (never hardcode it). Write a model card with dataset, metrics and limitations.
7. Add a "label_map.json" that maps the dataset labels to the InvoiceGuard schema (invoice_number, invoice_date, due_date, seller, client, seller_tax_id, client_tax_id, iban, item_desc, item_qty, item_net_price, item_net_worth, item_vat, item_gross_worth, subtotal, total_vat, total_gross_worth, currency, discount, shipping, payment_terms). Mark unmapped ones.
8. Add an inference cell: given an image, a list of words and normalized boxes, return grouped field predictions with confidences.
9. Also write ml/layoutlm/README.md explaining how backend/app/services/extraction/layoutlm.py should load the model (HF repo id from env LAYOUTLM_MODEL_ID, optional token HF_TOKEN) and how to run inference on CPU.

Commit the notebook and README on a branch feat/layoutlm-notebook and push it.
````

---

## DAY 1 — Foundation, Synthetic Data Engine, Document Intelligence

````text
You are the lead engineer building "InvoiceGuard", an explainable multimodal invoice anomaly and fraud-risk detection web app. Treat this as a portfolio-grade product, not a college demo.

READ FIRST: ./InvoiceGuard_Blueprint.md (source of truth, wins over the original plan) and ./InvoiceGuard_Project_Plan.md (original plan, for context). Read both fully before writing code.

Operating system: <TELL ME: Windows/Mac/Linux>. Keep every command and script cross-platform (provide both .sh and .ps1 where needed).

DAY 1 GOAL: By the end of today we have a clean GitHub repo, a running FastAPI backend skeleton, a deterministic synthetic invoice/fraud data engine with ground truth, and a document pipeline that turns a PDF/image into validated structured InvoiceData with bounding boxes, with measured extraction accuracy.

WORK IN THIS ORDER. After each numbered block, run tests, commit with Conventional Commits, and continue.

1. REPO + GITHUB
- Create the repo layout from Blueprint section 5 in a folder named InvoiceGuard. Run git init with default branch main.
- Move the two plan files into docs/ (docs/BLUEPRINT.md and docs/original-plan.md).
- Create AGENTS.md (and an identical CLAUDE.md) containing: project summary, run commands, the engineering and git rules from Blueprint section 16 and 17, the language rule ("risk indicators, never fraud verdicts"), and the instruction "read docs/BLUEPRINT.md and docs/PROGRESS.md at the start of every session; update PROGRESS.md and CHANGELOG.md at the end".
- Create .gitignore (python, node, .env, data/uploads, data/raw, large model files, .venv, __pycache__, dist, coverage), .env.example, LICENSE (MIT), README.md skeleton (title, one-liner, planned features, setup placeholders), CHANGELOG.md, docs/PROGRESS.md, docs/DECISIONS.md.
- Create the GitHub repo: if `gh auth status` works, run `gh repo create InvoiceGuard --private --source=. --remote=origin --push` (ask me before choosing public vs private if unsure). If gh is unavailable, STOP and ask me for an empty repo URL, then add it as origin.
- First commit: "chore: initial project scaffold". Push main. Then create branch feat/day1-foundation and work there.
- Add .github/workflows/ci.yml: Python job (setup 3.11, pip install, ruff check, pytest) and a Node job placeholder that activates once frontend exists. Add a Makefile or scripts/dev.sh + scripts/dev.ps1 (start backend; frontend later).

2. BACKEND SKELETON (backend/)
- FastAPI app with app factory, config via pydantic-settings (.env), structured logging with request-id middleware, CORS from env, uniform error format {error:{code,message,details}}, GET /api/v1/health returning versions and which optional models are available.
- SQLAlchemy 2.0 models for every table in Blueprint section 13. SQLite default (data/invoiceguard.db), URL configurable so PostgreSQL works. create_all on startup is fine; no Alembic needed.
- Pydantic v2 schemas for ALL data contracts in Blueprint section 6 (Token, Field[T], InvoiceData, Finding, SignalResult, RiskResult, API response models). Put them in app/schemas. Add docstrings; these become the frozen API contract.
- Dependencies: pyproject/requirements.txt (core) and requirements-ml.txt (torch, transformers, optional). Core: fastapi, uvicorn, sqlalchemy, pydantic-settings, python-multipart, sse-starlette, pymupdf, pillow, opencv-python-headless, numpy, pandas, scikit-learn, xgboost, shap, rapidfuzz, imagehash, fastembed, rapidocr-onnxruntime (verify package names on PyPI and pick working versions; pin them), reportlab, num2words, faker, pytest, httpx, ruff. If a package fails to install on this OS, tell me and propose the fallback from the Blueprint risk register.

3. SYNTHETIC DATA ENGINE (ml/synthetic/) — follow Blueprint section 10 exactly
- Vendor simulator with valid GSTINs (implement the real checksum), PAN, IFSC, accounts, log-normal amounts, cadence, numbering patterns, categories; 40+ vendors with 12–40 historical invoices each, output to data/synthetic/vendor_history.csv.
- At least 5 invoice templates rendered with ReportLab (bundle OFL-licensed fonts such as Inter/Roboto/Lato in ml/synthetic/fonts with their licenses). Record the exact bbox of every field and table cell, normalised to 0–1. Support Indian number formatting (1,00,000.00), ₹ symbol, amount-in-words, CGST/SGST vs IGST by state.
- Scan simulation (rotation, noise, blur, JPEG, shadow) as an optional post-process producing PNG/JPG.
- Tamper operator registry with all operators and the three modes (re-render, pixel-edit, pdf-edit) from the Blueprint. Each operator returns the new document, the label(s) and affected fields/bboxes.
- CLI: `python scripts/generate_data.py --seed 42 --genuine 300 --tampered 300 --visual-pairs 200 --out data/synthetic`. Produces PDFs/PNGs, gt/{id}.json, manifest.csv with train/val/test split by vendor and template. Deterministic and under 10 minutes.
- Commit only the generator and a small fixture set (about 12 docs) under backend/tests/fixtures; the bulk output is gitignored.
- Build the hero demo set (Blueprint section 10) in scripts/seed_demo.py now as a data generator (documents + expected score bands in data/samples/expected.json). The DB loading part comes tomorrow.

4. DOCUMENT PIPELINE (backend/app/services/)
- ingest: validation (extension, magic bytes, size, pages), safe storage under data/uploads/{uuid}/, SHA-256, PyMuPDF rendering at 200 DPI (cap 2400px) plus thumbnails, image normalisation and light deskew.
- reading: PDF text-layer reader (words with bboxes) and RapidOCR reader for scans; one Reader interface; automatic selection; token list output.
- extraction: HeuristicExtractor per Blueprint 7 (anchors, regex, table parser with column clustering by x-position, header/party detection, amount in words, bank block) and a Normalizer (Indian numerals, dates, currency, identifiers). Implement an Extractor chain interface with stubs for LayoutLMv3Extractor and LLMExtractor that are disabled unless configured. Every extracted value carries conf, source and bbox.
- extraction report: per-field confidence, missing critical fields, needs_manual_verification flag.
- Expose temporary endpoints POST /api/v1/invoices/upload and GET /api/v1/invoices/{id}/extraction (full upload/analyze flow comes tomorrow).

5. EXTRACTION EVALUATION
- ml/evaluation/extraction_eval.py: run the pipeline on the synthetic TEST split (both PDF text-layer path and the scan-simulated OCR path), compute field-level exact-match precision/recall/F1 after normalisation, per field and per template, and write reports/extraction_metrics.json plus a markdown table.
- Target: >= 0.95 F1 on critical fields (invoice_number, date, vendor, GSTIN, subtotal, tax, grand_total) for text-layer PDFs; >= 0.85 on scans. If lower, iterate the heuristics until reached or document why.

6. TESTS + DOCS + HANDOFF
- Unit tests: normalizer, GSTIN checksum, number/date parsing, table parser, reader selection, generator determinism (same seed gives same manifest), ingest validation (reject .exe renamed to .pdf, oversized files).
- Update README (setup, run, generate data, run tests), docs/PROGRESS.md, CHANGELOG.md, docs/DECISIONS.md.
- Open a PR (or merge --no-ff) feat/day1-foundation into main, ensure CI passes, tag v0.1-day1, push main and tags.

ACCEPTANCE CRITERIA (verify and show me proof)
- Fresh clone: README steps work; `pytest` passes; `uvicorn` starts; /api/v1/health responds.
- `python scripts/generate_data.py` creates the dataset deterministically.
- Uploading a synthetic PDF and a scanned PNG returns structured InvoiceData with bboxes and confidences.
- reports/extraction_metrics.json exists and meets the targets (or the gap is documented).
- GitHub repo has clean history, CI green, tag v0.1-day1.

CUT-LINE if behind: ship 4 templates instead of 5, skip deskew, skip the pdf-edit tamper mode (do it on Day 2), skip the scan-path target of 0.85 (document actual).

FINISH WITH a "Day 1 handoff report": what was built, test results, metrics, decisions made and why, known issues, exact commands I should run to verify, and anything you need from me for Day 2 (for example: my LayoutLM Hugging Face repo id).
````

---

## DAY 2 — Detection Engines, Risk Fusion, Full API

````text
Continue building InvoiceGuard. Day 1 is complete and tagged v0.1-day1.

START BY: reading AGENTS.md, docs/BLUEPRINT.md, docs/PROGRESS.md and the Day 1 handoff notes; pull the latest main; create branch feat/day2-engines. Confirm the test suite is green before changing anything.

DAY 2 GOAL: A complete, tested backend. Upload, extract, review, analyze and fetch results all work. Every engine from Blueprint section 8 exists, fusion produces an explainable 0–100 score, evaluation numbers are generated, the API contract is frozen, and the demo data loads with one command. No frontend work today except exporting mocks.

WORK IN THIS ORDER; commit after each block; keep the tests growing.

1. ENGINE FRAMEWORK
- Define the Engine interface and a shared AnalysisContext (invoice data, tokens, page images, vendor history, settings, indices). Each engine returns SignalResult with findings that follow the Finding schema exactly, including normalised bboxes, expected/found/difference evidence and recommended_action.
- Settings service: thresholds, tolerances, GST slab table (date-aware; verify the current slabs by web search and cite the source in docs/DECISIONS.md; keep legacy slabs with validity dates), engine toggles, PDF-editor producer list. Defaults in config/*.yaml, overridable via the settings table/API.

2. RULES ENGINES (Blueprint 8.1, 8.2, 8.3)
- Implement every listed rule with stable type codes. Write unit tests for each rule with at least one pass and one fail case, including the plan's examples (qty 2 × 15,000 shown as 40,000; GST 18% on 10,000 shown as 2,800; mismatched amount in words). Aim for >= 90% coverage on the rules package.

3. DUPLICATE ENGINE (8.4)
- SHA-256, pHash, exact fields, rapidfuzz on canonical strings, fastembed embeddings with a VectorIndex interface (NumPy cosine; optional faiss). Persist embeddings. Return top-K matches with field-level diffs and a classification (exact / near-duplicate / modified duplicate). Evaluate precision, recall and Recall@K on the synthetic duplicate and near-duplicate sets.

4. VENDOR + BANK ENGINES (8.5, 8.6)
- Per-vendor profile builder (median, MAD, cadence, tax rate, accounts, numbering pattern, item centroid), robust-stat anomalies, Isolation Forest (train a global model on relative features from the synthetic history, save to ml/artifacts with a manifest), cold-start handling, lookalike vendor names, shared GSTIN/bank/address across vendors, bank-change logic with hashed + last-4 storage. Evaluate IF ROC-AUC on injected outliers.

5. IDENTIFIERS / DATES (8.3) and EXTRACTION-CONFIDENCE (8.8)

6. VISUAL FORENSICS (8.7)
- PDF-structure checks with PyMuPDF (metadata, incremental updates, per-span font mixing, cover-up rectangles, hidden text, image-over-text, signatures).
- Pixel-level: ELA, noise-residual variance, stroke/ink/baseline stats per key field region with z-scores against other text regions, optional copy-move check, heatmap PNG generation per page (lazy, cached).
- Cap confidence (<= 0.85), add the caveat text, never critical alone. Evaluate on the 200 visual pairs and the three tamper modes (AUC, confusion matrix) and report honestly.

7. RISK FUSION (Section 9)
- Noisy-OR baseline with weights in config/fusion.yaml; feature builder; XGBoost with monotone constraints and isotonic calibration, trained by ml/training/train_fusion.py on the synthetic dataset by running the REAL pipeline over the rendered documents (use multiprocessing, cache the signal vectors to disk). Split by vendor and template. Save the model + manifest to ml/artifacts (< 10 MB).
- Final score = blend, escalation rules, level thresholds, confidence band, SHAP top contributors, FUSION_MODE=baseline fallback flag.
- Explanation builder: ordered findings by score x confidence, plain-English narrative, "what would lower the risk", recommendation per level, and the standard disclaimer.

8. PIPELINE ORCHESTRATOR + FULL API (Section 12)
- Orchestrate: ingest -> read -> extract (upload step) and engines -> fusion -> explain -> persist (analyze step), executed in a background thread pool. Emit stage events with progress and durations through an SSE bus at GET /invoices/{id}/events (stages: ingest, render, read, extract, rules, duplicate, vendor, bank, forensics, fusion, explain, done).
- Implement ALL endpoints in Blueprint 12 except batch: upload, events, extraction GET/PUT (corrections saved and audited), analyze, full result, page/thumb/heatmap images, history with search/filter/sort/pagination, compare, review PATCH + audit, report.pdf (stub OK today; real tomorrow), vendors list/profile, dashboard stats, models/metrics, settings GET/PUT, demo seed/reset/samples, health.
- Persist everything (invoice, items, tokens, findings, risk_scores, embeddings, audit events). Upload rate limit. Idempotent re-analysis.

9. DEMO SEED
- Finish scripts/seed_demo.py and POST /demo/seed: loads the synthetic vendor history for ~12 vendors into the DB (with embeddings), plus the 8 hero demo documents analysed and stored. Golden test: each hero sample's score falls inside its expected band in data/samples/expected.json; the hero "critical" sample must produce findings for line-item mismatch, total mismatch, bank change, tax-rate deviation, amount outlier (about 3.8x median), near-duplicate, and a visual signal on the total.

10. EVALUATION (Section 11)
- ml/evaluation/run.py runs everything on the held-out test split and writes reports/metrics.json, curve data, confusion matrices, per-fraud-type recall, FPR on genuine invoices, latency p50/p95, and the ablation table; generate docs/EVALUATION.md automatically with an honest Limitations section. Print a one-screen summary.
- Also write docs/MODEL_CARD.md and docs/API.md.

11. CONTRACT FREEZE FOR THE FRONTEND
- scripts/export_openapi.py writes docs/openapi.json. Generate realistic JSON fixtures for every endpoint (including the hero analysis result) into frontend-mocks/ (or docs/mocks/) so the UI can be built against it tomorrow. Document any contract caveats in docs/API.md.

12. WRAP UP
- Tests green, ruff clean, CI green. Update README, PROGRESS.md, CHANGELOG.md, DECISIONS.md. Merge feat/day2-engines into main, tag v0.2-day2, push.

ACCEPTANCE CRITERIA (show me proof)
- Fresh clone, run seed, then upload the hero sample via curl or Swagger: the SSE stream shows each stage; the result JSON contains the score, signal breakdown, findings with bboxes, matches and SHAP contributors.
- Hero sample scores in the Critical/High band; clean sample is Low; the golden test passes.
- reports/metrics.json + docs/EVALUATION.md exist with real numbers and limitations.
- Rules package coverage >= 90%; all tests pass; CI green; tag v0.2-day2 pushed.

CUT-LINE if behind (in this order): copy-move check, ELA heatmap polish, faiss option, SHAP (keep baseline explanations), ablation table. Never cut: rules, duplicate, vendor, bank, PDF-structure forensics, fusion baseline, SSE, seed + golden test, API freeze.

FINISH WITH a "Day 2 handoff report" (what was built, metric highlights, API caveats, known issues, commands to verify). Ask me for my LayoutLM Hugging Face repo id if the Colab model is ready, and wire it in as an optional extractor if so (env LAYOUTLM_MODEL_ID, HF_TOKEN).
````

---

## DAY 3 — The Product UI (animated, polished, complete)

````text
Continue building InvoiceGuard. Backend is complete and tagged v0.2-day2.

START BY: reading AGENTS.md, docs/BLUEPRINT.md (especially Section 14), docs/PROGRESS.md, docs/API.md and docs/openapi.json; pull main; create branch feat/day3-frontend. Start the backend with the demo seeded and confirm the API works.

ALSO read and follow your frontend-design skill or guidance if you have one. The bar is: a design a funded startup would ship. No default-template look. No generic purple-gradient clichés. Restraint, precision, great typography, and excellent motion.

DAY 3 GOAL: The complete frontend from Blueprint Section 14, wired to the real backend, beautiful in dark and light, animated, accessible and responsive.

STACK (fixed): React 18 + Vite + TypeScript strict, Tailwind CSS v4, shadcn/ui (Radix), Framer Motion, TanStack Query + Table, React Router, Recharts, Lucide, cmdk, sonner, react-dropzone, react-zoom-pan-pinch, openapi-typescript (generate types from docs/openapi.json). Fonts via Fontsource: Inter and JetBrains Mono.

WORK IN THIS ORDER; commit after each block; push at least 3 times today.

1. SCAFFOLD + DESIGN SYSTEM
- Create frontend/ with the structure from Blueprint 5. Configure aliases, ESLint, Prettier, strict TS, Vitest. Generate the typed API client; add a thin fetch wrapper with error handling, TanStack Query provider, and an env-based API URL. A VITE_USE_MOCKS=1 flag serves the Day 2 fixtures so work never blocks on the backend.
- Design tokens as CSS variables: dark default (near-black zinc with a very subtle grid/noise background) and a full light theme; theme toggle with a smooth transition and persistence; one restrained accent; the risk palette (low emerald, medium amber, high orange, critical rose) with icon + label (never colour-only); radii, shadows, spacing scale, tabular-nums for all figures, mono for IDs and bank accounts.
- Motion tokens and helpers (durations, spring config, stagger variants, page-transition wrapper, reduced-motion hook). Respect prefers-reduced-motion everywhere.
- Build reusable components: AppShell (collapsible sidebar, top bar with glass blur, search + Ctrl/Cmd+K command palette), PageHeader, KpiCard (animated counter + sparkline), RiskGauge (animated radial sweep, count-up, colour morph), RiskBadge, SeverityChip, ConfidenceMeter, SignalRadar, SignalBars, FindingCard (expandable, expected vs found diff), EmptyState, ErrorState, Skeletons, Disclaimer footer, FileDropzone.

2. LANDING PAGE (/)
- Hero with an animated invoice mock being scanned (pure SVG/CSS/Framer, no stock images): a scan beam sweeps, anomaly boxes draw in with severity colours, a score gauge counts up. Three-step explainer, the 7-signal grid, "Try a sample" and "Upload invoice" CTAs, disclaimer.

3. ANALYZE FLOW (/analyze)
- Large dropzone with drag-over glow, file validation messages, and a sample gallery (the 8 hero samples with their expected risk badges) that runs the sample in one click.
- Pipeline view: document thumbnail with an animated scan beam, vertical stepper driven by the SSE events (stage names from Blueprint 12), live log lines with timestamps, elapsed time, aria-live announcements, error + retry state.
- Extraction review: split view with editable fields (confidence chips, low-confidence highlighted) on one side and the document with field boxes on the other; clicking a field highlights it on the document and vice versa; save corrections (PUT), primary button "Looks good - Analyze", Enter shortcut. Navigate to the result with a smooth transition.

4. INVOICE ANALYSIS PAGE (/invoices/:id) — the showpiece
- Header: invoice number, vendor, date, status chip, review actions (Confirm issue / False positive / Needs review / Approve with optional note and optimistic update), Export PDF, Compare.
- Left (about 60%): interactive InvoiceViewer. Pan/zoom, fit/zoom controls, page switcher, layer toggles (Findings / Extracted fields / Forensic heatmap), legend, overlay boxes positioned from normalised bboxes (draw-in animation, pulsing ring on hover/selection, dashed outline for visual findings), tooltip on hover, click to select. Selection syncs both ways with the findings list (scrollIntoView + highlight). Keyboard: arrows or j/k step through findings.
- Right (about 40%) tabs with animated indicator: Summary (RiskGauge, SignalRadar, SignalBars, confidence band, recommendation card, disclaimer) | Findings (filter chips Rule/Statistical/ML/Visual, sort by severity, staggered list, expandable evidence with expected-vs-found, related-invoice links) | Compare (vendor amount sparkline with median band and the current point, diff vs the best-matching previous invoice with changed values chipped) | Data (extracted fields and line items with confidence, masked bank account) | Model (SHAP contribution bars, baseline vs ML score, escalation rules) | Timeline (stage durations, audit trail).
- Choreography on first load: gauge sweeps, signal bars fill, findings stagger in, the highest-severity overlay pulses once.
- Mobile: stacked layout, finding details in a bottom sheet.

5. DASHBOARD (/dashboard), HISTORY (/history), REVIEW QUEUE (/review)
- Dashboard per Blueprint 14.2 (KPI cards with animated counters, risk-distribution donut, 30-day anomalies area chart, categories bar, top suspicious vendors, recent analyses feed, compact dropzone).
- History: TanStack Table with search, filters (vendor, date range, level, anomaly type, amount range, status), sorting, pagination, URL-synced filters, shared-element (layoutId) transition into the analysis header, CSV export.
- Review queue: inbox sorted by risk, keyboard j/k/c/f/a/Enter, optimistic updates, undo toast.

6. VENDORS, COMPARE, INSIGHTS, SETTINGS
- Vendors list with risk trend sparkline; vendor profile with KPIs, amount timeline (median +/- 2 MAD band, flagged points), known accounts with first/last seen and a "new" badge, tax-rate history, recent invoices, linked-entities card.
- Compare page (/compare/:a/:b): side-by-side fields, changed values chipped amber/red with deltas.
- Model Insights: metric cards, ROC and PR curves from /models/metrics, confusion matrix heatmap, per-fraud-type recall bars, latency, ablation table, an animated "how scoring works" diagram, dataset card, honest limitations.
- Settings: threshold sliders with live preview, tolerances, GST slab table, engine toggles, demo seed/reset, theme.

7. QUALITY PASS (do not skip)
- Every page has loading, empty and error states. Keyboard navigation and focus rings everywhere; ARIA labels for overlays and the pipeline; WCAG AA contrast in both themes; responsive down to 360px; 404 page; no layout shift; no console errors; Lighthouse performance >= 85 and accessibility >= 95 on the landing and analysis pages (lazy-load heavy chart/route chunks).
- Vitest tests for utilities (bbox maths, formatting, filters). If time allows, a Playwright smoke test: open /analyze, run a sample, see the score on the analysis page.
- Add scripts so `npm run dev` + backend run together via the root dev script. Add the frontend job to CI (lint, typecheck, test, build).

8. WRAP UP
- Take screenshots of the key pages (dark and light) into docs/assets/ and record a short GIF of the analysis choreography if possible. Update README (screenshots, run instructions), PROGRESS.md, CHANGELOG.md. Merge feat/day3-frontend into main, tag v0.3-day3, push.

ACCEPTANCE CRITERIA (show me proof)
- With the backend running and the demo seeded: Landing -> Try a sample (hero) -> pipeline animation -> extraction review -> analysis page with highlighted boxes, linked findings, gauge, radar and SHAP tab; marking a review decision updates the history and dashboard.
- All 10 pages in Blueprint 14.2 exist and use real data; dark and light themes both look finished.
- Typecheck, lint, tests and build pass; CI green; tag v0.3-day3 pushed.

CUT-LINE if behind (in this order): Playwright test, mobile bottom sheet polish, compare overlay slider, command palette extras, vendor linked-entities card, landing-page animation polish. Never cut: analysis page, viewer, upload/pipeline/review, dashboard, history, vendor profile, insights.

FINISH WITH a "Day 3 handoff report" listing what's done, what's rough, UI bugs you know about, and a punch-list for Day 4.
````

---

## DAY 4 — Integration, Polish, Docs, Deploy, Ship

````text
Continue building InvoiceGuard. Backend is tagged v0.2-day2 and the frontend v0.3-day3. Today we make it flawless, document it and ship it.

START BY: reading AGENTS.md, docs/BLUEPRINT.md, docs/PROGRESS.md and the Day 3 punch-list; pull main; create branch feat/day4-ship. Run the whole system from a fresh clone to confirm it works before touching anything.

WORK IN THIS ORDER; commit after each block; push often.

1. BUG BASH + EDGE CASES
- Work through the Day 3 punch-list first. Then test with my own invoices in ./my-test-invoices (gitignored; I will drop 5-10 real, redacted PDFs/photos there): digital PDF, phone photo, multi-page, rotated, low-quality scan, non-GST invoice, foreign currency, blank or corrupt file, huge file, wrong type. Every failure should degrade gracefully (clear message, partial results, "verify manually" flag), never a stack trace or a frozen UI.
- Fix extraction misses by improving heuristics. Record any remaining weakness in docs/EVALUATION.md under Limitations.
- False-positive review: run the genuine synthetic set plus my real invoices and list the top 5 false-positive causes. Tune weights/thresholds in config where justified (not by overfitting the test set) and document it.

2. REAL REPORT + EXTRAS
- Implement GET /invoices/{id}/report.pdf with ReportLab: branded cover (score, level, date), invoice snapshot with highlighted regions, extracted fields, signal breakdown chart, findings with evidence (grouped Rule/Statistical/ML/Visual), vendor comparison, confidence, recommendation, disclaimer, audit trail. It must look professional. Wire the Export button in the UI.
- P1 batch upload: POST /batch/upload (multiple files, max 20), progress via polling or SSE, a batch summary page (counts per risk level, sortable table, jump to each invoice) and UI entry on /analyze.
- LayoutLMv3: if my Colab model is ready (LAYOUTLM_MODEL_ID), enable the extractor, compare against the heuristic extractor in the evaluation, and keep whichever merge strategy scores best. Document the numbers. If it is not ready, leave the adapter documented and disabled.

3. UX POLISH PASS
- Review every page for spacing, alignment, typography rhythm, motion timing and consistency in both themes. Add the micro-interactions that were deferred (button press feedback, hover lift, number tick on KPI change, toast variants, skeleton-to-content crossfades). Confirm reduced-motion behaviour. Check dark/light screenshots side by side.
- Add a first-run onboarding hint (dismissible), helpful tooltips on signals ("What does this mean?"), and a "How to read this report" popover on the analysis page.
- Performance: route-level code splitting, image lazy-loading, memoised overlay rendering, API response caching. Target interaction latency under 100 ms and no jank in the viewer.

4. DOCKER + DEPLOYMENT (P1)
- docker/Dockerfile.api, Dockerfile.web (nginx), docker-compose.yml with api + web and an optional Postgres profile. `docker compose up` must work from a clean clone, auto-seeding demo data.
- Deploy: frontend to Vercel (VITE_API_URL), backend to Hugging Face Spaces (Docker) or Render, whichever works with the dependency size. Set CORS and env vars, seed on boot, and note that SQLite is ephemeral there. Never put secrets in the repo; document the variables in .env.example. If deployment is not feasible today, document the exact steps and provide a recorded-demo fallback.

5. DOCUMENTATION (this is part of the grade; make it excellent)
- README.md: hero GIF, one-paragraph pitch, feature list, architecture diagram (Mermaid), screenshot gallery, quick start (local and Docker), demo walkthrough, tech stack, evaluation highlights, project structure, limitations, ethics statement, licence, credits and dataset licences.
- docs/ARCHITECTURE.md (diagrams of pipeline, data flow, DB schema), docs/API.md, docs/MODEL_CARD.md, docs/EVALUATION.md (regenerated), docs/DATASETS.md (sources and licences), docs/DEMO_SCRIPT.md (a 5-minute demo narrative: the hero invoice, the "wow" sequence, and what to say at each step), docs/FUTURE_WORK.md.
- Project-report skeleton in docs/report/ (abstract, introduction, literature/existing systems, problem statement, objectives, methodology, system design, implementation, results and evaluation, limitations, conclusion, future work, references) pre-filled from the repo facts, plus docs/VIVA_QA.md with 30 likely viva questions and strong answers (why rules + ML, why LayoutLMv3, why synthetic data, how score is computed, how false positives are handled, limitations, ethics, scalability).
- A slide outline for the final presentation (docs/PRESENTATION_OUTLINE.md), 10-12 slides.

6. FINAL QA + RELEASE
- Full regression: backend tests, frontend tests, Playwright smoke (if present), evaluation run, fresh-clone install on a clean directory, Docker run. Verify no secrets or large files are in git history (`git log --stat` skim, check repo size).
- Set repo metadata: description, topics (fastapi, react, layoutlmv3, anomaly-detection, fraud-detection, document-ai, explainable-ai), pin screenshots in README, add social-preview image if possible.
- Update CHANGELOG.md with a 1.0.0 entry; update PROGRESS.md. Merge feat/day4-ship into main, tag v1.0.0, push, and create a GitHub Release with notes and screenshots (`gh release create v1.0.0`).

ACCEPTANCE CRITERIA (show me proof)
- Fresh clone -> README quick start -> working app with seeded demo; Docker works.
- Hero demo runs flawlessly in under 5 minutes, following docs/DEMO_SCRIPT.md.
- My real invoices produce sensible results or graceful failure messages.
- PDF report generated and looks professional. CI green. Release v1.0.0 published.
- Documentation set complete, README polished, evaluation numbers real and honest.

CUT-LINE if behind (in this order): Playwright, batch upload, deployment (keep Docker + local + demo-video plan), LayoutLM integration, viva Q&A length, PDF report extras. Never cut: bug bash, README, DEMO_SCRIPT, release tag.

FINISH WITH a "Final handoff report": architecture summary, metrics, how to run, how to demo, known limitations, and a prioritised future-work list.
````

---

## Optional prompt: "Rescue mode" (use whenever the AI drifts or something breaks)

````text
Stop adding features. Read AGENTS.md, docs/BLUEPRINT.md and docs/PROGRESS.md. Run the tests and the app from a clean state. List what is broken, ranked by user impact. Fix only the top issue, add a regression test, commit with a conventional message, push, and update PROGRESS.md. Then report the remaining list. Do not refactor unrelated code. Do not change the API contract without telling me.
````

## Optional prompt: "Design critique" (use after Day 3 and again on Day 4)

````text
Act as a senior product designer reviewing InvoiceGuard. Open every page in dark and light at 1440px and 390px. Produce a prioritised critique: hierarchy, spacing, alignment, typography, colour contrast, motion timing, empty/loading/error states, consistency, and "does this look expensive?". Then fix the top 10 issues, show before/after screenshots in docs/assets/, and commit as "style: ..." commits.
````
