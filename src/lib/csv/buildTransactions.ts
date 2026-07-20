import type { Transaction } from '../../types/models'
import type { ColumnMapping } from './columnMapping'
import { extractAmount } from './columnMapping'
import { normalizeMerchantName } from './normalizeMerchantName'
import { parseDateToIso } from './parseDate'

export interface BuildTransactionsInput {
  rows: Record<string, string>[]
  mapping: ColumnMapping
  bank: string
  person: string
  sourceFileId: string
  sourceFileName: string
}

/** Converts raw parsed CSV rows into normalized, uncategorized Transaction
 *  records ready to be run through the categorization engine. */
export function buildTransactions(input: BuildTransactionsInput): Transaction[] {
  const { rows, mapping, bank, person, sourceFileId, sourceFileName } = input
  const now = Date.now()

  return rows
    .map((row): Transaction | null => {
      const rawDescription = mapping.rawDescription ? row[mapping.rawDescription] ?? '' : ''
      const rawDate = mapping.date ? row[mapping.date] ?? '' : ''
      if (!rawDescription.trim() && !rawDate.trim()) return null

      return {
        id: crypto.randomUUID(),
        date: rawDate ? parseDateToIso(rawDate) : '',
        rawDescription,
        normalizedName: normalizeMerchantName(rawDescription),
        amount: Math.round(extractAmount(row, mapping) * 100),
        category: null,
        categorySource: null,
        bank,
        person,
        sourceFileId,
        sourceFileName,
        createdAt: now,
      }
    })
    .filter((t): t is Transaction => t !== null)
}
