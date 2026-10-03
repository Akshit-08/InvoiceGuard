'use client'
import { motion } from 'framer-motion'
import { useCountUp, useReducedMotion } from '@/hooks/useMotion'
import { riskLevelColor, riskLevelLabel } from '@/lib/utils'
import type { RiskLevel } from '@/api/types'

interface RiskGaugeProps {
  score: number
  level: RiskLevel
  size?: number
  animate?: boolean
}

const LEVEL_COLORS: Record<RiskLevel, string> = {
  LOW:      'var(--risk-low)',
  MEDIUM:   'var(--risk-medium)',
  HIGH:     'var(--risk-high)',
  CRITICAL: 'var(--risk-critical)',
}

export function RiskGauge({ score, level, size = 160, animate = true }: RiskGaugeProps) {
  const reduced = useReducedMotion()
  const displayScore = useCountUp(score, animate && !reduced ? 1200 : 0)

  const cx = size / 2
  const cy = size / 2
  const r = (size - 20) / 2
  // We draw a 270-degree arc (from 135° to 405°, i.e. bottom-left clockwise to bottom-right)
  const startAngle = 135
  const sweepDegrees = 270
  const endAngle = startAngle + sweepDegrees

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const polarToCartesian = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  })

  // Track path (full arc)
  const trackStart = polarToCartesian(startAngle)
  const trackEnd = polarToCartesian(endAngle)
  const trackPath = [
    `M ${trackStart.x} ${trackStart.y}`,
    `A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`,
  ].join(' ')

  // Fill path (proportional)
  const fillFraction = Math.max(0, Math.min(1, score / 100))
  const fillAngle = startAngle + sweepDegrees * fillFraction
  const fillEnd = polarToCartesian(fillAngle)
  const fillLargeArc = sweepDegrees * fillFraction > 180 ? 1 : 0
  const fillPath = [
    `M ${trackStart.x} ${trackStart.y}`,
    `A ${r} ${r} 0 ${fillLargeArc} 1 ${fillEnd.x} ${fillEnd.y}`,
  ].join(' ')

  const color = LEVEL_COLORS[level]
  const strokeWidth = size * 0.065

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Risk score: ${score.toFixed(1)}, level: ${riskLevelLabel(level)}`}
    >
      <svg width={size} height={size} className="absolute inset-0">
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--bg-subtle)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Glow blur layer */}
        <path
          d={fillPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          opacity={0.25}
          filter="blur(4px)"
        />
        {/* Animated fill */}
        {animate && !reduced ? (
          <motion.path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Score readout */}
      <div className="flex flex-col items-center z-10">
        <span
          className="tabular-nums font-bold leading-none"
          style={{
            fontSize: size * 0.22,
            color,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {displayScore.toFixed(0)}
        </span>
        <span
          className="text-xs font-semibold uppercase tracking-wider mt-1"
          style={{ color, fontSize: size * 0.07 }}
        >
          {riskLevelLabel(level)}
        </span>
        <span
          className="text-xs mt-0.5"
          style={{ color: 'var(--text-tertiary)', fontSize: size * 0.065 }}
        >
          Risk Score
        </span>
      </div>
    </div>
  )
}

// ── Signal bars (7 signals at a glance) ──────────────────────
interface SignalBarsProps {
  signals: Record<string, number>
  className?: string
}

import { signalDisplayName, scoreToLevel } from '@/lib/utils'

export function SignalBars({ signals, className }: SignalBarsProps) {
  const entries = Object.entries(signals).filter(([k]) => k !== 'extraction')

  return (
    <div className={className}>
      {entries.map(([key, value], i) => {
        const level = scoreToLevel(value)
        const color = LEVEL_COLORS[level]
        return (
          <motion.div
            key={key}
            className="flex items-center gap-3 py-1.5"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
          >
            <span
              className="text-xs w-36 truncate"
              style={{ color: 'var(--text-secondary)' }}
              title={signalDisplayName(key)}
            >
              {signalDisplayName(key)}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ delay: i * 0.05 + 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span
              className="text-xs tabular-nums w-8 text-right"
              style={{ color: riskLevelColor(level), fontFamily: 'var(--font-mono)' }}
            >
              {value.toFixed(0)}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
