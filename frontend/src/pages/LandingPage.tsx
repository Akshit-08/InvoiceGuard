import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import {
  Shield, Upload, ChevronRight,
  ArrowRight, Calculator, Fingerprint, Copy,
  Building2, CreditCard, Eye, CheckCircle2,
  AlertTriangle, AlertCircle, Zap,
} from 'lucide-react'
import { Disclaimer } from '@/components/ui'
import { useReducedMotion } from '@/hooks/useMotion'

// ── Animated Invoice Mock ─────────────────────────────────────
function InvoiceMockScan() {
  const reduced = useReducedMotion()

  const ANOMALY_BOXES = [
    { x: '62%', y: '30%', w: '28%', h: '5%', label: 'LINE TOTAL MISMATCH', severity: 'high' as const, delay: 1.2 },
    { x: '62%', y: '50%', w: '28%', h: '5%', label: 'GRAND TOTAL MISMATCH', severity: 'critical' as const, delay: 1.6 },
    { x: '8%',  y: '63%', w: '32%', h: '4%', label: 'BANK ACCOUNT CHANGED',  severity: 'high' as const, delay: 2.0 },
    { x: '8%',  y: '22%', w: '38%', h: '5%', label: 'VENDOR OUTLIER', severity: 'medium' as const, delay: 2.4 },
  ]

  const severityColors = {
    critical: { border: '#f43f5e', bg: 'rgba(244,63,94,0.08)', text: '#f43f5e' },
    high:     { border: '#fb923c', bg: 'rgba(251,146,60,0.08)', text: '#fb923c' },
    medium:   { border: '#fbbf24', bg: 'rgba(251,191,36,0.08)', text: '#fbbf24' },
    low:      { border: '#34d399', bg: 'rgba(52,211,153,0.08)', text: '#34d399' },
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
            <div className="flex px-3 py-2.5" >
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
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
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
                className="absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap"
                style={{ background: colors.border, color: 'white', fontSize: 9 }}
              >
                {box.label}
              </span>
            </motion.div>
          )
        })}

        {/* Risk score overlay — bottom right corner */}
        <motion.div
          className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            background: 'var(--risk-critical-bg)',
            border: '1px solid var(--risk-critical-border)',
          }}
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

// ── Three-step explainer ──────────────────────────────────────
const STEPS = [
  {
    num: '01',
    title: 'Upload',
    desc: 'Drop any PDF or image invoice. InvoiceGuard validates, renders every page, and reads the text layer with machine precision.',
    icon: Upload,
  },
  {
    num: '02',
    title: 'Analyse',
    desc: 'Seven detection engines run in parallel: financial arithmetic, tax identity, duplicate detection, vendor behaviour, bank changes, identifier checks, and visual forensics.',
    icon: Eye,
  },
  {
    num: '03',
    title: 'Review',
    desc: 'Evidence highlighted directly on the invoice. Risk score, signal breakdown, and recommended action. Human reviewer decides.',
    icon: CheckCircle2,
  },
]

// ── 7-signal grid ─────────────────────────────────────────────
const SIGNALS = [
  { icon: Calculator, name: 'Financial Rules',    desc: 'Arithmetic, totals, line items, round-off, currency' },
  { icon: Fingerprint, name: 'Tax & Identity',    desc: 'GSTIN checksum, PAN binding, CGST/SGST vs IGST, slabs' },
  { icon: Copy,        name: 'Duplicate Check',   desc: 'Exact hash, perceptual hash, field match, semantic similarity' },
  { icon: Building2,   name: 'Vendor Behaviour',  desc: 'Amount outlier, lookalike names, shared bank/GSTIN' },
  { icon: CreditCard,  name: 'Bank Change',       desc: 'New account detection, shared accounts across vendors' },
  { icon: CheckCircle2,name: 'Identifiers & Dates','desc': 'Number reuse, sequence anomaly, future dates, cadence' },
  { icon: Eye,         name: 'Visual Forensics',  desc: 'PDF structure, font mixing, cover-up rectangles, ELA' },
]

