import type { CategoryRule, Transaction } from '../../types/models'

/**
 * Exact match wins first. Otherwise, contains/startsWith rules are tried
 * most-specific (longest pattern) first, so a sub-brand rule like
 * "uber eats" -> Takeout wins over the more generic "uber" -> Transport.
 * This is a general precedence rule, not a one-off special case.
 */
export function findMatchingRule(normalizedName: string, rules: CategoryRule[]): CategoryRule | null {
  const exact = rules.find((r) => r.matchType === 'exact' && r.pattern === normalizedName)
  if (exact) return exact

  const candidates = rules
    .filter((r) => r.matchType !== 'exact')
    .filter((r) =>
      r.matchType === 'contains'
        ? normalizedName.includes(r.pattern)
        : normalizedName.startsWith(r.pattern),
    )
    .sort((a, b) => b.pattern.length - a.pattern.length)

  return candidates[0] ?? null
}

export function categorizeTransaction(
  txn: Transaction,
  rules: CategoryRule[],
  onRuleApplied?: (rule: CategoryRule) => void,
): Transaction {
  if (txn.category) return txn
  const rule = findMatchingRule(txn.normalizedName, rules)
  if (!rule) return txn
  onRuleApplied?.(rule)
  return {
    ...txn,
    category: rule.category,
    categorySource: rule.source === 'seed-heuristic' ? 'heuristic' : 'rule',
  }
}

export function categorizeAll(
  transactions: Transaction[],
  rules: CategoryRule[],
  onRuleApplied?: (rule: CategoryRule) => void,
): Transaction[] {
  return transactions.map((t) => categorizeTransaction(t, rules, onRuleApplied))
}
