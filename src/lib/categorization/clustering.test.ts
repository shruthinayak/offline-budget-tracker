import { describe, expect, it } from 'vitest'
import { computeTopUncategorizedClusters } from './clustering'
import type { Transaction } from '../../types/models'

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: '2026-05-01',
    rawDescription: '',
    normalizedName: '',
    amount: -1000,
    category: null,
    categorySource: null,
    bank: 'Chase',
    person: 'Mira',
    sourceFileId: 'file-1',
    sourceFileName: 'test.csv',
    createdAt: 0,
    datasetType: 'training',
    ...overrides,
  }
}

describe('computeTopUncategorizedClusters', () => {
  it('groups by normalized name and ranks by frequency', () => {
    const transactions = [
      makeTransaction({ normalizedName: 'mystery merchant', date: '2026-05-01' }),
      makeTransaction({ normalizedName: 'mystery merchant', date: '2026-05-02' }),
      makeTransaction({ normalizedName: 'mystery merchant', date: '2026-05-03' }),
      makeTransaction({ normalizedName: 'rare merchant', date: '2026-05-01' }),
      makeTransaction({ normalizedName: 'already categorized', category: 'Bills' }),
    ]

    const clusters = computeTopUncategorizedClusters(transactions)

    expect(clusters).toHaveLength(2)
    expect(clusters[0].normalizedName).toBe('mystery merchant')
    expect(clusters[0].count).toBe(3)
    expect(clusters[1].normalizedName).toBe('rare merchant')
    expect(clusters[1].count).toBe(1)
  })

  it('excludes already-categorized rows entirely', () => {
    const transactions = [makeTransaction({ normalizedName: 'netflix', category: 'Entertainment' })]
    expect(computeTopUncategorizedClusters(transactions)).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    const transactions = Array.from({ length: 15 }, (_, i) =>
      makeTransaction({ normalizedName: `merchant ${i}` }),
    )
    expect(computeTopUncategorizedClusters(transactions, 10)).toHaveLength(10)
  })
})
