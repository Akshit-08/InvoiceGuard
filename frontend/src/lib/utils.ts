import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RiskLevel, Severity } from '@/api/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Risk level helpers ───────────────────────────────────────
export function riskLevelLabel(level: RiskLevel): string {
  return level.charAt(0) + level.slice(1).toLowerCase()
}

export function riskLevelColor(level: RiskLevel | undefined): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low-text)'
    case 'MEDIUM':   return 'var(--risk-medium-text)'
    case 'HIGH':     return 'var(--risk-high-text)'
    case 'CRITICAL': return 'var(--risk-critical-text)'
    default:         return 'var(--text-secondary)'
  }
}

export function riskLevelBg(level: RiskLevel | undefined): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low-bg)'
    case 'MEDIUM':   return 'var(--risk-medium-bg)'
    case 'HIGH':     return 'var(--risk-high-bg)'
    case 'CRITICAL': return 'var(--risk-critical-bg)'
    default:         return 'var(--bg-subtle)'
  }
}

export function riskLevelBorder(level: RiskLevel | undefined): string {
  switch (level) {
    case 'LOW':      return 'var(--risk-low-border)'
    case 'MEDIUM':   return 'var(--risk-medium-border)'
    case 'HIGH':     return 'var(--risk-high-border)'
    case 'CRITICAL': return 'var(--risk-critical-border)'
    default:         return 'var(--border-default)'
  }
}

// ── Severity helpers ──────────────────────────────────────────
export function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical': return 'var(--risk-critical-text)'
    case 'high':     return 'var(--risk-high-text)'
    case 'medium':   return 'var(--risk-medium-text)'
    case 'low':      return 'var(--risk-low-text)'
    case 'info':     return 'var(--risk-info-text)'
    default:         return 'var(--text-secondary)'
  }
}

// ── Number formatting ─────────────────────────────────────────
export function formatCurrency(amount: number | undefined, currency = 'INR'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatScore(score: number | undefined): string {
  if (score == null) return '—'
  return score.toFixed(1)
}

export function formatPercent(value: number | undefined): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const secs = diff / 1000
    if (secs < 60) return 'just now'
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`
    return formatDate(dateStr)
  } catch {
    return dateStr
  }
}

// ── Mask account number ──────────────────────────────────────
export function maskAccount(acct: string | undefined): string {
  if (!acct) return '—'
  if (acct.startsWith('XXXXXX')) return acct
  const digits = acct.replace(/\D/g, '')
  if (digits.length <= 4) return acct
  return `XXXXXX${digits.slice(-4)}`
}

// ── Score to risk level ───────────────────────────────────────
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return 'CRITICAL'
  if (score >= 60) return 'HIGH'
  if (score >= 30) return 'MEDIUM'
  return 'LOW'
}

// ── Clamp ────────────────────────────────────────────────────
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// ── Signal display name ───────────────────────────────────────
export function signalDisplayName(key: string): string {
  const map: Record<string, string> = {
    financial:    'Financial Rules',
    tax_identity: 'Tax & Identity',
    duplicate:    'Duplicate Check',
    vendor:       'Vendor Behaviour',
    bank_change:  'Bank Change',
    identifiers:  'Identifiers & Dates',
    visual:       'Visual Forensics',
    extraction:   'Extraction Quality',
  }
  return map[key] ?? key.replace(/_/g, ' ')
}
