import Papa from 'papaparse'
import { looksLikeHeaderRow } from './columnMapping'

export interface ParsedCsv {
  /** Keys used on each row object — real header names when present, else synthetic `column_N`. */
  headers: string[]
  /** Human-friendly labels for the mapping UI, same order as `headers`. */
  headerLabels: string[]
  rows: Record<string, string>[]
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      worker: true,
      complete: (results) => resolve(buildParsedCsv(results.data)),
      error: (error: Error) => reject(error),
    })
  })
}

function buildParsedCsv(allRows: string[][]): ParsedCsv {
  if (allRows.length === 0) return { headers: [], headerLabels: [], rows: [] }

  const firstRow = allRows[0]
  const hasHeaderRow = looksLikeHeaderRow(firstRow)
  const dataRows = hasHeaderRow ? allRows.slice(1) : allRows
  const columnCount = Math.max(firstRow.length, ...dataRows.map((row) => row.length))

  const headers = Array.from({ length: columnCount }, (_, i) =>
    hasHeaderRow ? (firstRow[i]?.trim() || `column_${i}`) : `column_${i}`,
  )

  const headerLabels = Array.from({ length: columnCount }, (_, i) => {
    if (hasHeaderRow) return firstRow[i]?.trim() || `Column ${i + 1}`
    const sample = dataRows[0]?.[i]
    return sample ? `Column ${i + 1} (e.g. "${sample}")` : `Column ${i + 1}`
  })

  const rows = dataRows.map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((key, i) => {
      record[key] = row[i] ?? ''
    })
    return record
  })

  return { headers, headerLabels, rows }
}
