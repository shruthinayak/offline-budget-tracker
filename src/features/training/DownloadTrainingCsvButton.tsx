import { Download } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'

export function DownloadTrainingCsvButton() {
  const exportTrainingCsv = useBudgetStore((state) => state.exportTrainingCsv)
  const totalDatapoints = useBudgetStore((state) => state.transactions.length)

  return (
    <button
      type="button"
      disabled={totalDatapoints === 0}
      onClick={exportTrainingCsv}
      className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
    >
      <Download size={18} />
      Download Training CSV
    </button>
  )
}
