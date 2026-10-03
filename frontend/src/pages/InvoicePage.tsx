import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { invoiceApi } from '@/api/client'
import { RiskGauge, SignalBars } from '@/components/RiskGauge'
import { RiskBadge } from '@/components/RiskBadge'
import { FindingCard } from '@/components/FindingCard'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <SkeletonCard className="h-20" />
      <div className="grid lg:grid-cols-2 gap-6">
        <SkeletonCard className="h-96" />
        <SkeletonCard className="h-96" />
      </div>
    </div>
  )

  if (error || !data) return (
    <ErrorState
      title="Invoice not found"
      message={error instanceof Error ? error.message : 'This invoice could not be loaded.'}
      onRetry={() => refetch()}
    />
  )

  const level = data.risk_level ?? (data.overall_score != null ? scoreToLevel(data.overall_score) : undefined)
  const signals = data.signals ?? data.risk?.signals ?? {}

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {level && <RiskBadge level={level} />}
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--bg-subtle)', color: 'var(--text-tertiary)' }}>
              {data.id}
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            {data.invoice_number ?? 'Invoice Analysis'}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {data.vendor?.name} · {formatDate(data.invoice_date)} · {formatCurrency(data.grand_total)}
          </p>
        </div>

        {/* Risk score */}
        {data.overall_score != null && level && (
          <RiskGauge score={data.overall_score} level={level} size={140} />
        )}
      </div>

      {/* Disclaimer */}
      <div
        className="flex items-start gap-2 p-3 rounded-xl text-xs"
        style={{ background: 'var(--accent-muted)', color: 'var(--text-secondary)', border: '1px solid var(--accent-border)' }}
        role="note"
      >
        <AlertCircle size={14} style={{ color: 'var(--accent)' }} className="shrink-0 mt-0.5" />
        InvoiceGuard flags anomalies for human review. It does not determine fraud.
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Signal bars */}
        {Object.keys(signals).length > 0 && (
          <div className="surface p-6">
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Signal Scores</h2>
            <SignalBars signals={signals} />
          </div>
        )}

        {/* Recommendation */}
        {data.risk?.recommendation && (
          <div className="surface p-6 flex flex-col gap-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Recommendation</h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {data.risk.recommendation}
            </p>
            {data.risk.escalations && data.risk.escalations.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.risk.escalations.map((esc, i) => (
                  <p key={i} className="text-xs p-2 rounded-lg" style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)' }}>
                    {esc}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Findings */}
      {data.findings && data.findings.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            Findings ({data.findings.length})
          </h2>
          <div className="space-y-2">
            {data.findings
              .sort((a, b) => b.score - a.score)
              .map((f, i) => (
                <FindingCard key={f.id} finding={f} index={i} />
              ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
