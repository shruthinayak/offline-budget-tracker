import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { useBudgetStore } from '../../store/useBudgetStore'

export function CsvUploadPanel() {
  const queueFiles = useBudgetStore((state) => state.queueFiles)
  const uploadError = useBudgetStore((state) => state.uploadError)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const csvFiles = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.csv'))
    if (csvFiles.length > 0) void queueFiles(csvFiles)
  }

  return (
    <div className="mb-6">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          handleFiles(event.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragOver ? 'border-primary bg-surface-container-low' : 'border-outline-variant bg-surface-container-lowest'
        }`}
      >
        <UploadCloud size={28} className="text-primary" />
        <p className="text-body-md font-medium text-on-surface">Drop statement CSVs here, or click to browse</p>
        <p className="text-body-sm text-on-surface-variant">
          Upload one or more bank/card statement CSVs. Nothing leaves your browser.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {uploadError && <p className="mt-2 text-body-sm text-error">{uploadError}</p>}
    </div>
  )
}
