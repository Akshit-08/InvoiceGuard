import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SeverityChip, ConfidenceMeter } from './RiskBadge'
import type { Finding } from '@/api/types'
import { cn } from '@/lib/utils'

interface FindingCardProps {
  finding: Finding
  isSelected?: boolean
  onSelect?: () => void
  index?: number
}

export function FindingCard({ finding, isSelected, onSelect, index = 0 }: FindingCardProps) {
  const [expanded, setExpanded] = useState(false)

  const handleClick = () => {
    setExpanded(e => !e)
    onSelect?.()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={cn(
          'rounded-xl border transition-all duration-150 cursor-pointer',
          isSelected ? 'border-[var(--accent)]' : 'border-[var(--border-hairline)]',
        )}
        style={{
          background: isSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
          boxShadow: isSelected ? 'inset 0 0 0 1px var(--accent)' : undefined,
        }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
        aria-expanded={expanded}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <SeverityChip severity={finding.severity} />
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-subtle)', color: 'var(--text-tertiary)' }}>
                {finding.type}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {finding.engine}
              </span>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {finding.title}
            </p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
              {finding.summary}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
            >
              {finding.score.toFixed(0)}
            </span>
            <ConfidenceMeter confidence={finding.confidence} className="w-20" />
          </div>
          <div className="text-[var(--text-tertiary)] ml-1">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>

        {/* Expanded evidence */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
                {/* Expected vs Found diff */}
                {(finding.evidence.expected != null || finding.evidence.found != null) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3" style={{ background: 'var(--bg-subtle)' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        Expected
                      </p>
                      <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--risk-low-text)' }}>
                        {formatEvidence(finding.evidence.expected)}
                      </p>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: 'var(--risk-high-bg)' }}>
                      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        Found
                      </p>
                      <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--risk-high-text)' }}>
                        {formatEvidence(finding.evidence.found)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Difference */}
                {finding.evidence.difference != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Difference:</span>
                    <span className="text-xs font-mono font-medium tabular-nums" style={{ color: 'var(--risk-critical-text)' }}>
                      {formatEvidence(finding.evidence.difference)}
                    </span>
                  </div>
                )}

                {/* Recommendation */}
                {finding.recommended_action && (
                  <div
                    className="mt-3 p-3 rounded-lg text-xs"
                    style={{ background: 'var(--accent-muted)', color: 'var(--text-secondary)' }}
                  >
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>Recommended: </span>
                    {finding.recommended_action}
                  </div>
                )}

                {/* Field location */}
                {finding.field && (
                  <p className="mt-2 text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    Field: <span style={{ color: 'var(--text-secondary)' }}>{finding.field}</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function formatEvidence(val: unknown): string {
  if (val == null) return '—'
  if (typeof val === 'number') {
    // If it looks like currency (> 1)
    if (Math.abs(val) > 1 && Number.isFinite(val)) return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    return val.toString()
  }
  return String(val)
}
