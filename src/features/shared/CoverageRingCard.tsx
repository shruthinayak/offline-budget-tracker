import { useCoverage } from '../../store/selectors'
import { COVERAGE_GOAL } from '../../lib/categorization/coverage'

const SIZE = 72
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function CoverageRingCard() {
  const coverage = useCoverage()
  const pct = Math.round(coverage * 100)
  const offset = CIRCUMFERENCE * (1 - coverage)
  const ringColor = coverage >= COVERAGE_GOAL ? 'var(--color-secondary)' : 'var(--color-primary)'

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <span className="mb-2 text-label-md uppercase tracking-wider text-on-surface-variant">Coverage</span>
      <div className="flex items-center gap-4">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 -rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-container-high)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>
        <div>
          <p className="text-headline-lg">{pct}%</p>
          <p className="text-label-md text-on-surface-variant">Goal: {Math.round(COVERAGE_GOAL * 100)}%</p>
        </div>
      </div>
    </div>
  )
}
