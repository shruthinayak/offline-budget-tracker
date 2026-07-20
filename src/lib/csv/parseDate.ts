/** Normalizes a variety of bank date formats to ISO 8601 (yyyy-mm-dd). */
export function parseDateToIso(raw: string): string {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const [, a, b, year] = slashMatch
    const first = Number(a)
    const second = Number(b)
    // Assume MM/DD/YYYY unless the first segment can't be a month.
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    return `${year}-${pad(month)}-${pad(day)}`
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
  }

  return trimmed
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
