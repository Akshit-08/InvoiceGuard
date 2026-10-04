import { useQuery } from '@tanstack/react-query'
import { Activity, Target, ShieldCheck, TrendingUp, Info } from 'lucide-react'

import { systemApi } from '@/api/client'
import { KpiCard, ErrorState, SkeletonCard } from '@/components/ui'

// ── Hardcoded evaluation results (from retrained model, test split N=480) ─────
const FALLBACK_ROC_AUC  = 0.8772
const FALLBACK_PR_AUC   = 0.8924
const FALLBACK_PRECISION = 0.8761
const FALLBACK_RECALL    = 0.7615

function computeF1(p: number, r: number) {
  if (p + r === 0) return 0
  return (2 * p * r) / (p + r)
}

// Per-fraud-type recall (from evaluation report)
const PER_TYPE_RECALL = [
  { type: 'Financial arithmetic', recall: 0.91 },
  { type: 'Tax identity',         recall: 0.88 },
  { type: 'Duplicate detection',  recall: 0.94 },
  { type: 'Vendor behaviour',     recall: 0.82 },
  { type: 'Bank account change',  recall: 0.96 },
  { type: 'Identifier anomaly',   recall: 0.79 },
  { type: 'Visual forensics',     recall: 0.71 },
]

// Confusion matrix from held-out test split
const CM = { tn: 192, fp: 28, fn: 62, tp: 198 }

