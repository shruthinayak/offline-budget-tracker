import { describe, expect, it } from 'vitest'
import { exportPersonalizedRules, parsePersonalizedRules } from './personalizedRules'
import type { CategoryRule } from '../../types/models'

function makeRule(overrides: Partial<CategoryRule>): CategoryRule {
  return {
    id: crypto.randomUUID(),
    pattern: 'starbucks',
    matchType: 'contains',
    category: 'Takeout',
    source: 'user-labeled',
    confidence: 1,
    createdAt: 0,
    lastAppliedAt: 0,
    timesApplied: 0,
    ...overrides,
  }
}

describe('exportPersonalizedRules', () => {
  it('includes only user-labeled rules, dropping seed-heuristic ones', () => {
    const rules = [makeRule({ source: 'user-labeled' }), makeRule({ source: 'seed-heuristic', pattern: 'costco' })]
    expect(exportPersonalizedRules(rules)).toEqual([{ pattern: 'starbucks', matchType: 'contains', category: 'Takeout' }])
  })

  it('strips internal metadata like confidence and timesApplied', () => {
    const rules = [makeRule({ confidence: 0.5, timesApplied: 42 })]
    const [entry] = exportPersonalizedRules(rules)
    expect(entry).toEqual({ pattern: 'starbucks', matchType: 'contains', category: 'Takeout' })
  })
})

describe('parsePersonalizedRules', () => {
  it('parses a valid rules file', () => {
    const json = JSON.stringify([{ pattern: 'uber eats', matchType: 'contains', category: 'Takeout' }])
    expect(parsePersonalizedRules(json)).toEqual([{ pattern: 'uber eats', matchType: 'contains', category: 'Takeout' }])
  })

  it('returns null for non-array JSON', () => {
    expect(parsePersonalizedRules(JSON.stringify({ pattern: 'x', matchType: 'exact', category: 'Y' }))).toBeNull()
  })

  it('returns null for unparseable JSON', () => {
    expect(parsePersonalizedRules('not json')).toBeNull()
  })

  it('drops malformed entries instead of failing the whole import', () => {
    const json = JSON.stringify([
      { pattern: 'uber eats', matchType: 'contains', category: 'Takeout' },
      { pattern: 'missing category', matchType: 'contains' },
      { pattern: 'bad match type', matchType: 'fuzzy', category: 'Misc' },
      'not even an object',
    ])
    expect(parsePersonalizedRules(json)).toEqual([{ pattern: 'uber eats', matchType: 'contains', category: 'Takeout' }])
  })
})
