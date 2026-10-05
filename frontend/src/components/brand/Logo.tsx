/**
 * InvoiceGuard Logo — single source of truth for the brand mark.
 *
 * Mark concept: a document with a folded top-right corner crossed by
 * a horizontal scan line, with one accent-coloured dot at the point
 * of anomaly detection. No shield, no padlock, no magnifier.
 *
 * Variants:
 *   "full"      — mark + wordmark (default)
 *   "mark"      — mark only (sidebar icon-only collapsed state)
 *   "mono"      — mark only, monochrome (currentColor)
 *
 * Sizes: pass explicit `size` for the mark height in px (default 28).
 * The wordmark scales proportionally.
 *
 * Animation: the scan line sweeps once across the mark on mount
 * (CSS animation, respects prefers-reduced-motion via .logo-scan-line).
 */

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface LogoProps {
  variant?: 'full' | 'mark' | 'mono'
  /** Mark height in px. Wordmark scales to match. */
  size?: number
  /** Whether to play the one-shot scan animation on mount. */
  animated?: boolean
  className?: string
  wordmarkColor?: string
}

// ── Mark SVG ─────────────────────────────────────────────────────
// 24 × 24 grid, designed to read at 16 px (favicon) through 48 px.
// The scan line and anomaly dot use CSS var(--accent) for theme support.
function MarkSvg({ size = 28, mono = false }: { size?: number; mono?: boolean }) {
  const scanRef = useRef<SVGLineElement>(null)

  useEffect(() => {
    // Trigger the CSS animation class after mount
    const el = scanRef.current
    if (!el) return
    el.classList.add('logo-scan-line')
    const cleanup = () => el.classList.remove('logo-scan-line')
    el.addEventListener('animationend', cleanup, { once: true })
    return cleanup
  }, [])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      {/* ── Document body ──────────────────────────────────────── */}
      <path
        d="M4 2 H14 L20 8 V22 H4 Z"
        fill={mono ? 'currentColor' : 'var(--bg-elevated)'}
        fillOpacity={mono ? 0.15 : 1}
        stroke={mono ? 'currentColor' : 'var(--border-strong)'}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* ── Folded corner ──────────────────────────────────────── */}
      <path
        d="M14 2 L20 8 H14 Z"
        fill={mono ? 'currentColor' : 'var(--bg-overlay)'}
        fillOpacity={mono ? 0.22 : 1}
        stroke={mono ? 'currentColor' : 'var(--border-strong)'}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />

      {/* ── Content stubs (3 text rows) ────────────────────────── */}
      <line x1="7" y1="12" x2="11.5" y2="12"
        stroke={mono ? 'currentColor' : 'var(--text-tertiary)'}
        strokeWidth="1.2" strokeLinecap="round" opacity="0.7"
      />
      <line x1="15" y1="12" x2="17" y2="12"
        stroke={mono ? 'currentColor' : 'var(--text-tertiary)'}
        strokeWidth="1.2" strokeLinecap="round" opacity="0.7"
      />
      <line x1="7" y1="15.5" x2="17" y2="15.5"
        stroke={mono ? 'currentColor' : 'var(--text-tertiary)'}
        strokeWidth="1.2" strokeLinecap="round" opacity="0.5"
      />
      <line x1="7" y1="19" x2="14" y2="19"
        stroke={mono ? 'currentColor' : 'var(--text-tertiary)'}
        strokeWidth="1.2" strokeLinecap="round" opacity="0.35"
      />

      {/* ── Scan line (horizontal, accent-coloured) ────────────── */}
      {/* Clip so it stays inside the document shape */}
      <clipPath id="ig-doc-clip">
        <path d="M4 2 H14 L20 8 V22 H4 Z" />
      </clipPath>
      <line
        ref={scanRef}
        x1="4" y1="12" x2="20" y2="12"
        stroke={mono ? 'currentColor' : 'var(--accent)'}
        strokeWidth="1"
        opacity={mono ? 0.4 : 0.65}
        strokeLinecap="round"
        clipPath="url(#ig-doc-clip)"
        /* translateY starts at -100% of document height; CSS keyframes move it */
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />

      {/* ── Anomaly detection dot (accent, filled) ─────────────── */}
      <circle
        cx="13" cy="12" r="2.4"
        fill={mono ? 'currentColor' : 'var(--accent)'}
        fillOpacity={mono ? 0.85 : 1}
      />
      {/* Inner white notch — the "flagged" indicator */}
      <circle
        cx="13" cy="12" r="0.9"
        fill={mono ? 'var(--bg-base)' : '#fff'}
        opacity="0.9"
      />
    </svg>
  )
}

// ── Logo Component ────────────────────────────────────────────────
export function Logo({ variant = 'full', size = 28, animated = false, className, wordmarkColor = 'var(--text-primary)' }: LogoProps) {
  void animated // animation is handled by the CSS keyframe on mount inside MarkSvg

  if (variant === 'mark' || variant === 'mono') {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <MarkSvg size={size} mono={variant === 'mono'} />
      </span>
    )
  }

  // Full variant: mark + wordmark
  const wordmarkSize = Math.round(size * 0.5) // em-equivalent
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <MarkSvg size={size} />
      <span
        style={{
          fontSize: wordmarkSize,
          lineHeight: 1,
          letterSpacing: '-0.025em',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontWeight: 400, color: wordmarkColor }}>Invoice</span>
        <span style={{ fontWeight: 600, color: wordmarkColor }}>Guard</span>
      </span>
    </span>
  )
}

export default Logo
