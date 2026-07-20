import { Database, AlertTriangle } from 'lucide-react'
import { useRemainingUncategorizedCount, useTotalDatapoints } from '../../store/selectors'
import { CoverageRingCard } from './CoverageRingCard'
import type { DatasetType } from '../../types/models'

interface StatsRowProps {
  datasetType: DatasetType
}

export function StatsRow({ datasetType }: StatsRowProps) {
  const total = useTotalDatapoints(datasetType)
  const remaining = useRemainingUncategorizedCount(datasetType)

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest p-6 custom-shadow">
        <Database size={64} className="absolute -bottom-3 -right-3 text-primary/10" />
        <span className="mb-2 text-label-md uppercase tracking-wider text-on-surface-variant">
          Total Datapoints
        </span>
        <h3 className="text-headline-lg">{total.toLocaleString()}</h3>
      </div>

      <CoverageRingCard datasetType={datasetType} />

      <div className="relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest p-6 custom-shadow">
        <AlertTriangle size={64} className="absolute -bottom-3 -right-3 text-tertiary/10" />
        <span className="mb-2 text-label-md uppercase tracking-wider text-on-surface-variant">
          Requires Label
        </span>
        <div className="flex items-center gap-3">
          <h3 className="text-headline-lg">{remaining.toLocaleString()}</h3>
          {remaining > 0 && (
            <span className="rounded-full bg-error-container/40 px-2 py-0.5 text-label-md font-bold text-error">
              Action Needed
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
