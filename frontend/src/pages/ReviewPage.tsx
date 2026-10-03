import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, MousePointerClick } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { ErrorState } from '@/components/ui'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'

export default function ReviewPage() {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  // Filter for needs review invoices
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => invoiceApi.list({ status: 'needs_review', limit: 20 }),
  })
  
  const items = data?.items ?? []
  const selectedItem = items[selectedIndex]

  // Keyboard navigation
  useEffect(() => {
    if (!items.length) return
    
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      
      switch (e.key.toLowerCase()) {
        case 'j':
          setSelectedIndex(prev => Math.min(prev + 1, items.length - 1))
          break
        case 'k':
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'c':
          if (selectedItem) await handleAction(selectedItem.id, 'confirmed_issue')
          break
        case 'f':
          if (selectedItem) await handleAction(selectedItem.id, 'false_positive')
          break
        case 'a':
          if (selectedItem) await handleAction(selectedItem.id, 'approved')
          break
        case 'enter':
          if (selectedItem) navigate(`/invoices/${selectedItem.id}`)
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items, selectedIndex, navigate, selectedItem])

  const handleAction = async (id: string, status: 'confirmed_issue' | 'false_positive' | 'approved') => {
    try {
      await invoiceApi.review(id, status)
      // Optimistically move to next item
      if (selectedIndex >= items.length - 1) {
        setSelectedIndex(Math.max(0, items.length - 2))
      }
      refetch()
    } catch (e) {
      console.error(e)
    }
  }

  if (isLoading) return <div className="p-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading queue...</div>
  if (error) return <ErrorState title="Failed to load queue" />

  if (items.length === 0) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--bg-subtle)' }}>
          <CheckCircle2 size={32} style={{ color: 'var(--risk-low-text)' }} />
        </div>
        <h2 className="text-xl font-bold mb-2">Inbox Zero</h2>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-secondary)' }}>
          There are no invoices waiting for manual review. Take a break!
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Sidebar: Queue ───────────────────────────────────── */}
      <div className="w-80 border-r flex flex-col bg-base shrink-0" style={{ borderColor: 'var(--border-hairline)' }}>
        <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-hairline)', background: 'var(--bg-surface)' }}>
          <h2 className="font-bold text-sm">Review Queue</h2>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
            {items.length} left
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setSelectedIndex(i)}
              className="w-full text-left p-4 border-b transition-colors flex gap-3"
              style={{
                borderColor: 'var(--border-hairline)',
                background: i === selectedIndex ? 'var(--bg-surface)' : 'transparent',
                borderLeft: i === selectedIndex ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <div className="mt-0.5 shrink-0">
                 <RiskBadge level={scoreToLevel(item.overall_score ?? 0)} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.vendor?.name}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{item.invoice_number}</span>
                  <span className="text-xs font-mono">{formatCurrency(item.grand_total)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t text-[11px] font-mono flex flex-col gap-1.5" style={{ borderColor: 'var(--border-hairline)', color: 'var(--text-tertiary)', background: 'var(--bg-surface)' }}>
           <p><kbd className="bg-neutral-500/10 px-1 py-0.5 rounded mr-1">J</kbd> / <kbd className="bg-neutral-500/10 px-1 py-0.5 rounded mr-1">K</kbd> to move</p>
           <p><kbd className="bg-neutral-500/10 px-1 py-0.5 rounded mr-1">Enter</kbd> open details</p>
        </div>
      </div>

      {/* ── Right Pane: Active Review Item ────────────────────────── */}
      <div className="flex-1 flex flex-col bg-surface overflow-hidden">
        {selectedItem && (
          <>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="max-w-3xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h1 className="text-2xl font-bold mb-1">{selectedItem.vendor?.name}</h1>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Invoice <span className="font-mono">{selectedItem.invoice_number}</span> · {formatDate(selectedItem.invoice_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono">{formatCurrency(selectedItem.grand_total)}</p>
                    <RiskBadge level={scoreToLevel(selectedItem.overall_score ?? 0)} size="md" className="mt-2 justify-end" />
                  </div>
                </div>

                {/* Evidence snippet */}
                <div className="p-6 rounded-2xl border" style={{ borderColor: 'var(--risk-high-border)', background: 'var(--risk-high-bg)' }}>
                   <div className="flex items-start gap-3">
                     <AlertTriangle className="shrink-0 mt-0.5" style={{ color: 'var(--risk-high-text)' }} />
                     <div>
                       <h3 className="font-bold text-sm" style={{ color: 'var(--risk-high-text)' }}>Primary Anomalies</h3>
                       <ul className="text-sm mt-2 space-y-1.5" style={{ color: 'var(--risk-high-text)' }}>
                         {/* We would map top findings here in real app */}
                         <li>• Bank account details changed vs vendor history.</li>
                         <li>• Amount is 3.5× higher than median.</li>
                       </ul>
                     </div>
                   </div>
                </div>

                <div className="flex justify-center">
                  <button 
                    onClick={() => navigate(`/invoices/${selectedItem.id}`)}
                    className="btn-ghost"
                  >
                    <MousePointerClick size={16} /> Open Full Analysis
                  </button>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="p-4 border-t flex justify-center gap-4 bg-base" style={{ borderColor: 'var(--border-hairline)' }}>
              <button 
                onClick={() => handleAction(selectedItem.id, 'false_positive')}
                className="btn-ghost"
                title="Shortcut: f"
              >
                <XCircle size={16} /> Mark False Positive <kbd className="ml-2 font-mono text-[10px] opacity-50">F</kbd>
              </button>
              <button 
                onClick={() => handleAction(selectedItem.id, 'approved')}
                className="btn-ghost"
                title="Shortcut: a"
              >
                <CheckCircle2 size={16} /> Approve & Clear <kbd className="ml-2 font-mono text-[10px] opacity-50">A</kbd>
              </button>
              <div className="w-px h-6 bg-border mx-2" style={{ background: 'var(--border-default)' }} />
              <button 
                onClick={() => handleAction(selectedItem.id, 'confirmed_issue')}
                className="btn-primary"
                title="Shortcut: c"
                style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}
              >
                <AlertTriangle size={16} /> Confirm Issue <kbd className="ml-2 font-mono text-[10px] opacity-50">C</kbd>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
