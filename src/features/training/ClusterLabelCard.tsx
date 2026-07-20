import { useState } from 'react'
import { CategoryDropdown } from '../../components/CategoryDropdown'
import { useBudgetStore } from '../../store/useBudgetStore'
import type { UncategorizedCluster } from '../../types/models'

interface ClusterLabelCardProps {
  cluster: UncategorizedCluster
}

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

export function ClusterLabelCard({ cluster }: ClusterLabelCardProps) {
  const categories = useBudgetStore((state) => state.categories)
  const labelCluster = useBudgetStore((state) => state.labelCluster)
  const [pendingCategory, setPendingCategory] = useState<string | null>(null)

  const displayName = cluster.sampleRows[0]?.rawDescription || cluster.normalizedName

  async function handleApply(category: string) {
    setPendingCategory(category)
    await labelCluster(cluster.normalizedName, category)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-5 custom-shadow">
      <div>
        <p className="truncate font-medium text-on-surface">{displayName}</p>
        <p className="text-label-md text-on-surface-variant">
          {cluster.count} transaction{cluster.count === 1 ? '' : 's'} ·{' '}
          {currencyFormatter.format(cluster.totalAmount / 100)}
        </p>
      </div>

      <ul className="space-y-1 text-body-sm text-on-surface-variant">
        {cluster.sampleRows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-2">
            <span>{row.date}</span>
            <span className="font-medium text-on-surface">{currencyFormatter.format(row.amount / 100)}</span>
            <span className="truncate text-label-md">{row.sourceFileName}</span>
          </li>
        ))}
      </ul>

      <CategoryDropdown value={pendingCategory} categories={categories} onChange={handleApply} className="w-full" />
    </div>
  )
}
