import { AlertCircle, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'

interface EmptyStateProps {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  icon?: React.ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <div className="mb-4 opacity-30" style={{ color: 'var(--text-tertiary)' }}>
        {icon ?? (
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect x="8" y="12" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2" />
            <path d="M8 20h48" stroke="currentColor" strokeWidth="2" />
            <path d="M20 32h24M20 40h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && (
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      )}
      {action && (
        <button className="btn-primary mt-4" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </motion.div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-8 text-center"
    >
      <AlertCircle size={40} className="mb-4" style={{ color: 'var(--risk-critical-text)' }} aria-hidden="true" />
      <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {message && (
        <p className="text-sm max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{message}</p>
      )}
      {onRetry && (
        <button className="btn-ghost mt-4" onClick={onRetry}>
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </motion.div>
  )
}

// ── Skeletons ─────────────────────────────────────────────────
export function SkeletonLine({ width = '100%', height = 16, className = '' }: { width?: string | number; height?: number; className?: string }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius: 4 }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`surface p-4 space-y-3 ${className}`} aria-hidden="true">
      <SkeletonLine width="60%" height={14} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="80%" height={12} />
    </div>
  )
}

// ── Disclaimer footer ─────────────────────────────────────────
export function Disclaimer() {
  return (
    <p
      className="text-xs text-center py-4 px-6 border-t"
      style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-hairline)' }}
      role="note"
    >
      InvoiceGuard flags anomalies for human review. It does not determine fraud. Demo data is synthetic.
    </p>
  )
}

// ── KPI Card ─────────────────────────────────────────────────
import { useCountUp } from '@/hooks/useMotion'
import type { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: number
  icon: LucideIcon
  delta?: number
  deltaLabel?: string
  format?: 'number' | 'currency'
  accent?: string
}

export function KpiCard({ label, value, icon: Icon, delta, deltaLabel, format = 'number', accent }: KpiCardProps) {
  const displayValue = useCountUp(value)
  const formatted = format === 'currency'
    ? `₹${displayValue.toLocaleString('en-IN')}`
    : displayValue.toLocaleString('en-IN')

  return (
    <div className="surface p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: accent ?? 'var(--accent-muted)' }}
        >
          <Icon size={16} style={{ color: accent ? 'white' : 'var(--accent)' }} aria-hidden="true" />
        </div>
      </div>
      <div>
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        >
          {formatted}
        </span>
      </div>
      {delta != null && (
        <div className="flex items-center gap-1">
          <span
            className="text-xs tabular-nums"
            style={{ color: delta >= 0 ? 'var(--risk-low-text)' : 'var(--risk-critical-text)' }}
          >
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
          {deltaLabel && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{deltaLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
