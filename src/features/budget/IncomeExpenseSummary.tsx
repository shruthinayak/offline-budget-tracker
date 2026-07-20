import { useMemo } from 'react'
import { useBudgetStore } from '../../store/useBudgetStore'
import { computeIncomeExpenseBreakdown } from '../../lib/categorization/incomeExpense'
import { CategoryKindEditor } from './CategoryKindEditor'

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const INCOME_COLOR = '#1baf7a'
const EXPENSE_COLOR = '#e34948'
const TRANSFER_COLOR = '#2a78d6'
const INVESTMENT_COLOR = '#4a3aa7'

function BarRow({ label, amount, maxBar, color }: { label: string; amount: number; maxBar: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-body-sm">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-medium text-on-surface">{currencyFormatter.format(amount / 100)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full rounded-full" style={{ width: `${(amount / maxBar) * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// Money moved between the user's own accounts (Transfers) or into
// investments is tracked in its own bar, not counted as income or an
// expense — see computeIncomeExpenseBreakdown.
export function IncomeExpenseSummary() {
  const transactions = useBudgetStore((state) => state.transactions)
  const categories = useBudgetStore((state) => state.categories)

  const { income, expenses, transfers, investments } = useMemo(
    () => computeIncomeExpenseBreakdown(transactions, categories),
    [transactions, categories],
  )

  if (transactions.length === 0) return null

  const net = income - expenses
  const maxBar = Math.max(income, expenses, transfers, investments, 1)

  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <h2 className="mb-4 text-headline-sm text-on-surface">Income vs. expenses</h2>
      <div className="flex flex-col gap-4">
        <BarRow label="Income" amount={income} maxBar={maxBar} color={INCOME_COLOR} />
        <BarRow label="Expenses" amount={expenses} maxBar={maxBar} color={EXPENSE_COLOR} />
        {transfers > 0 && <BarRow label="Transfers" amount={transfers} maxBar={maxBar} color={TRANSFER_COLOR} />}
        {investments > 0 && (
          <BarRow label="Investments" amount={investments} maxBar={maxBar} color={INVESTMENT_COLOR} />
        )}

        <div className="flex items-center justify-between border-t border-outline-variant pt-3 text-body-md">
          <span className="text-on-surface-variant">Net</span>
          <span className={`font-semibold ${net >= 0 ? 'text-[#1baf7a]' : 'text-[#e34948]'}`}>
            {net >= 0 ? '+' : '−'}
            {currencyFormatter.format(Math.abs(net) / 100)}
          </span>
        </div>
      </div>

      <CategoryKindEditor />
    </section>
  )
}
