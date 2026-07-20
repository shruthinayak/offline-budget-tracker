import type { Category, Transaction } from '../../types/models'

export interface IncomeExpenseBreakdown {
  income: number
  expenses: number
  transfers: number
  investments: number
}

/** Buckets transactions into income/expenses/transfers/investments by their
 *  category's `kind` — money moved between the user's own accounts or into
 *  investments is deliberately excluded from income/expenses. Uncategorized
 *  transactions (or ones whose category has no recognized kind) fall back to
 *  the amount's sign, matching the pre-category-kind behavior. */
export function computeIncomeExpenseBreakdown(
  transactions: Transaction[],
  categories: Category[],
): IncomeExpenseBreakdown {
  const kindByCategory = new Map(categories.map((c) => [c.name, c.kind]))
  const result: IncomeExpenseBreakdown = { income: 0, expenses: 0, transfers: 0, investments: 0 }

  for (const t of transactions) {
    const kind = t.category ? kindByCategory.get(t.category) : undefined
    const amount = Math.abs(t.amount)

    if (kind === 'transfer') result.transfers += amount
    else if (kind === 'investment') result.investments += amount
    else if (kind === 'income') result.income += amount
    else if (kind === 'expense') result.expenses += amount
    else if (t.amount > 0) result.income += amount
    else result.expenses += amount
  }

  return result
}
