/**
 * Shared normalization used both at CSV ingestion time and by the clustering
 * engine, so the two never drift into producing different keys for the same
 * merchant.
 */
export function normalizeMerchantName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ') // drop trailing card/reference numbers
    .replace(/\s+/g, ' ')
    .trim()
}
