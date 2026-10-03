import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table'
import { Search, Filter, Download, ArrowUpDown } from 'lucide-react'

import { invoiceApi } from '@/api/client'
import { RiskBadge } from '@/components/RiskBadge'
import { formatCurrency, formatDate, scoreToLevel } from '@/lib/utils'
import type { InvoiceListItem } from '@/api/types'

const columnHelper = createColumnHelper<InvoiceListItem>()

export default function HistoryPage() {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices-list'],
    queryFn: () => invoiceApi.list({ limit: 50 }),
  })

  const columns = useMemo(
    () => [
      columnHelper.accessor('invoice_number', {
        header: 'Invoice',
        cell: info => <span className="font-medium">{info.getValue() || '—'}</span>,
      }),
      columnHelper.accessor(row => row.vendor_name || row.vendor?.name, {
        id: 'vendor',
        header: 'Vendor',
        cell: info => info.getValue() || '—',
      }),
      columnHelper.accessor('invoice_date', {
        header: 'Date',
        cell: info => <span className="font-mono text-xs">{formatDate(info.getValue())}</span>,
      }),
      columnHelper.accessor('grand_total', {
        header: 'Amount',
        cell: info => <span className="font-mono tabular-nums">{formatCurrency(info.getValue())}</span>,
      }),
      columnHelper.accessor('overall_score', {
        header: 'Risk',
        cell: info => {
          const score = info.getValue()
          if (score == null) return <span className="text-xs text-neutral-500">Pending</span>
          return <RiskBadge level={scoreToLevel(score)} size="sm" />
        },
      }),
      columnHelper.accessor('review_status', {
        header: 'Status',
        cell: info => {
          const s = info.getValue()
          if (!s) return null
          return (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
              {s.replace('_', ' ')}
            </span>
          )
        },
      }),
    ],
    []
  )

  const table = useReactTable({
    data: (data?.items as any[]) ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Analysis History</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>All processed invoices and their risk assessments.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost px-3 py-1.5 text-sm h-9">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div className="surface flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b flex items-center justify-between gap-4" style={{ borderColor: 'var(--border-hairline)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input 
              type="text" 
              placeholder="Search invoices..." 
              className="w-full bg-transparent border rounded-lg pl-9 pr-4 py-1.5 text-sm focus:outline-none focus:ring-1 transition-all"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          <button className="btn-ghost px-3 py-1.5 text-sm h-9">
            <Filter size={14} /> Filters
          </button>
        </div>
        
        <div className="flex-1 overflow-auto hide-scrollbar">
          {isLoading ? (
             <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading history...</div>
          ) : error ? (
             <div className="p-8 text-center text-sm text-red-500">Failed to load history</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-base z-10 text-xs font-medium uppercase tracking-wider" style={{ background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id} className="px-4 py-3 border-b cursor-pointer hover:bg-neutral-500/5 transition-colors" style={{ borderColor: 'var(--border-hairline)' }} onClick={header.column.getToggleSortingHandler()}>
                        <div className="flex items-center gap-2">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ArrowUpDown size={12} className="opacity-100" />,
                            desc: <ArrowUpDown size={12} className="opacity-100 rotate-180" />,
                          }[header.column.getIsSorted() as string] ?? <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-50" />}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {table.getRowModel().rows.map(row => (
                  <tr 
                    key={row.id} 
                    className="hover:bg-neutral-500/5 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/invoices/${row.original.id}`)}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
