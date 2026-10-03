import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, ArrowRightLeft } from 'lucide-react'
import { invoiceApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

export default function ComparePage() {
  const { a, b } = useParams<{ a: string; b: string }>()
  const navigate = useNavigate()

  const { data: invA, isLoading: loadA } = useQuery({
    queryKey: ['invoice', a],
    queryFn: () => invoiceApi.get(a!),
    enabled: !!a,
  })

  const { data: invB, isLoading: loadB } = useQuery({
    queryKey: ['invoice', b],
    queryFn: () => invoiceApi.get(b!),
    enabled: !!b,
  })

  if (loadA || loadB) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6 h-full">
        <SkeletonCard className="h-16" />
        <div className="grid grid-cols-2 gap-6 h-full">
          <SkeletonCard className="h-full" />
          <SkeletonCard className="h-full" />
        </div>
      </div>
    )
  }

  if (!invA || !invB) {
    return <ErrorState title="Invoices not found" />
  }

  const fields = [
    { label: 'Invoice Number', key: 'invoice_number', a: invA.data?.invoice_number?.value, b: invB.data?.invoice_number?.value },
    { label: 'Date', key: 'invoice_date', a: invA.data?.invoice_date?.value, b: invB.data?.invoice_date?.value },
    { label: 'Vendor', key: 'vendor.name', a: invA.data?.vendor?.name?.value, b: invB.data?.vendor?.name?.value },
    { label: 'Subtotal', key: 'subtotal', a: invA.data?.subtotal?.value, b: invB.data?.subtotal?.value, type: 'currency' },
    { label: 'Tax Total', key: 'tax.total', a: invA.data?.tax?.total?.value, b: invB.data?.tax?.total?.value, type: 'currency' },
    { label: 'Grand Total', key: 'grand_total', a: invA.data?.grand_total?.value, b: invB.data?.grand_total?.value, type: 'currency' },
    { label: 'Bank Name', key: 'payment.bank_name', a: invA.data?.payment?.bank_name?.value, b: invB.data?.payment?.bank_name?.value },
    { label: 'Account No.', key: 'payment.account_number', a: invA.data?.payment?.account_number?.value, b: invB.data?.payment?.account_number?.value },
    { label: 'IFSC', key: 'payment.ifsc', a: invA.data?.payment?.ifsc?.value, b: invB.data?.payment?.ifsc?.value },
  ]

  const getDelta = (valA: any, valB: any, type?: string) => {
    if (valA === valB) return null
    if (type === 'currency' && typeof valA === 'number' && typeof valB === 'number') {
      const diff = valB - valA
      return {
        text: `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`,
        isError: Math.abs(diff) > 0,
      }
    }
    return {
      text: 'Modified',
      isError: true,
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col h-full">
      <div className="flex items-center gap-4 mb-8">
        <button className="p-2 hover:bg-neutral-500/10 rounded-lg transition-colors" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Compare Invoices</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Highlighting differences between {invA.invoice_number || 'A'} and {invB.invoice_number || 'B'}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        
        {/* Invoice A Column */}
        <div className="flex-1 surface rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-neutral-500/5 flex items-center justify-between" style={{ borderColor: 'var(--border-hairline)' }}>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-50 font-bold mb-1">Source Document</p>
              <p className="font-mono font-bold text-lg">{invA.invoice_number || invA.id.substring(0,8)}</p>
            </div>
            <button className="btn-ghost text-xs py-1 px-2" onClick={() => navigate(`/invoices/${invA.id}`)}><FileText size={14} className="mr-1 inline"/> View</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {fields.map(f => (
              <div key={f.key} className="p-3 border rounded-lg bg-neutral-500/5" style={{ borderColor: 'var(--border-default)' }}>
                <p className="text-xs opacity-50 mb-1">{f.label}</p>
                <p className={`font-mono text-sm ${f.a !== f.b ? 'opacity-50 line-through' : ''}`}>
                  {f.type === 'currency' ? formatCurrency(f.a as number) : (f.a?.toString() || '—')}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center -mx-3 z-10 hidden lg:flex">
          <div className="w-10 h-10 rounded-full bg-accent text-white shadow-lg flex items-center justify-center">
            <ArrowRightLeft size={16} />
          </div>
        </div>

        {/* Invoice B Column */}
        <div className="flex-1 surface rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-neutral-500/5 flex items-center justify-between" style={{ borderColor: 'var(--border-hairline)' }}>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-50 font-bold mb-1">Comparison Document</p>
              <p className="font-mono font-bold text-lg">{invB.invoice_number || invB.id.substring(0,8)}</p>
            </div>
            <button className="btn-ghost text-xs py-1 px-2" onClick={() => navigate(`/invoices/${invB.id}`)}><FileText size={14} className="mr-1 inline"/> View</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {fields.map(f => {
              const delta = getDelta(f.a, f.b, f.type)
              return (
                <div key={f.key} className={`p-3 border rounded-lg transition-colors ${delta ? 'bg-orange-500/10 border-orange-500/30' : 'bg-neutral-500/5'}`} style={{ borderColor: delta ? undefined : 'var(--border-default)' }}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs opacity-50">{f.label}</p>
                    {delta && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: delta.isError ? 'var(--risk-high-bg)' : 'var(--risk-low-bg)', color: delta.isError ? 'var(--risk-high-text)' : 'var(--risk-low-text)' }}>
                        {delta.text}
                      </span>
                    )}
                  </div>
                  <p className={`font-mono text-sm ${delta ? 'text-orange-500 dark:text-orange-400 font-bold' : ''}`}>
                    {f.type === 'currency' ? formatCurrency(f.b as number) : (f.b?.toString() || '—')}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
