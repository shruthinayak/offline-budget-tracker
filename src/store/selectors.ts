import { useMemo } from 'react'
import { computeTopUncategorizedClusters } from '../lib/categorization/clustering'
import { computeCoverage } from '../lib/categorization/coverage'
import { useBudgetStore } from './useBudgetStore'
import type { DatasetType } from '../types/models'

export function useCoverage(datasetType: DatasetType): number {
  return useBudgetStore((state) =>
    computeCoverage(state.transactions.filter((t) => t.datasetType === datasetType)),
  )
}

/** `transactions` is a stable reference from the store (it only changes
 *  identity when actually mutated), so memoizing on it here keeps the
 *  derived array reference stable across re-renders — required by
 *  useSyncExternalStore-backed selectors, which would otherwise treat a
 *  freshly-computed array as a changed snapshot on every read. */
export function useTopUncategorizedClusters(datasetType: DatasetType, limit = 10) {
  const transactions = useBudgetStore((state) => state.transactions)
  return useMemo(() => {
    const scoped = transactions.filter((t) => t.datasetType === datasetType)
    return computeTopUncategorizedClusters(scoped, limit)
  }, [transactions, datasetType, limit])
}

export function useRemainingUncategorizedCount(datasetType: DatasetType): number {
  return useBudgetStore(
    (state) => state.transactions.filter((t) => t.datasetType === datasetType && !t.category).length,
  )
}

export function useTotalDatapoints(datasetType: DatasetType): number {
  return useBudgetStore((state) => state.transactions.filter((t) => t.datasetType === datasetType).length)
}

export function useDatasetTransactions(datasetType: DatasetType) {
  const transactions = useBudgetStore((state) => state.transactions)
  return useMemo(() => transactions.filter((t) => t.datasetType === datasetType), [transactions, datasetType])
}
