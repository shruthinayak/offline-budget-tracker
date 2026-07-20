import { describe, expect, it } from 'vitest'
import { guessMappingFromContent, looksLikeHeaderRow, detectColumnMapping } from './columnMapping'

// Shaped like a real CIBC export: date, description, debit, credit, masked card number — no header row.
const cibcRows: Record<string, string>[] = [
  { column_0: '2026-04-29', column_1: 'Amazon.ca*BS9Q97EH0', column_2: '78.84', column_3: '', column_4: '4500********6997' },
  { column_0: '2026-04-28', column_1: 'CINEPLEX 8030 WEB QPS', column_2: '78.81', column_3: '', column_4: '4500********6997' },
  { column_0: '2026-04-28', column_1: 'PRE-AUTHORIZED PAYMENT - THANK YOU', column_2: '', column_3: '691.54', column_4: '4500********6997' },
  { column_0: '2026-04-27', column_1: 'FOOD BASICS 648', column_2: '7.81', column_3: '', column_4: '4500********6997' },
  { column_0: '2026-04-27', column_1: 'DOLLARAMA #0992', column_2: '13.10', column_3: '', column_4: '4500********6997' },
]

// Shaped like a real TD export: date, description, withdrawal, deposit, running balance — no header row.
const tdRows: Record<string, string>[] = [
  { column_0: '2026-01-02', column_1: 'Google PAY', column_2: '', column_3: '4018.1', column_4: '28166.38' },
  { column_0: '2026-01-02', column_1: 'SEND E-TFR ***mTb', column_2: '3000', column_3: '', column_4: '25166.38' },
  { column_0: '2026-01-02', column_1: 'Questrade Inc MSP', column_2: '100', column_3: '', column_4: '25066.38' },
  { column_0: '2026-01-05', column_1: 'SEND E-TFR ***2NJ', column_2: '3000', column_3: '', column_4: '22066.38' },
  { column_0: '2026-01-06', column_1: 'ENERCARE HOME S MSP', column_2: '58.03', column_3: '', column_4: '22008.35' },
]

describe('looksLikeHeaderRow', () => {
  it('detects a real header row', () => {
    expect(looksLikeHeaderRow(['Transaction Date', 'Description', 'Amount'])).toBe(true)
  })

  it('rejects an actual transaction row as a header', () => {
    expect(looksLikeHeaderRow(['2026-04-29', 'Amazon.ca*BS9Q97EH0', '78.84', '', '4500********6997'])).toBe(false)
  })
})

describe('guessMappingFromContent', () => {
  it('guesses date, description, and debit/credit for a headerless CIBC-shaped file', () => {
    const headers = ['column_0', 'column_1', 'column_2', 'column_3', 'column_4']
    const mapping = guessMappingFromContent(headers, cibcRows, detectColumnMapping(headers))

    expect(mapping.date).toBe('column_0')
    expect(mapping.rawDescription).toBe('column_1')
    expect(mapping.debit).toBe('column_2')
    expect(mapping.credit).toBe('column_3')
    expect(mapping.amount).toBeUndefined()
  })

  it('excludes a running-balance column from the debit/credit guess for a headerless TD-shaped file', () => {
    const headers = ['column_0', 'column_1', 'column_2', 'column_3', 'column_4']
    const mapping = guessMappingFromContent(headers, tdRows, detectColumnMapping(headers))

    expect(mapping.date).toBe('column_0')
    expect(mapping.rawDescription).toBe('column_1')
    expect(mapping.debit).toBe('column_2')
    expect(mapping.credit).toBe('column_3')
    expect(mapping.debit).not.toBe('column_4')
    expect(mapping.credit).not.toBe('column_4')
  })

  it('never overrides a field already present from header-alias detection', () => {
    const headers = ['Transaction Date', 'Description', 'Amount']
    const rows = [{ 'Transaction Date': '2026-05-01', Description: 'Netflix', Amount: '15.49' }]
    const existing = detectColumnMapping(headers)
    const mapping = guessMappingFromContent(headers, rows, existing)
    expect(mapping).toEqual(existing)
  })
})
