import { describe, expect, it } from 'vitest'
import { categorizeAll, categorizeTransaction, findMatchingRule } from './categorizationEngine'
import { buildSeedCategoryRules } from './seedData'
import type { Transaction } from '../../types/models'

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'id',
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

describe('categorization precedence', () => {
  const rules = buildSeedCategoryRules()

  it('matches the more specific "uber eats" rule over the generic "uber" rule', () => {
    const rule = findMatchingRule('uber eats san francisco ca', rules)
    expect(rule?.category).toBe('Takeout')
  })

  it('falls back to the generic "uber" rule for plain uber trips', () => {
    const rule = findMatchingRule('uber trip help uber com', rules)
    expect(rule?.category).toBe('Transport')
  })

  it('categorizes investment platforms correctly', () => {
    expect(findMatchingRule('wealthsimple trade', rules)?.category).toBe('Investments')
    expect(findMatchingRule('questrade inc', rules)?.category).toBe('Investments')
  })

  it('leaves unmatched merchants uncategorized', () => {
    const txn = makeTransaction({ normalizedName: 'totally unknown merchant' })
    const result = categorizeTransaction(txn, rules)
    expect(result.category).toBeNull()
  })

  it('never overwrites an already-categorized transaction', () => {
    const txn = makeTransaction({ normalizedName: 'uber eats', category: 'Manual Override' })
    const result = categorizeTransaction(txn, rules)
    expect(result.category).toBe('Manual Override')
  })
})

describe('onRuleApplied usage-tracking callback', () => {
  const rules = buildSeedCategoryRules()

  it('fires once per transaction a rule was used to categorize', () => {
    const applied: string[] = []
    const transactions = [
      makeTransaction({ id: '1', normalizedName: 'uber eats san francisco' }),
      makeTransaction({ id: '2', normalizedName: 'uber trip' }),
      makeTransaction({ id: '3', normalizedName: 'uber eats toronto' }),
    ]
    categorizeAll(transactions, rules, (rule) => applied.push(rule.id))

    expect(applied).toHaveLength(3)
    // The two "uber eats" rows should have matched the same Takeout rule.
    expect(applied[0]).toBe(applied[2])
    expect(applied[1]).not.toBe(applied[0])
  })

  it('does not fire for unmatched or already-categorized transactions', () => {
    const applied: string[] = []
    const transactions = [
      makeTransaction({ id: '1', normalizedName: 'totally unknown merchant' }),
      makeTransaction({ id: '2', normalizedName: 'uber eats', category: 'Already Set' }),
    ]
    categorizeAll(transactions, rules, (rule) => applied.push(rule.id))

    expect(applied).toHaveLength(0)
  })
})