export default function InsightsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['model-metrics'],
    queryFn: () => systemApi.metrics(),
  })

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="mb-2">
          <div className="h-8 w-48 skeleton mb-2" />
          <div className="h-4 w-80 skeleton" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  if (error) return <ErrorState title="Failed to load model metrics" />

  // Use API values when available, else fall back to evaluated constants
  const rocAuc   = data?.roc_auc   ?? FALLBACK_ROC_AUC
  const prAuc    = data?.pr_auc    ?? FALLBACK_PR_AUC
  const precision = FALLBACK_PRECISION   // API doesn't expose per-threshold precision; use eval constant
  const recall    = FALLBACK_RECALL
  const f1        = computeF1(precision, recall)

  // Ablation: baseline rules-only vs full ML fusion
  const ablationRows = [
    { label: 'Baseline (rules only)', auc: 0.8476, accent: false },
    { label: 'ML fusion (retrained)', auc: rocAuc,  accent: true  },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1
          className="text-3xl font-bold mb-2"
          style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}
        >
          Model Insights
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Evaluation metrics, ablation results, and per-fraud-type recall from the retrained
          detection model.
        </p>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="ROC-AUC (×100)"
          value={Math.round(rocAuc * 100)}
          icon={Activity}
        />
        <KpiCard
          label="PR-AUC (×100)"
          value={Math.round(prAuc * 100)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Precision @ 30 (%)"
          value={Math.round(precision * 100)}
          icon={Target}
        />
        <KpiCard
          label="Recall @ 30 (%)"
          value={Math.round(recall * 100)}
          icon={ShieldCheck}
        />
      </div>

      {/* ── F1 note ── */}
      <div
        className="text-xs px-4 py-2 rounded-lg border"
        style={{
          color:       'var(--text-secondary)',
          background:  'var(--bg-overlay)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        F1 score (computed) ={' '}
        <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {f1.toFixed(4)}
        </span>
        {' '}· False positive rate on genuine invoices ={' '}
        <span className="font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
          0.1273
        </span>
        {' '}· Threshold = 30
      </div>

      {/* ── Ablation chart ── */}
      <div className="surface p-6">
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          Ablation: Baseline vs ML Fusion (ROC-AUC)
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Adding the gradient-boosted fusion model over pure rules improves ROC-AUC by +3.0 pp.
        </p>
        <div className="space-y-4">
          {ablationRows.map(row => {
            const pct = (row.auc / 1) * 100
            return (
              <div key={row.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {row.label}
                  </span>
                  <span
                    className="text-sm font-mono tabular-nums font-medium"
                    style={{ color: row.accent ? 'var(--accent)' : 'var(--text-tertiary)' }}
                  >
                    {row.auc.toFixed(4)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--bg-subtle)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width:      `${pct}%`,
                      background: row.accent ? 'var(--accent)' : 'var(--text-tertiary)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Per-fraud-type recall ── */}
      <div className="surface p-6">
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          Per-Fraud-Type Recall
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Recall per category on the held-out test split (N=480).
        </p>
        <div className="space-y-3">
          {PER_TYPE_RECALL.map(row => (
            <div key={row.type}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {row.type}
                </span>
                <span
                  className="text-sm font-mono tabular-nums font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  {(row.recall * 100).toFixed(0)}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--bg-subtle)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${row.recall * 100}%`, background: 'var(--accent)' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Confusion matrix ── */}
      <div className="surface p-6">
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          Confusion Matrix
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Held-out test split · N=480 · threshold=30
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          {/* TN */}
          <div
            className="p-4 rounded-xl border text-center"
            style={{ background: 'var(--risk-low-bg)', borderColor: 'var(--risk-low-border)' }}
          >
            <p className="text-2xl font-mono font-bold tabular-nums" style={{ color: 'var(--risk-low-text)' }}>
              {CM.tn}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>True Negative</p>
          </div>
          {/* FP */}
          <div
            className="p-4 rounded-xl border text-center"
            style={{ background: 'var(--risk-medium-bg)', borderColor: 'var(--risk-medium-border)' }}
          >
            <p className="text-2xl font-mono font-bold tabular-nums" style={{ color: 'var(--risk-medium-text)' }}>
              {CM.fp}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>False Positive</p>
          </div>
          {/* FN */}
          <div
            className="p-4 rounded-xl border text-center"
            style={{ background: 'var(--risk-high-bg)', borderColor: 'var(--risk-high-border)' }}
          >
            <p className="text-2xl font-mono font-bold tabular-nums" style={{ color: 'var(--risk-high-text)' }}>
              {CM.fn}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>False Negative</p>
          </div>
          {/* TP */}
          <div
            className="p-4 rounded-xl border text-center"
            style={{ background: 'var(--risk-low-bg)', borderColor: 'var(--risk-low-border)' }}
          >
            <p className="text-2xl font-mono font-bold tabular-nums" style={{ color: 'var(--risk-low-text)' }}>
              {CM.tp}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>True Positive</p>
          </div>
        </div>
        <div className="flex gap-4 mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span>← Predicted Genuine</span>
          <span>Predicted Risk →</span>
        </div>
      </div>

      {/* ── Evaluation dataset card ── */}
      <div className="surface p-6">
        <h2 className="font-bold text-base mb-3" style={{ color: 'var(--text-primary)' }}>
          Evaluation Dataset
        </h2>
        <div
          className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          {[
            ['Documents',   '4,400 synthetic'],
            ['Vendors',     '45'],
            ['Templates',   '5'],
            ['Random seed', '42'],
            ['Split',       '80 / 20 train / test'],
            ['Test size',   'N = 480'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="p-3 rounded-lg border"
              style={{ background: 'var(--bg-overlay)', borderColor: 'var(--border-hairline)' }}
            >
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
              <p className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Limitations panel ── */}
      <div
        className="p-5 rounded-xl border"
        style={{
          background:  'var(--bg-overlay)',
          borderColor: 'var(--border-default)',
        }}
      >
        <h3
          className="font-semibold text-sm mb-3 flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Info size={15} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
          Limitations &amp; Disclaimer
        </h3>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>
            InvoiceGuard flags <em>risk indicators</em> for human review. It does not determine
            fraud.
          </li>
          <li>
            Model trained on synthetic data — real-world performance may differ.
          </li>
          <li>
            Synthetic evaluation metrics are optimistic compared to production environments.
          </li>
          <li>
            Visual forensics relies on patch-pairs and may flag benign re-saves.
          </li>
          <li>
            The vendor isolation forest requires at least 5 invoices to establish a baseline.
          </li>
        </ul>
      </div>

    </div>
  )
}
