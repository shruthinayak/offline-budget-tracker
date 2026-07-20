import { useMemo, useState } from 'react'
import { useDatasetTransactions } from '../../store/selectors'
import type { DatasetType } from '../../types/models'

interface CategoryPieChartProps {
  datasetType: DatasetType
}

// Validated categorical palette (dataviz skill reference set) — fixed hue
// order is the CVD-safety mechanism, never reassigned by sort rank at render
// time. Slot 7 (last) doubles as the "Other" bucket color for categories
// beyond the chart's 8-slot budget, per "a 9th series folds into Other."
const CATEGORICAL_COLORS = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange / Other
]
const MAX_SLOTS = CATEGORICAL_COLORS.length

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

interface CategorySlice {
  category: string
  total: number
  color: string
  isOtherGroup: boolean
}

const SIZE = 200
const STROKE = 34
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP_DEGREES = 2.5

export function CategoryPieChart({ datasetType }: CategoryPieChartProps) {
  const transactions = useDatasetTransactions(datasetType)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  // Color/rank assignment is computed from the FULL (unfiltered) set so that
  // toggling a category on/off never repaints the survivors with a
  // different hue — color follows the entity, not its current rank.
  const slices = useMemo<CategorySlice[]>(() => {
    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (!t.category) continue
      totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount))
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
    const needsOtherGroup = sorted.length > MAX_SLOTS

    return sorted.map(([category, total], index) => {
      const isOtherGroup = needsOtherGroup && index >= MAX_SLOTS - 1
      const color = isOtherGroup ? CATEGORICAL_COLORS[MAX_SLOTS - 1] : CATEGORICAL_COLORS[index]
      return { category, total, color, isOtherGroup }
    })
  }, [transactions])

  const visible = slices.filter((s) => !excluded.has(s.category))
  const visibleIndividual = visible.filter((s) => !s.isOtherGroup)
  const otherTotal = visible.filter((s) => s.isOtherGroup).reduce((sum, s) => sum + s.total, 0)

  const segments = [
    ...visibleIndividual.map((s) => ({ label: s.category, total: s.total, color: s.color })),
    ...(otherTotal > 0 ? [{ label: 'Other', total: otherTotal, color: CATEGORICAL_COLORS[MAX_SLOTS - 1] }] : []),
  ]
  const grandTotal = segments.reduce((sum, s) => sum + s.total, 0)

  function toggle(category: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  if (slices.length === 0) return null

  let cumulative = 0

  return (
    <section className="mb-6 rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <h2 className="mb-4 text-headline-sm text-on-surface">Spending by category</h2>
      <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
        <div className="relative shrink-0">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--color-surface-container-high)"
              strokeWidth={STROKE}
            />
            {grandTotal > 0 &&
              segments.map((seg) => {
                const fraction = seg.total / grandTotal
                const gapLength = (GAP_DEGREES / 360) * CIRCUMFERENCE
                const segmentLength = Math.max(fraction * CIRCUMFERENCE - gapLength, 0)
                const dashOffset = -cumulative
                cumulative += fraction * CIRCUMFERENCE
                return (
                  <circle
                    key={seg.label}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${segmentLength} ${CIRCUMFERENCE - segmentLength}`}
                    strokeDashoffset={dashOffset}
                  />
                )
              })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-headline-md text-on-surface">{currencyFormatter.format(grandTotal / 100)}</span>
            <span className="text-label-md text-on-surface-variant">
              {segments.length} categor{segments.length === 1 ? 'y' : 'ies'} shown
            </span>
          </div>
        </div>

        <ul className="grid w-full grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {slices.map((s) => (
            <li key={s.category} className="flex items-center gap-2">
              <label className="flex flex-1 cursor-pointer items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={!excluded.has(s.category)}
                  onChange={() => toggle(s.category)}
                  className="shrink-0"
                />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="flex-1 truncate text-on-surface">
                  {s.category}
                  {s.isOtherGroup && <span className="text-on-surface-variant"> · in Other</span>}
                </span>
                <span className="shrink-0 font-medium text-on-surface">
                  {currencyFormatter.format(s.total / 100)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
