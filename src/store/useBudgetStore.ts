import { create } from 'zustand'
import type { ColumnMapping } from '../lib/csv/columnMapping'
import { detectColumnMapping, guessMappingFromContent } from '../lib/csv/columnMapping'
import { buildTransactions } from '../lib/csv/buildTransactions'
import { parseFilenameTags } from '../lib/csv/filenameTagParser'
import { parseCsvFile } from '../lib/csv/parseCsvFile'
import { categorizeAll } from '../lib/categorization/categorizationEngine'
import { buildSeedCategories, buildSeedCategoryRules, SEED_VERSION } from '../lib/categorization/seedData'
import { exportPersonalizedRules, parsePersonalizedRules } from '../lib/categorization/personalizedRules'
import { downloadTransactionsCsv } from '../lib/export/exportTransactionsCsv'
import { downloadJson } from '../lib/export/downloadJson'
import { mergeIntoLedger } from '../lib/export/consolidation'
import {
  deleteCategoryRules,
  deleteSourceFiles,
  deleteTransactions,
  getAllCategories,
  getAllCategoryRules,
  getAllMasterLedgerEntries,
  getAllSourceFiles,
  getAllTransactions,
  getMeta,
  putCategory,
  putCategoryRule,
  putCategoryRules,
  putMasterLedgerEntries,
  putSourceFile,
  putTransactions,
  setMeta,
} from '../lib/db/repository'
import type { Category, CategoryKind, CategoryRule, SourceFile, Transaction } from '../types/models'

/** A just-imported (or being-corrected) file, shown as a dismissible,
 *  editable review card — never blocks the import itself. */
export interface ImportedFileReview {
  sourceFileId: string
  fileName: string
  headers: string[]
  headerLabels: string[]
  rows: Record<string, string>[]
  mapping: ColumnMapping
  bank: string
  person: string
}

interface QueuedFile {
  file: File
}

interface BudgetStoreState {
  isLoading: boolean
  transactions: Transaction[]
  sourceFiles: SourceFile[]
  categoryRules: CategoryRule[]
  categories: Category[]
  masterLedger: Transaction[]

  uploadQueue: QueuedFile[]
  isImporting: boolean
  recentImports: ImportedFileReview[]
  uploadError: string | null
  actionMessage: string | null

  loadInitialData: () => Promise<void>
  queueFiles: (files: File[]) => Promise<void>
  updateImportMapping: (sourceFileId: string, mapping: ColumnMapping) => Promise<void>
  updateImportTags: (sourceFileId: string, bank: string, person: string) => Promise<void>
  dismissImport: (sourceFileId: string) => void
  labelCluster: (normalizedName: string, category: string) => Promise<void>
  editTransactionCategory: (id: string, category: string) => Promise<void>
  editTransactionCategories: (ids: string[], category: string) => Promise<void>
  addCustomCategory: (name: string) => Promise<void>
  setCategoryKind: (name: string, kind: CategoryKind) => Promise<void>
  exportRules: () => void
  importRules: (file: File) => Promise<{ importedCount: number } | { error: string }>
  exportCsv: () => void
  consolidateAndDownload: () => Promise<void>
  startNewBatch: () => Promise<void>
}

/** Bumps timesApplied/lastAppliedAt on every rule that was used to
 *  auto-categorize a batch, and persists just those rules. */
async function applyRuleUsage(
  rules: CategoryRule[],
  usage: Map<string, number>,
): Promise<CategoryRule[]> {
  if (usage.size === 0) return rules
  const now = Date.now()
  const bumped = rules
    .filter((r) => usage.has(r.id))
    .map((r) => ({ ...r, timesApplied: r.timesApplied + (usage.get(r.id) ?? 0), lastAppliedAt: now }))
  await putCategoryRules(bumped)
  const bumpedById = new Map(bumped.map((r) => [r.id, r]))
  return rules.map((r) => bumpedById.get(r.id) ?? r)
}

/** Creates or refreshes the single user-labeled rule for a merchant — the
 *  one mechanism every "teach the categorizer" path (cluster labeling, a
 *  single row edit, a bulk edit) goes through, so a correction anywhere
 *  immediately improves future auto-categorization. */
