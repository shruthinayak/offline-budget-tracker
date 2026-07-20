import { useMemo, useRef, useState } from 'react'
import { useBudgetStore } from '../../store/useBudgetStore'

// Validated categorical palette (dataviz skill reference set) — fixed hue
// order is the CVD-safety mechanism. The last slot doubles as the shared
// "Other" bucket color for categories beyond the chart's individual-slice
// budget; it's only handed out to an individual category when no Other
// bucket is needed at all (see `palette` below).
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
const OTHER_COLOR = CATEGORICAL_COLORS[MAX_SLOTS - 1]

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

export function CategoryPieChart() {
  const transactions = useBudgetStore((state) => state.transactions)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  // Persists color assignments per category identity across renders so that
  // promoting a category out of "Other" (or demoting one back in) never
  // repaints a category that's already individually shown — colors are only
  // reused/reassigned for categories that just entered or left the
  // individually-shown set.
  const colorMapRef = useRef<Map<string, string>>(new Map())

  // Net (signed) per category, not sum-of-abs — a refund nets against its
  // category's purchases rather than inflating the total as separate spend.
  const { allCategoryTotals, reviewOnlyTotals } = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (!t.category) continue
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount)
    }
    const allCategoryTotals: [string, number][] = []
    const reviewOnlyTotals: [string, number][] = []
    for (const [category, net] of totals) {
      // net < 0 means real spend (debits outweigh credits) — eligible for the
      // pie. net >= 0 (refunds/credits outweigh or equal spend) isn't spending,
      // so it's surfaced for review only, never charted.
      if (net < 0) allCategoryTotals.push([category, -net])
      else reviewOnlyTotals.push([category, net])
    }
    allCategoryTotals.sort((a, b) => b[1] - a[1])
    reviewOnlyTotals.sort((a, b) => b[1] - a[1])
    return { allCategoryTotals, reviewOnlyTotals }
  }, [transactions])

  const { slices, segments } = useMemo(() => {
    const visible = allCategoryTotals.filter(([category]) => !excluded.has(category))
    // If everything visible fits in the chart's slot budget, no Other bucket
    // is needed at all and every visible category gets its own slice —
    // otherwise the top (MAX_SLOTS - 1) visible categories go individual and
    // the rest are merged into a single "Other" arc.
    const individualCount = visible.length <= MAX_SLOTS ? visible.length : MAX_SLOTS - 1
    const individualVisible = visible.slice(0, individualCount)
    const otherVisible = visible.slice(individualCount)
    const individualVisibleSet = new Set(individualVisible.map(([category]) => category))
    const needsOtherBucket = otherVisible.length > 0
    const palette = needsOtherBucket ? CATEGORICAL_COLORS.slice(0, MAX_SLOTS - 1) : CATEGORICAL_COLORS

    // Reconcile color assignments: keep every still-individual category's
    // existing color first, then hand out free colors (in rank order) to
    // categories newly promoted into the individual set.
    const prevMap = colorMapRef.current
    const nextMap = new Map<string, string>()
    const usedColors = new Set<string>()
    for (const [category] of individualVisible) {
      const prevColor = prevMap.get(category)
      if (prevColor && palette.includes(prevColor) && !usedColors.has(prevColor)) {
        nextMap.set(category, prevColor)
        usedColors.add(prevColor)
      }
    }
    for (const [category] of individualVisible) {
      if (nextMap.has(category)) continue
      const color = palette.find((c) => !usedColors.has(c))
      if (!color) continue
      nextMap.set(category, color)
      usedColors.add(color)
    }
    colorMapRef.current = nextMap

    const slices: CategorySlice[] = allCategoryTotals.map(([category, total]) => {
      const isIndividual = individualVisibleSet.has(category)
      const isVisible = !excluded.has(category)
      return {
        category,
        total,
        color: isIndividual ? (nextMap.get(category) ?? OTHER_COLOR) : OTHER_COLOR,
        isOtherGroup: isVisible && !isIndividual,
      }
    })

    const otherTotal = otherVisible.reduce((sum, [, total]) => sum + total, 0)
    const segments = [
      ...individualVisible.map(([category, total]) => ({ label: category, total, color: nextMap.get(category)! })),
      ...(otherTotal > 0 ? [{ label: 'Other', total: otherTotal, color: OTHER_COLOR }] : []),
    ]

    return { slices, segments }
  }, [allCategoryTotals, excluded])

  const grandTotal = segments.reduce((sum, s) => sum + s.total, 0)

  function toggle(category: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  if (slices.length === 0 && reviewOnlyTotals.length === 0) return null

  let cumulative = 0

  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <h2 className="mb-4 text-headline-sm text-on-surface">Spending by category</h2>
      <div className="flex flex-col items-center gap-6">
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

        <ul className="flex w-full flex-col gap-2">
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
          {reviewOnlyTotals.map(([category, net]) => (
            <li key={category} className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-body-sm text-on-surface">
                {category}
                <span className="text-on-surface-variant"> · not counted in chart</span>
              </span>
              <span className="shrink-0 text-body-sm font-medium text-on-surface-variant">
                {net > 0 ? `+${currencyFormatter.format(net / 100)}` : currencyFormatter.format(net / 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
