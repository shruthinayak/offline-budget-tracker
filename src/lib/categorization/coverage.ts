import type { Transaction } from '../../types/models'

export const COVERAGE_GOAL = 0.9

export function computeCoverage(transactions: Transaction[]): number {
  if (transactions.length === 0) return 0
  const categorized = transactions.filter((t) => !!t.category).length
  return categorized / transactions.length
}
