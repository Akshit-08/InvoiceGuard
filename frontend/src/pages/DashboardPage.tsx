/**
 * DashboardPage — polished command-centre layout.
 *
 * Layout: 12-col bento grid (responsive to 1 col).
 * Row 1: Header (title, date-range control, upload CTA, last-updated)
 * Row 2: 4 KPI cards with animated counters, sparklines, delta arrows
 * Row 3: Risk-over-time stacked area chart + Risk distribution donut
 * Row 4: Anomaly categories bars | Suspicious vendors | Needs-review queue
 * Row 5: Recent analyses feed + System status
 * Empty state when no data.
 */

import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useInView } from 'framer-motion'
import {
  FileText, AlertTriangle, ShieldAlert, TrendingUp,
  ChevronRight, RefreshCw, Activity, Upload,
  Calculator, Fingerprint, Copy, Building2, CreditCard, Eye, CheckCircle2,
  Cpu, ExternalLink, Clock, Zap,
} from 'lucide-react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { toast } from 'sonner'

import { dashboardApi } from '@/api/client'
import type { DateRange } from '@/api/types'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { RiskBadge } from '@/components/RiskBadge'
import { scoreToLevel, formatRelativeTime, formatDate } from '@/lib/utils'
import { useCountUp, useReducedMotion } from '@/hooks/useMotion'

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString('en-IN')}`
}

const ENGINE_ICONS: Record<string, React.ElementType> = {
  layoutlmv3:   FileText,
  financial:    Calculator,
  tax_identity: Fingerprint,
  duplicate:    Copy,
  vendor:       Building2,
  bank_change:  CreditCard,
  identifiers:  CheckCircle2,
  visual:       Eye,
}

const ENGINE_LABELS: Record<string, string> = {
  layoutlmv3:   'LayoutLMv3',
  financial:    'Financial',
  tax_identity: 'Tax & Identity',
  duplicate:    'Duplicate',
  vendor:       'Vendor',
  bank_change:  'Bank Change',
  identifiers:  'Identifiers',
  visual:       'Visual',
}

/** Monogram avatar from vendor name */
function Monogram({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold select-none"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: 'var(--sidebar-bg)',
        color: 'var(--bg-base)',
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SPARKLINE (tiny 7-point area chart inside KPI card)
// ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
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
        <linearGradient id={`sg-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${color.replace(/[^a-z]/gi, '')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string
  value: number
  format?: 'number' | 'inr'
  icon: React.ElementType
  color: string
  bg?: string
  spark?: number[]
  delta?: number
  delay?: number
  active: boolean
  onClick?: () => void
}

