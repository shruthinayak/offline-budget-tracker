export interface FilenameTags {
  person?: string
  bank?: string
}

/**
 * Best-effort parse of the recommended `name_bank_month.csv` convention
 * (e.g. "shruthi_chase_may.csv"). Never required — a non-matching filename
 * just leaves the tags blank for the user to fill in manually.
 */
export function parseFilenameTags(fileName: string): FilenameTags {
  const base = fileName.replace(/\.csv$/i, '')
  const parts = base.split(/[_\-\s]+/).filter(Boolean)
  if (parts.length < 2) return {}
  const [person, bank] = parts
  return { person: titleCase(person), bank: titleCase(bank) }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}
