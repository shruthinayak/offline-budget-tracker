import { useTopUncategorizedClusters } from '../../store/selectors'
import { ClusterLabelCard } from './ClusterLabelCard'

export function TopUncategorizedQueue() {
  const clusters = useTopUncategorizedClusters(10)

  if (clusters.length === 0) return null

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-headline-sm text-on-surface">
        Label the most recurring uncategorized merchants
      </h2>
      <p className="mb-4 text-body-sm text-on-surface-variant">
        Labeling one of these applies to every matching transaction at once, so a few labels here cover a
        lot of rows.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {clusters.map((cluster) => (
          <ClusterLabelCard key={cluster.normalizedName} cluster={cluster} />
        ))}
      </div>
    </section>
  )
}
