import { Sparkles } from 'lucide-react'
import { useCoverage, useTotalDatapoints } from '../../store/selectors'
import { COVERAGE_GOAL } from '../../lib/categorization/coverage'
import { useBudgetStore } from '../../store/useBudgetStore'

export function CoverageGateBanner() {
  const coverage = useCoverage()
  const totalDatapoints = useTotalDatapoints()
  const exportCsv = useBudgetStore((state) => state.exportCsv)

  if (totalDatapoints === 0 || coverage < COVERAGE_GOAL) return null

  return (
    <div className="relative mb-6 flex items-center justify-between gap-6 overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary p-6 text-on-primary">
      <div className="relative z-10">
        <h4 className="text-headline-sm">You&apos;ve hit {Math.round(coverage * 100)}% coverage 🎉</h4>
        <p className="mt-1 max-w-md text-body-sm text-on-primary-container">
          You can keep labeling recurring merchants below, or jump straight to the review table and export
          this batch now.
        </p>
      </div>
      <button
        type="button"
        onClick={exportCsv}
        className="relative z-10 shrink-0 rounded-lg bg-white px-5 py-2.5 text-body-sm font-bold text-primary"
      >
        Download CSV
      </button>
      <Sparkles size={140} className="absolute -right-4 -top-4 opacity-20" />
    </div>
  )
}
