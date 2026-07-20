import { CheckCircle2, X } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'
import type { CanonicalColumn } from '../../lib/csv/columnMapping'
import type { DatasetType } from '../../types/models'

const FIELD_LABELS: { field: CanonicalColumn; label: string }[] = [
  { field: 'date', label: 'Date' },
  { field: 'rawDescription', label: 'Description' },
  { field: 'amount', label: 'Amount' },
  { field: 'debit', label: 'Debit' },
  { field: 'credit', label: 'Credit' },
]

const NONE = ''

interface ImportReviewCardProps {
  datasetType: DatasetType
}

/** Non-blocking: the file is already imported using auto-guessed columns by
 *  the time this renders. Every edit here immediately re-applies against
 *  the same source file rather than gating the import on confirmation.
 *  `lastImport` is global (whichever file was most recently dropped in
 *  either tab), so this only renders when it belongs to the current tab —
 *  otherwise switching tabs without dismissing would leak the other tab's
 *  review card. */
export function ImportReviewCard({ datasetType }: ImportReviewCardProps) {
  const lastImport = useBudgetStore((state) => state.lastImport)
  const uploadQueueLength = useBudgetStore((state) => state.uploadQueue.length)
  const updateLastImportMapping = useBudgetStore((state) => state.updateLastImportMapping)
  const updateLastImportTags = useBudgetStore((state) => state.updateLastImportTags)
  const dismissLastImport = useBudgetStore((state) => state.dismissLastImport)

  if (!lastImport || lastImport.datasetType !== datasetType) return null

  return (
    <div className="mb-6 rounded-xl border border-secondary/30 bg-surface-container-lowest p-5 custom-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-secondary" />
          <div>
            <p className="text-body-md font-medium text-on-surface">
              Imported {lastImport.rows.length} rows from {lastImport.fileName}
            </p>
            <p className="text-body-sm text-on-surface-variant">
              Columns were auto-detected — check below and adjust if anything looks off.
              {uploadQueueLength > 0 &&
                ` (${uploadQueueLength} more file${uploadQueueLength === 1 ? '' : 's'} importing…)`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissLastImport}
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
              value={lastImport.mapping[field] ?? NONE}
              onChange={(event) =>
                void updateLastImportMapping({
                  ...lastImport.mapping,
                  [field]: event.target.value || undefined,
                })
              }
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
            >
              <option value={NONE}>— none —</option>
              {lastImport.headers.map((header, i) => (
                <option key={header} value={header}>
                  {lastImport.headerLabels[i] ?? header}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="block">
          <span className="text-label-md text-on-surface-variant">Bank</span>
          <input
            type="text"
            value={lastImport.bank}
            onChange={(event) => void updateLastImportTags(event.target.value, lastImport.person)}
            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Person</span>
          <input
            type="text"
            value={lastImport.person}
            onChange={(event) => void updateLastImportTags(lastImport.bank, event.target.value)}
            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm focus:border-primary focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}
