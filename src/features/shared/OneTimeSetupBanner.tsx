import { useState } from 'react'
import { Info, X } from 'lucide-react'

export function OneTimeSetupBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary-container/40 bg-surface-container-low px-5 py-4">
      <Info size={20} className="mt-0.5 shrink-0 text-primary" />
      <div className="flex-1 text-body-sm text-on-surface-variant">
        <p className="text-on-surface font-medium">Getting started</p>
        <p>
          Upload a statement CSV to see it auto-categorized using common merchants we already know.
          Correct anything that's wrong or missing — every correction is remembered, so next month's
          statements come in more accurately categorized automatically.
        </p>
        <p className="mt-1">
          Tip: name files <code className="rounded bg-surface-container-high px-1.5 py-0.5">name_bank_month.csv</code> (e.g.{' '}
          <code className="rounded bg-surface-container-high px-1.5 py-0.5">shruthi_chase_may.csv</code>) and we&apos;ll
          auto-fill the person/bank tags for you — it&apos;s just a convenience, any filename works.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}
