import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Building2, Search, ArrowRight, ShieldAlert, CreditCard, Activity, Link as LinkIcon, BadgeAlert } from 'lucide-react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Scatter, Cell } from 'recharts'

import { vendorApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { VendorProfile } from '@/api/types'

// ── VENDORS LIST VIEW ─────────────────────────────────────────

const columnHelper = createColumnHelper<VendorProfile>()

function VendorList() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: () => vendorApi.list(),
  })

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Vendor Name',
        cell: info => <span className="font-medium flex items-center gap-2"><Building2 size={14} className="opacity-50" /> {info.getValue()}</span>,
      }),
      columnHelper.accessor('gstin', {
        header: 'GSTIN',
        cell: info => <span className="font-mono text-xs">{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor('invoice_count', {
        header: 'Invoices',
        cell: info => <span className="font-mono">{info.getValue() || 0}</span>,
      }),
      columnHelper.accessor('total_volume', {
        header: 'Total Volume',
        cell: info => <span className="font-mono tabular-nums">{formatCurrency(info.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'trend',
        header: 'Risk Trend',
        cell: () => (
          <div className="w-16 h-6 flex items-end gap-0.5">
            {[2, 4, 3, 6, 8, 5, 2].map((v, i) => (
               <div key={i} className="w-1.5 bg-accent/40 rounded-t-sm" style={{ height: `${(v/8)*100}%` }} />
            ))}
          </div>
        )
      }),
    ],
    []
  )

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <div className="p-8"><SkeletonCard className="h-64" /></div>
  if (error) return <ErrorState title="Failed to load vendors" />

  return (
    <div className="p-6 h-full flex flex-col max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Vendor Directory</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profiles, historical statistics, and behavioural analysis.</p>
      </div>

      <div className="surface rounded-2xl flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b flex items-center gap-4" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input type="text" placeholder="Search vendors..." className="w-full bg-transparent border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-1 transition-all" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        
        <div className="flex-1 overflow-auto hide-scrollbar p-2">
          <table className="w-full text-sm text-left">
            <thead className="sticky top-0 bg-base z-10 text-xs font-medium uppercase tracking-wider" style={{ background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-hairline)' }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-neutral-500/5 transition-colors cursor-pointer group" onClick={() => navigate(`/vendors/${row.original.id}`)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <ArrowRight size={14} className="inline-block opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-tertiary)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── VENDOR PROFILE VIEW ───────────────────────────────────────

function VendorProfileView({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => vendorApi.get(id),
  })

  if (isLoading) return <div className="p-8"><SkeletonCard className="h-64" /></div>
  if (error || !data) return <ErrorState title="Vendor not found" />

  // Mock timeline data for MAD band
  const madData = Array.from({ length: 12 }).map((_, i) => {
    const val = 1000 + Math.random() * 500
    const isAnomaly = i === 8 || i === 2
    const actual = isAnomaly ? val * (i === 8 ? 2.5 : 0.3) : val
    return {
      date: `Month ${i+1}`,
      median: 1250,
      upper: 1750,
      lower: 750,
      actual,
      isAnomaly
    }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="surface p-6 rounded-2xl flex flex-wrap items-start justify-between gap-6 relative overflow-hidden">
        <div className="z-10">
          <div className="flex items-center gap-3 mb-2">
            <Building2 size={24} style={{ color: 'var(--text-tertiary)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{data.name}</h1>
          </div>
          <div className="flex gap-6 mt-4 text-sm">
            <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>GSTIN</span><span className="font-mono">{data.gstin || '—'}</span></div>
            <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Volume</span><span className="font-mono font-medium">{formatCurrency(data.total_volume)}</span></div>
            <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Invoices</span><span className="font-mono">{data.invoice_count}</span></div>
            <div><span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Avg Risk</span><span className="font-mono font-bold text-accent">{data.avg_risk_score || 0}</span></div>
          </div>
        </div>
        
        {data.avg_risk_score && data.avg_risk_score > 60 && (
          <div className="flex items-center gap-3 p-4 rounded-xl z-10" style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}>
            <ShieldAlert size={20} />
            <div>
              <p className="font-bold text-sm">Elevated Risk Profile</p>
              <p className="text-xs mt-0.5 opacity-90">Score: {data.avg_risk_score}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Accounts */}
        <div className="surface p-6 rounded-2xl md:col-span-1 space-y-6">
          <div>
            <h3 className="font-bold mb-4 flex items-center gap-2 text-sm"><CreditCard size={16} className="text-accent" /> Known Bank Accounts</h3>
            <div className="space-y-3">
              {data.known_accounts?.map((acc: any, i: number) => {
                const isNew = i === 0 && acc.invoice_count === 1
                return (
                  <div key={i} className="p-3 rounded-lg border text-sm flex justify-between items-center relative overflow-hidden" style={{ borderColor: isNew ? 'var(--risk-medium-border)' : 'var(--border-default)', background: isNew ? 'var(--risk-medium-bg)' : 'transparent' }}>
                    <div>
                      <p className="font-mono font-bold flex items-center gap-2">
                        XXXXXX{acc.last4}
                        {isNew && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500 text-white">New</span>}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>IFSC: {acc.ifsc || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium">Seen {acc.invoice_count}x</p>
                      <p className="text-[10px] mt-1 opacity-60">Last: {formatDate(acc.last_seen) || '—'}</p>
                    </div>
                  </div>
                )
              }) || <p className="text-xs text-center py-4 opacity-50">No accounts on record</p>}
            </div>
          </div>

          <div>
             <h3 className="font-bold mb-4 flex items-center gap-2 text-sm"><LinkIcon size={16} className="text-accent" /> Linked Entities</h3>
             <div className="p-3 rounded-lg border text-sm text-center" style={{ borderColor: 'var(--border-default)' }}>
                <BadgeAlert size={24} className="mx-auto mb-2 opacity-50" />
                <p className="opacity-80">2 vendors share same PAN</p>
                <button className="text-xs text-accent mt-2 hover:underline">View Linkages</button>
             </div>
          </div>
        </div>

        {/* Timeline (MAD Band) */}
        <div className="surface p-6 rounded-2xl md:col-span-2 flex flex-col">
           <h3 className="font-bold mb-4 flex items-center gap-2 text-sm"><Activity size={16} className="text-accent" /> Invoice Amount Timeline (MAD)</h3>
           <p className="text-xs mb-6 opacity-60">
             Displays historical invoice totals. The shaded region represents the median ± 2 Median Absolute Deviations (MAD). Points outside are flagged.
           </p>
           <div className="flex-1 min-h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={madData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `₹${v/1000}k`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px' }} />
                  <Area type="step" dataKey="upper" stroke="none" fill="var(--bg-subtle)" />
                  <Area type="step" dataKey="lower" stroke="none" fill="var(--bg-surface)" />
                  <Line type="step" dataKey="median" stroke="var(--text-tertiary)" strokeDasharray="3 3" dot={false} />
                  <Scatter dataKey="actual">
                    {madData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isAnomaly ? 'var(--risk-high-text)' : 'var(--text-primary)'} />
                    ))}
                  </Scatter>
                </ComposedChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  )
}

export default function VendorsPage() {
  const { id } = useParams<{ id?: string }>()
  return id ? <VendorProfileView id={id} /> : <VendorList />
}
