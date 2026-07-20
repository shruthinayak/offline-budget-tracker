import seedMerchantCategories from '../../data/seedMerchantCategories.json'
import type { Category, CategoryKind, CategoryRule, MatchType } from '../../types/models'

/** Bump whenever seedMerchantCategories.json or BUILT_IN_CATEGORIES changes
 *  structurally — this triggers a one-time reseed in browsers that already
 *  seeded an older version, so edits to the shipped data actually take
 *  effect instead of being silently masked by whatever was cached on first run. */
export const SEED_VERSION = 2

/** Derived from the seed data itself (plus a guaranteed catch-all) rather
 *  than hand-maintained, so editing seedMerchantCategories.json can't drift
 *  out of sync with which categories the app actually registers. */
export const BUILT_IN_CATEGORIES = Array.from(
  new Set(['Misc', ...seedMerchantCategories.map((entry) => entry.category)]),
).sort()

/** Default report bucket for a category by name — used both to seed the
 *  built-in categories and as a fallback for any stored category that
 *  predates the `kind` field. Everything not explicitly income/transfer/
 *  investment defaults to 'expense', the common case. */
export function inferCategoryKind(name: string): CategoryKind {
  if (name === 'Income') return 'income'
  if (name === 'Transfers') return 'transfer'
  if (name === 'Investments') return 'investment'
  return 'expense'
}

export function buildSeedCategories(): Category[] {
  const now = Date.now()
  return BUILT_IN_CATEGORIES.map((name) => ({
    name,
    color: null,
    isBuiltIn: true,
    createdAt: now,
    kind: inferCategoryKind(name),
  }))
}

export function buildSeedCategoryRules(): CategoryRule[] {
  const now = Date.now()
  return seedMerchantCategories.map((entry, index) => ({
    id: `seed-${index}`,
    pattern: entry.pattern,
    matchType: entry.matchType as MatchType,
    category: entry.category,
    source: 'seed-heuristic' as const,
    confidence: 0.5,
    createdAt: now,
    lastAppliedAt: 0,
    timesApplied: 0,
  }))
}
