import { CheckCircle2, Circle, X } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'
import { useCoverage, useTotalDatapoints } from '../../store/selectors'
import { COVERAGE_GOAL } from '../../lib/categorization/coverage'

/** A step-by-step guide through the recommended monthly workflow, shown at
 *  the top of the report sidebar. Every step auto-checks itself off a real
 *  signal (upload, coverage goal, a download button click, the pie chart
 *  scrolling into view) rather than requiring the user to track their own
 *  progress — closeable so a repeat user isn't stuck looking at it every
 *  session. */
export function WorkflowChecklist() {
  const dismissed = useBudgetStore((state) => state.checklistDismissed)
  const dismissChecklist = useBudgetStore((state) => state.dismissChecklist)
  const viewedPieChart = useBudgetStore((state) => state.checklistViewedPieChart)
  const downloadedRules = useBudgetStore((state) => state.checklistDownloadedRules)
  const downloadedTransactions = useBudgetStore((state) => state.checklistDownloadedTransactions)
  const savedToHistory = useBudgetStore((state) => state.checklistSavedToHistory)
  const totalDatapoints = useTotalDatapoints()
  const coverage = useCoverage()

  if (dismissed) return null

  const hasData = totalDatapoints > 0

  const items = [
    { label: 'Download your bank statement CSVs', done: hasData },
    { label: 'Drop it in the tool', done: hasData },
    { label: 'Check your "Categorized" %', done: hasData },
    { label: 'Label your recurring transactions', done: coverage >= COVERAGE_GOAL },
    { label: 'View your spending pie chart', done: viewedPieChart },
    { label: 'Download your personalized rules', done: downloadedRules },
    { label: 'Download your categorized transactions', done: downloadedTransactions },
    { label: 'Add it to your all-time history', done: savedToHistory },
  ]

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-container-lowest p-5 custom-shadow">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-headline-sm text-on-surface">Getting started</h2>
        <button
          type="button"
          onClick={dismissChecklist}
          aria-label="Dismiss checklist"
          className="shrink-0 rounded p-1 text-on-surface-variant hover:bg-surface-container-high"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-body-sm">
            {item.done ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-secondary" />
            ) : (
              <Circle size={18} className="mt-0.5 shrink-0 text-outline-variant" />
            )}
            <span className={item.done ? 'text-on-surface-variant line-through' : 'text-on-surface'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
