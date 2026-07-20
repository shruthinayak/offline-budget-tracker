import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'

/** Backup/restore for the categorizer's learned merchant rules — a portable
 *  counterpart to the shipped seed list, since IndexedDB already persists
 *  rules across sessions but never leaves this one browser. Feedback is
 *  local state, not the store's shared `actionMessage`/`uploadError` —
 *  those also render in ActionsBar/CsvUploadPanel, and a rules-import
 *  message showing up under "Save to All-Time History" would be confusing. */
export function RulesBackupCard() {
  const learnedCount = useBudgetStore(
    (state) => state.categoryRules.filter((r) => r.source === 'user-labeled').length,
  )
  const exportRules = useBudgetStore((state) => state.exportRules)
  const importRules = useBudgetStore((state) => state.importRules)
  const inputRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null)

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const result = await importRules(file)
    if ('error' in result) {
      setFeedback({ text: result.error, isError: true })
    } else {
      setFeedback({
        text: `Imported ${result.importedCount} learned rule${result.importedCount === 1 ? '' : 's'} from "${file.name}".`,
        isError: false,
      })
    }
  }

  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 custom-shadow">
      <h2 className="mb-1 text-headline-sm text-on-surface">Your learned rules</h2>
      <p className="mb-4 text-body-sm text-on-surface-variant">
        {learnedCount === 0
          ? "Corrections you make are remembered in this browser only — nothing to back up yet."
          : `${learnedCount} merchant${learnedCount === 1 ? '' : 's'} you've personally categorized, saved in this browser.`}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={learnedCount === 0}
          onClick={exportRules}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-medium text-on-surface hover:bg-surface-container-high disabled:opacity-40"
        >
          <Download size={16} />
          Download
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm font-medium text-on-surface hover:bg-surface-container-high"
        >
          <Upload size={16} />
          Restore
        </button>
        <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFileSelected} />
      </div>
      {feedback && (
        <p className={`mt-3 text-body-sm ${feedback.isError ? 'text-error' : 'text-secondary'}`}>{feedback.text}</p>
      )}
    </section>
  )
}
