import { useMemo } from 'react'
import { computeTopUncategorizedClusters } from '../lib/categorization/clustering'
import { computeCoverage } from '../lib/categorization/coverage'
import { useBudgetStore } from './useBudgetStore'

export function useCoverage(): number {
  return useBudgetStore((state) => computeCoverage(state.transactions))
}

/** `transactions` is a stable reference from the store (it only changes
 *  identity when actually mutated), so memoizing on it here keeps the
 *  derived array reference stable across re-renders — required by
 *  useSyncExternalStore-backed selectors, which would otherwise treat a
 *  freshly-computed array as a changed snapshot on every read. */
export function useTopUncategorizedClusters(limit = 10) {
  const transactions = useBudgetStore((state) => state.transactions)
  return useMemo(() => computeTopUncategorizedClusters(transactions, limit), [transactions, limit])
}

export function useRemainingUncategorizedCount(): number {
  return useBudgetStore((state) => state.transactions.filter((t) => !t.category).length)
}

export function useTotalDatapoints(): number {
  return useBudgetStore((state) => state.transactions.length)
}