function KpiCard({ label, value, format, icon: Icon, color, bg, spark, delta, delay = 0, active, onClick }: KpiProps) {
  const count = useCountUp(active ? value : 0, 1000)
  const formatted = format === 'inr' ? formatINR(count) : count.toLocaleString('en-IN')
  const reduced = useReducedMotion()

  return (
    <motion.div
      className="p-5 flex flex-col justify-between cursor-default relative overflow-hidden aspect-square"
      style={{ borderRadius: 'var(--radius-3xl)', background: bg ?? 'var(--bg-elevated)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-sm)' }}
      initial={{ opacity: 0, y: 16 }}
      animate={active ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: reduced ? 0 : delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={reduced ? {} : { y: -2, transition: { duration: 0.15 } }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Decorative background blobs */}
      <div 
        className="absolute -top-8 -left-8 w-28 h-28 rounded-full pointer-events-none" 
        style={{ backgroundColor: color === 'var(--text-inverse)' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }} 
      />
      <div 
        className="absolute -bottom-6 -right-6 w-32 h-32 rounded-full pointer-events-none" 
        style={{ backgroundColor: color === 'var(--text-inverse)' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }} 
      />

      <div className="flex items-start justify-between z-10 w-full gap-2">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: color === 'var(--text-inverse)' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)' }}
          >
            <Icon size={16} style={{ color }} aria-hidden="true" />
          </div>
          <span className="text-sm font-bold capitalize tracking-tight leading-tight" style={{ color }}>
            {label}
          </span>
        </div>
        
        {delta != null && (
          <div 
            className="flex items-center justify-center px-2 py-1 rounded-full text-xs font-extrabold z-10 tabular-nums shrink-0"
            style={{ backgroundColor: color === 'var(--text-inverse)' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)', color }}
          >
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </div>
        )}
      </div>

      <div className="z-10 flex-1 flex items-center justify-center w-full mb-6 mt-2 pointer-events-none">
        <span
          className="text-5xl font-black tabular-nums leading-none tracking-tight"
          style={{ color, fontFamily: 'var(--font-mono)' }}
        >
          {format === 'inr' ? '₹' : ''}{formatted.replace('₹', '')}
        </span>
      </div>

      {spark && (
        <div className="absolute bottom-0 left-0 right-0 h-20 opacity-75">
          <Sparkline data={spark} color={color} />
        </div>
      )}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CUSTOM RECHARTS TOOLTIP
// ─────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
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
            {p.name}: <strong className="tabular-nums">{p.value}</strong>
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DONUT LEGEND ITEM
// ─────────────────────────────────────────────────────────────────
function DonutLegendItem({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{pct.toFixed(0)}%</span>
      <div className="h-1 rounded-full overflow-hidden w-full mt-0.5" style={{ background: 'var(--border-default)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────
function DashboardEmpty({ onSeed, onUpload }: { onSeed: () => void; onUpload: () => void }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 px-8 text-center"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'var(--accent-muted)' }}>
        <Activity size={28} style={{ color: 'var(--accent)' }} aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold mb-2">No invoice data yet</h2>
      <p className="text-sm mb-8 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        Load the demo dataset to explore the full dashboard, or upload your first invoice to get started.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button className="btn-primary" onClick={onSeed}>
          <Zap size={15} aria-hidden="true" />
          Load demo data
        </button>
        <button className="btn-ghost" onClick={onUpload}>
          <Upload size={15} aria-hidden="true" />
          Upload an invoice
        </button>
      </div>
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────
// LOADING SKELETON — mirrors the final layout
// ─────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Header */}
      <SkeletonCard className="h-12 w-full max-w-lg" />
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0,1,2,3].map(i => <SkeletonCard key={i} className="h-32" />)}
      </div>
      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <SkeletonCard className="h-64 lg:col-span-2" />
        <SkeletonCard className="h-64" />
      </div>
      {/* Bottom */}
      <div className="grid lg:grid-cols-3 gap-4">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const reduced = useReducedMotion()

  // Root ref for stagger trigger
  const rootRef = useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef, { once: true, amount: 0.05 })

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-stats', dateRange],
    queryFn: () => dashboardApi.stats(dateRange),
    staleTime: 60_000,
  })


  if (isLoading) return <DashboardSkeleton />
  if (error || !data) return (
    <div className="p-6">
      <ErrorState
        title="Failed to load dashboard"
        message="Check that the backend is running, or enable mock mode."
        onRetry={() => refetch()}
      />
    </div>
  )

  const kpis = data.kpis
  const distribution = data.risk_distribution
  let rawTrend = data.trend ?? []
  // Keep fewer days to stretch the graph horizontally (7 days total)
  // To have current date in middle of 7 days: 3 past days + 1 current day = 4 days
  if (rawTrend.length > 4) {
    rawTrend = rawTrend.slice(-4)
  }
  const trend = [...rawTrend]
  if (rawTrend.length > 0) {
    const lastDateStr = rawTrend[rawTrend.length - 1].date
    const padCount = 3 // Add exactly 3 future days to make the total 7 and the current day the exact middle
    
    let currentDate = new Date(`${new Date().getFullYear()}-${lastDateStr.replace('/', '-')}`)
    if (isNaN(currentDate.getTime())) currentDate = new Date()
    
    for (let i = 0; i < padCount; i++) {
      currentDate.setDate(currentDate.getDate() + 1)
      const m = String(currentDate.getMonth() + 1).padStart(2, '0')
      const d = String(currentDate.getDate()).padStart(2, '0')
      trend.push({ date: `${m}-${d}`, low: 0, medium: 0, high: 0, critical: 0 })
    }
  }
  const categories = data.anomaly_categories ?? data.categories ?? {}
  const recentAnalyses = data.recent_analyses ?? []
  const topVendors = data.top_vendors ?? []
  const reviewQueue = data.needs_review_queue ?? []
  const systemStatus = data.system_status
  const sparklines = kpis.sparklines ?? {
    analyzed: [12, 14, 18, 15, 22, 28, 30],
    needs_review: [8, 7, 5, 6, 4, 3, 2],
    high_critical: [1, 2, 1, 3, 2, 4, 3],
    value_at_risk: [100, 120, 110, 150, 180, 160, 200]
  }
  const deltas = kpis.deltas ?? {
    analyzed: 15,
    needs_review: -5,
    high_critical: 2,
    value_at_risk: 8
  }
  const analyzed = kpis.analyzed_count ?? kpis.total_analyzed ?? kpis.total_invoices ?? 0
  const needsReview = kpis.needs_review_count ?? kpis.needs_review ?? 0
  const highCritical = kpis.high_critical_count ?? kpis.high_critical ?? 0
  const valueAtRisk = kpis.value_at_risk ?? 0
  const totalDistrib = (distribution.low + distribution.medium + distribution.high + distribution.critical) || 1

  const isEmpty = analyzed === 0

  const pieData = [
    { name: 'Low',      value: distribution.low,      color: '#C5D9B9', bg: 'var(--risk-low-bg)' },
    { name: 'Medium',   value: distribution.medium,   color: '#9DB591', bg: 'var(--risk-medium-bg)' },
    { name: 'High',     value: distribution.high,     color: '#F3D896', bg: 'var(--risk-high-bg)' },
    { name: 'Critical', value: distribution.critical, color: '#A8A3F4', bg: 'var(--risk-critical-bg)' },
  ]

  const barData = Object.entries(categories)
    .map(([name, value]) => ({
      name: ENGINE_LABELS[name] ?? name,
      key: name,
      value: Number(value),
      color: 'var(--accent)',
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7)

  return (
    <div ref={rootRef} className="p-5 space-y-5 max-w-[1440px] mx-auto overflow-y-auto h-full">

      {/* ── Row 1: Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Overview
          </h1>
          {data.last_updated_at && (
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
              <Clock size={11} aria-hidden="true" />
              Updated {formatRelativeTime(data.last_updated_at)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Refresh */}
          <button
            onClick={() => refetch()}
            className="btn-ghost w-8 h-8 p-0 justify-center"
            aria-label="Refresh data"
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </button>

          {/* Date-range segmented control */}
          <div
            className="flex items-center rounded-lg p-0.5 gap-0.5"
            style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-hairline)' }}
            role="group"
            aria-label="Date range"
          >
            {(['7d', '30d', '90d'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                style={{
                  background: dateRange === r ? 'var(--bg-elevated)' : 'transparent',
                  color: dateRange === r ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  boxShadow: dateRange === r ? 'var(--shadow-sm)' : 'none',
                }}
                aria-pressed={dateRange === r}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────── */}
      {isEmpty && (
        <DashboardEmpty
          onSeed={async () => {
            await fetch('/api/v1/demo/seed', { method: 'POST' }).catch(() => null)
            qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
            toast.success('Demo data loaded')
          }}
          onUpload={() => navigate('/analyze')}
        />
      )}

      {!isEmpty && (
        <>
          {/* ── Main Dashboard Layout ─────────────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-6 mt-4">
            
            {/* ── Left Partition (Risk over time, Categories, Vendors) ── */}
            <div className="lg:col-span-2 flex flex-col gap-6">
{/* ── Row 2: KPI Cards ──────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Invoices analysed"
              value={analyzed}
              icon={FileText}
              color="var(--text-primary)"
              bg="var(--risk-low)"
              spark={sparklines.analyzed}
              delta={deltas.analyzed}
              delay={0}
              active={inView}
              onClick={() => navigate('/history')}
            />
            <KpiCard
              label="Needs review"
              value={needsReview}
              icon={AlertTriangle}
              color="var(--text-primary)"
              bg="var(--risk-medium)"
              spark={sparklines.needs_review}
              delta={deltas.needs_review}
              delay={0.04}
              active={inView}
              onClick={() => navigate('/review')}
            />
            <KpiCard
              label="High + Critical"
              value={highCritical}
              icon={ShieldAlert}
              color="var(--text-inverse)"
              bg="var(--accent)"
              spark={sparklines.high_critical}
              delta={deltas.high_critical}
              delay={0.08}
              active={inView}
              onClick={() => navigate('/history?risk_level=HIGH')}
            />
            <KpiCard
              label="Value at risk"
              value={valueAtRisk}
              format="inr"
              icon={TrendingUp}
              color="var(--text-primary)"
              bg="var(--bg-elevated)"
              spark={sparklines.value_at_risk}
              delta={deltas.value_at_risk}
              delay={0.12}
              active={inView}
            />
          </div>

          
          
              {/* Risk over time — stacked area */}
            <motion.div
              className="rounded-[32px] p-6 flex flex-col gap-4"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.16, duration: 0.45 }}
            >
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
                  Risk over time
                </h2>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Historical trend of flagged invoices
                </p>
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="var(--border-default)" />
                    <defs>
                      {[
                        { id: 'low',      color: 'var(--risk-low-text)' },
                        { id: 'medium',   color: 'var(--risk-medium-text)' },
                        { id: 'high',     color: 'var(--risk-high-text)' },
                        { id: 'critical', color: 'var(--risk-critical-text)' },
                      ].map(({ id, color }) => (
                        <linearGradient key={id} id={`ag-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis
                      dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                      axisLine={false} tickLine={false} interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-default)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="low"      name="Low"      stackId="1" stroke="var(--risk-low-text)"      fill="url(#ag-low)"      strokeWidth={1.5} />
                    <Area type="monotone" dataKey="medium"   name="Medium"   stackId="1" stroke="var(--risk-medium-text)"   fill="url(#ag-medium)"   strokeWidth={1.5} />
                    <Area type="monotone" dataKey="high"     name="High"     stackId="1" stroke="var(--risk-high-text)"     fill="url(#ag-high)"     strokeWidth={1.5} />
                    <Area type="monotone" dataKey="critical" name="Critical" stackId="1" stroke="var(--risk-critical-text)" fill="url(#ag-critical)" strokeWidth={1.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>


              <div className="grid md:grid-cols-2 gap-6">
                {/* Anomaly categories — horizontal bars */}
            <motion.div
              className="rounded-[32px] p-6 flex flex-col gap-4 h-full"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.24, duration: 0.45 }}
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Anomaly Categories</h2>
                  <Link
                    to="/history"
                    className="text-xs flex items-center gap-1 font-medium transition-opacity hover:opacity-75"
                    style={{ color: 'var(--sidebar-bg)' }}
                  >
                    View all <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                </div>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Breakdown of flagged invoices by detection engine
                </p>
              </div>
              <div className="space-y-4 mt-2">
                {barData.map(d => {
                  const EngIcon = ENGINE_ICONS[d.key] ?? Activity
                  const max = barData[0]?.value || 1
                  return (
                    <button
                      key={d.name}
                      className="w-full flex flex-col gap-2 group text-left"
                      onClick={() => navigate(`/history?category=${d.key}`)}
                      aria-label={`${d.name}: ${d.value} findings`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <EngIcon size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                          <span style={{ color: 'var(--text-secondary)' }} className="text-xs font-medium truncate">{d.name}</span>
                        </div>
                        <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--sidebar-bg)' }}
                          initial={{ width: 0 }}
                          animate={inView ? { width: `${(d.value / max) * 100}%` } : {}}
                          transition={{ delay: reduced ? 0 : 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            </motion.div>

                {/* Suspicious vendors */}
            <motion.div
              className="rounded-[32px] p-6 flex flex-col gap-4 h-full"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.28, duration: 0.45 }}
            >
              <div>
                <h2 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Suspicious vendors in The Last Week</h2>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-2xl font-black tabular-nums tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {(deltas?.high_critical ?? 0) > 0 ? '+ ' : ''}{(deltas?.high_critical ?? 0).toFixed(1)}%
                  </span>
                  <Link to="/vendors" className="text-[10px] transition-opacity hover:opacity-75" style={{ color: 'var(--text-tertiary)' }}>
                    See statistics for all time
                  </Link>
                </div>
              </div>
              {topVendors.length === 0 ? (
                <p className="text-xs py-4 text-center mt-auto" style={{ color: 'var(--text-tertiary)' }}>No suspicious vendors detected.</p>
              ) : (
                  <div className="flex items-start h-40 mt-auto">
                    {/* Y-axis */}
                    <div className="flex flex-col justify-between items-end h-28 pb-1 pr-3 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      <span>100</span>
                      <span>75</span>
                      <span>50</span>
                      <span>25</span>
                      <span>0</span>
                    </div>
                    {/* Bars */}
                    <div className="flex-1 flex items-end justify-between px-2 h-full pb-4">
                  {topVendors.slice(0, 7).map((v) => {
                    const score = v.avg_risk_score ?? v.avg_score ?? 0
                    return (
                      <div
                        key={v.id}
                        className="flex flex-col items-center gap-3 group cursor-pointer relative"
                        onClick={() => navigate(`/vendors/${v.id}`)}
                        title={`${v.name}: ${score.toFixed(0)} score`}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-white px-2 py-1 rounded shadow-sm text-xs font-bold z-10 whitespace-nowrap" style={{ color: 'var(--text-primary)', border: '1px solid var(--border-hairline)' }}>
                          {score.toFixed(0)} Risk
                        </div>
                        {/* Bar track */}
                        <div className="relative w-10 h-28 rounded-t-md rounded-b-md overflow-hidden" style={{ background: 'var(--border-strong)' }}>
                          {/* Bar fill */}
                          <motion.div
                            className="absolute bottom-0 left-0 right-0 rounded-t-sm rounded-b-md"
                            style={{ background: 'var(--sidebar-bg)' }}
                            initial={{ height: 0 }}
                            animate={inView ? { height: `${score}%` } : {}}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        {/* Label */}
                        <span className="text-[10px] font-semibold truncate w-12 text-center uppercase" style={{ color: 'var(--text-secondary)' }}>
                          {v.name.substring(0, 3)}
                        </span>
                      </div>
                    )
                  })}
                    </div>
                  </div>
              )}
            </motion.div>

              </div>
            </div>

            {/* ── Right Partition (Risk distribution, Needs review) ── */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              {/* Risk distribution — donut */}
            <motion.div
              className="rounded-[32px] p-6 flex flex-col gap-4"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.2, duration: 0.45 }}
            >
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Risk Distribution</h2>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  High & Critical risk of {(((distribution.high + distribution.critical) / (totalDistrib || 1)) * 100).toFixed(0)}%
                </p>
              </div>
              <div className="flex items-center justify-between gap-6 mt-4 mb-2 px-2">
                <div className="relative shrink-0 flex items-center justify-center" style={{ width: 180, height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        innerRadius="65%"
                        outerRadius="100%"
                        paddingAngle={0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        isAnimationActive={!reduced}
                      >
                        {pieData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.color}
                            stroke="transparent"
                            style={{ cursor: 'pointer', outline: 'none' }}
                            onClick={() => navigate(`/history?risk_level=${entry.name.toUpperCase()}`)}
                            tabIndex={0}
                            aria-label={`${entry.name}: ${entry.value} invoices`}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Centre label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>Total</span>
                    <span
                      className="text-[32px] leading-none font-bold tabular-nums mt-1"
                      style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.02em' }}
                    >
                      {analyzed}
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 flex flex-col gap-3">
                  {pieData.map(d => (
                    <DonutLegendItem
                      key={d.name}
                      label={d.name}
                      pct={totalDistrib > 0 ? (d.value / totalDistrib) * 100 : 0}
                      color={d.color}
                    />
                  ))}
                </div>
              </div>
            </motion.div>

              {/* Needs review mini-queue */}
            <motion.div
              className="rounded-[32px] p-6 flex flex-col gap-4"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.32, duration: 0.45 }}
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Needs Review</h2>
                  <Link to="/review" className="text-xs flex items-center gap-1 font-medium transition-opacity hover:opacity-75" style={{ color: 'var(--sidebar-bg)' }}>
                    Open queue <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                </div>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Invoices requiring urgent manual verification
                </p>
              </div>
              {reviewQueue.length === 0 ? (
                <div className="flex flex-col items-center py-4 gap-2">
                  <CheckCircle2 size={22} style={{ color: 'var(--risk-low-text)' }} aria-hidden="true" />
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>All clear — nothing to review.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reviewQueue.slice(0, 5).map(inv => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 p-3 rounded-2xl transition-colors"
                      style={{ cursor: 'pointer', background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-sm)' }}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/invoices/${inv.id}`)}
                      aria-label={`Open ${inv.invoice_number}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {inv.invoice_number ?? inv.id}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{(inv as any).vendor_name}</p>
                      </div>
                      <RiskBadge level={inv.risk_level ?? scoreToLevel(inv.overall_score ?? 0)} size="sm" />
                      <ExternalLink size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            </div>

          </div>


          {/* ── Row 5: Recent analyses + System status ─────── */}
          <div className="grid lg:grid-cols-3 gap-4">

            {/* Recent analyses feed — lg:col-span-2 */}
            <motion.div
              className="rounded-[32px] p-6 lg:col-span-2 flex flex-col gap-4"
              style={{ background: '#EAE5DB' }}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.36, duration: 0.45 }}
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Recent Analyses</h2>
                  <Link to="/history" className="text-xs flex items-center gap-1 font-medium transition-opacity hover:opacity-75" style={{ color: 'var(--sidebar-bg)' }}>
                    Full history <ChevronRight size={12} aria-hidden="true" />
                  </Link>
                </div>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Log of most recently processed invoices
                </p>
              </div>
              {recentAnalyses.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No recent activity.</p>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--border-hairline)' }}>
                  {recentAnalyses.map((inv, i) => (
                    <motion.div
                      key={inv.id}
                      className="flex items-center gap-4 py-2.5 cursor-pointer group"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      initial={{ opacity: 0, x: -8 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: reduced ? 0 : 0.4 + i * 0.05, duration: 0.35 }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && navigate(`/invoices/${inv.id}`)}
                      aria-label={`Open invoice ${inv.invoice_number}`}
                    >
                      {/* Monogram */}
                      <Monogram name={(inv as any).vendor_name ?? inv.invoice_number ?? '?'} size={30} />
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {(inv as any).vendor_name ?? '—'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {inv.invoice_number ?? inv.id}
                        </p>
                      </div>
                      {/* Amount */}
                      <div className="hidden sm:flex justify-end w-16 shrink-0">
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {inv.grand_total ? formatINR(inv.grand_total) : '—'}
                        </span>
                      </div>
                      {/* Risk badge */}
                      <div className="flex justify-start w-28 shrink-0">
                        <RiskBadge level={inv.risk_level ?? scoreToLevel(inv.overall_score ?? 0)} size="sm" />
                      </div>
                      {/* Time */}
                      <div className="hidden md:flex justify-end w-12 shrink-0">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {formatRelativeTime(inv.created_at)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* System status */}
            <motion.div
              className="surface p-5 flex flex-col gap-3"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: reduced ? 0 : 0.4, duration: 0.45 }}
            >
              <div className="flex flex-col mb-1">
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>System Status</h2>
                <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  Active machine learning pipeline
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Model loaded */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Model</span>
                  <span
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium"
                    style={
                      systemStatus?.model_loaded
                        ? { background: 'var(--risk-low-bg)', color: 'var(--risk-low-text)', border: '1px solid var(--risk-low-border)' }
                        : { background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)', border: '1px solid var(--risk-critical-border)' }
                    }
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: systemStatus?.model_loaded ? 'var(--risk-low-text)' : 'var(--risk-critical-text)' }}
                      aria-hidden="true"
                    />
                    {systemStatus?.model_loaded ? 'Loaded' : 'Not loaded'}
                  </span>
                </div>

                {/* Fusion mode */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>Fusion mode</span>
                  <span
                    className="flex items-center gap-1 tabular-nums font-medium"
                    style={{ color: 'var(--sidebar-bg)', fontFamily: 'var(--font-mono)' }}
                  >
                    <Cpu size={11} aria-hidden="true" />
                    {systemStatus?.fusion_mode ?? '—'}
                  </span>
                </div>

                {/* ROC-AUC */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>ROC-AUC</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {systemStatus?.roc_auc?.toFixed(4) ?? '—'}
                  </span>
                </div>

                {/* PR-AUC */}
                <div className="flex items-center justify-between">
                  <span style={{ color: 'var(--text-secondary)' }}>PR-AUC</span>
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {systemStatus?.pr_auc?.toFixed(4) ?? '—'}
                  </span>
                </div>

                {/* Engines */}
                {systemStatus?.engines_enabled && (
                  <div className="mt-2">
                    <span className="block mb-2" style={{ color: 'var(--text-secondary)' }}>Engines enabled</span>
                    <div className="grid grid-cols-2 gap-2">
                      {systemStatus.engines_enabled.map(e => {
                        const EIcon = ENGINE_ICONS[e] ?? Activity
                        return (
                          <span
                            key={e}
                            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs"
                            style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', border: '1px solid var(--border-hairline)' }}
                            title={ENGINE_LABELS[e] ?? e}
                          >
                            <EIcon size={11} aria-hidden="true" style={{ color: 'var(--sidebar-bg)' }} />
                            <span className="truncate">{e.replace('_', ' ')}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {systemStatus?.last_evaluated_at && (
                  <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid var(--border-hairline)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>Last evaluated</span>
                    <span style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {formatDate(systemStatus.last_evaluated_at)}
                    </span>
                  </div>
                )}
              </div>

              <Link
                to="/insights"
                className="text-sm mt-auto flex items-center gap-1 font-bold transition-opacity hover:opacity-75"
                style={{ color: 'var(--sidebar-bg)', paddingLeft: 0, paddingBottom: 0 }}
              >
                Model Insights <ExternalLink size={11} aria-hidden="true" />
              </Link>
            </motion.div>

          </div>
        </>
      )}
    </div>
  )
}
