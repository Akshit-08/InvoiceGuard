import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/api/client'
import { AlertCircle, CheckCircle2, FileText, ShieldAlert, Copy } from 'lucide-react'
import { KpiCard, ErrorState, SkeletonCard } from '@/components/ui'
import { RiskBadge } from '@/components/RiskBadge'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { Disclaimer } from '@/components/ui'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const RISK_COLORS = {
  low:      'var(--risk-low)',
  medium:   'var(--risk-medium)',
  high:     'var(--risk-high)',
  critical: 'var(--risk-critical)',
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
  })

  if (isLoading) return (
    <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )

  if (error) return (
    <ErrorState
      title="Could not load dashboard"
      message="Check the backend is running on port 8000."
      onRetry={() => refetch()}
    />
  )

  const stats = data!
  const distribution = stats.risk_distribution ?? { low: 0, medium: 0, high: 0, critical: 0 }
  const pieData = Object.entries(distribution).map(([name, value]) => ({ name, value }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Overview of invoice risk across all processed documents.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Invoices"    value={stats.total_invoices}  icon={FileText}     />
        <KpiCard label="Analysed"          value={stats.analyzed}        icon={CheckCircle2} accent="var(--risk-low-bg)" />
        <KpiCard label="Needs Review"      value={stats.needs_review}    icon={AlertCircle}  accent="var(--risk-medium-bg)" />
        <KpiCard label="High / Critical"   value={stats.high_critical}   icon={ShieldAlert}  accent="var(--risk-critical-bg)" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Risk distribution donut */}
        <div className="surface p-6">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Risk Distribution</h2>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                  {pieData.map(entry => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name as keyof typeof RISK_COLORS] ?? '#888'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12, color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2.5 flex-1">
              {pieData.map(entry => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RISK_COLORS[entry.name as keyof typeof RISK_COLORS] ?? '#888' }} />
                  <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
                  <span className="ml-auto text-xs tabular-nums font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Duplicate alerts */}
        <div className="surface p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Key Metrics</h2>
          <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
            <div className="flex items-center gap-2">
              <Copy size={14} style={{ color: 'var(--risk-high-text)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Duplicate Alerts</span>
            </div>
            <span className="text-lg font-bold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: 'var(--risk-high-text)' }}>
              {stats.duplicate_alerts}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            InvoiceGuard flags anomalies for human review. It does not determine fraud.
          </p>
          <Link to="/analyze" className="btn-primary mt-auto self-start text-sm">
            Analyse a new invoice
          </Link>
        </div>
      </div>

      {/* Recent analyses */}
      {stats.recent_analyses && stats.recent_analyses.length > 0 && (
        <div className="surface">
          <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Recent Analyses</h2>
          </div>
          <div className="divide-y" style={{ '--divide-color': 'var(--border-hairline)' } as React.CSSProperties}>
            {stats.recent_analyses.slice(0, 8).map(inv => (
              <Link
                key={inv.id}
                to={`/invoices/${inv.id}`}
                className="flex items-center gap-4 px-6 py-3 transition-colors duration-100"
                style={{ display: 'flex' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {inv.invoice_number ?? inv.id}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {inv.vendor_name} · {formatRelativeTime(inv.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm tabular-nums font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatCurrency(inv.grand_total)}
                  </span>
                  {inv.risk_level && <RiskBadge level={inv.risk_level} size="sm" />}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
