import type { CategoryRule, MatchType } from '../../types/models'

export interface PersonalizedRuleEntry {
  pattern: string
  matchType: MatchType
  category: string
}

const VALID_MATCH_TYPES: MatchType[] = ['exact', 'contains', 'startsWith']

function isPersonalizedRuleEntry(value: unknown): value is PersonalizedRuleEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.pattern === 'string' &&
    entry.pattern.length > 0 &&
    typeof entry.category === 'string' &&
    entry.category.length > 0 &&
    typeof entry.matchType === 'string' &&
    VALID_MATCH_TYPES.includes(entry.matchType as MatchType)
  )
}

/** Same shape as `seedMerchantCategories.json` — a personalized rules file is
 *  meant to be a portable, inspectable counterpart to it, not a raw dump of
 *  internal rule metadata (confidence/timesApplied/etc. are usage stats, not
 *  portable "teaching" data, and get regenerated fresh on import). */
export function exportPersonalizedRules(categoryRules: CategoryRule[]): PersonalizedRuleEntry[] {
  return categoryRules
    .filter((r) => r.source === 'user-labeled')
    .map((r) => ({ pattern: r.pattern, matchType: r.matchType, category: r.category }))
}

/** Parses+validates an imported rules file, silently dropping any malformed
 *  entries rather than failing the whole import — a hand-edited file with
 *  one typo shouldn't lose every other rule in it. Returns `null` only if
 *  the top-level shape isn't a JSON array at all. */
export function parsePersonalizedRules(json: string): PersonalizedRuleEntry[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter(isPersonalizedRuleEntry)
}
