import { AlertCircle, AlertTriangle, CheckCircle2, Info, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RiskLevel, Severity } from '@/api/types'

// ── RiskBadge ─────────────────────────────────────────────────
interface RiskBadgeProps {
  level: RiskLevel
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const levelConfig = {
  LOW:      { label: 'Low Risk',      Icon: CheckCircle2,   bg: 'var(--risk-low-bg)',      border: 'var(--risk-low-border)',      color: 'var(--risk-low-text)' },
  MEDIUM:   { label: 'Medium Risk',   Icon: AlertTriangle,  bg: 'var(--risk-medium-bg)',   border: 'var(--risk-medium-border)',   color: 'var(--risk-medium-text)' },
  HIGH:     { label: 'High Risk',     Icon: AlertCircle,    bg: 'var(--risk-high-bg)',     border: 'var(--risk-high-border)',     color: 'var(--risk-high-text)' },
  CRITICAL: { label: 'Critical Risk', Icon: Zap,            bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)', color: 'var(--risk-critical-text)' },
}

export function RiskBadge({ level, size = 'md', className }: RiskBadgeProps) {
  const normLevel = (level ? String(level).toUpperCase() : 'LOW') as RiskLevel
  const config = levelConfig[normLevel] || levelConfig.LOW
  const { Icon } = config
  const sizeClass = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  }[size]
  const iconSize = { sm: 12, md: 14, lg: 16 }[size]

  return (
    <span
      className={cn('inline-flex items-center font-medium rounded-full border', sizeClass, className)}
      style={{
        background: config.bg,
        borderColor: config.border,
        color: config.color,
      }}
      role="status"
      aria-label={config.label}
    >
      <Icon size={iconSize} aria-hidden="true" />
      {config.label}
    </span>
  )
}

// ── SeverityChip ──────────────────────────────────────────────
interface SeverityChipProps {
  severity: Severity
  className?: string
}

const severityConfig: Record<Severity, { label: string; Icon: typeof Info; bg: string; border: string; color: string }> = {
  info:     { label: 'Info',     Icon: Info,          bg: 'var(--risk-info-bg)',      border: 'var(--risk-info-border)',      color: 'var(--risk-info-text)' },
  low:      { label: 'Low',      Icon: CheckCircle2,  bg: 'var(--risk-low-bg)',       border: 'var(--risk-low-border)',       color: 'var(--risk-low-text)' },
  medium:   { label: 'Medium',   Icon: AlertTriangle, bg: 'var(--risk-medium-bg)',    border: 'var(--risk-medium-border)',    color: 'var(--risk-medium-text)' },
  high:     { label: 'High',     Icon: AlertCircle,   bg: 'var(--risk-high-bg)',      border: 'var(--risk-high-border)',      color: 'var(--risk-high-text)' },
  critical: { label: 'Critical', Icon: Zap,           bg: 'var(--risk-critical-bg)', border: 'var(--risk-critical-border)', color: 'var(--risk-critical-text)' },
}

export function SeverityChip({ severity, className }: SeverityChipProps) {
  const normSev = (severity ? String(severity).toLowerCase() : 'info') as Severity
  const config = severityConfig[normSev] || severityConfig.info
  const { Icon } = config
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', className)}
      style={{ background: config.bg, borderColor: config.border, color: config.color }}
      aria-label={`Severity: ${config.label}`}
    >
      <Icon size={11} aria-hidden="true" />
      {config.label}
    </span>
  )
}

// ── ConfidenceMeter ───────────────────────────────────────────
interface ConfidenceMeterProps {
  confidence: number
  showLabel?: boolean
  className?: string
}

export function ConfidenceMeter({ confidence, showLabel = true, className }: ConfidenceMeterProps) {
  const pct = Math.round(confidence * 100)
  const color = pct >= 80 ? 'var(--risk-low)' : pct >= 50 ? 'var(--risk-medium)' : 'var(--risk-high)'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 rounded-full overflow-hidden flex-1"
        style={{ background: 'rgba(0, 0, 0, 0.08)', minWidth: 40 }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confidence: ${pct}%`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showLabel && (
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', minWidth: 30 }}>
          {pct}%
        </span>
      )}
    </div>
  )
}