// ── Main Landing page ─────────────────────────────────────────
export default function LandingPage() {
  const stepsRef = useRef<HTMLDivElement>(null)
  const signalsRef = useRef<HTMLDivElement>(null)
  const stepsInView = useInView(stepsRef, { once: true, margin: '-100px' })
  const signalsInView = useInView(signalsRef, { once: true, margin: '-100px' })
  const reduced = useReducedMotion()

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav
        className="glass sticky top-0 z-30 flex items-center justify-between px-8 border-b"
        style={{ height: 64, borderColor: 'var(--glass-border)' }}
        role="navigation"
        aria-label="Site navigation"
      >
        <Link to="/" className="flex items-center gap-2.5 group">
          <motion.div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent)' }}
            whileHover={{ scale: 1.05 }}
          >
            <Shield size={16} color="white" aria-hidden="true" />
          </motion.div>
          <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            InvoiceGuard
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="btn-ghost text-sm">Dashboard</Link>
          <Link to="/analyze" className="btn-primary text-sm">
            Try now <ChevronRight size={14} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 px-6 lg:px-16 xl:px-24">
        {/* Background gradient blobs */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80%',
              height: '60%',
              background: 'radial-gradient(ellipse, hsl(248 80% 60% / 0.06) 0%, transparent 70%)',
              borderRadius: '50%',
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Eyebrow */}
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium mb-6"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent)',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Shield size={12} />
              Explainable · Multimodal · Human-in-the-loop
            </motion.div>

            <h1
              className="text-5xl lg:text-6xl font-bold leading-tight mb-6"
              style={{ letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
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
                <Upload size={16} />
                Upload an invoice
                <ArrowRight size={14} />
              </Link>
              <Link to="/dashboard" className="btn-ghost">
                Try a sample
              </Link>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap gap-6 mt-10 pt-8 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
              {[
                { icon: CheckCircle2, label: '7 detection engines', color: 'var(--risk-low-text)' },
                { icon: AlertTriangle, label: '0–100 risk score',   color: 'var(--risk-medium-text)' },
                { icon: AlertCircle, label: 'Explainable evidence', color: 'var(--accent)' },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  <Icon size={15} style={{ color }} aria-hidden="true" />
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right — animated invoice mock */}
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

      {/* ── Three-step explainer ────────────────────────────── */}
      <section className="py-24 px-6 lg:px-16 xl:px-24 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>
              How it works
            </h2>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              From upload to explainable risk — in under 10 seconds.
            </p>
          </motion.div>

          <div ref={stepsRef} className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => {
              const StepIcon = step.icon
              return (
                <motion.div
                  key={step.num}
                  className="surface p-8 relative overflow-hidden"
                  initial={{ opacity: 0, y: 24 }}
                  animate={stepsInView || reduced ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Step number (large background) */}
                  <span
                    className="absolute top-4 right-4 text-7xl font-black tabular-nums select-none pointer-events-none"
                    style={{ color: 'var(--bg-overlay)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}
                    aria-hidden="true"
                  >
                    {step.num}
                  </span>

                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: 'var(--accent-muted)' }}
                  >
                    <StepIcon size={20} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── 7-signal grid ──────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-16 xl:px-24 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: '-0.02em' }}>
              Seven detection engines
            </h2>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              Each engine returns a score, confidence, and evidence. Fused by XGBoost with SHAP explanations.
            </p>
          </motion.div>

          <div ref={signalsRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SIGNALS.map((sig, i) => {
              const SigIcon = sig.icon
              return (
                <motion.div
                  key={sig.name}
                  className="surface p-5 transition-all duration-200 hover:border-[var(--accent-border)] cursor-default"
                  style={{
                    borderColor: 'var(--border-hairline)',
                    borderRadius: 'var(--radius-xl)',
                  }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={signalsInView || reduced ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={reduced ? {} : { y: -2 }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: 'var(--accent-muted)' }}
                  >
                    <SigIcon size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">{sig.name}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{sig.desc}</p>
                </motion.div>
              )
            })}

            {/* 8th cell — CTA */}
            <motion.div
              className="sm:col-span-2 lg:col-span-1 rounded-2xl p-5 flex flex-col justify-between"
              style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={signalsInView || reduced ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.42, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: 'var(--accent)' }}
                >
                  <Shield size={16} color="white" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--accent)' }}>Risk Fusion</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Noisy-OR baseline + XGBoost ML model fused into a calibrated 0–100 score with SHAP explanations.
                </p>
              </div>
              <Link to="/insights" className="btn-ghost mt-4 text-xs" style={{ color: 'var(--accent)' }}>
                View model insights →
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA section ────────────────────────────────────── */}
      <section
        className="py-24 px-6 border-t text-center"
        style={{ borderColor: 'var(--border-hairline)' }}
      >
        <motion.div
          className="max-w-xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl font-bold mb-4" style={{ letterSpacing: '-0.02em' }}>
            Start reviewing invoices.
          </h2>
          <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
            Upload a PDF or try one of the demo invoices — no sign-in required.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/analyze" className="btn-primary">
              <Upload size={16} />
              Upload an invoice
            </Link>
            <Link to="/dashboard" className="btn-ghost">
              Explore the dashboard
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Shield size={12} color="white" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>InvoiceGuard</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>v0.3.0-day3</span>
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
            InvoiceGuard flags anomalies for human review. It does not determine fraud. Demo data is synthetic.
          </p>
        </div>
      </footer>
    </div>
  )
}
