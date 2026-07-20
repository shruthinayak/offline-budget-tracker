import type { Transaction } from '../../types/models'

const CANONICAL_HEADERS = [
  'date',
  'normalized_name',
  'raw_description',
  'amount',
  'category',
  'bank',
  'person',
]

export function transactionsToCsv(transactions: Transaction[]): string {
  const rows = transactions.map((t) => [
    t.date,
    t.normalizedName,
    t.rawDescription,
    (t.amount / 100).toFixed(2),
    t.category ?? '',
    t.bank,
    t.person,
  ])

  return [CANONICAL_HEADERS, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function downloadTransactionsCsv(transactions: Transaction[], filename: string): void {
  const csv = transactionsToCsv(transactions)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
