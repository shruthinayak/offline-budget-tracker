import { describe, expect, it } from 'vitest'
import { computeIncomeExpenseBreakdown } from './incomeExpense'
import type { Category, Transaction } from '../../types/models'

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

function makeCategory(name: string, kind: Category['kind']): Category {
  return { name, color: null, isBuiltIn: true, createdAt: 0, kind }
}

const categories: Category[] = [
  makeCategory('Income', 'income'),
  makeCategory('Entertainment', 'expense'),
  makeCategory('Transfers', 'transfer'),
  makeCategory('Investments', 'investment'),
]

describe('computeIncomeExpenseBreakdown', () => {
  it('buckets a categorized transfer into transfers, not income or expenses', () => {
    const transactions = [
      makeTransaction({ category: 'Transfers', amount: -50000 }),
      makeTransaction({ category: 'Transfers', amount: 50000 }),
    ]
    const result = computeIncomeExpenseBreakdown(transactions, categories)

    expect(result.transfers).toBe(100000)
    expect(result.income).toBe(0)
    expect(result.expenses).toBe(0)
  })

  it('buckets a categorized investment into investments, not income or expenses', () => {
    const transactions = [makeTransaction({ category: 'Investments', amount: -20000 })]
    const result = computeIncomeExpenseBreakdown(transactions, categories)

    expect(result.investments).toBe(20000)
    expect(result.expenses).toBe(0)
  })

  it('buckets a category tagged income as income regardless of amount sign', () => {
    const transactions = [makeTransaction({ category: 'Income', amount: 300000 })]
    const result = computeIncomeExpenseBreakdown(transactions, categories)

    expect(result.income).toBe(300000)
  })

  it('falls back to amount sign for uncategorized transactions', () => {
    const transactions = [
      makeTransaction({ category: null, amount: 5000 }),
      makeTransaction({ category: null, amount: -3000 }),
    ]
    const result = computeIncomeExpenseBreakdown(transactions, categories)

    expect(result.income).toBe(5000)
    expect(result.expenses).toBe(3000)
  })

  it('falls back to amount sign for a category with no matching kind entry', () => {
    const transactions = [makeTransaction({ category: 'Unknown Category', amount: -1200 })]
    const result = computeIncomeExpenseBreakdown(transactions, categories)

    expect(result.expenses).toBe(1200)
  })
})
