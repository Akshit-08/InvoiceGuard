import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { AlertCircle, FileText, CheckCircle2, ChevronRight, Download, Eye, Layers } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { RiskGauge, SignalBars } from '@/components/RiskGauge'
import { RiskBadge, SeverityChip, ConfidenceMeter } from '@/components/RiskBadge'
import { FindingCard } from '@/components/FindingCard'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState('summary')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return (
      <div className="p-6 h-full flex flex-col">
        <SkeletonCard className="h-20 shrink-0 mb-6" />
        <div className="flex-1 grid lg:grid-cols-5 gap-6">
          <SkeletonCard className="lg:col-span-3 h-full" />
          <SkeletonCard className="lg:col-span-2 h-full" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return <ErrorState title="Invoice not found" message={error instanceof Error ? error.message : ''} onRetry={() => refetch()} />
  }

  const level = data.risk_level ?? (data.overall_score != null ? scoreToLevel(data.overall_score) : undefined)
  const signals = data.signals ?? data.risk?.signals ?? {}

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="shrink-0 px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
                {data.invoice_number ?? 'Unknown Invoice'}
              </h1>
              {level && <RiskBadge level={level} size="sm" />}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {data.vendor?.name} · {formatDate(data.invoice_date)} · {formatCurrency(data.grand_total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-sm">
            <Download size={14} /> PDF Report
          </button>
          <div className="h-6 w-px bg-border mx-1" style={{ background: 'var(--border-default)' }} />
          <button className="btn-primary text-sm" onClick={() => invoiceApi.review(id!, 'approved')}>
            <CheckCircle2 size={14} /> Mark as Reviewed
          </button>
        </div>
      </header>

      {/* ── Main content (Split View) ─────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left 60%: Document Viewer */}
        <div className="hidden lg:flex w-3/5 flex-col border-r bg-zinc-950 relative" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div className="glass px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm">
              <Layers size={14} />
              Layers
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative group">
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
            >
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                <div className="relative shadow-xl">
                  {/* The actual image */}
                  <img 
                    src={invoiceApi.pageUrl(id!, 1)} 
                    alt="Invoice Page 1" 
                    className="max-w-none bg-white select-none"
                    style={{ height: '80vh', objectFit: 'contain' }}
                    onError={(e) => {
                      // Fallback for mocks
                      const target = e.target as HTMLImageElement
                      target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="1131" viewBox="0 0 800 1131"%3E%3Crect fill="%23fff" width="800" height="1131"/%3E%3Ctext x="400" y="565" font-family="sans-serif" font-size="24" fill="%23999" text-anchor="middle"%3EInvoice Document Preview%3C/text%3E%3C/svg%3E'
                    }}
                  />
                  {/* Bounding box overlays would go here, scaled to image dimensions */}
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>
          
          <div className="h-12 border-t flex items-center justify-center gap-4 text-sm" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>Page 1 of 1</span>
          </div>
        </div>

        {/* Right 40%: Analysis Tabs */}
        <div className="w-full lg:w-2/5 flex flex-col bg-base overflow-hidden">
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <Tabs.List className="flex border-b px-2 overflow-x-auto hide-scrollbar shrink-0" style={{ borderColor: 'var(--border-hairline)' }}>
              {['Summary', 'Findings', 'Data', 'Timeline'].map(tab => {
                const val = tab.toLowerCase()
                return (
                  <Tabs.Trigger
                    key={val}
                    value={val}
                    className="px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
                    style={{
                      borderColor: activeTab === val ? 'var(--accent)' : 'transparent',
                      color: activeTab === val ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {tab}
                    {tab === 'Findings' && data.findings?.length ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-accent/20 text-accent" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                        {data.findings.length}
                      </span>
                    ) : null}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* ── Summary Tab ─────────────────────────────────── */}
                  {activeTab === 'summary' && (
                    <div className="space-y-6">
                      <div className="flex justify-center py-4">
                        {data.overall_score != null && level && (
                          <RiskGauge score={data.overall_score} level={level} size={180} />
                        )}
                      </div>

                      {data.risk?.recommendation && (
                        <div className="surface p-5 text-sm space-y-3">
                          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>AI Recommendation</h3>
                          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {data.risk.recommendation}
                          </p>
                          {data.risk.escalations && data.risk.escalations.length > 0 && (
                            <div className="space-y-1.5 pt-2">
                              {data.risk.escalations.map((esc, i) => (
                                <div key={i} className="flex gap-2 text-xs p-2.5 rounded-lg" style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)' }}>
                                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                  <span className="font-medium">{esc}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {Object.keys(signals).length > 0 && (
                        <div className="surface p-5">
                          <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Detection Engines</h3>
                          <SignalBars signals={signals} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Findings Tab ────────────────────────────────── */}
                  {activeTab === 'findings' && (
                    <div className="space-y-3">
                      {data.findings?.length === 0 ? (
                        <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No anomalies found.</p>
                      ) : (
                        data.findings?.sort((a, b) => b.score - a.score).map((f, i) => (
                          <FindingCard key={f.id} finding={f} index={i} />
                        ))
                      )}
                    </div>
                  )}

                  {/* ── Data Tab (Extraction) ───────────────────────── */}
                  {activeTab === 'data' && (
                    <div className="surface p-5 space-y-4 text-sm">
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div>
                          <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Invoice Number</p>
                          <p className="font-mono">{data.invoice_number ?? '—'}</p>
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Date</p>
                          <p className="font-mono">{data.invoice_date ?? '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Vendor</p>
                          <p className="font-medium">{data.vendor?.name ?? '—'}</p>
                          {data.vendor?.gstin && <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{data.vendor.gstin}</p>}
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Subtotal</p>
                          <p className="font-mono tabular-nums">{formatCurrency(data.subtotal)}</p>
                        </div>
                        <div>
                          <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Grand Total</p>
                          <p className="font-mono font-bold tabular-nums text-lg">{formatCurrency(data.grand_total)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Timeline Tab ────────────────────────────────── */}
                  {activeTab === 'timeline' && (
                    <div className="space-y-6">
                       <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Pipeline execution history and audit log.</p>
                       <div className="surface p-5 flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                         Audit log integration coming soon
                       </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </Tabs.Root>
        </div>
      </div>
    </div>
  )
}
