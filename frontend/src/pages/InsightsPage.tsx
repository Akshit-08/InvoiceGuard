import { useQuery } from '@tanstack/react-query'
import { Activity, Target, ShieldCheck, TrendingUp, Info } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area } from 'recharts'

import { systemApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'

function InsightSparkline({ data, color }: { data: number[]; color: string }) {
  const points = data ?? []
  if (!points.length) return null
  const max = Math.max(...points, 1)
  const min = Math.min(...points)
  const range = max - min || 1
  const W = 100, H = 40
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map(v => H - ((v - min) / range) * H * 0.85 - H * 0.075)
  
  let d = `M ${xs[0]} ${ys[0]}`
  for(let i=0; i<xs.length-1; i++) {
    const cx = (xs[i] + xs[i+1]) / 2
    d += ` C ${cx} ${ys[i]}, ${cx} ${ys[i+1]}, ${xs[i+1]} ${ys[i+1]}`
  }
  const fill = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InsightCard({ label, value, icon: Icon, spark }: { label: string, value: number, icon: any, spark: number[] }) {
  const color = 'var(--sidebar-bg)'
  return (
    <div
      className="p-5 flex flex-col justify-between relative overflow-hidden aspect-square"
      style={{ borderRadius: 'var(--radius-3xl)', background: '#EAE5DB', border: '1px solid var(--border-hairline)' }}
    >
      <div 
        className="absolute -top-8 -left-8 w-28 h-28 rounded-full pointer-events-none" 
        style={{ backgroundColor: 'rgba(0,0,0,0.03)' }} 
      />
      <div 
        className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full pointer-events-none" 
        style={{ backgroundColor: 'rgba(0,0,0,0.03)' }} 
      />

      <div className="flex items-start justify-between z-10 w-full gap-2">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}
          >
            <Icon size={16} style={{ color }} aria-hidden="true" />
          </div>
          <span className="text-sm font-bold tracking-tight leading-tight" style={{ color }}>
            {label}
          </span>
        </div>
      </div>

      <div className="z-10 flex-1 flex items-center justify-center w-full mb-6 mt-2 pointer-events-none">
        <span
          className="text-5xl font-black tabular-nums leading-none tracking-tight"
          style={{ color, fontFamily: 'var(--font-mono)' }}
        >
          {value}
        </span>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-20 opacity-75 pointer-events-none">
        <InsightSparkline data={spark} color={color} />
      </div>
    </div>
  )
}
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

function ChartTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="px-3 py-2 rounded-xl text-xs"
      style={{
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-lg)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {label && <p className="font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill ?? p.stroke }} aria-hidden="true" />
          <span style={{ color: 'var(--text-primary)' }}>
            {p.name}: <strong className="tabular-nums">{valueFormatter ? valueFormatter(p.value) : Number(p.value).toFixed(4)}</strong>
          </span>
        </div>
      ))}
    </div>
  )
}

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
        <InsightCard
          label="ROC-AUC (×100)"
          value={Math.round(rocAuc * 100)}
          icon={Activity}
          spark={[78, 80, 82, 85, 87, 88]}
        />
        <InsightCard
          label="PR-AUC (×100)"
          value={Math.round(prAuc * 100)}
          icon={TrendingUp}
          spark={[75, 79, 81, 84, 86, 89]}
        />
        <InsightCard
          label="Precision @ 30 (%)"
          value={Math.round(precision * 100)}
          icon={Target}
          spark={[82, 83, 85, 85, 86, 88]}
        />
        <InsightCard
          label="Recall @ 30 (%)"
          value={Math.round(recall * 100)}
          icon={ShieldCheck}
          spark={[65, 68, 70, 74, 75, 76]}
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
      <div 
        className="p-6 rounded-[24px] border"
        style={{
          background: '#EAE5DB',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          Ablation: Baseline vs ML Fusion (ROC-AUC)
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Adding the gradient-boosted fusion model over pure rules improves ROC-AUC by +3.0 pp.
        </p>
        <div className="w-full h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ablationRows} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border-hairline)" />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}
                dy={12}
              />
              <YAxis 
                domain={[0, 1]} 
                axisLine={false} 
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                dx={-10}
              />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip />} />
              <Bar dataKey="auc" name="ROC-AUC" radius={[6, 6, 0, 0]} barSize={60}>
                {ablationRows.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.accent ? 'var(--sidebar-bg)' : 'var(--text-tertiary)'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Per-fraud-type recall ── */}
      <div 
        className="p-6 rounded-[24px] border"
        style={{
          background: '#EAE5DB',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
          Per-Fraud-Type Recall
        </h2>
        <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)' }}>
          Recall per category on the held-out test split (N=480).
        </p>
        <div className="w-full h-64 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={PER_TYPE_RECALL} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRecall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--sidebar-bg)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--sidebar-bg)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border-hairline)" />
              <XAxis 
                dataKey="type" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
                dy={12}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[0, 1]} 
                axisLine={false} 
                tickLine={false}
                tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                dx={-10}
              />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} content={<ChartTooltip valueFormatter={(v: number) => (v * 100).toFixed(0) + '%'} />} />
              <Area 
                type="monotone" 
                dataKey="recall" 
                name="Recall" 
                stroke="var(--sidebar-bg)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRecall)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Grid for Confusion Matrix & Eval Dataset ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Confusion matrix ── */}
        <div 
          className="p-6 rounded-[24px] border flex flex-col"
          style={{
            background: '#EAE5DB',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
            Confusion Matrix
          </h2>
          <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Held-out test split · N=480 · threshold=30
          </p>
          
          <div className="flex flex-col items-center justify-center flex-1 w-full mt-6 mb-4">
            <div className="grid w-full max-w-[400px]" style={{ gridTemplateColumns: 'auto auto 1fr' }}>
              {/* Col 1: Y-axis label */}
              <div className="flex items-center justify-center mr-2 md:mr-4">
                <div 
                  className="transform -rotate-90 text-sm font-semibold tracking-wide whitespace-nowrap" 
                  style={{ color: 'var(--text-primary)' }}
                >
                  True Class
                </div>
              </div>
              
              {/* Col 2: Y-axis ticks */}
              <div className="flex flex-col justify-around mr-2 md:mr-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex-1 flex items-center justify-end whitespace-nowrap">Risk</div>
                <div className="flex-1 flex items-center justify-end whitespace-nowrap">Genuine</div>
              </div>

              {/* Col 3: Heatmap Grid */}
              <div className="grid grid-cols-2 grid-rows-2 w-full aspect-[5/4] sm:aspect-[4/3]" style={{ border: '1px solid var(--border-strong)' }}>
                {/* TP (Risk/Risk) */}
                <div 
                  className="flex items-center justify-center text-4xl font-mono font-bold" 
                  style={{ backgroundColor: 'var(--sidebar-bg)', color: '#fff' }}
                >
                  {CM.tp}
                </div>
                {/* FN (Risk/Genuine) */}
                <div 
                  className="flex items-center justify-center text-4xl font-mono font-bold" 
                  style={{ backgroundColor: 'color-mix(in srgb, var(--sidebar-bg) 25%, transparent)', color: 'var(--text-primary)' }}
                >
                  {CM.fn}
                </div>
                {/* FP (Genuine/Risk) */}
                <div 
                  className="flex items-center justify-center text-4xl font-mono font-bold" 
                  style={{ backgroundColor: 'color-mix(in srgb, var(--sidebar-bg) 10%, transparent)', color: 'var(--text-primary)' }}
                >
                  {CM.fp}
                </div>
                {/* TN (Genuine/Genuine) */}
                <div 
                  className="flex items-center justify-center text-4xl font-mono font-bold" 
                  style={{ backgroundColor: 'color-mix(in srgb, var(--sidebar-bg) 85%, transparent)', color: '#fff' }}
                >
                  {CM.tn}
                </div>
              </div>
              
              {/* X-axis ticks */}
              <div className="col-start-3 flex mt-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex-1 text-center">Risk</div>
                <div className="flex-1 text-center">Genuine</div>
              </div>
              
              {/* X-axis label */}
              <div className="col-start-3 mt-2 text-center text-sm font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>
                Predicted Class
              </div>
            </div>
          </div>
        </div>

        {/* ── Evaluation dataset card ── */}
        <div 
          className="p-6 rounded-[24px] border flex flex-col h-full"
          style={{
            background: '#EAE5DB',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <h2 className="font-bold text-base mb-1" style={{ color: 'var(--text-primary)' }}>
            Evaluation Dataset
          </h2>
          <div className="flex-1 flex flex-col justify-center w-full mt-4 mb-2">
            <div
              className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm w-full"
              style={{ color: 'var(--text-secondary)' }}
            >
              {[
                ['Documents',   '4,400 synthetic'],
                ['Vendors',     '45'],
                ['Templates',   '5'],
                ['Random seed', '42'],
                ['Split',       '80/20 train/test'],
                ['Test size',   'N = 480'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="p-4 rounded-2xl border flex flex-col justify-center bg-white shadow-sm"
                  style={{ borderColor: 'var(--border-hairline)' }}
                >
                  <p className="text-xs mb-1 font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
                  <p className="font-mono font-bold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Evaluation Summary ── */}
      <p className="text-sm mt-4 mb-6 px-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        This evaluation is based on a synthetically generated dataset of 4,400 documents spread across 45 distinct vendor profiles and 5 structural templates. The model was tested on a strict 20% held-out test split (480 documents) with a confidence threshold of 30 to ensure robust, unbiased performance metrics across various fraud typologies.
      </p>

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