function upsertUserRule(
  categoryRules: CategoryRule[],
  pattern: string,
  category: string,
  now: number,
  appliedCount: number,
): CategoryRule {
  const existingRule = categoryRules.find(
    (r) => r.matchType === 'exact' && r.pattern === pattern && r.source === 'user-labeled',
  )
  return existingRule
    ? { ...existingRule, category, lastAppliedAt: now, timesApplied: existingRule.timesApplied + appliedCount }
    : {
        id: crypto.randomUUID(),
        pattern,
        matchType: 'exact',
        category,
        source: 'user-labeled',
        confidence: 1,
        createdAt: now,
        lastAppliedAt: now,
        timesApplied: appliedCount,
      }
}

function mergeRule(categoryRules: CategoryRule[], rule: CategoryRule): CategoryRule[] {
  return categoryRules.some((r) => r.id === rule.id)
    ? categoryRules.map((r) => (r.id === rule.id ? rule : r))
    : [...categoryRules, rule]
}

/** Builds+categorizes a file's rows and writes them in place under
 *  `review.sourceFileId` — used both for a fresh import and for re-applying
 *  a corrected mapping/tags, since both are "replace this file's rows". */
async function importParsedFile(
  get: () => BudgetStoreState,
  set: (partial: Partial<BudgetStoreState>) => void,
  review: ImportedFileReview,
): Promise<void> {
  const { categoryRules, transactions, sourceFiles } = get()

  const ruleUsage = new Map<string, number>()
  const newTransactions = categorizeAll(
    buildTransactions({
      rows: review.rows,
      mapping: review.mapping,
      bank: review.bank || 'Unknown',
      person: review.person || 'Unknown',
      sourceFileId: review.sourceFileId,
      sourceFileName: review.fileName,
      datasetType: 'categorize',
    }),
    categoryRules,
    (rule) => ruleUsage.set(rule.id, (ruleUsage.get(rule.id) ?? 0) + 1),
  )

  const sourceFile: SourceFile = {
    id: review.sourceFileId,
    fileName: review.fileName,
    bank: review.bank || 'Unknown',
    person: review.person || 'Unknown',
    columnMapping: review.mapping as Record<string, string>,
    rowCount: newTransactions.length,
    importedAt: Date.now(),
  }

  const staleIds = transactions.filter((t) => t.sourceFileId === review.sourceFileId).map((t) => t.id)
  await deleteTransactions(staleIds)
  await Promise.all([putTransactions(newTransactions), putSourceFile(sourceFile)])
  const updatedCategoryRules = await applyRuleUsage(categoryRules, ruleUsage)

  const otherTransactions = transactions.filter((t) => t.sourceFileId !== review.sourceFileId)
  const otherSourceFiles = sourceFiles.filter((f) => f.id !== review.sourceFileId)

  const otherRecentImports = get().recentImports.filter((r) => r.sourceFileId !== review.sourceFileId)

  set({
    transactions: [...otherTransactions, ...newTransactions],
    sourceFiles: [...otherSourceFiles, sourceFile],
    categoryRules: updatedCategoryRules,
    recentImports: [...otherRecentImports, review],
    uploadError: null,
  })
}

