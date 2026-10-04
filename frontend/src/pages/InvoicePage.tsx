import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import * as Tabs from '@radix-ui/react-tabs'
import { TransformWrapper, TransformComponent, useControls } from 'react-zoom-pan-pinch'
import { AlertCircle, CheckCircle2, ChevronRight, ChevronLeft, Download, ZoomIn, ZoomOut, Maximize, FileText, Check, ShieldAlert, ArrowRightLeft, History, Activity, Zap } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { RiskGauge, SignalBars } from '@/components/RiskGauge'
import { RiskBadge, ConfidenceMeter } from '@/components/RiskBadge'
import { FindingCard } from '@/components/FindingCard'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'

// Zoom controls helper component
const ViewerControls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls()
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 bg-neutral-900/80 backdrop-blur rounded-lg p-1 shadow-lg">
      <button onClick={() => zoomIn()} className="p-2 hover:bg-neutral-800 rounded text-neutral-300 transition-colors"><ZoomIn size={16} /></button>
      <button onClick={() => resetTransform()} className="p-2 hover:bg-neutral-800 rounded text-neutral-300 transition-colors"><Maximize size={16} /></button>
      <button onClick={() => zoomOut()} className="p-2 hover:bg-neutral-800 rounded text-neutral-300 transition-colors"><ZoomOut size={16} /></button>
    </div>
  )
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState('summary')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  
  // Layer toggles
  const [showFindings, setShowFindings] = useState(true)
  const [showExtracted, setShowExtracted] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoiceApi.get(id!),
    enabled: !!id,
  })

  // Keyboard navigation for findings
  useEffect(() => {
    if (!data?.findings?.length) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      
      const findings = data.findings!
      const currentIndex = selectedFindingId ? findings.findIndex(f => f.id === selectedFindingId) : -1
      
      if (e.key === 'j' || e.key === 'ArrowDown') {
        const next = Math.min(currentIndex + 1, findings.length - 1)
        setSelectedFindingId(findings[next].id)
        setActiveTab('findings')
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const prev = Math.max(currentIndex - 1, 0)
        setSelectedFindingId(findings[prev].id)
        setActiveTab('findings')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [data, selectedFindingId])

  // Sync scroll for selected finding
  useEffect(() => {
    if (selectedFindingId && activeTab === 'findings') {
      const el = document.getElementById(`finding-card-${selectedFindingId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [selectedFindingId, activeTab])

  const handleReviewAction = async (status: 'confirmed_issue' | 'false_positive' | 'approved') => {
    if (!id) return
    try {
      await invoiceApi.review(id, status)
      // Optimistic update
      queryClient.setQueryData(['invoice', id], (old: any) => ({ ...old, review_status: status }))
    } catch (e) {
      console.error('Failed to review:', e)
    }
  }

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

  if (error || !data) return <ErrorState title="Invoice not found" />

  const level = data.risk_level ?? (data.overall_score != null ? scoreToLevel(data.overall_score) : undefined)
  const signals = data.signals ?? data.risk?.signals ?? {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="shrink-0 px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 bg-surface" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold leading-none font-mono" style={{ color: 'var(--text-primary)' }}>
                {data.invoice_number ?? 'Unknown Invoice'}
              </h1>
              {level && <RiskBadge level={level} size="sm" />}
              {data.review_status && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                  {data.review_status.replace('_', ' ')}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-medium text-primary">{data.vendor?.name}</span> · {formatDate(data.invoice_date)} · {formatCurrency(data.grand_total)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="btn-ghost text-sm hidden md:flex"><Download size={14} /> PDF Report</button>
          <div className="h-6 w-px bg-border mx-2 hidden md:block" style={{ background: 'var(--border-default)' }} />
          
          <div className="flex bg-subtle rounded-lg p-1 gap-1" style={{ background: 'var(--bg-subtle)' }}>
            <button onClick={() => handleReviewAction('false_positive')} className="btn-ghost text-xs px-2 py-1 h-7">False Positive</button>
            <button onClick={() => handleReviewAction('approved')} className="btn-ghost text-xs px-2 py-1 h-7 text-green-500 hover:text-green-400"><CheckCircle2 size={12} className="mr-1 inline" />Approve</button>
            <button onClick={() => handleReviewAction('confirmed_issue')} className="btn-ghost text-xs px-2 py-1 h-7 text-red-500 hover:text-red-400"><AlertCircle size={12} className="mr-1 inline" />Confirm Issue</button>
          </div>
        </div>
      </header>

      {/* ── Main content (Split View) ─────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left 60%: Document Viewer */}
        <div className="w-full lg:w-3/5 h-1/2 lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r relative" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-hairline)' }}>
          
          {/* Top Controls */}
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--border-hairline)',
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-4 shadow-lg"
            >
              <label
                className="flex items-center gap-2 cursor-pointer transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <input type="checkbox" checked={showFindings} onChange={e => setShowFindings(e.target.checked)} className="accent-accent" />
                Findings
              </label>
              <label
                className="flex items-center gap-2 cursor-pointer transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                <input type="checkbox" checked={showExtracted} onChange={e => setShowExtracted(e.target.checked)} className="accent-accent" />
                Extracted Fields
              </label>
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative group">
            <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit wheel={{ step: 0.1 }}>
              <>
                <ViewerControls />
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <div className="relative shadow-2xl m-8">
                    {/* The actual image */}
                    <img 
                      src={invoiceApi.pageUrl(id!, page)} 
                      alt={`Invoice Page ${page}`} 
                      className="max-w-none bg-white select-none block"
                      style={{ height: '80vh', objectFit: 'contain' }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="1131" viewBox="0 0 800 1131"%3E%3Crect fill="%23fff" width="800" height="1131"/%3E%3Ctext x="400" y="565" font-family="sans-serif" font-size="24" fill="%23999" text-anchor="middle"%3EInvoice Preview%3C/text%3E%3C/svg%3E'
                      }}
                    />
                    
                    {/* Overlays: Findings */}
                    <AnimatePresence>
                      {showFindings && data.findings?.map(f => {
                        if (!f.bbox || f.bbox.length !== 4) return null
                        const [x0, y0, x1, y1] = f.bbox
                        const isSelected = selectedFindingId === f.id
                        const isVisual = f.category === 'visual'
                        
                        return (
                          <motion.div
                            key={`finding-${f.id}`}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                              setSelectedFindingId(isSelected ? null : f.id)
                              setActiveTab('findings')
                            }}
                            className={`absolute cursor-pointer transition-all ${isVisual ? 'border-dashed' : 'border-solid'} ${isSelected ? 'z-20' : 'z-10'}`}
                            style={{
                              left: `${x0 * 100}%`, top: `${y0 * 100}%`,
                              width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`,
                              borderWidth: isSelected ? 3 : 2,
                              borderColor: 'var(--risk-high-text)',
                              backgroundColor: isSelected ? 'var(--risk-high-bg)' : 'rgba(249,115,22,0.05)'
                            }}
                          >
                            {isSelected && (
                              <motion.div 
                                className="absolute -inset-2 border-2 rounded pointer-events-none" 
                                style={{ borderColor: 'var(--risk-high-text)' }}
                                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 0, 0.8] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                </TransformComponent>
              </>
            </TransformWrapper>
          </div>
          
          <div className="h-12 border-t flex items-center justify-center gap-4 text-sm" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            <button 
              disabled={page <= 1} 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1 disabled:opacity-30 hover:text-white transition-opacity"
            >
              <ChevronLeft size={16}/>
            </button>
            <span>Page {page} of {data.page_count ?? 1}</span>
            <button 
              disabled={page >= (data.page_count ?? 1)} 
              onClick={() => setPage(p => Math.min(data.page_count ?? 1, p + 1))}
              className="p-1 disabled:opacity-30 hover:text-white transition-opacity"
            >
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>

        {/* Right 40%: Analysis Tabs */}
        <div className="w-full lg:w-2/5 flex flex-col bg-base overflow-hidden">
          <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <Tabs.List className="flex border-b px-2 overflow-x-auto hide-scrollbar shrink-0" style={{ borderColor: 'var(--border-hairline)' }}>
              {['Summary', 'Findings', 'Compare', 'Data', 'Model', 'Timeline'].map(tab => {
                const val = tab.toLowerCase()
                return (
                  <Tabs.Trigger
                    key={val}
                    value={val}
                    className="px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap relative"
                    style={{
                      borderColor: activeTab === val ? 'var(--accent)' : 'transparent',
                      color: activeTab === val ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {tab}
                    {tab === 'Findings' && data.findings?.length ? (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-accent/20 text-accent font-bold" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
                        {data.findings.length}
                      </span>
                    ) : null}
                  </Tabs.Trigger>
                )
              })}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* ── Summary Tab ─────────────────────────────────── */}
                  {activeTab === 'summary' && (
                    <>
                      <div className="flex flex-col items-center justify-center py-6">
                        {data.overall_score != null && level && (
                          <RiskGauge score={data.overall_score} level={level} size={220} />
                        )}
                        {data.risk?.confidence != null && (
                          <div className="mt-6 w-full max-w-xs text-center">
                            <span className="text-xs uppercase tracking-widest font-bold opacity-50 block mb-2">Analysis Confidence</span>
                            <ConfidenceMeter confidence={data.risk.confidence} />
                          </div>
                        )}
                      </div>

                      {data.risk?.recommendation && (
                        <div className="surface p-5 rounded-2xl border" style={{ borderColor: 'var(--border-default)' }}>
                          <h3 className="font-bold flex items-center gap-2 text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                            <ShieldAlert size={16} className="text-accent" /> Recommendation
                          </h3>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {data.risk.recommendation}
                          </p>
                          {data.risk.escalations && data.risk.escalations.length > 0 && (
                            <div className="space-y-2 pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-hairline)' }}>
                              <p className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">Escalation Triggers</p>
                              {data.risk.escalations.map((esc, i) => (
                                <div key={i} className="flex gap-2 text-xs p-3 rounded-lg font-medium" style={{ background: 'var(--risk-critical-bg)', color: 'var(--risk-critical-text)' }}>
                                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                  <span>{esc}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {Object.keys(signals).length > 0 && (
                        <div className="surface p-5 rounded-2xl">
                          <h3 className="font-bold text-sm mb-5 uppercase tracking-wider opacity-60">Engine Contributions</h3>
                          <SignalBars signals={signals} />
                        </div>
                      )}
                      
                      <p className="text-xs text-center opacity-40 px-4 mt-8 pb-4">
                        InvoiceGuard flags anomalies for human review. It does not determine fraud.
                      </p>
                    </>
                  )}

                  {/* ── Findings Tab ────────────────────────────────── */}
                  {activeTab === 'findings' && (
                    <div className="space-y-4">
                      {data.findings?.length === 0 ? (
                        <div className="text-center py-12">
                          <CheckCircle2 size={32} className="mx-auto mb-4 text-green-500 opacity-20" />
                          <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>No anomalies found.</p>
                        </div>
                      ) : (
                        data.findings?.sort((a, b) => b.score - a.score).map((f, i) => (
                          <div 
                            key={f.id} 
                            id={`finding-card-${f.id}`}
                            className="cursor-pointer transition-transform" 
                            onClick={() => setSelectedFindingId(f.id)}
                            style={{ 
                              transform: selectedFindingId === f.id ? 'scale(1.01)' : 'scale(1)',
                              opacity: selectedFindingId && selectedFindingId !== f.id ? 0.6 : 1
                            }}
                          >
                            <FindingCard finding={f} index={i} />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ── Compare Tab ─────────────────────────────────── */}
                  {activeTab === 'compare' && (
                    <div className="space-y-6">
                      <div className="surface p-6 rounded-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-4 text-sm"><ArrowRightLeft size={16}/> Near Duplicate Matches</h3>
                        {data.matches?.length ? (
                          <div className="space-y-3">
                            {data.matches.map(m => (
                              <div key={m.matched_invoice_id} className="p-3 border rounded-lg text-sm" style={{ borderColor: 'var(--border-default)' }}>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-mono">{m.matched_invoice_number || m.matched_invoice_id.substring(0,8)}</span>
                                  <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}>
                                    {(m.similarity * 100).toFixed(0)}% Match
                                  </span>
                                </div>
                                <p className="text-xs text-neutral-500">Field-level diff would render here.</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-500">No duplicate matches found in the index.</p>
                        )}
                      </div>
                      
                      <div className="surface p-6 rounded-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-4 text-sm"><Activity size={16}/> Vendor Amount Timeline</h3>
                        <p className="text-xs text-neutral-500 mb-4">Historical comparison of {data.vendor?.name} invoices.</p>
                        <div className="h-32 border border-dashed rounded-lg flex items-center justify-center text-xs text-neutral-500" style={{ borderColor: 'var(--border-default)' }}>
                          Sparkline Chart Rendering...
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Data Tab ────────────────────────────────────── */}
                  {activeTab === 'data' && (
                    <div className="space-y-4">
                      <div className="surface p-6 rounded-2xl">
                        <h3 className="font-bold text-sm mb-4">Extracted Headers</h3>
                        <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Invoice Number</p>
                            <p className="font-mono">{data.data?.invoice_number?.value ?? '—'}</p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Date</p>
                            <p className="font-mono">{data.data?.invoice_date?.value ?? '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Vendor</p>
                            <p className="font-medium">{data.data?.vendor?.name?.value ?? data.vendor?.name ?? '—'}</p>
                            <p className="font-mono text-xs mt-0.5 opacity-60">{data.data?.vendor?.gstin?.value ?? data.vendor?.gstin ?? ''}</p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Subtotal</p>
                            <p className="font-mono tabular-nums">{formatCurrency(Number(data.data?.subtotal?.value) || 0)}</p>
                          </div>
                          <div>
                            <p style={{ color: 'var(--text-tertiary)' }} className="text-xs mb-1">Grand Total</p>
                            <p className="font-mono font-bold tabular-nums text-lg">{formatCurrency(Number(data.data?.grand_total?.value) || data.grand_total)}</p>
                          </div>
                        </div>
                      </div>
                      
                      {data.data?.payment && (
                        <div className="surface p-6 rounded-2xl">
                          <h3 className="font-bold text-sm mb-4">Payment Details</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-xs opacity-50 mb-1">Bank Name</p>
                              <p>{data.data.payment.bank_name?.value || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-50 mb-1">Account No.</p>
                              <p className="font-mono">XXXXXX{data.data.payment.account_number?.value?.toString().slice(-4) || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-50 mb-1">IFSC</p>
                              <p className="font-mono">{data.data.payment.ifsc?.value || '—'}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Model Tab ───────────────────────────────────── */}
                  {activeTab === 'model' && (
                    <div className="space-y-6">
                      <div className="surface p-6 rounded-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-4 text-sm"><Zap size={16}/> Fusion Model (XGBoost)</h3>
                        <div className="flex gap-4 text-sm border-b pb-4 mb-4" style={{ borderColor: 'var(--border-hairline)' }}>
                          <div>
                            <p className="text-xs opacity-50">Baseline Rules Score</p>
                            <p className="font-mono font-bold">{data.risk?.baseline_score ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-50">ML Score</p>
                            <p className="font-mono font-bold">{data.risk?.ml_score ?? '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs opacity-50">Combined (Final)</p>
                            <p className="font-mono font-bold">{data.risk?.overall_score ?? '—'}</p>
                          </div>
                        </div>
                        
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3 mt-6">SHAP Feature Contributions</h4>
                        <div className="space-y-2">
                          {data.risk?.shap_top?.length ? (
                            data.risk.shap_top.map(shap => (
                              <div key={shap.feature} className="flex justify-between items-center text-xs p-2 rounded bg-neutral-500/5">
                                <span className="font-mono opacity-80">{shap.feature}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden flex justify-end">
                                    <div 
                                      className="h-full rounded-full" 
                                      style={{ 
                                        width: `${Math.min(100, Math.abs(shap.value) * 100)}%`,
                                        background: shap.direction === 'increases_risk' ? 'var(--risk-high-text)' : 'var(--risk-low-text)'
                                      }}
                                    />
                                  </div>
                                  <span className="font-mono w-8 text-right opacity-50">{(shap.value > 0 ? '+' : '')}{shap.value.toFixed(1)}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm opacity-50">SHAP explanations not available for this analysis.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Timeline Tab ────────────────────────────────── */}
                  {activeTab === 'timeline' && (
                    <div className="surface p-6 rounded-2xl">
                      <h3 className="font-bold flex items-center gap-2 mb-4 text-sm"><History size={16}/> Processing Timeline</h3>
                      <div className="relative pl-6 border-l space-y-6" style={{ borderColor: 'var(--border-default)' }}>
                        {[
                          { time: data.created_at, label: 'Document uploaded and ingested', icon: <FileText size={12}/> },
                          { time: data.created_at, label: 'Extraction chain completed', icon: <CheckCircle2 size={12}/> },
                          { time: data.created_at, label: 'Detection engines & fusion completed', icon: <Zap size={12}/> },
                          data.review_status && { time: new Date().toISOString(), label: `Marked as ${data.review_status.replace('_', ' ')}`, icon: <Check size={12}/> }
                        ].filter(Boolean).map((ev: any, i) => (
                          <div key={i} className="relative">
                            <div className="absolute -left-9 w-6 h-6 rounded-full bg-surface border flex items-center justify-center" style={{ borderColor: 'var(--border-default)' }}>
                              {ev.icon}
                            </div>
                            <p className="text-sm font-medium">{ev.label}</p>
                            <p className="text-xs font-mono opacity-50 mt-1">{ev.time ? formatDate(ev.time) : '—'}</p>
                          </div>
                        ))}
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
