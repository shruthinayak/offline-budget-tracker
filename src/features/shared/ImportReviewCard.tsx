import { CheckCircle2, X } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'
import type { ImportedFileReview } from '../../store/useBudgetStore'
import type { CanonicalColumn } from '../../lib/csv/columnMapping'

const FIELD_LABELS: { field: CanonicalColumn; label: string }[] = [
  { field: 'date', label: 'Date' },
  { field: 'rawDescription', label: 'Description' },
  { field: 'amount', label: 'Amount' },
  { field: 'debit', label: 'Debit' },
  { field: 'credit', label: 'Credit' },
]

const NONE = ''

/** Non-blocking: every queued file is already imported using auto-guessed
 *  columns by the time its card renders. Every edit here immediately
 *  re-applies against that same source file rather than gating the import
 *  on confirmation. `recentImports` holds one entry per file, so uploading
 *  a batch shows one editable card per file — not just the last one. */
export function ImportReviewCard() {
  const recentImports = useBudgetStore((state) => state.recentImports)
  const uploadQueueLength = useBudgetStore((state) => state.uploadQueue.length)

  if (recentImports.length === 0) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      {recentImports.map((review) => (
        <SingleImportReviewCard key={review.sourceFileId} review={review} />
      ))}
      {uploadQueueLength > 0 && (
        <p className="text-body-sm text-on-surface-variant">
          {uploadQueueLength} more file{uploadQueueLength === 1 ? '' : 's'} importing…
        </p>
      )}
    </div>
  )
}

function SingleImportReviewCard({ review }: { review: ImportedFileReview }) {
  const updateImportMapping = useBudgetStore((state) => state.updateImportMapping)
  const updateImportTags = useBudgetStore((state) => state.updateImportTags)
  const dismissImport = useBudgetStore((state) => state.dismissImport)

  return (
    <div className="rounded-xl border border-secondary/30 bg-surface-container-lowest p-5 custom-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-secondary" />
          <div>
            <p className="text-body-md font-medium text-on-surface">
              Imported {review.rows.length} transactions from {review.fileName}
            </p>
            <p className="text-body-sm text-on-surface-variant">
              We matched up the columns automatically — check below and fix anything that looks off.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismissImport(review.sourceFileId)}
          className="shrink-0 rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {FIELD_LABELS.map(({ field, label }) => (
          <label key={field} className="block">
            <span className="text-label-md text-on-surface-variant">{label}</span>
            <select
              value={review.mapping[field] ?? NONE}
              onChange={(event) =>
                void updateImportMapping(review.sourceFileId, {
                  ...review.mapping,
                  [field]: event.target.value || undefined,
                })
              }
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
            >
              <option value={NONE}>— none —</option>
              {review.headers.map((header, i) => (
                <option key={header} value={header}>
                  {review.headerLabels[i] ?? header}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="block">
          <span className="text-label-md text-on-surface-variant">Bank</span>
          <input
            type="text"
            value={review.bank}
            onChange={(event) => void updateImportTags(review.sourceFileId, event.target.value, review.person)}
            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Person</span>
          <input
            type="text"
            value={review.person}
            onChange={(event) => void updateImportTags(review.sourceFileId, review.bank, event.target.value)}
            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}
