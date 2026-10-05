import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/hooks/useTheme'
import { AppShell } from '@/components/AppShell'
import { SkeletonCard } from '@/components/ui'
import LandingPage from '@/pages/LandingPage'

// Lazy-loaded pages (code splitting)
const DashboardPage  = lazy(() => import('@/pages/DashboardPage'))
const AnalyzePage    = lazy(() => import('@/pages/AnalyzePage'))
const InvoicePage    = lazy(() => import('@/pages/InvoicePage'))
const HistoryPage    = lazy(() => import('@/pages/HistoryPage'))
const ReviewPage     = lazy(() => import('@/pages/ReviewPage'))
const VendorsPage    = lazy(() => import('@/pages/VendorsPage'))
const InsightsPage   = lazy(() => import('@/pages/InsightsPage'))
const SettingsPage   = lazy(() => import('@/pages/SettingsPage'))
const ComparePage    = lazy(() => import('@/pages/ComparePage'))
const BatchPage      = lazy(() => import('@/pages/BatchPage'))
const NotFoundPage   = lazy(() => import('@/pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function PageLoader() {
  return (
    <div className="p-8 space-y-4 max-w-3xl">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            {/* Landing page — no shell */}
            <Route path="/" element={<LandingPage />} />

            {/* App shell wraps all authenticated routes */}
            <Route
              path="/*"
              element={
                <AppShell>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/dashboard"        element={<DashboardPage />} />
                      <Route path="/analyze"          element={<AnalyzePage />} />
                      <Route path="/batch/:id"        element={<BatchPage />} />
                      <Route path="/invoices/:id"     element={<InvoicePage />} />
                      <Route path="/history"          element={<HistoryPage />} />
                      <Route path="/review"           element={<ReviewPage />} />
                      <Route path="/vendors"          element={<VendorsPage />} />
                      <Route path="/insights"         element={<InsightsPage />} />
                      <Route path="/settings"         element={<SettingsPage />} />
                      <Route path="/compare/:a/:b"    element={<ComparePage />} />
                      <Route path="/404"              element={<NotFoundPage />} />
                      <Route path="*"                 element={<Navigate to="/404" replace />} />
                    </Routes>
                  </Suspense>
                </AppShell>
              }
            />
          </Routes>
        </BrowserRouter>

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
