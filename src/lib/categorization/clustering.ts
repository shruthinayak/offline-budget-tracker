import type { Transaction, UncategorizedCluster } from '../../types/models'

/** Groups uncategorized rows by normalized merchant name, ranks by frequency
 *  (tie-broken by most-recent date), and returns the top N clusters. */
export function computeTopUncategorizedClusters(
  transactions: Transaction[],
  limit = 10,
): UncategorizedCluster[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.category) continue
    const existing = groups.get(t.normalizedName)
    if (existing) existing.push(t)
    else groups.set(t.normalizedName, [t])
  }

  const clusters: UncategorizedCluster[] = Array.from(groups.entries()).map(([normalizedName, rows]) => {
    const sampleRows = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
    return {
      normalizedName,
      count: rows.length,
      totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
      sampleRows,
    }
  })

  clusters.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.sampleRows[0].date.localeCompare(a.sampleRows[0].date)
  })

  return clusters.slice(0, limit)
}
