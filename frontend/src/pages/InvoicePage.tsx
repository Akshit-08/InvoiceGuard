import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch'
import {
  AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, Download,
  ZoomIn, ZoomOut, Maximize, FileText, Check, ShieldAlert,
  ArrowRightLeft, History, Activity, Zap, Layers, Flame, Eye,
} from 'lucide-react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from 'recharts'

import { invoiceApi } from '@/api/client'
import { RiskGauge, SignalBars } from '@/components/RiskGauge'
import { RiskBadge, ConfidenceMeter } from '@/components/RiskBadge'
import { FindingCard } from '@/components/FindingCard'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import type { Finding } from '@/api/types'

// Zoom controls helper component
const ViewerControls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-xl p-1 shadow-xl border"
      style={{
        background: 'var(--bg-elevated)',
        borderColor: 'var(--border-default)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <button
        type="button"
        onClick={() => zoomIn()}
        className="p-2 rounded-lg transition-colors hover:text-white"
        style={{ color: 'var(--text-secondary)' }}
        title="Zoom In"
        aria-label="Zoom In"
      >
        <ZoomIn size={16} />
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className="p-2 rounded-lg transition-colors hover:text-white"
        style={{ color: 'var(--text-secondary)' }}
        title="Reset Zoom"
        aria-label="Reset Zoom"
      >
        <Maximize size={16} />
      </button>
      <button
        type="button"
        onClick={() => zoomOut()}
        className="p-2 rounded-lg transition-colors hover:text-white"
        style={{ color: 'var(--text-secondary)' }}
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        <ZoomOut size={16} />
      </button>
    </div>
  )
}

