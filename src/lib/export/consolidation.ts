import type { Transaction } from '../../types/models'

/** Identifies "the same real-world transaction" for dedup purposes when
 *  appending to the master ledger — deliberately not the row's random `id`,
 *  since re-uploading the same statement file produces fresh ids each time. */
export function transactionDedupKey(t: Transaction): string {
  return [t.date, t.normalizedName, t.amount, t.bank, t.person].join('|')
}

export interface MergeResult {
  merged: Transaction[]
  added: Transaction[]
  addedCount: number
  skippedCount: number
}

/** Appends `incoming` transactions onto `ledger`, skipping any that are
 *  already present by dedup key (e.g. the same month's file uploaded twice). */
export function mergeIntoLedger(ledger: Transaction[], incoming: Transaction[]): MergeResult {
  const existingKeys = new Set(ledger.map(transactionDedupKey))
  const added: Transaction[] = []

  for (const t of incoming) {
    const key = transactionDedupKey(t)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    added.push(t)
  }

  return {
    merged: [...ledger, ...added],
    added,
    addedCount: added.length,
    skippedCount: incoming.length - added.length,
  }
}
