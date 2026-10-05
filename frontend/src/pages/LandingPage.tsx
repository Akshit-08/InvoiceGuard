/**
 * LandingPage — scroll-animated product landing.
 *
 * Hero animation (InvoiceMockScan) is preserved exactly as designed.
 * "How it works" uses sticky-scroll storytelling on desktop and
 * viewport-triggered animations on mobile.
 *
 * Animation rules followed throughout:
 * - Only transform + opacity animated
 * - will-change used sparingly (auto-managed by Framer Motion)
 * - prefers-reduced-motion: static final states, no scroll hijacking
 * - No layout shift; lazy-mount heavy stage SVGs
 */

import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)
import {
  Upload, ChevronRight, ArrowRight,
  Calculator, Fingerprint, Copy, Building2, CreditCard, Eye, CheckCircle2,
  AlertTriangle, AlertCircle, Zap,
  FileText, Layers, ScanLine, FileSearch, ShieldCheck, Cpu,
} from 'lucide-react'
import { useReducedMotion, useCountUp } from '@/hooks/useMotion'
import { Logo } from '@/components/brand/Logo'

// ─────────────────────────────────────────────────────────────────
// HERO ANIMATION — unchanged from design-v2
// ─────────────────────────────────────────────────────────────────
function InvoiceMockScan() {
  const reduced = useReducedMotion()

  const ANOMALY_BOXES = [
    { x: '62%', y: '30%', w: '28%', h: '5%', label: 'LINE TOTAL MISMATCH',  severity: 'high'     as const, delay: 1.2 },
    { x: '62%', y: '50%', w: '28%', h: '5%', label: 'GRAND TOTAL MISMATCH', severity: 'critical' as const, delay: 1.6 },
    { x: '8%',  y: '63%', w: '32%', h: '4%', label: 'BANK ACCOUNT CHANGED', severity: 'high'     as const, delay: 2.0 },
    { x: '8%',  y: '22%', w: '38%', h: '5%', label: 'VENDOR OUTLIER',       severity: 'medium'   as const, delay: 2.4 },
  ]

  const severityColors = {
    critical: { border: 'var(--risk-critical-text)', bg: 'var(--risk-critical-bg)', text: 'var(--risk-critical-text)' },
    high:     { border: 'var(--risk-high-text)',     bg: 'var(--risk-high-bg)',      text: 'var(--risk-high-text)' },
    medium:   { border: 'var(--risk-medium-text)',   bg: 'var(--risk-medium-bg)',    text: 'var(--risk-medium-text)' },
    low:      { border: 'var(--risk-low-text)',      bg: 'var(--risk-low-bg)',       text: 'var(--risk-low-text)' },
  }

  return (
    <div
      className="relative mx-auto"
      style={{ maxWidth: 480, perspective: 1000 }}
      role="img"
      aria-label="Animated invoice document being scanned for anomalies"
    >
      <motion.div
        className="relative rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-xl)' }}
        initial={{ opacity: 0, rotateY: -8, y: 20 }}
        animate={{ opacity: 1, rotateY: 0, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Invoice content skeleton */}
        <div className="p-6 text-xs" style={{ fontFamily: 'var(--font-mono)', minHeight: 380 }}>
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                Apex Cloud Technologies Pvt Ltd
              </div>
              <div style={{ color: 'var(--text-tertiary)' }}>GSTIN: 27AABCA1234F1Z9</div>
              <div style={{ color: 'var(--text-tertiary)' }}>Unit 402, Trade Tower, Mumbai</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>INVOICE</div>
              <div style={{ color: 'var(--text-secondary)' }}>No: INV-2026-0042</div>
              <div style={{ color: 'var(--text-secondary)' }}>Date: 15 Mar 2026</div>
            </div>
          </div>

          {/* Line items table */}
          <div className="border rounded-lg overflow-hidden mb-4" style={{ borderColor: 'var(--border-hairline)' }}>
            <div className="flex px-3 py-2 text-xs font-semibold border-b" style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-hairline)', color: 'var(--text-secondary)' }}>
              <span className="flex-1">Description</span>
              <span className="w-12 text-right">Qty</span>
              <span className="w-20 text-right">Rate</span>
              <span className="w-20 text-right">Total</span>
            </div>
            <div className="flex px-3 py-2.5 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
              <span className="flex-1" style={{ color: 'var(--text-primary)' }}>Cloud Migration Consulting</span>
              <span className="w-12 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>2</span>
              <span className="w-20 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>₹15,000</span>
              <span className="w-20 text-right tabular-nums font-semibold" style={{ color: 'var(--risk-high-text)' }}>₹40,000</span>
            </div>
            <div className="flex px-3 py-2.5">
              <span className="flex-1" style={{ color: 'var(--text-primary)' }}>Kubernetes Infrastructure</span>
              <span className="w-12 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>1</span>
              <span className="w-20 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>₹65,000</span>
              <span className="w-20 text-right tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>₹65,000</span>
            </div>
          </div>

          {/* Totals */}
          <div className="ml-auto w-56 space-y-1.5">
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Subtotal</span><span className="tabular-nums">₹1,05,000</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>IGST @ 18%</span><span className="tabular-nums">₹18,900</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-1 border-t" style={{ borderColor: 'var(--border-default)', color: 'var(--risk-critical-text)' }}>
              <span>Grand Total</span><span className="tabular-nums">₹1,53,900</span>
            </div>
          </div>

          {/* Bank */}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-tertiary)' }}>
            <div>Bank: HDFC Bank | A/c: XXXXXX8891 | IFSC: HDFC0001234</div>
          </div>
        </div>

        {/* Scan beam */}
        {!reduced && (
          <motion.div
            className="absolute inset-x-0 h-0.5 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)',
              boxShadow: '0 0 12px var(--accent)',
              top: 0,
            }}
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 2.5, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.5 }}
            aria-hidden="true"
          />
        )}

        {/* Anomaly bounding boxes */}
        {ANOMALY_BOXES.map((box, i) => {
          const colors = severityColors[box.severity]
          return (
            <motion.div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: box.x, top: box.y,
                width: box.w, height: box.h,
                border: `1.5px solid ${colors.border}`,
                background: colors.bg,
                borderRadius: 4,
              }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={reduced ? { opacity: 1, scale: 1 } : undefined}
              variants={reduced ? undefined : {
                hidden: { opacity: 0, scale: 0.9 },
                visible: { opacity: 1, scale: 1 },
              }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: box.delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              aria-hidden="true"
            >
              <span
                className="absolute -top-5 left-0 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
                style={{ background: colors.border, color: 'white', fontSize: 9 }}
              >
                {box.label}
              </span>
            </motion.div>
          )
        })}

        {/* Risk score overlay */}
        <motion.div
          className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'var(--risk-critical-bg)', border: '1px solid var(--risk-critical-border)' }}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Zap size={14} style={{ color: 'var(--risk-critical-text)' }} />
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--risk-critical-text)', fontFamily: 'var(--font-mono)' }}>
            88.5
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--risk-critical-text)' }}>CRITICAL</span>
        </motion.div>
      </motion.div>

      {/* Floating signal cards */}
      {!reduced && (
        <>
          <motion.div
            className="absolute -left-12 top-16 surface-elevated px-3 py-2 flex items-center gap-2"
            style={{ borderRadius: 10, minWidth: 160 }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.8, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <CreditCard size={14} style={{ color: 'var(--risk-high-text)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--risk-high-text)' }}>Bank Changed</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Score: 85</p>
            </div>
          </motion.div>

          <motion.div
            className="absolute -right-12 top-1/3 surface-elevated px-3 py-2 flex items-center gap-2"
            style={{ borderRadius: 10, minWidth: 160 }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <Calculator size={14} style={{ color: 'var(--risk-critical-text)' }} />
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--risk-critical-text)' }}>Arithmetic Error</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>+₹30,000</p>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// STAGE ILLUSTRATIONS — each mounts fresh, runs its animation once
// ─────────────────────────────────────────────────────────────────

/** Stage 1: A file chip drops into a dashed dropzone; invoice thumbnail fades in. */
function StageUpload() {
  return (
    <div
      className="relative mx-auto flex flex-col items-center justify-center"
      style={{ width: 300, height: 280 }}
      aria-label="Upload stage illustration"
    >
      {/* Dropzone border */}
      <motion.div
        className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2"
        style={{ border: '2px dashed var(--border-strong)', background: 'var(--bg-elevated)' }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Initial prompt */}
        <motion.div
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 0.7, duration: 0.25 }}
        >
          <Upload size={32} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Drop invoice here</span>
        </motion.div>

        {/* Invoice thumbnail that fades in after drop */}
        <motion.div
          className="absolute inset-4 rounded-xl overflow-hidden"
          style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-default)' }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Tiny invoice lines */}
          {[14, 28, 50, 62, 74, 90, 102, 118, 130].map((top, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                top,
                left: 12,
                right: i % 3 === 0 ? 60 : i % 3 === 1 ? 30 : 12,
                height: i === 3 ? 14 : 6,
                borderRadius: 3,
                background: i === 3
                  ? 'var(--border-hairline)'
                  : i % 4 === 0
                    ? 'var(--border-strong)'
                    : 'var(--border-hairline)',
                opacity: i === 3 ? 0.8 : 0.6,
              }}
              aria-hidden="true"
            />
          ))}
        </motion.div>

        {/* Ready badge */}
        <motion.div
          className="absolute bottom-3 left-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            transform: 'translateX(-50%)',
            background: 'var(--risk-low-bg)',
            border: '1px solid var(--risk-low-border)',
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7, duration: 0.4 }}
        >
          <CheckCircle2 size={11} style={{ color: 'var(--risk-low-text)' }} aria-hidden="true" />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--risk-low-text)' }}>Ready to analyse</span>
        </motion.div>
      </motion.div>

      {/* File chip dropping in */}
      <motion.div
        className="absolute flex items-center gap-2 px-3 py-2 rounded-xl z-10"
        style={{
          top: -28,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-md)',
          whiteSpace: 'nowrap',
        }}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 90, opacity: [0, 1, 1, 0] }}
        transition={{ delay: 0.3, duration: 0.75, ease: [0.34, 1.56, 0.64, 1] }}
        aria-hidden="true"
      >
        <FileText size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          invoice.pdf
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>847 KB</span>
      </motion.div>
    </div>
  )
}

