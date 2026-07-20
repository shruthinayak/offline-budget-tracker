import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { CategoryDropdown } from '../../components/CategoryDropdown'
import { useBudgetStore } from '../../store/useBudgetStore'

const PAGE_SIZE = 10
const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

export function ReviewTable() {
  const transactions = useBudgetStore((state) => state.transactions)
  const categories = useBudgetStore((state) => state.categories)
  const filters = useBudgetStore((state) => state.reviewTableFilters)
  const setReviewTableFilters = useBudgetStore((state) => state.setReviewTableFilters)
  const editTransactionCategory = useBudgetStore((state) => state.editTransactionCategory)
  const [page, setPage] = useState(0)

  const banks = useMemo(() => Array.from(new Set(transactions.map((t) => t.bank))).sort(), [transactions])
  const persons = useMemo(() => Array.from(new Set(transactions.map((t) => t.person))).sort(), [transactions])

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    return transactions
      .filter((t) => (search ? t.rawDescription.toLowerCase().includes(search) : true))
      .filter((t) => (filters.category ? t.category === filters.category : true))
      .filter((t) => (filters.bank ? t.bank === filters.bank : true))
      .filter((t) => (filters.person ? t.person === filters.person : true))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, filters])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE)

  if (transactions.length === 0) return null

  return (
    <section className="rounded-xl bg-surface-container-lowest custom-shadow overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-outline-variant p-5 md:flex-row md:items-center md:justify-between">
        <h2 className="text-headline-sm text-on-surface">All transactions</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5">
            <Search size={16} className="text-outline" />
            <input
              type="text"
              placeholder="Search description…"
              value={filters.search}
              onChange={(event) => {
                setReviewTableFilters({ search: event.target.value })
                setPage(0)
              }}
              className="w-40 bg-transparent text-body-sm focus:outline-none"
            />
          </div>
          <select
            value={filters.category ?? ''}
            onChange={(event) => {
              setReviewTableFilters({ category: event.target.value || null })
              setPage(0)
            }}
            className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm focus:outline-none"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filters.bank ?? ''}
            onChange={(event) => {
              setReviewTableFilters({ bank: event.target.value || null })
              setPage(0)
            }}
            className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm focus:outline-none"
          >
            <option value="">All banks</option>
            {banks.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
          <select
            value={filters.person ?? ''}
            onChange={(event) => {
              setReviewTableFilters({ person: event.target.value || null })
              setPage(0)
            }}
            className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm focus:outline-none"
          >
            <option value="">All people</option>
            {persons.map((person) => (
              <option key={person} value={person}>
                {person}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low/50 text-label-md uppercase tracking-widest text-on-surface-variant">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-5 py-3 font-semibold">Description</th>
              <th className="px-5 py-3 font-semibold">Category</th>
              <th className="px-5 py-3 font-semibold">Bank</th>
              <th className="px-5 py-3 font-semibold">Person</th>
              <th className="px-5 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {pageRows.map((t) => (
              <tr key={t.id} className="hover:bg-surface-container-low">
                <td className="px-5 py-3 text-body-sm">{t.date}</td>
                <td className="px-5 py-3">
                  <p className="text-body-sm font-medium text-on-surface">{t.rawDescription}</p>
                  <p className="text-label-md text-on-surface-variant">{t.normalizedName}</p>
                </td>
                <td className="px-5 py-3">
                  <CategoryDropdown
                    value={t.category}
                    categories={categories}
                    onChange={(category) => void editTransactionCategory(t.id, category)}
                  />
                </td>
                <td className="px-5 py-3 text-body-sm text-on-surface-variant">{t.bank}</td>
                <td className="px-5 py-3 text-body-sm text-on-surface-variant">{t.person}</td>
                <td
                  className={`px-5 py-3 text-right text-body-sm font-medium ${t.amount < 0 ? 'text-error' : 'text-secondary'}`}
                >
                  {t.amount < 0 ? '-' : '+'}
                  {currencyFormatter.format(Math.abs(t.amount) / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between bg-surface-container-low p-4">
        <span className="text-body-sm text-on-surface-variant">
          Showing {filtered.length === 0 ? 0 : clampedPage * PAGE_SIZE + 1}-
          {Math.min(filtered.length, clampedPage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={clampedPage === 0}
            onClick={() => setPage(clampedPage - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="flex h-9 items-center px-2 text-body-sm text-on-surface-variant">
            {clampedPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={clampedPage >= pageCount - 1}
            onClick={() => setPage(clampedPage + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </section>
  )
}
