import { describe, expect, it } from 'vitest'
import { mergeIntoLedger, transactionDedupKey } from './consolidation'
import type { Transaction } from '../../types/models'

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: '2026-05-01',
    rawDescription: 'NETFLIX.COM',
    normalizedName: 'netflix com',
    amount: -1549,
    category: 'Entertainment',
    categorySource: 'heuristic',
    bank: 'Chase',
    person: 'Mira',
    sourceFileId: 'file-1',
    sourceFileName: 'test.csv',
    createdAt: 0,
    datasetType: 'categorize',
    ...overrides,
  }
}

describe('mergeIntoLedger', () => {
  it('appends all rows into an empty ledger', () => {
    const incoming = [makeTransaction({ id: '1' }), makeTransaction({ id: '2', normalizedName: 'uber' })]
    const result = mergeIntoLedger([], incoming)

    expect(result.addedCount).toBe(2)
    expect(result.skippedCount).toBe(0)
    expect(result.merged).toHaveLength(2)
  })

  it('skips rows that already exist in the ledger by dedup key, even with a different id', () => {
    const existing = makeTransaction({ id: 'old-id' })
    // Re-uploading the same statement produces a fresh random id for "the same" row.
    const reuploaded = makeTransaction({ id: 'new-id' })
    expect(transactionDedupKey(existing)).toBe(transactionDedupKey(reuploaded))

    const result = mergeIntoLedger([existing], [reuploaded])

    expect(result.addedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.merged).toHaveLength(1)
  })

  it('adds only the genuinely new rows out of a mixed batch', () => {
    const existing = makeTransaction({ id: 'old-id' })
    const duplicate = makeTransaction({ id: 'dup-id' })
    const genuinelyNew = makeTransaction({ id: 'new-id', normalizedName: 'whole foods', date: '2026-05-02' })

    const result = mergeIntoLedger([existing], [duplicate, genuinelyNew])

    expect(result.addedCount).toBe(1)
    expect(result.skippedCount).toBe(1)
    expect(result.added[0].id).toBe('new-id')
    expect(result.merged).toHaveLength(2)
  })

  it('treats a different amount, date, bank, or person as a distinct transaction', () => {
    const base = makeTransaction({ id: '1' })
    const differentAmount = makeTransaction({ id: '2', amount: -999 })
    const differentBank = makeTransaction({ id: '3', bank: 'CIBC' })

    const result = mergeIntoLedger([base], [differentAmount, differentBank])

    expect(result.addedCount).toBe(2)
  })
})
