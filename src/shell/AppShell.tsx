import { useEffect } from 'react'
import { Wallet, ShieldCheck } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'
import { MainPage } from '../features/budget/MainPage'

export function AppShell() {
  const isLoading = useBudgetStore((state) => state.isLoading)
  const loadInitialData = useBudgetStore((state) => state.loadInitialData)

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-outline-variant bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-4 sm:gap-6 sm:px-6 md:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
              <Wallet size={20} />
            </div>
            <span className="text-headline-sm font-bold text-primary">BudgetLocal</span>
          </div>
          <div
            className="hidden shrink-0 items-center gap-2 text-on-surface-variant sm:flex"
            title="100% local — nothing leaves your browser"
          >
            <ShieldCheck size={20} />
            <span className="hidden text-label-md md:inline">Local-only</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8 md:px-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-on-surface-variant">Loading…</div>
        ) : (
          <MainPage />
        )}
      </main>
    </div>
  )
}
