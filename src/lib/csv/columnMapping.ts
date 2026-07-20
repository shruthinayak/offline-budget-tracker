export type CanonicalColumn = 'date' | 'rawDescription' | 'amount' | 'debit' | 'credit'

export type ColumnMapping = Partial<Record<CanonicalColumn, string>>

const ALIASES: Record<CanonicalColumn, string[]> = {
  date: ['date', 'transaction date', 'posted date', 'posting date', 'trans date'],
  rawDescription: ['description', 'merchant', 'payee', 'name', 'details', 'memo'],
  amount: ['amount', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'money out', 'debit amount'],
  credit: ['credit', 'deposit', 'money in', 'credit amount'],
}

const ALL_ALIAS_WORDS = Object.values(ALIASES).flat()

/** Many real bank exports (e.g. CIBC, TD) ship with no header row at all —
 *  the first line is already a transaction. Normalizing punctuation before
 *  comparing catches variants like "transaction_date" while still rejecting
 *  actual transaction text (merchant names, amounts, dates) as non-headers. */
export function looksLikeHeaderRow(cells: string[]): boolean {
  return cells.some((cell) => {
    const normalized = cell.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return ALL_ALIAS_WORDS.includes(normalized)
  })
}

/** Best-effort header -> canonical field detection. Never blocks import;
 *  the guess is auto-applied and the user can correct it afterward in the
 *  post-import review card. */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => ({ original: h, norm: h.trim().toLowerCase() }))
  const mapping: ColumnMapping = {}

  for (const canonical of Object.keys(ALIASES) as CanonicalColumn[]) {
    const match = normalizedHeaders.find((h) => ALIASES[canonical].includes(h.norm))
    if (match) mapping[canonical] = match.original
  }

  return mapping
}

const DATE_SHAPE = /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/
const AMOUNT_SHAPE = /^-?\$?\d[\d,]*(\.\d{1,2})?$/

function isLikelyDateValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || !DATE_SHAPE.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

function isLikelyAmountValue(value: string): boolean {
  return AMOUNT_SHAPE.test(value.trim())
}

interface ColumnStats {
  key: string
  dateScore: number
  amountScore: number
  avgLength: number
  fillRate: number
}

function computeColumnStats(key: string, rows: Record<string, string>[]): ColumnStats {
  const values = rows.map((r) => (r[key] ?? '').trim())
  const nonEmpty = values.filter(Boolean)
  const count = nonEmpty.length || 1
  return {
    key,
    dateScore: nonEmpty.filter(isLikelyDateValue).length / count,
    amountScore: nonEmpty.filter(isLikelyAmountValue).length / count,
    avgLength: nonEmpty.reduce((sum, v) => sum + v.length, 0) / count,
    fillRate: nonEmpty.length / (values.length || 1),
  }
}

/** For a candidate debit/credit pair, checks that each row has a value in
 *  exactly one of the two columns (never both, rarely neither) — the
 *  signature of a split debit/credit layout as opposed to two unrelated
 *  numeric columns (e.g. one of them being a running balance). */
function exclusivityScore(a: string, b: string, rows: Record<string, string>[]): number {
  if (rows.length === 0) return 0
  const exclusiveHits = rows.filter((row) => {
    const aFilled = !!(row[a] ?? '').trim()
    const bFilled = !!(row[b] ?? '').trim()
    return aFilled !== bFilled
  }).length
  return exclusiveHits / rows.length
}

/** Fills in any of date/rawDescription/amount(or debit+credit) that header-alias
 *  detection couldn't find, by inspecting a sample of actual cell values —
 *  needed for real-world headerless bank exports (CIBC, TD, ...). Never
 *  overrides fields already present in `existing`. */
export function guessMappingFromContent(
  headers: string[],
  rows: Record<string, string>[],
  existing: ColumnMapping,
): ColumnMapping {
  const mapping: ColumnMapping = { ...existing }
  const sample = rows.slice(0, 30)
  if (sample.length === 0) return mapping

  const assignedKeys = new Set(Object.values(existing).filter((v): v is string => !!v))
  const candidateKeys = headers.filter((h) => !assignedKeys.has(h))
  const stats = candidateKeys.map((key) => computeColumnStats(key, sample))

  if (!mapping.date) {
    const best = [...stats].sort((a, b) => b.dateScore - a.dateScore)[0]
    if (best && best.dateScore > 0.5) {
      mapping.date = best.key
      assignedKeys.add(best.key)
    }
  }

  const remainingForAmount = stats.filter((s) => !assignedKeys.has(s.key))
  const numericCandidates = remainingForAmount.filter((s) => s.amountScore > 0.5)

  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    if (numericCandidates.length === 1) {
      mapping.amount = numericCandidates[0].key
      assignedKeys.add(numericCandidates[0].key)
    } else if (numericCandidates.length >= 2) {
      let bestPair: [ColumnStats, ColumnStats] | null = null
      let bestScore = 0
      for (let i = 0; i < numericCandidates.length; i++) {
        for (let j = i + 1; j < numericCandidates.length; j++) {
          const score = exclusivityScore(numericCandidates[i].key, numericCandidates[j].key, sample)
          if (score > bestScore) {
            bestScore = score
            bestPair = [numericCandidates[i], numericCandidates[j]]
          }
        }
      }
      if (bestPair && bestScore > 0.85) {
        const [colA, colB] = bestPair
        // The more frequently populated side is treated as the debit
        // (ordinary spending is more common than payments/refunds) —
        // a best-effort guess, correctable in the review card.
        const [debitCol, creditCol] = colA.fillRate >= colB.fillRate ? [colA, colB] : [colB, colA]
        mapping.debit = debitCol.key
        mapping.credit = creditCol.key
        assignedKeys.add(debitCol.key)
        assignedKeys.add(creditCol.key)
      }
    }
  }

  if (!mapping.rawDescription) {
    const remaining = stats.filter((s) => !assignedKeys.has(s.key) && s.dateScore < 0.5 && s.amountScore < 0.5)
    const best = remaining.sort((a, b) => b.avgLength - a.avgLength)[0]
    if (best) {
      mapping.rawDescription = best.key
      assignedKeys.add(best.key)
    }
  }

  return mapping
}

/** Signed amount in whole currency units from a mapped row, handling banks
 *  that report a single signed `amount` column vs split debit/credit columns. */
export function extractAmount(row: Record<string, string>, mapping: ColumnMapping): number {
  if (mapping.amount) {
    return parseAmountString(row[mapping.amount])
  }
  const debit = mapping.debit ? parseAmountString(row[mapping.debit]) : 0
  const credit = mapping.credit ? parseAmountString(row[mapping.credit]) : 0
  return credit - Math.abs(debit)
}

function parseAmountString(value: string | undefined): number {
  if (!value) return 0
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}
