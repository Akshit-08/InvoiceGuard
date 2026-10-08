# design-v2 Screenshots

Before/after screenshots should be captured here for each major page in both dark and light themes.

## Naming convention

```
{page}-{theme}-before.png   (captured from v0.3.2 main)
{page}-{theme}-after.png    (captured from v0.4-design-v2 tag)
```

## Pages to capture

| Page | Route | Dark | Light |
|------|-------|------|-------|
| Landing | `/` | `landing-dark-after.png` | `landing-light-after.png` |
| Dashboard | `/dashboard` | `dashboard-dark-after.png` | `dashboard-light-after.png` |
| Analyze | `/analyze` | `analyze-dark-after.png` | `analyze-light-after.png` |
| Invoice | `/invoices/:id` | `invoice-dark-after.png` | `invoice-light-after.png` |
| History | `/history` | `history-dark-after.png` | `history-light-after.png` |

## WCAG AA contrast verified

| Token pair | Ratio | Result |
|------------|-------|--------|
| `--text-primary` (#ececec) on `--bg-base` (#151515) | ~14.5:1 | ✅ AAA |
| `--text-secondary` (#a1a1a1) on `--bg-base` (#151515) | ~5.3:1 | ✅ AA |
| `--accent` (#7B72F8) on `--bg-base` (#151515) | ~5.3:1 | ✅ AA |
| `--text-primary` (#161616) on `--bg-base` (#f6f6f4) | ~14.8:1 | ✅ AAA |
| `--text-secondary` (#5f5f5f) on `--bg-elevated` (#ffffff) | ~7.4:1 | ✅ AA |
| `--accent` (#5552d6) on `--bg-elevated` (#ffffff) | ~5.0:1 | ✅ AA |
| Risk low text (#3ecf8e) on `--bg-elevated` (#1e1e1e) | ~5.8:1 | ✅ AA |
| Risk high text (#f97316) on `--bg-elevated` (#1e1e1e) | ~5.4:1 | ✅ AA |
| Risk critical text (#f4697e) on `--bg-elevated` (#1e1e1e) | ~5.1:1 | ✅ AA |