/** Stage 2: Scan beam sweeps the invoice; bounding boxes draw in; field chips appear. */
function StageExtract() {
  const FIELDS = [
    { label: 'Invoice No', value: 'INV-2026-0042', conf: 98, top: '18%' },
    { label: 'Amount',     value: '₹1,53,900',     conf: 96, top: '56%' },
    { label: 'GSTIN',      value: '27AABCA…F1Z9',  conf: 94, top: '72%' },
    { label: 'Date',       value: '15 Mar 2026',    conf: 99, top: '34%' },
  ]

  return (
    <div
      className="relative mx-auto"
      style={{ width: 300, height: 300 }}
      aria-label="Extract stage illustration"
    >
      {/* Invoice document */}
      <motion.div
        className="absolute inset-0 rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Document rows */}
        {[10, 22, 50, 70, 82, 118, 132, 160, 178, 196, 214, 240, 260].map((top, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top,
              left: 12,
              right: i % 3 === 2 ? 80 : i % 3 === 1 ? 40 : 12,
              height: i === 3 ? 16 : 6,
              borderRadius: 3,
              background: i === 0 ? 'var(--border-strong)'
                        : i === 3 ? 'var(--border-hairline)'
                        : 'var(--border-hairline)',
              opacity: i === 0 ? 0.9 : 0.5,
            }}
          />
        ))}

        {/* Scan beam */}
        <motion.div
          className="absolute inset-x-0 h-0.5 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)',
            boxShadow: '0 0 8px var(--accent)',
          }}
          initial={{ top: '0%', opacity: 0 }}
          animate={{ top: ['0%', '100%', '100%'], opacity: [0, 1, 0] }}
          transition={{ delay: 0.5, duration: 1.6, ease: 'easeInOut', times: [0, 0.85, 1] }}
          aria-hidden="true"
        />

        {/* Bounding boxes drawing in */}
        {FIELDS.map((f, i) => (
          <motion.div
            key={f.label}
            className="absolute"
            style={{
              originX: 0,
              top: f.top,
              left: 8,
              right: 8,
              height: 16,
              border: '1.5px solid var(--accent-border)',
              background: 'var(--accent-muted)',
              borderRadius: 3,
            }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.7 + i * 0.25, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          />
        ))}
      </motion.div>

      {/* Field chips on the right */}
      <div className="absolute -right-2 top-0 bottom-0 flex flex-col justify-around pointer-events-none" aria-hidden="true">
        {FIELDS.map((f, i) => (
          <motion.div
            key={f.label}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-sm)',
              transform: 'translateX(80px)',
              minWidth: 130,
            }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0, transform: 'translateX(80px)' }}
            transition={{ delay: 0.8 + i * 0.22, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</p>
            </div>
            <span
              style={{ fontSize: 9, fontWeight: 700, color: 'var(--risk-low-text)', background: 'var(--risk-low-bg)', padding: '1px 4px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}
            >{f.conf}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/** Stage 3: Seven engine tiles light up with scores; fusion indicator appears. */
const ANALYSE_ENGINES = [
  { icon: Calculator,  name: 'Financial',   score: 72, color: 'var(--risk-high-text)' },
  { icon: Fingerprint, name: 'Tax',         score: 0,  color: 'var(--risk-low-text)' },
  { icon: Copy,        name: 'Duplicate',   score: 15, color: 'var(--risk-low-text)' },
  { icon: Building2,   name: 'Vendor',      score: 45, color: 'var(--risk-medium-text)' },
  { icon: CreditCard,  name: 'Bank',        score: 85, color: 'var(--risk-critical-text)' },
  { icon: CheckCircle2,name: 'Identifiers', score: 8,  color: 'var(--risk-low-text)' },
  { icon: Eye,         name: 'Visual',      score: 30, color: 'var(--risk-medium-text)' },
]

function EngineScore({ score, color }: { score: number; color: string }) {
  const displayed = useCountUp(score, 900)
  return (
    <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
      {displayed}
    </span>
  )
}

function StageAnalyse() {
  return (
    <div className="mx-auto" style={{ width: 300 }} aria-label="Analyse stage illustration">
      {/* Engine grid */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {ANALYSE_ENGINES.map((eng, i) => {
          const EngIcon = eng.icon
          return (
            <motion.div
              key={eng.name}
              className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg"
              style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-hairline)' }}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <EngIcon size={13} style={{ color: eng.color }} aria-hidden="true" />
              <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.2 }}>
                {eng.name}
              </span>
              <EngineScore score={eng.score} color={eng.color} />
              {/* Score bar */}
              <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'var(--bg-subtle)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: eng.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${eng.score}%` }}
                  transition={{ delay: 0.2 + i * 0.12, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  aria-hidden="true"
                />
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Flow arrow to fusion */}
      <motion.div
        className="flex items-center gap-2 justify-center mb-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.3 }}
        aria-hidden="true"
      >
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Noisy-OR + XGBoost</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </motion.div>

      {/* Fusion result */}
      <motion.div
        className="flex items-center gap-2.5 rounded-xl px-4 py-3"
        style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <Cpu size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Risk Fusion</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--risk-critical-text)', fontFamily: 'var(--font-mono)' }}>
          88.5
        </span>
      </motion.div>
    </div>
  )
}

/** Stage 4: Gauge sweeps to score; finding cards stack in. */
function StageExplain() {
  const r = 52
  const arcLen = Math.PI * r          // ≈ 163.4  (semicircle)
  const filled = 0.885 * arcLen        // 88.5%

  return (
    <div
      className="mx-auto flex flex-col items-center gap-3"
      style={{ width: 300 }}
      aria-label="Explain stage illustration"
    >
      {/* Risk gauge SVG — upper semicircle */}
      <div role="img" aria-label="Risk gauge showing 88 critical">
        <svg viewBox="0 0 120 76" width="180" height="114">
          {/* Background track */}
          <path
            d={`M ${60 - r} 64 A ${r} ${r} 0 0 1 ${60 + r} 64`}
            fill="none"
            stroke="var(--bg-subtle)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <motion.path
            d={`M ${60 - r} 64 A ${r} ${r} 0 0 1 ${60 + r} 64`}
            fill="none"
            stroke="var(--risk-critical)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={arcLen}
            initial={{ strokeDashoffset: arcLen }}
            animate={{ strokeDashoffset: arcLen - filled }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
          {/* Score */}
          <text x="60" y="50" textAnchor="middle"
            style={{ fontSize: 22, fontWeight: 700, fill: 'var(--risk-critical-text)', fontFamily: 'monospace' }}>
            88
          </text>
          <text x="60" y="64" textAnchor="middle"
            style={{ fontSize: 8, fill: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
            CRITICAL RISK
          </text>
        </svg>
      </div>

      {/* Finding cards */}
      {([
        { label: 'Grand Total Mismatch', severity: 'critical' as const, diff: '+₹30,000' },
        { label: 'Bank Account Changed', severity: 'high' as const,     diff: 'New payee' },
      ] as const).map((f, i) => (
        <motion.div
          key={f.label}
          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5"
          style={{
            background: f.severity === 'critical' ? 'var(--risk-critical-bg)' : 'var(--risk-high-bg)',
            border: `1px solid ${f.severity === 'critical' ? 'var(--risk-critical-border)' : 'var(--risk-high-border)'}`,
          }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3 + i * 0.2, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <AlertCircle
            size={14}
            style={{ color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)', flexShrink: 0 }}
            aria-hidden="true"
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)', flex: 1 }}>
            {f.label}
          </span>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)', opacity: 0.8 }}>
            {f.diff}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    num: '01',
    title: 'Upload',
    desc: 'Drop any PDF or scanned image. InvoiceGuard validates, renders every page at 200 DPI, and reads the text layer.',
    icon: Upload,
    Stage: StageUpload,
  },
  {
    num: '02',
    title: 'Extract',
    desc: 'A scan beam sweeps the document. Fields are detected with bounding boxes and confidence scores for every value.',
    icon: ScanLine,
    Stage: StageExtract,
  },
  {
    num: '03',
    title: 'Analyse',
    desc: 'Seven engines run in parallel. A noisy-OR baseline is blended with an XGBoost model into a calibrated 0–100 risk score.',
    icon: Layers,
    Stage: StageAnalyse,
  },
  {
    num: '04',
    title: 'Explain',
    desc: 'Evidence highlighted on the document. SHAP values, signal breakdown, and a recommended action for the human reviewer.',
    icon: FileSearch,
    Stage: StageExplain,
  },
] as const

const SIGNALS = [
  { icon: Calculator,  name: 'Financial Rules',   desc: 'Arithmetic, totals, line items, round-off, amount-in-words' },
  { icon: Fingerprint, name: 'Tax & Identity',    desc: 'GSTIN checksum, PAN binding, CGST/SGST vs IGST, slabs' },
  { icon: Copy,        name: 'Duplicate Check',   desc: 'Exact hash, perceptual hash, field match, semantic similarity' },
  { icon: Building2,   name: 'Vendor Behaviour',  desc: 'Amount outlier, lookalike names, shared bank/GSTIN' },
  { icon: CreditCard,  name: 'Bank Change',       desc: 'New account detection, shared accounts across vendors' },
  { icon: CheckCircle2,name: 'Identifiers & Dates','desc': 'Number reuse, sequence anomaly, future dates, cadence' },
  { icon: Eye,         name: 'Visual Forensics',  desc: 'PDF structure, font mixing, cover-up rectangles, ELA heatmap' },
]

const WHY_DIFFERENT = [
  {
    stat: 7,
    suffix: ' engines',
    label: 'Detection engines',
    desc: 'Financial arithmetic, tax identity, duplicate detection, vendor behaviour, bank changes, identifier checks, and visual forensics run in parallel.',
    icon: Layers,
  },
  {
    stat: 100,
    suffix: '% evidence',
    label: 'Every finding linked',
    desc: 'Each risk indicator links to exact evidence on the invoice — a bounding box, field value, or forensic heatmap. Nothing is opaque.',
    icon: FileSearch,
  },
  {
    stat: 0,
    suffix: ' verdicts',
    label: 'No fraud verdicts',
    desc: 'InvoiceGuard flags risk indicators for human review. It never claims fraud. A reviewer with full context decides.',
    icon: ShieldCheck,
  },
] as const

// ─────────────────────────────────────────────────────────────────
// HOW IT WORKS — GSAP ScrollTrigger implementation
// ─────────────────────────────────────────────────────────────────

function HowItWorksSection({ reduced }: { reduced: boolean }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  
  useGSAP(() => {
    if (reduced) return

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: 'top top',
        end: '+=4000',
        scrub: 1,
        pin: true,
      }
    })

    tl.to('.gsap-progress-line', { height: '100%', ease: 'none', duration: 4 }, 0)

    HOW_IT_WORKS.forEach((step, i) => {
      const stepStart = i
      
      tl.to(`.gsap-step-${i}`, { opacity: 1, duration: 0.5 }, stepStart)
        .to(`.gsap-step-dot-${i}`, { scale: 1.18, borderColor: 'var(--accent)', backgroundColor: 'var(--accent)', color: 'white', duration: 0.5 }, stepStart)
      
      if (i < HOW_IT_WORKS.length - 1) {
        tl.to(`.gsap-step-${i}`, { opacity: 0.38, duration: 0.5 }, stepStart + 0.8)
          .to(`.gsap-step-dot-${i}`, { scale: 1, backgroundColor: 'var(--bg-base)', color: 'var(--text-tertiary)', duration: 0.5 }, stepStart + 0.8)
      }

      tl.to(`.gsap-stage-${i}`, { opacity: 1, y: 0, duration: 0.5 }, stepStart)
      if (i < HOW_IT_WORKS.length - 1) {
        tl.to(`.gsap-stage-${i}`, { opacity: 0, y: -20, duration: 0.5 }, stepStart + 0.8)
      }
    })

    tl.fromTo('.gsap-s0-dropzone', { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.3 }, 0)
    tl.to('.gsap-s0-prompt', { opacity: 0, duration: 0.2 }, 0.2)
    tl.fromTo('.gsap-s0-thumb', { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.4 }, 0.3)
    tl.fromTo('.gsap-s0-badge', { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 }, 0.5)
    tl.fromTo('.gsap-s0-chip', { opacity: 0, y: -40 }, { opacity: 1, y: 90, duration: 0.5 }, 0.1)
    tl.to('.gsap-s0-chip', { opacity: 0, duration: 0.2 }, 0.6)

    tl.fromTo('.gsap-s1-doc', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.3 }, 1)
    tl.fromTo('.gsap-s1-beam', { top: '0%', opacity: 0 }, { top: '100%', opacity: 1, duration: 0.6 }, 1.2)
    tl.to('.gsap-s1-beam', { opacity: 0, duration: 0.1 }, 1.8)
    tl.fromTo('.gsap-s1-box', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.3, stagger: 0.1 }, 1.3)
    tl.fromTo('.gsap-s1-chip', { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.1 }, 1.4)

    tl.fromTo('.gsap-s2-eng', { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.05 }, 2)
    tl.fromTo('.gsap-s2-bar', { width: 0 }, { width: (i, el) => el.dataset.w + '%', duration: 0.4, stagger: 0.05 }, 2.1)
    tl.fromTo('.gsap-s2-arrow', { opacity: 0 }, { opacity: 1, duration: 0.3 }, 2.5)
    tl.fromTo('.gsap-s2-fusion', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, 2.6)

    const arcLen = Math.PI * 52
    const filled = 0.885 * arcLen
    tl.fromTo('.gsap-s3-arc', { strokeDashoffset: arcLen }, { strokeDashoffset: arcLen - filled, duration: 0.6 }, 3)
    tl.fromTo('.gsap-s3-card', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 }, 3.3)

  }, { scope: sectionRef })

  return (
    <section className="border-t" style={{ borderColor: 'var(--border-hairline)' }} id="how-it-works">
      <div ref={sectionRef} className="relative hidden lg:block" style={{ height: '100vh', overflow: 'hidden' }}>
        <div className="h-full grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 1280, margin: '0 auto' }}>
          
          <div className="flex flex-col justify-center px-10 xl:px-20 py-16" style={{ borderRight: '1px solid var(--border-hairline)' }}>
            <div className="mb-10">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>How it works</p>
              <h2 className="text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>From upload to explained risk</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Under 10 seconds. Evidence on the document.</p>
            </div>
            
            <div className="relative pl-10">
              <div className="absolute left-3" style={{ top: 14, bottom: 14, width: 1, background: 'var(--border-hairline)' }} />
              <div className="gsap-progress-line absolute left-3" style={{ top: 14, width: 1, height: 0, background: 'var(--accent)', transformOrigin: 'top' }} />
              
              <div className="space-y-9">
                {HOW_IT_WORKS.map((step, i) => {
                  const StepIcon = step.icon
                  return (
                    <div key={step.num} className="relative flex items-start gap-4">
                      <div className={`gsap-step-dot-${i} absolute -left-10 flex items-center justify-center rounded-full border-2 shrink-0`} style={{ width: 28, height: 28, top: -2, borderColor: 'var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-tertiary)' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{step.num}</span>
                      </div>
                      <div className={`gsap-step-${i}`} style={{ opacity: i === 0 ? 1 : 0.38 }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <StepIcon size={15} style={{ color: 'var(--accent)' }} />
                          <h3 className="font-semibold" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{step.title}</h3>
                        </div>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 340 }}>{step.desc}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center px-10 xl:px-20 py-16" style={{ background: 'var(--bg-surface)' }}>
            
            <div className="gsap-stage-0 absolute" style={{ opacity: 1, y: 0, width: 300, height: 280 }}>
              <div className="gsap-s0-dropzone absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2" style={{ border: '2px dashed var(--border-strong)', background: 'var(--bg-elevated)' }}>
                <div className="gsap-s0-prompt flex flex-col items-center gap-2">
                  <Upload size={32} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Drop invoice here</span>
                </div>
                <div className="gsap-s0-thumb absolute inset-4 rounded-xl overflow-hidden" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-default)' }}>
                  {[14, 28, 50, 62, 74, 90, 102, 118, 130].map((top, j) => (
                    <div key={j} className="absolute" style={{ top, left: 12, right: j % 3 === 0 ? 60 : j % 3 === 1 ? 30 : 12, height: j === 3 ? 14 : 6, borderRadius: 3, background: j === 3 ? 'var(--border-hairline)' : j % 4 === 0 ? 'var(--border-strong)' : 'var(--border-hairline)', opacity: j === 3 ? 0.8 : 0.6 }} />
                  ))}
                </div>
                <div className="gsap-s0-badge absolute bottom-3 left-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ transform: 'translateX(-50%)', background: 'var(--risk-low-bg)', border: '1px solid var(--risk-low-border)' }}>
                  <CheckCircle2 size={11} style={{ color: 'var(--risk-low-text)' }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--risk-low-text)' }}>Ready to analyse</span>
                </div>
              </div>
              <div className="gsap-s0-chip absolute flex items-center gap-2 px-3 py-2 rounded-xl z-10" style={{ top: -28, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap' }}>
                <FileText size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>invoice.pdf</span>
              </div>
            </div>

            <div className="gsap-stage-1 absolute" style={{ opacity: 0, y: 20, width: 300, height: 300 }}>
              <div className="gsap-s1-doc absolute inset-0 rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                {[10, 22, 50, 70, 82, 118, 132, 160, 178, 196, 214, 240, 260].map((top, j) => (
                  <div key={j} className="absolute" style={{ top, left: 12, right: j % 3 === 2 ? 80 : j % 3 === 1 ? 40 : 12, height: j === 3 ? 16 : 6, borderRadius: 3, background: j === 0 ? 'var(--border-strong)' : 'var(--border-hairline)', opacity: j === 0 ? 0.9 : 0.5 }} />
                ))}
                <div className="gsap-s1-beam absolute inset-x-0 h-0.5 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)', boxShadow: '0 0 8px var(--accent)' }} />
                {[
                  { label: 'Invoice No', value: 'INV-2026-0042', conf: 98, top: '18%' },
                  { label: 'Amount', value: '₹1,53,900', conf: 96, top: '56%' },
                  { label: 'GSTIN', value: '27AABCA…F1Z9', conf: 94, top: '72%' },
                  { label: 'Date', value: '15 Mar 2026', conf: 99, top: '34%' }
                ].map(f => (
                  <div key={f.label} className="gsap-s1-box absolute" style={{ top: f.top, left: 8, right: 8, height: 16, border: '1.5px solid var(--accent-border)', background: 'var(--accent-muted)', borderRadius: 3 }} />
                ))}
              </div>
              <div className="absolute -right-2 top-0 bottom-0 flex flex-col justify-around pointer-events-none">
                {[
                  { label: 'Invoice No', value: 'INV-2026-0042', conf: 98, top: '18%' },
                  { label: 'Amount', value: '₹1,53,900', conf: 96, top: '56%' },
                  { label: 'GSTIN', value: '27AABCA…F1Z9', conf: 94, top: '72%' },
                  { label: 'Date', value: '15 Mar 2026', conf: 99, top: '34%' }
                ].map(f => (
                  <div key={f.label} className="gsap-s1-chip flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-sm)', minWidth: 130 }}>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 8, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                      <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{f.value}</p>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--risk-low-text)', background: 'var(--risk-low-bg)', padding: '1px 4px', borderRadius: 4 }}>{f.conf}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="gsap-stage-2 absolute mx-auto" style={{ opacity: 0, y: 20, width: 300 }}>
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {[
                  { icon: Calculator, name: 'Financial', score: 72, color: 'var(--risk-high-text)' },
                  { icon: Fingerprint, name: 'Tax', score: 0, color: 'var(--risk-low-text)' },
                  { icon: Copy, name: 'Duplicate', score: 15, color: 'var(--risk-low-text)' },
                  { icon: Building2, name: 'Vendor', score: 45, color: 'var(--risk-medium-text)' },
                  { icon: CreditCard, name: 'Bank', score: 85, color: 'var(--risk-critical-text)' },
                  { icon: CheckCircle2, name: 'Identifiers', score: 8, color: 'var(--risk-low-text)' },
                  { icon: Eye, name: 'Visual', score: 30, color: 'var(--risk-medium-text)' }
                ].map(eng => {
                  const EngIcon = eng.icon
                  return (
                    <div key={eng.name} className="gsap-s2-eng flex flex-col items-center gap-1 py-2 px-1 rounded-lg" style={{ background: 'var(--bg-overlay)', border: '1px solid var(--border-hairline)' }}>
                      <EngIcon size={13} style={{ color: eng.color }} />
                      <span style={{ fontSize: 8, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.2 }}>{eng.name}</span>
                      <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 700, color: eng.color, fontFamily: 'var(--font-mono)' }}>{eng.score}</span>
                      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'var(--bg-subtle)' }}>
                        <div className="gsap-s2-bar h-full rounded-full" data-w={eng.score} style={{ background: eng.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="gsap-s2-arrow flex items-center gap-2 justify-center mb-2">
                <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Noisy-OR + XGBoost</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
              </div>
              <div className="gsap-s2-fusion flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)' }}>
                <Cpu size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Risk Fusion</span>
                <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--risk-critical-text)', fontFamily: 'var(--font-mono)' }}>88.5</span>
              </div>
            </div>

            <div className="gsap-stage-3 absolute mx-auto flex flex-col items-center gap-3" style={{ opacity: 0, y: 20, width: 300 }}>
              <div>
                <svg viewBox="0 0 120 76" width="180" height="114">
                  <path d="M 8 64 A 52 52 0 0 1 112 64" fill="none" stroke="var(--bg-subtle)" strokeWidth="10" strokeLinecap="round" />
                  <path className="gsap-s3-arc" d="M 8 64 A 52 52 0 0 1 112 64" fill="none" stroke="var(--risk-critical)" strokeWidth="10" strokeLinecap="round" strokeDasharray={Math.PI * 52} />
                  <text x="60" y="50" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: 'var(--risk-critical-text)', fontFamily: 'monospace' }}>88</text>
                  <text x="60" y="64" textAnchor="middle" style={{ fontSize: 8, fill: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>CRITICAL RISK</text>
                </svg>
              </div>
              {[
                { label: 'Grand Total Mismatch', severity: 'critical' as const, diff: '+₹30,000' },
                { label: 'Bank Account Changed', severity: 'high' as const, diff: 'New payee' }
              ].map((f) => (
                <div key={f.label} className="gsap-s3-card w-full flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: f.severity === 'critical' ? 'var(--risk-critical-bg)' : 'var(--risk-high-bg)', border: `1px solid ${f.severity === 'critical' ? 'var(--risk-critical-border)' : 'var(--risk-high-border)'}` }}>
                  <AlertCircle size={14} style={{ color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)' }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)', flex: 1 }}>{f.label}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: f.severity === 'critical' ? 'var(--risk-critical-text)' : 'var(--risk-high-text)', opacity: 0.8 }}>{f.diff}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="block lg:hidden py-16 px-6">
        <div className="max-w-xl mx-auto">
          <div className="mb-10">
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>How it works</p>
            <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>From upload to explained risk</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Under 10 seconds. Evidence on the document.</p>
          </div>
          <div className="space-y-8">
            {HOW_IT_WORKS.map(step => {
              const StepIcon = step.icon
              return (
                <div key={step.num} className="surface p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="inline-flex items-center justify-center rounded-full text-xs font-bold" style={{ width: 28, height: 28, background: 'var(--accent)', color: 'white', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{step.num}</span>
                    <StepIcon size={15} style={{ color: 'var(--accent)' }} />
                    <h3 className="font-semibold" style={{ fontSize: 16 }}>{step.title}</h3>
                  </div>
                  <p className="mb-5" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// 7-SIGNAL GRID — enhanced with hover lift + icon pulse
// ─────────────────────────────────────────────────────────────────
function SignalsSection({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section
      className="py-24 px-6 lg:px-16 xl:px-24 border-t"
      style={{ borderColor: 'var(--border-hairline)' }}
      id="engines"
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>
            Seven detection engines
          </h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Each engine returns a score, confidence, and evidence. Fused by XGBoost with SHAP explanations.
          </p>
        </motion.div>

        <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SIGNALS.map((sig, i) => {
            const SigIcon = sig.icon
            return (
              <motion.div
                key={sig.name}
                className="surface p-5 group cursor-default"
                style={{ borderRadius: 'var(--radius-xl)' }}
                initial={{ opacity: 0, y: 20 }}
                animate={inView || reduced ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                whileHover={reduced ? {} : {
                  y: -3,
                  transition: { duration: 0.2 },
                }}
              >
                {/* Icon — scale on hover */}
                <motion.div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--accent-muted)' }}
                  whileHover={reduced ? {} : { scale: 1.12 }}
                  transition={{ duration: 0.2 }}
                >
                  <SigIcon size={17} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                </motion.div>
                <h3 className="text-sm font-semibold mb-1.5">{sig.name}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{sig.desc}</p>
              </motion.div>
            )
          })}

          {/* 8th cell — Fusion CTA */}
          <motion.div
            className="sm:col-span-2 lg:col-span-1 rounded-2xl p-5 flex flex-col justify-between"
            style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={inView || reduced ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.49, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            whileHover={reduced ? {} : { y: -3, transition: { duration: 0.2 } }}
          >
            <div>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'var(--accent)' }}
              >
                <Cpu size={17} color="white" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--accent)' }}>Risk Fusion</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Noisy-OR baseline + XGBoost ML model fused into a calibrated 0–100 score with SHAP explanations.
              </p>
            </div>
            <Link
              to="/insights"
              className="btn-ghost mt-4 text-xs"
              style={{ color: 'var(--accent)', paddingLeft: 0 }}
            >
              View model insights <ChevronRight size={13} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// WHY DIFFERENT — stat counters + differentiators
// ─────────────────────────────────────────────────────────────────
function StatCard({
  stat, suffix, label, desc, icon: Icon, active,
}: {
  stat: number; suffix: string; label: string; desc: string;
  icon: React.ElementType; active: boolean;
}) {
  const displayed = useCountUp(active ? stat : 0, 1400)
  return (
    <div className="surface p-7 flex flex-col gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--accent-muted)' }}
      >
        <Icon size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
      </div>
      <div>
        <p className="leading-none mb-1" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-5xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>
            {displayed}
          </span>
          <span className="text-lg font-semibold ml-1" style={{ color: 'var(--text-secondary)' }}>
            {suffix}
          </span>
        </p>
        <p className="text-base font-semibold mt-3" style={{ color: 'var(--text-primary)' }}>{label}</p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
    </div>
  )
}

function WhyDifferentSection({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section
      className="py-24 px-6 lg:px-16 xl:px-24 border-t"
      style={{ borderColor: 'var(--border-hairline)' }}
      id="why-different"
    >
      <div className="max-w-7xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>
            Why InvoiceGuard is different
          </h2>
          <p className="text-base max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Not a black box. Not a verdict machine. Explainable risk indicators for human reviewers.
          </p>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-3 gap-5">
          {WHY_DIFFERENT.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 24 }}
              animate={inView || reduced ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.14, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <StatCard {...item} active={inView} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// CTA SECTION — subtle animated background
// ─────────────────────────────────────────────────────────────────
function CtaSection({ reduced }: { reduced: boolean }) {
  return (
    <section
      className="relative py-28 px-6 border-t overflow-hidden"
      style={{ borderColor: 'var(--border-hairline)' }}
    >
      {/* Animated accent glow behind CTA */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2 }}
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 100%, var(--accent-muted), transparent)',
          }}
        />
      )}

      {/* Dot grid overlay (extra subtle) */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <motion.div
        className="relative max-w-2xl mx-auto text-center"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p
          className="text-xs font-semibold uppercase mb-4"
          style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}
        >
          Ready to review?
        </p>
        <h2 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-0.025em' }}>
          Start reviewing invoices.
        </h2>
        <p className="text-base mb-10 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Upload a PDF or try one of the demo invoices — no sign-in required.
          Full evidence, no black box.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/analyze" className="btn-primary">
            <Upload size={16} aria-hidden="true" />
            Upload an invoice
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <Link to="/dashboard" className="btn-ghost">
            Explore the dashboard
          </Link>
        </div>

        {/* Trust micro-signals */}
        <div
          className="flex flex-wrap justify-center gap-6 mt-10 pt-8 border-t"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          {[
            { icon: CheckCircle2, label: '7 detection engines', color: 'var(--risk-low-text)' },
            { icon: AlertTriangle, label: '0–100 risk score',   color: 'var(--risk-medium-text)' },
            { icon: AlertCircle,  label: 'Explainable evidence', color: 'var(--accent)' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <Icon size={14} style={{ color }} aria-hidden="true" />
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const reduced = useReducedMotion()

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav
        className="glass sticky top-0 z-30 flex items-center justify-between px-6 lg:px-10 border-b"
        style={{ height: 56, borderColor: 'var(--glass-border)' }}
        role="navigation"
        aria-label="Site navigation"
      >
        <Link to="/" className="flex items-center focus-visible:outline-none" aria-label="InvoiceGuard home">
          <Logo variant="full" size={22} />
        </Link>

        <div className="flex items-center gap-2">
          {/* Scroll anchors */}
          <a
            href="#how-it-works"
            className="btn-ghost text-sm hidden sm:inline-flex"
            onClick={(e) => { e.preventDefault(); document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            How it works
          </a>
          <a
            href="#engines"
            className="btn-ghost text-sm hidden md:inline-flex"
            onClick={(e) => { e.preventDefault(); document.getElementById('engines')?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            Engines
          </a>
          <Link to="/dashboard" className="btn-ghost text-sm hidden sm:inline-flex">Dashboard</Link>
          <Link to="/analyze" className="btn-primary text-sm py-1.5 px-4">
            Try now <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 px-6 lg:px-16 xl:px-24">
        {/* Background accent blob */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div style={{
            position: 'absolute', top: '-10%', left: '50%',
            transform: 'translateX(-50%)',
            width: '80%', height: '60%',
            background: 'radial-gradient(ellipse, var(--accent-muted) 0%, transparent 70%)',
            borderRadius: '50%',
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mb-6"
              style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <ShieldCheck size={12} aria-hidden="true" />
              Explainable · Multimodal · Human-in-the-loop
            </motion.div>

            <h1
              className="text-5xl lg:text-6xl font-bold leading-tight mb-6"
              style={{ letterSpacing: '-0.03em' }}
            >
              Invoice risk,
              <br />
              <span style={{ color: 'var(--accent)' }}>explained.</span>
            </h1>

            <p className="text-lg mb-8 max-w-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Upload any PDF or scanned invoice. Seven detection engines analyse financial arithmetic,
              tax identity, duplicates, vendor behaviour, and visual forensics — fused into a 0–100 risk
              score with evidence highlighted on the document itself.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link to="/analyze" className="btn-primary">
                <Upload size={16} aria-hidden="true" />
                Upload an invoice
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link to="/dashboard" className="btn-ghost">
                Try a sample
              </Link>
            </div>

            {/* Trust signals */}
            <div
              className="flex flex-wrap gap-6 mt-10 pt-8 border-t"
              style={{ borderColor: 'var(--border-hairline)' }}
            >
              {[
                { icon: CheckCircle2, label: '7 detection engines', color: 'var(--risk-low-text)' },
                { icon: AlertTriangle, label: '0–100 risk score',   color: 'var(--risk-medium-text)' },
                { icon: AlertCircle,  label: 'Explainable evidence', color: 'var(--accent)' },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <Icon size={15} style={{ color }} aria-hidden="true" />
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — animated invoice mock (unchanged) */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center"
          >
            <InvoiceMockScan />
          </motion.div>
        </div>
      </section>

      {/* ── How It Works — sticky scroll ── */}
      <HowItWorksSection reduced={reduced} />

      {/* ── 7 Engines grid ── */}
      <SignalsSection reduced={reduced} />

      {/* ── Why Different — counters ── */}
      <WhyDifferentSection reduced={reduced} />

      {/* ── CTA ── */}
      <CtaSection reduced={reduced} />

      {/* ── Footer ── */}
      <footer
        className="border-t"
        style={{ borderColor: 'var(--border-hairline)' }}
        role="contentinfo"
      >
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo variant="mark" size={20} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>InvoiceGuard</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>v0.4.1</span>
          </div>
          <p
            className="text-xs text-center max-w-sm"
            style={{ color: 'var(--text-tertiary)' }}
            role="note"
          >
            InvoiceGuard flags anomalies for human review. It does not determine fraud. Demo data is synthetic.
          </p>
        </div>
      </footer>
    </div>
  )
}