async function drainUploadQueue(
  get: () => BudgetStoreState,
  set: (partial: Partial<BudgetStoreState>) => void,
): Promise<void> {
  while (get().uploadQueue.length > 0) {
    const [next, ...rest] = get().uploadQueue
    set({ uploadQueue: rest })

    try {
      const { headers, headerLabels, rows } = await parseCsvFile(next.file)
      const aliasMapping = detectColumnMapping(headers)
      const mapping = guessMappingFromContent(headers, rows, aliasMapping)
      const filenameTags = parseFilenameTags(next.file.name)

      await importParsedFile(get, set, {
        sourceFileId: crypto.randomUUID(),
        fileName: next.file.name,
        headers,
        headerLabels,
        rows,
        mapping,
        bank: filenameTags.bank ?? '',
        person: filenameTags.person ?? '',
      })
    } catch {
      set({ uploadError: `Could not parse "${next.file.name}" as CSV.` })
    }
  }
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  isLoading: true,
  transactions: [],
  sourceFiles: [],
  categoryRules: [],
  categories: [],
  masterLedger: [],

  uploadQueue: [],
  isImporting: false,
  recentImports: [],
  uploadError: null,
  actionMessage: null,

  async loadInitialData() {
    const [existingRules, seededVersion] = await Promise.all([getAllCategoryRules(), getMeta<number>('seedVersion')])

    const needsReseed = seededVersion !== SEED_VERSION
    if (needsReseed) {
      const staleSeedIds = existingRules.filter((r) => r.source === 'seed-heuristic').map((r) => r.id)
      await deleteCategoryRules(staleSeedIds)
      await putCategoryRules(buildSeedCategoryRules())
      await setMeta('seedVersion', SEED_VERSION)
    }
    await Promise.all(buildSeedCategories().map((c) => putCategory(c)))

    const [transactions, sourceFiles, categoryRules, categories, masterLedger] = await Promise.all([
      getAllTransactions(),
      getAllSourceFiles(),
      getAllCategoryRules(),
      getAllCategories(),
      getAllMasterLedgerEntries(),
    ])

    let finalTransactions = transactions
    let finalCategoryRules = categoryRules
    if (needsReseed) {
      // Re-run categorization only for rows a (now possibly stale) heuristic
      // rule had tagged — manual edits and user-labeled-rule matches are untouched.
      const reset = transactions.map((t) =>
        t.categorySource === 'heuristic' ? { ...t, category: null, categorySource: null } : t,
      )
      const reseedUsage = new Map<string, number>()
      finalTransactions = categorizeAll(reset, categoryRules, (rule) =>
        reseedUsage.set(rule.id, (reseedUsage.get(rule.id) ?? 0) + 1),
      )
      const changed = finalTransactions.filter((t, i) => t !== transactions[i])
      await putTransactions(changed)
      finalCategoryRules = await applyRuleUsage(categoryRules, reseedUsage)
    }

    set({
      transactions: finalTransactions,
      sourceFiles,
      categoryRules: finalCategoryRules,
      categories,
      masterLedger,
      isLoading: false,
    })
  },

  async queueFiles(files) {
    const queued = files.map((file) => ({ file }))
    set({ uploadQueue: [...get().uploadQueue, ...queued] })
    if (get().isImporting) return
    set({ isImporting: true })
    await drainUploadQueue(get, set)
    set({ isImporting: false })
  },

  async updateImportMapping(sourceFileId, mapping) {
    const review = get().recentImports.find((r) => r.sourceFileId === sourceFileId)
    if (!review) return
    await importParsedFile(get, set, { ...review, mapping })
  },

  async updateImportTags(sourceFileId, bank, person) {
    const review = get().recentImports.find((r) => r.sourceFileId === sourceFileId)
    if (!review) return
    await importParsedFile(get, set, { ...review, bank, person })
  },

  dismissImport(sourceFileId) {
    set({ recentImports: get().recentImports.filter((r) => r.sourceFileId !== sourceFileId) })
  },

  async labelCluster(normalizedName, category) {
    const { categoryRules, transactions } = get()
    const now = Date.now()
    const matchingTransactions = transactions.filter(
      (t) => t.normalizedName === normalizedName && !t.category,
    )

    const rule = upsertUserRule(categoryRules, normalizedName, category, now, matchingTransactions.length)

    const updatedTransactions = transactions.map((t) =>
      t.normalizedName === normalizedName && !t.category
        ? { ...t, category, categorySource: 'manual' as const }
        : t,
    )

    await Promise.all([
      putCategoryRule(rule),
      putTransactions(updatedTransactions.filter((t) => t.normalizedName === normalizedName)),
    ])

    set({
      transactions: updatedTransactions,
      categoryRules: mergeRule(categoryRules, rule),
    })
  },

  async editTransactionCategory(id, category) {
    const { transactions, categoryRules } = get()
    const target = transactions.find((t) => t.id === id)
    if (!target) return
    const now = Date.now()

    // Every correction teaches the categorizer immediately, not just this row.
    const rule = upsertUserRule(categoryRules, target.normalizedName, category, now, 1)

    const updated = transactions.map((t) =>
      t.id === id ? { ...t, category, categorySource: 'manual' as const } : t,
    )
    const changed = updated.find((t) => t.id === id)
    await Promise.all([changed ? putTransactions([changed]) : Promise.resolve(), putCategoryRule(rule)])
    set({ transactions: updated, categoryRules: mergeRule(categoryRules, rule) })
  },

  async editTransactionCategories(ids, category) {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const { transactions, categoryRules } = get()
    const now = Date.now()
    const selected = transactions.filter((t) => idSet.has(t.id))

    const countByPattern = new Map<string, number>()
    for (const t of selected) countByPattern.set(t.normalizedName, (countByPattern.get(t.normalizedName) ?? 0) + 1)

    let updatedRules = categoryRules
    const rulesToPersist: CategoryRule[] = []
    for (const [pattern, count] of countByPattern) {
      const rule = upsertUserRule(updatedRules, pattern, category, now, count)
      updatedRules = mergeRule(updatedRules, rule)
      rulesToPersist.push(rule)
    }

    const updated = transactions.map((t) =>
      idSet.has(t.id) ? { ...t, category, categorySource: 'manual' as const } : t,
    )
    const changed = updated.filter((t) => idSet.has(t.id))
    await Promise.all([putTransactions(changed), putCategoryRules(rulesToPersist)])
    set({ transactions: updated, categoryRules: updatedRules })
  },

  async addCustomCategory(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const { categories } = get()
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return

    const category: Category = { name: trimmed, color: null, isBuiltIn: false, createdAt: Date.now(), kind: 'expense' }
    await putCategory(category)
    set({ categories: [...categories, category] })
  },

  async setCategoryKind(name, kind) {
    const { categories } = get()
    const target = categories.find((c) => c.name === name)
    if (!target || target.kind === kind) return
    const updated: Category = { ...target, kind }
    await putCategory(updated)
    set({ categories: categories.map((c) => (c.name === name ? updated : c)) })
  },

  exportRules() {
    const entries = exportPersonalizedRules(get().categoryRules)
    downloadJson(entries, 'personalized-merchant-categories.json')
  },

  async importRules(file) {
    const parsedEntries = parsePersonalizedRules(await file.text())
    if (!parsedEntries) {
      return { error: `Could not parse "${file.name}" as a rules file.` }
    }
    if (parsedEntries.length === 0) {
      return { error: `No valid rules found in "${file.name}".` }
    }

    const { categoryRules, transactions } = get()
    const now = Date.now()
    const existingByKey = new Map(
      categoryRules.filter((r) => r.source === 'user-labeled').map((r) => [`${r.matchType}:${r.pattern}`, r]),
    )
    const rulesToPersist: CategoryRule[] = parsedEntries.map((entry) => {
      const existing = existingByKey.get(`${entry.matchType}:${entry.pattern}`)
      return existing
        ? { ...existing, category: entry.category, lastAppliedAt: now }
        : {
            id: crypto.randomUUID(),
            pattern: entry.pattern,
            matchType: entry.matchType,
            category: entry.category,
            source: 'user-labeled' as const,
            confidence: 1,
            createdAt: now,
            lastAppliedAt: now,
            timesApplied: 0,
          }
    })
    await putCategoryRules(rulesToPersist)
    const byId = new Map(rulesToPersist.map((r) => [r.id, r]))
    const mergedRules = [...categoryRules.filter((r) => !byId.has(r.id)), ...rulesToPersist]

    // Apply the newly imported rules to any currently uncategorized rows —
    // categorizeTransaction is a no-op for already-categorized ones, so this
    // only fills gaps, same as the reseed path in loadInitialData.
    const usage = new Map<string, number>()
    const recategorized = categorizeAll(transactions, mergedRules, (rule) =>
      usage.set(rule.id, (usage.get(rule.id) ?? 0) + 1),
    )
    const changed = recategorized.filter((t, i) => t !== transactions[i])
    if (changed.length > 0) await putTransactions(changed)
    const finalRules = await applyRuleUsage(mergedRules, usage)

    set({ categoryRules: finalRules, transactions: recategorized })
    return { importedCount: rulesToPersist.length }
  },

  exportCsv() {
    downloadTransactionsCsv(get().transactions, 'transactions.csv')
  },

  async consolidateAndDownload() {
    const { transactions, masterLedger } = get()
    const { merged, added, addedCount, skippedCount } = mergeIntoLedger(masterLedger, transactions)

    if (addedCount > 0) await putMasterLedgerEntries(added)

    set({
      masterLedger: merged,
      actionMessage:
        `Added ${addedCount} new transaction${addedCount === 1 ? '' : 's'} to your consolidated file` +
        (skippedCount > 0 ? ` (${skippedCount} already there).` : '.'),
    })

    downloadTransactionsCsv(merged, 'consolidated-transactions.csv')
  },

  async startNewBatch() {
    const { transactions, sourceFiles } = get()
    const ids = transactions.map((t) => t.id)
    const sourceFileIds = sourceFiles.map((f) => f.id)

    await Promise.all([deleteTransactions(ids), deleteSourceFiles(sourceFileIds)])

    set({
      transactions: [],
      sourceFiles: [],
      actionMessage: null,
      recentImports: [],
    })
  },
}))