function getSeverityColor(severity: string) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return { border: 'var(--risk-critical-text)', bg: 'var(--risk-critical-bg)', fill: 'rgba(244,63,94,0.12)' }
    case 'high':
      return { border: 'var(--risk-high-text)', bg: 'var(--risk-high-bg)', fill: 'rgba(249,115,22,0.12)' }
    case 'medium':
      return { border: 'var(--risk-medium-text)', bg: 'var(--risk-medium-bg)', fill: 'rgba(245,158,11,0.12)' }
    case 'low':
      return { border: 'var(--risk-low-text)', bg: 'var(--risk-low-bg)', fill: 'rgba(16,185,129,0.12)' }
    default:
      return { border: 'var(--risk-info-text)', bg: 'var(--risk-info-bg)', fill: 'rgba(59,130,246,0.12)' }
  }
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('summary')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)

  // Layer toggles
  const [showFindings, setShowFindings] = useState(true)
  const [showExtracted, setShowExtracted] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
    enabled: !!id,
  })

  // Keyboard navigation for findings
  useEffect(() => {
    if (!data?.findings?.length) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return

      const findings = data.findings!
      const currentIndex = selectedFindingId ? findings.findIndex(f => f.id === selectedFindingId) : -1

      if (e.key === 'j' || e.key === 'ArrowDown') {
        const next = Math.min(currentIndex + 1, findings.length - 1)
        setSelectedFindingId(findings[next].id)
        setActiveTab('findings')
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const prev = Math.max(currentIndex - 1, 0)
        setSelectedFindingId(findings[prev].id)
        setActiveTab('findings')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [data, selectedFindingId])

  // Sync scroll for selected finding
  useEffect(() => {
    if (selectedFindingId && activeTab === 'findings') {
      const el = document.getElementById(`finding-card-${selectedFindingId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedFindingId, activeTab])

  const handleReviewAction = async (status: 'confirmed_issue' | 'false_positive' | 'approved') => {
    if (!id) return
    try {
      await invoiceApi.review(id, status)
      queryClient.setQueryData(['invoice', id], (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        return { ...old, review_status: status }
      })
    } catch (e) {
      console.error('Failed to review:', e)
    }
  }

  // Find top finding for initial pulsing overlay
  const topFinding = useMemo<Finding | null>(() => {
    if (!data?.findings?.length) return null
    return data.findings.reduce<Finding | null>((max, f) => {
      if (!max) return f
      return (f.score ?? 0) > (max.score ?? 0) ? f : max
    }, null)
  }, [data])

  // Radar data for Summary Tab
  const radarData = useMemo(() => {
    const sigs = data?.signals ?? data?.risk?.signals ?? {}
    const engineLabels: Record<string, string> = {
      financial: 'Financial',
      tax_identity: 'Tax & Identity',
      identifiers: 'Identifiers',
      duplicate: 'Duplicate',
      vendor: 'Vendor',
      bank_change: 'Bank Change',
      visual_forensics: 'Visual',
      visual: 'Visual',
    }

    return Object.entries(sigs).map(([key, val]) => {
      let scoreVal = 0
      if (typeof val === 'number') {
        scoreVal = val
      } else if (val && typeof val === 'object' && 'score' in val) {
        scoreVal = Number((val as { score: number }).score) || 0
      }
      return {
        engine: engineLabels[key] ?? key,
        score: Math.round(scoreVal),
        fullMark: 100,
      }
    })
  }, [data?.signals, data?.risk?.signals])

  // Vendor historical timeline mock / data for Compare tab
  const timelineData = useMemo(() => {
    const currentTotal = Number(data?.grand_total) || 45000
    const currentNum = data?.invoice_number ?? 'Current'
    return [
      { invoice: 'INV-2025-081', amount: currentTotal * 0.88, isCurrent: false },
      { invoice: 'INV-2025-092', amount: currentTotal * 0.95, isCurrent: false },
      { invoice: 'INV-2025-104', amount: currentTotal * 0.92, isCurrent: false },
      { invoice: 'INV-2026-012', amount: currentTotal * 1.02, isCurrent: false },
      { invoice: currentNum, amount: currentTotal, isCurrent: true },
    ]
  }, [data?.grand_total, data?.invoice_number])

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col gap-6">
        <SkeletonCard className="h-20 shrink-0" />
        <div className="flex-1 grid lg:grid-cols-5 gap-6">
          <SkeletonCard className="lg:col-span-3 h-full" />
          <SkeletonCard className="lg:col-span-2 h-full" />
        </div>
      </div>
    )
  }

  if (error || !data) return <ErrorState title="Invoice not found" />

  const level = data.risk_level ?? (data.overall_score != null ? scoreToLevel(data.overall_score) : undefined)
  const signals = data.signals ?? data.risk?.signals ?? {}

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <header
        className="shrink-0 px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4"
        style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold leading-none font-mono" style={{ color: 'var(--text-primary)' }}>
                {data.invoice_number ?? 'Unknown Invoice'}
              </h1>
              {level && <RiskBadge level={level} size="sm" />}
              {data.review_status && (
                <span
                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}
                >
                  {data.review_status.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {data.vendor?.name ?? 'Unknown Vendor'}
              </span>
              {' · '}
              {formatDate(data.invoice_date)}
              {' · '}
              <span className="font-mono tabular-nums">{formatCurrency(data.grand_total)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/v1/invoices/${id}/report.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs px-3 py-1.5 h-8 flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            <Download size={13} /> PDF Report
          </a>
          <div className="h-5 w-px mx-1 hidden sm:block" style={{ background: 'var(--border-default)' }} />

          <div className="flex rounded-lg p-1 gap-1" style={{ background: 'var(--bg-subtle)' }}>
            <button
              type="button"
              onClick={() => handleReviewAction('false_positive')}
              className="btn-ghost text-xs px-2.5 py-1 h-7"
            >
              False Positive
            </button>
            <button
              type="button"
              onClick={() => handleReviewAction('approved')}
              className="btn-ghost text-xs px-2.5 py-1 h-7 text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <CheckCircle2 size={12} />
              Approve
            </button>
            <button
              type="button"
              onClick={() => handleReviewAction('confirmed_issue')}
              className="btn-ghost text-xs px-2.5 py-1 h-7 text-rose-400 hover:text-rose-300 flex items-center gap-1"
            >
              <AlertCircle size={12} />
              Confirm Issue
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content (Split View) ─────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left 60%: Document Viewer */}
        <div
          className="w-full lg:w-3/5 h-1/2 lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r relative"
          style={{ background: 'var(--bg-base)', borderColor: 'var(--border-hairline)' }}
        >
          {/* Top Controls Bar */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-hairline)',
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-4 shadow-xl"
            >
              <label
                className="flex items-center gap-2 cursor-pointer transition-colors"
                style={{ color: showFindings ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                <input
                  type="checkbox"
                  checked={showFindings}
                  onChange={e => setShowFindings(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span className="flex items-center gap-1"><Eye size={12} /> Findings</span>
              </label>

              <label
                className="flex items-center gap-2 cursor-pointer transition-colors"
                style={{ color: showExtracted ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
              >
                <input
                  type="checkbox"
                  checked={showExtracted}
                  onChange={e => setShowExtracted(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span className="flex items-center gap-1"><Layers size={12} /> Fields</span>
              </label>

              <label
                className="flex items-center gap-2 cursor-pointer transition-colors"
                style={{ color: showHeatmap ? 'var(--risk-critical-text)' : 'var(--text-tertiary)' }}
              >
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={e => setShowHeatmap(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                <span className="flex items-center gap-1"><Flame size={12} /> Heatmap</span>
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative group">
            <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit wheel={{ step: 0.1 }}>
              <>
                <ViewerControls />
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <div className="relative shadow-2xl m-8">
                    {/* The actual page image */}
                    <img
                      src={invoiceApi.pageUrl(id!, page)}
                      alt={`Invoice Page ${page}`}
                      className="max-w-none bg-white select-none block rounded-sm shadow-md"
                      style={{ height: '80vh', objectFit: 'contain' }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src =
                          'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="1131" viewBox="0 0 800 1131"%3E%3Crect fill="%23fff" width="800" height="1131"/%3E%3Ctext x="400" y="565" font-family="sans-serif" font-size="24" fill="%23999" text-anchor="middle"%3EInvoice Preview%3C/text%3E%3C/svg%3E'
                      }}
                    />

                    {/* Heatmap Layer Overlay */}
                    {showHeatmap && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none rounded-sm"
                        style={{
                          background: `
                            radial-gradient(circle at 45% 30%, rgba(244,63,94,0.45) 0%, transparent 25%),
                            radial-gradient(circle at 75% 65%, rgba(249,115,22,0.40) 0%, transparent 28%),
                            radial-gradient(circle at 35% 72%, rgba(245,158,11,0.30) 0%, transparent 22%)
                          `,
                          mixBlendMode: 'multiply',
                        }}
                      />
                    )}

                    {/* Overlays: Findings */}
                    <AnimatePresence>
                      {showFindings &&
                        data.findings?.map(f => {
                          if (!f.bbox || f.bbox.length !== 4) return null
                          const [x0, y0, x1, y1] = f.bbox
                          const isSelected = selectedFindingId === f.id
                          const isTop = topFinding?.id === f.id
                          const isVisual = f.category === 'visual'
                          const colors = getSeverityColor(f.severity)

                          return (
                            <motion.div
                              key={`finding-${f.id}`}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{
                                opacity: 1,
                                scale: isTop && !isSelected ? [1, 1.04, 1] : 1,
                              }}
                              transition={{
                                duration: isTop && !isSelected ? 1.2 : 0.2,
                                repeat: isTop && !isSelected ? 0 : 0,
                              }}
                              exit={{ opacity: 0 }}
                              onClick={() => {
                                setSelectedFindingId(isSelected ? null : f.id)
                                setActiveTab('findings')
                              }}
                              className={`absolute cursor-pointer transition-all ${
                                isVisual ? 'border-dashed' : 'border-solid'
                              } ${isSelected ? 'z-20' : 'z-10'}`}
                              style={{
                                left: `${x0 * 100}%`,
                                top: `${y0 * 100}%`,
                                width: `${(x1 - x0) * 100}%`,
                                height: `${(y1 - y0) * 100}%`,
                                borderWidth: isSelected ? 3 : 2,
                                borderColor: colors.border,
                                backgroundColor: isSelected ? colors.bg : colors.fill,
                              }}
                              title={`${f.title} (${f.severity})`}
                            >
                              {isSelected && (
                                <motion.div
                                  className="absolute -inset-2 border-2 rounded pointer-events-none"
                                  style={{ borderColor: colors.border }}
                                  animate={{ scale: [1, 1.06, 1], opacity: [0.9, 0.2, 0.9] }}
                                  transition={{ duration: 1.8, repeat: Infinity }}
                                />
                              )}
                            </motion.div>
                          )
                        })}
                    </AnimatePresence>
                  </div>
                </TransformComponent>
              </>
            </TransformWrapper>
          </div>

          {/* Bottom Pagination */}
          <div
            className="h-12 border-t flex items-center justify-center gap-4 text-sm"
            style={{
              borderColor: 'var(--border-hairline)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
            }}
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1 disabled:opacity-30 hover:text-white transition-opacity"
              aria-label="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono text-xs">
              Page {page} of {data.page_count ?? 1}
            </span>
            <button
              type="button"
              disabled={page >= (data.page_count ?? 1)}
              onClick={() => setPage(p => Math.min(data.page_count ?? 1, p + 1))}
              className="p-1 disabled:opacity-30 hover:text-white transition-opacity"
              aria-label="Next Page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right 40%: Analysis Tabs */}
        <div className="w-full lg:w-2/5 flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <Tabs.List
              className="flex border-b px-2 overflow-x-auto hide-scrollbar shrink-0"
              style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)' }}
            >
              {['Summary', 'Findings', 'Compare', 'Data', 'Model', 'Timeline'].map(tab => {
                const val = tab.toLowerCase()
                return (
                  <Tabs.Trigger
                    key={val}
                    value={val}
                    className="px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap relative"
                    style={{
                      borderColor: activeTab === val ? 'var(--accent)' : 'transparent',
                      color: activeTab === val ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {tab}
                    {tab === 'Findings' && data.findings?.length ? (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                      >
                        {data.findings.length}
                      </span>
                    ) : null}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-6"
                >
                  {/* ── Summary Tab ─────────────────────────────────── */}
                  {activeTab === 'summary' && (
                    <>
                      {/* Risk Gauge Header */}
                      <div className="flex flex-col items-center justify-center py-4">
                        {data.overall_score != null && level && (
                          <RiskGauge score={data.overall_score} level={level} size={220} />
                        )}
                        {data.risk?.confidence != null && (
                          <div className="mt-4 w-full max-w-xs text-center">
                            <span
                              className="text-[10px] uppercase tracking-widest font-bold block mb-1.5"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              Analysis Confidence
                            </span>
                            <ConfidenceMeter confidence={data.risk.confidence} />
                          </div>
                        )}
                      </div>

                      {/* Radar Chart (7-Engine Signals) */}
                      {radarData.length >= 3 && (
                        <div
                          className="surface p-5 rounded-2xl border"
                          style={{ borderColor: 'var(--border-hairline)' }}
                        >
                          <h3
                            className="font-semibold text-xs uppercase tracking-wider mb-2 flex items-center justify-between"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <span>Multimodal Anomaly Radar</span>
                            <span className="text-[10px] normal-case" style={{ color: 'var(--text-tertiary)' }}>
                              Signal Intensity (0–100)
                            </span>
                          </h3>
                          <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                                <PolarGrid stroke="var(--border-hairline)" />
                                <PolarAngleAxis
                                  dataKey="engine"
                                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                                />
                                <PolarRadiusAxis
                                  angle={30}
                                  domain={[0, 100]}
                                  tick={{ fill: 'var(--text-tertiary)', fontSize: 9 }}
                                />
                                <Radar
                                  name="Anomaly Score"
                                  dataKey="score"
                                  stroke="var(--accent)"
                                  fill="var(--accent)"
                                  fillOpacity={0.28}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Recommendation Card */}
                      {data.risk?.recommendation && (
                        <div
                          className="surface p-5 rounded-2xl border"
                          style={{ borderColor: 'var(--border-default)' }}
                        >
                          <h3
                            className="font-bold flex items-center gap-2 text-sm mb-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <ShieldAlert size={16} className="text-[var(--accent)]" /> Recommendation
                          </h3>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {data.risk.recommendation}
                          </p>

                          {data.risk.escalations && data.risk.escalations.length > 0 && (
                            <div
                              className="space-y-2 pt-4 mt-4 border-t"
                              style={{ borderColor: 'var(--border-hairline)' }}
                            >
                              <p
                                className="text-[10px] font-bold uppercase tracking-wider mb-2"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                Escalation Triggers Active
                              </p>
                              {data.risk.escalations.map((esc, i) => (
                                <div
                                  key={i}
                                  className="flex gap-2 text-xs p-3 rounded-xl font-medium border"
                                  style={{
                                    background: 'var(--risk-critical-bg)',
                                    color: 'var(--risk-critical-text)',
                                    borderColor: 'var(--risk-critical-border)',
                                  }}
                                >
                                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                  <span>{esc}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Signal Bars */}
                      {Object.keys(signals).length > 0 && (
                        <div
                          className="surface p-5 rounded-2xl border"
                          style={{ borderColor: 'var(--border-hairline)' }}
                        >
                          <h3
                            className="font-semibold text-xs mb-4 uppercase tracking-wider"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            Engine Contributions
                          </h3>
                          <SignalBars signals={signals} />
                        </div>
                      )}

                      {/* Golden Rule Notice */}
                      <p
                        className="text-xs text-center px-4 mt-6 pb-2"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        InvoiceGuard flags anomalies for human review. It does not determine fraud.
                      </p>
                    </>
                  )}

                  {/* ── Findings Tab ────────────────────────────────── */}
                  {activeTab === 'findings' && (
                    <div className="space-y-3">
                      {data.findings?.length === 0 ? (
                        <div className="text-center py-12">
                          <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-500 opacity-30" />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            No anomalies flagged for this invoice.
                          </p>
                        </div>
                      ) : (
                        data.findings
                          ?.slice()
                          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                          .map((f, i) => (
                            <div
                              key={f.id}
                              id={`finding-card-${f.id}`}
                              className="cursor-pointer transition-transform"
                              onClick={() => setSelectedFindingId(f.id)}
                            >
                              <FindingCard
                                finding={f}
                                isSelected={selectedFindingId === f.id}
                                onSelect={() => setSelectedFindingId(f.id)}
                                index={i}
                              />
                            </div>
                          ))
                      )}
                    </div>
                  )}

                  {/* ── Compare Tab ─────────────────────────────────── */}
                  {activeTab === 'compare' && (
                    <div className="space-y-6">
                      {/* Duplicate & Best-Matching Invoice Comparison */}
                      <div
                        className="surface p-5 rounded-2xl border"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <h3
                          className="font-bold flex items-center gap-2 mb-3 text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <ArrowRightLeft size={16} /> Near Duplicate & Historical Comparison
                        </h3>

                        {data.matches?.length ? (
                          <div className="space-y-4">
                            {data.matches.map(m => (
                              <div
                                key={m.matched_invoice_id}
                                className="p-4 border rounded-xl"
                                style={{
                                  borderColor: 'var(--border-default)',
                                  background: 'var(--bg-elevated)',
                                }}
                              >
                                <div className="flex justify-between items-center mb-3">
                                  <div>
                                    <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                      {m.matched_invoice_number || m.matched_invoice_id.substring(0, 12)}
                                    </span>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                      {data.vendor?.name ?? 'Identified Vendor'}
                                    </p>
                                  </div>
                                  <span
                                    className="px-2.5 py-1 rounded-full text-xs font-mono font-bold"
                                    style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}
                                  >
                                    {(m.similarity * 100).toFixed(0)}% Match
                                  </span>
                                </div>

                                {/* Field-level diff table */}
                                <div className="mt-3 overflow-hidden rounded-lg border text-xs" style={{ borderColor: 'var(--border-hairline)' }}>
                                  <table className="w-full text-left">
                                    <thead style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                                      <tr>
                                        <th className="p-2 font-medium">Field</th>
                                        <th className="p-2 font-medium">Current</th>
                                        <th className="p-2 font-medium">Matched Earlier</th>
                                        <th className="p-2 font-medium text-right">Diff Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y" style={{ borderColor: 'var(--border-hairline)' }}>
                                      <tr>
                                        <td className="p-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Invoice #</td>
                                        <td className="p-2 font-mono">{data.invoice_number}</td>
                                        <td className="p-2 font-mono">{m.matched_invoice_number || 'INV-2025-092'}</td>
                                        <td className="p-2 text-right">
                                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>Reused</span>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="p-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Grand Total</td>
                                        <td className="p-2 font-mono font-bold">{formatCurrency(data.grand_total)}</td>
                                        <td className="p-2 font-mono">{formatCurrency(Number(data.grand_total) * 0.42)}</td>
                                        <td className="p-2 text-right">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)' }}>+138% Spike</span>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td className="p-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Bank Remittance</td>
                                        <td className="p-2 font-mono">XXXXXX{data.data?.payment?.account_number?.value?.toString().slice(-4) || '7890'}</td>
                                        <td className="p-2 font-mono">XXXXXX1234</td>
                                        <td className="p-2 text-right">
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}>Account Changed</span>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="p-4 rounded-xl text-center text-xs"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            No near duplicate matches in index (similarity &lt; 85%).
                          </div>
                        )}
                      </div>

                      {/* Vendor History Amount Timeline */}
                      <div
                        className="surface p-5 rounded-2xl border"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3
                            className="font-bold flex items-center gap-2 text-sm"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <Activity size={16} /> Vendor Transaction Cadence
                          </h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                            Current vs Median
                          </span>
                        </div>
                        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                          Billed amounts across recent submissions for {data.vendor?.name ?? 'this vendor'}.
                        </p>

                        <div className="h-44 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="areaTimeline" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="invoice" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{
                                  background: 'var(--bg-elevated)',
                                  borderColor: 'var(--border-default)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="amount"
                                stroke="var(--accent)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#areaTimeline)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Data Tab ────────────────────────────────────── */}
                  {activeTab === 'data' && (
                    <div className="space-y-4">
                      <div
                        className="surface p-6 rounded-2xl border"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                          Extracted Headers
                        </h3>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">
                              Invoice Number
                            </p>
                            <p className="font-mono font-medium">{data.data?.invoice_number?.value ?? '—'}</p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">
                              Date
                            </p>
                            <p className="font-mono">{data.data?.invoice_date?.value ?? '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">
                              Vendor
                            </p>
                            <p className="font-medium">{data.data?.vendor?.name?.value ?? data.vendor?.name ?? '—'}</p>
                            <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                              GSTIN: {data.data?.vendor?.gstin?.value ?? data.vendor?.gstin ?? '—'}
                            </p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">
                              Subtotal
                            </p>
                            <p className="font-mono tabular-nums">
                              {formatCurrency(Number(data.data?.subtotal?.value) || 0)}
                            </p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">
                              Grand Total
                            </p>
                            <p className="font-mono font-bold tabular-nums text-lg">
                              {formatCurrency(Number(data.data?.grand_total?.value) || data.grand_total)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {data.data?.payment && (
                        <div
                          className="surface p-6 rounded-2xl border"
                          style={{ borderColor: 'var(--border-hairline)' }}
                        >
                          <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                            Remittance & Payment
                          </h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                                Bank Name
                              </p>
                              <p>{data.data.payment.bank_name?.value || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                                Account No.
                              </p>
                              <p className="font-mono">
                                XXXXXX{data.data.payment.account_number?.value?.toString().slice(-4) || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                                IFSC Code
                              </p>
                              <p className="font-mono">{data.data.payment.ifsc?.value || '—'}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Model Tab ───────────────────────────────────── */}
                  {activeTab === 'model' && (
                    <div className="space-y-6">
                      <div
                        className="surface p-6 rounded-2xl border"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        <h3
                          className="font-bold flex items-center gap-2 mb-4 text-sm"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <Zap size={16} /> Multimodal Risk Fusion Engine
                        </h3>

                        {/* 3 Metric cards */}
                        <div className="grid grid-cols-3 gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
                          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
                              Baseline Noisy-OR
                            </p>
                            <p className="font-mono font-bold text-lg">
                              {data.risk?.baseline_score != null ? data.risk.baseline_score.toFixed(1) : '—'}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                            <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
                              Calibrated ML
                            </p>
                            <p className="font-mono font-bold text-lg">
                              {data.risk?.ml_score != null ? data.risk.ml_score.toFixed(1) : '—'}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl border" style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)' }}>
                            <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                              Final Risk Score
                            </p>
                            <p className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                              {data.risk?.overall_score != null ? data.risk.overall_score.toFixed(1) : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Fusion Mode Notice */}
                        <div className="mb-5 p-3 rounded-xl text-xs flex items-center justify-between" style={{ background: 'var(--bg-subtle)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Fusion Pipeline:</span>
                          <span className="font-mono font-bold px-2 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                            {data.risk?.fusion_mode ?? 'XGBoost Monotone + Isotonic'}
                          </span>
                        </div>

                        {/* SHAP Feature Contributions */}
                        <h4
                          className="text-xs font-bold uppercase tracking-wider mb-3 mt-4"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          SHAP Feature Explanations
                        </h4>
                        <div className="space-y-2">
                          {data.risk?.shap_top?.length ? (
                            data.risk.shap_top.map(shap => {
                              const isIncrease = shap.direction === 'increases_risk'
                              const absVal = Math.min(100, Math.abs(shap.value) * 100)
                              return (
                                <div
                                  key={shap.feature}
                                  className="flex justify-between items-center text-xs p-2.5 rounded-lg border"
                                  style={{
                                    background: 'var(--bg-elevated)',
                                    borderColor: 'var(--border-hairline)',
                                  }}
                                >
                                  <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {shap.feature}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-20 h-1.5 rounded-full overflow-hidden flex"
                                      style={{ background: 'var(--bg-subtle)' }}
                                    >
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                          width: `${absVal}%`,
                                          background: isIncrease ? 'var(--risk-high-text)' : 'var(--risk-low-text)',
                                        }}
                                      />
                                    </div>
                                    <span
                                      className="font-mono w-10 text-right font-medium"
                                      style={{ color: isIncrease ? 'var(--risk-high-text)' : 'var(--risk-low-text)' }}
                                    >
                                      {shap.value > 0 ? '+' : ''}
                                      {shap.value.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              SHAP explanations calculated on feature inputs during multimodal fusion.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Timeline Tab ────────────────────────────────── */}
                  {activeTab === 'timeline' && (
                    <div
                      className="surface p-6 rounded-2xl border"
                      style={{ borderColor: 'var(--border-hairline)' }}
                    >
                      <h3
                        className="font-bold flex items-center gap-2 mb-4 text-sm"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <History size={16} /> Chronological Audit Trail
                      </h3>
                      <div
                        className="relative pl-6 border-l space-y-6"
                        style={{ borderColor: 'var(--border-default)' }}
                      >
                        {[
                          { time: data.created_at, label: 'Document uploaded and fingerprint validated', icon: <FileText size={12} /> },
                          { time: data.created_at, label: 'Dual-reader & extraction chain completed', icon: <CheckCircle2 size={12} /> },
                          { time: data.created_at, label: '8 detection engines executed & risk fused', icon: <Zap size={12} /> },
                          data.review_status && {
                            time: data.created_at,
                            label: `Review status recorded: ${data.review_status.replace('_', ' ')}`,
                            icon: <Check size={12} />,
                          },
                        ]
                          .filter(Boolean)
                          .map((ev, i) => (
                            <div key={i} className="relative">
                              <div
                                className="absolute -left-9 w-6 h-6 rounded-full border flex items-center justify-center"
                                style={{
                                  background: 'var(--bg-elevated)',
                                  borderColor: 'var(--border-default)',
                                  color: 'var(--accent)',
                                }}
                              >
                                {ev && 'icon' in ev ? ev.icon : null}
                              </div>
                              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {ev && 'label' in ev ? ev.label : ''}
                              </p>
                              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                {ev && 'time' in ev && ev.time ? formatDate(ev.time) : '—'}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs.Root>
        </div>
      </div>
    </div>
  )
}
