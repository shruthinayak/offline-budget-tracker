import { Download, Archive, Trash2 } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'
import { useTotalDatapoints } from '../../store/selectors'

export function ActionsBar() {
  const totalDatapoints = useTotalDatapoints()
  const exportCsv = useBudgetStore((state) => state.exportCsv)
  const consolidateAndDownload = useBudgetStore((state) => state.consolidateAndDownload)
  const startNewBatch = useBudgetStore((state) => state.startNewBatch)
  const actionMessage = useBudgetStore((state) => state.actionMessage)

  if (totalDatapoints === 0) return null

  function handleStartNewBatch() {
    if (
      window.confirm(
        'Clear this batch to start a new month? This removes these transactions from the working view — download or consolidate first if you want to keep a copy.',
      )
    ) {
      void startNewBatch()
    }
  }

  return (
    <section className="mb-6 rounded-xl bg-surface-container-lowest p-5 custom-shadow">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-2.5 text-body-sm font-medium text-on-surface hover:bg-surface-container-high"
        >
          <Download size={18} />
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => void consolidateAndDownload()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
        >
          <Archive size={18} />
          Consolidated Transactions
        </button>
        <button
          type="button"
          onClick={handleStartNewBatch}
          className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high"
        >
          <Trash2 size={16} />
          Start a new month
        </button>
      </div>
      {actionMessage && <p className="mt-3 text-body-sm text-secondary">{actionMessage}</p>}
    </section>
  )
}
