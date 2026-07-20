import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'
import type { CategoryKind } from '../../types/models'

const KIND_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'investment', label: 'Investment' },
]

/** Lets the user reclassify any category's report bucket — e.g. if "Rent
 *  Payment" should count as a Transfer instead of an Expense. Collapsed by
 *  default since most users will never need to touch it. */
export function CategoryKindEditor() {
  const categories = useBudgetStore((state) => state.categories)
  const setCategoryKind = useBudgetStore((state) => state.setCategoryKind)
  const [expanded, setExpanded] = useState(false)

  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mt-4 border-t border-outline-variant pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
      >
        Customize which categories count as income, expenses, transfers, or investments
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((category) => (
            <li key={category.name} className="flex items-center justify-between gap-2 text-body-sm">
              <span className="truncate text-on-surface">{category.name}</span>
              <select
                value={category.kind}
                onChange={(event) => void setCategoryKind(category.name, event.target.value as CategoryKind)}
                className="shrink-0 rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1 text-body-sm focus:border-primary focus:outline-none"
              >
                {KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
