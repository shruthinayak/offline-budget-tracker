import { useMemo } from 'react'
import { useBudgetStore } from '../../store/useBudgetStore'

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

// Amount sign convention (see `extractAmount` in columnMapping.ts): positive
// = credit/income, negative = debit/expense. Independent of categorization —
// counts every transaction in the batch, not just categorized ones.
export function IncomeExpenseSummary() {
  const transactions = useBudgetStore((state) => state.transactions)

  const { income, expenses } = useMemo(() => {
    let income = 0
    let expenses = 0
    for (const t of transactions) {
      if (t.amount > 0) income += t.amount
      else expenses += Math.abs(t.amount)
    }
    return { income, expenses }
  }, [transactions])

  if (transactions.length === 0) return null

  const net = income - expenses
  const maxBar = Math.max(income, expenses, 1)

  return (
    <section className="mb-6 rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <h2 className="mb-4 text-headline-sm text-on-surface">Income vs. expenses</h2>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex items-center justify-between text-body-sm">
            <span className="text-on-surface-variant">Income</span>
            <span className="font-medium text-on-surface">{currencyFormatter.format(income / 100)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-[#1baf7a]"
              style={{ width: `${(income / maxBar) * 100}%` }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-body-sm">
            <span className="text-on-surface-variant">Expenses</span>
            <span className="font-medium text-on-surface">{currencyFormatter.format(expenses / 100)}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-[#e34948]"
              style={{ width: `${(expenses / maxBar) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant pt-3 text-body-md">
          <span className="text-on-surface-variant">Net</span>
          <span className={`font-semibold ${net >= 0 ? 'text-[#1baf7a]' : 'text-[#e34948]'}`}>
            {net >= 0 ? '+' : '−'}
            {currencyFormatter.format(Math.abs(net) / 100)}
          </span>
        </div>
      </div>
    </section>
  )
}
