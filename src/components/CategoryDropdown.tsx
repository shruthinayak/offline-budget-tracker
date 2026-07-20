import { useState } from 'react'
import { useBudgetStore } from '../store/useBudgetStore'
import type { Category } from '../types/models'

interface CategoryDropdownProps {
  value: string | null
  categories: Category[]
  onChange: (category: string) => void
  className?: string
}

const OTHER_SENTINEL = '__other__'

/** Existing categories + "Other" (reveals a free-text input, promoted to a
 *  real custom category on commit) + "Misc" (just another built-in category). */
export function CategoryDropdown({ value, categories, onChange, className }: CategoryDropdownProps) {
  const addCustomCategory = useBudgetStore((state) => state.addCustomCategory)
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name))

  function handleSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    if (next === OTHER_SENTINEL) {
      setCustomMode(true)
      setCustomValue('')
      return
    }
    onChange(next)
  }

  async function commitCustom() {
    const trimmed = customValue.trim()
    if (!trimmed) {
      setCustomMode(false)
      return
    }
    await addCustomCategory(trimmed)
    onChange(trimmed)
    setCustomMode(false)
  }

  const baseClasses = `rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 text-body-sm text-on-surface focus:border-primary focus:outline-none ${className ?? ''}`

  if (customMode) {
    return (
      <input
        autoFocus
        type="text"
        placeholder="New category name…"
        value={customValue}
        onChange={(event) => setCustomValue(event.target.value)}
        onBlur={commitCustom}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitCustom()
          if (event.key === 'Escape') setCustomMode(false)
        }}
        className={baseClasses}
      />
    )
  }

  return (
    <select value={value ?? ''} onChange={handleSelectChange} className={baseClasses}>
      <option value="" disabled>
        Select category…
      </option>
      {sortedCategories.map((category) => (
        <option key={category.name} value={category.name}>
          {category.name}
        </option>
      ))}
      <option value={OTHER_SENTINEL}>Other…</option>
    </select>
  )
}
