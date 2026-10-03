import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Building2, Search, ArrowRight, ShieldAlert, CreditCard } from 'lucide-react'

import { vendorApi } from '@/api/client'
import { ErrorState, SkeletonCard } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
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
        cell: info => <span className="font-medium text-primary flex items-center gap-2"><Building2 size={14} className="opacity-50" /> {info.getValue()}</span>,
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
    ],
    []
  )

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (isLoading) return <div className="p-8">Loading vendors...</div>
  if (error) return <ErrorState title="Failed to load vendors" />

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Vendor Directory</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profiles, historical statistics, and behavioural analysis.</p>
      </div>

      <div className="surface flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b flex items-center gap-4" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              placeholder="Search vendors..." 
              className="w-full bg-transparent border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-1 transition-all"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-auto hide-scrollbar">
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
            <tbody className="divide-y" style={{ divideColor: 'var(--border-hairline)' }}>
              {table.getRowModel().rows.map(row => (
                <tr 
                  key={row.id} 
                  className="hover:bg-neutral-500/5 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/vendors/${row.original.id}`)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="surface p-6 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 size={24} style={{ color: 'var(--text-tertiary)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{data.name}</h1>
          </div>
          <div className="flex gap-6 mt-4 text-sm">
            <div>
              <span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>GSTIN</span>
              <span className="font-mono">{data.gstin || '—'}</span>
            </div>
            <div>
              <span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Volume</span>
              <span className="font-mono font-medium">{formatCurrency(data.total_volume)}</span>
            </div>
            <div>
              <span className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Invoices</span>
              <span className="font-mono">{data.invoice_count}</span>
            </div>
          </div>
        </div>
        
        {data.risk_score && data.risk_score > 60 && (
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--risk-high-bg)', color: 'var(--risk-high-text)' }}>
            <ShieldAlert size={20} />
            <div>
              <p className="font-bold text-sm">Elevated Risk Profile</p>
              <p className="text-xs mt-0.5 opacity-90">Score: {data.risk_score}</p>
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Accounts */}
        <div className="surface p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <CreditCard size={16} /> Known Bank Accounts
          </h3>
          <div className="space-y-3">
            {data.accounts?.map((acc, i) => (
              <div key={i} className="p-3 rounded-lg border text-sm flex justify-between items-center" style={{ borderColor: 'var(--border-hairline)' }}>
                <div>
                  <p className="font-mono font-medium">XXXXXX{acc.last4}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>IFSC: {acc.ifsc || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Seen {acc.invoice_count} times</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Last: {acc.last_seen || '—'}</p>
                </div>
              </div>
            )) || <p className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No accounts on record</p>}
          </div>
        </div>

        {/* Timeline placeholder */}
        <div className="surface p-6 flex flex-col justify-center items-center text-center">
           <p className="font-medium text-sm mb-2">Historical Volume Analysis</p>
           <p className="text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
             Amount timeline with median ± 2·MAD bands will render here using Recharts.
           </p>
        </div>
      </div>
    </div>
  )
}

// ── EXPORT ────────────────────────────────────────────────────

export default function VendorsPage() {
  const { id } = useParams<{ id?: string }>()
  if (id) {
    return <VendorProfileView id={id} />
  }
  return <VendorList />
}
