import { create } from 'zustand'
import type { ColumnMapping } from '../lib/csv/columnMapping'
import { detectColumnMapping, guessMappingFromContent } from '../lib/csv/columnMapping'
import { buildTransactions } from '../lib/csv/buildTransactions'
import { parseFilenameTags } from '../lib/csv/filenameTagParser'
import { parseCsvFile } from '../lib/csv/parseCsvFile'
import { categorizeAll } from '../lib/categorization/categorizationEngine'
import { buildSeedCategories, buildSeedCategoryRules, SEED_VERSION } from '../lib/categorization/seedData'
import { downloadTransactionsCsv } from '../lib/export/exportTransactionsCsv'
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
import type { Category, CategoryRule, DatasetType, SourceFile, Transaction } from '../types/models'

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
  datasetType: DatasetType
}

interface QueuedFile {
  file: File
  datasetType: DatasetType
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
  lastImport: ImportedFileReview | null
  uploadError: string | null
  actionMessage: string | null

  loadInitialData: () => Promise<void>
  queueFiles: (files: File[], datasetType: DatasetType) => Promise<void>
  updateLastImportMapping: (mapping: ColumnMapping) => Promise<void>
  updateLastImportTags: (bank: string, person: string) => Promise<void>
  dismissLastImport: () => void
  labelCluster: (normalizedName: string, category: string) => Promise<void>
  editTransactionCategory: (id: string, category: string) => Promise<void>
  editTransactionCategories: (ids: string[], category: string) => Promise<void>
  addCustomCategory: (name: string) => Promise<void>
  exportTrainingCsv: () => void
  exportCategorizedCsv: () => void
  updateTrainingDataFromCategorized: () => Promise<void>
  consolidateAndDownload: () => Promise<void>
  clearCategorizeBatch: () => Promise<void>
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
      datasetType: review.datasetType,
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

  set({
    transactions: [...otherTransactions, ...newTransactions],
    sourceFiles: [...otherSourceFiles, sourceFile],
    categoryRules: updatedCategoryRules,
    lastImport: review,
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
        datasetType: next.datasetType,
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
  lastImport: null,
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

  async queueFiles(files, datasetType) {
    const queued = files.map((file) => ({ file, datasetType }))
    set({ uploadQueue: [...get().uploadQueue, ...queued] })
    if (get().isImporting) return
    set({ isImporting: true })
    await drainUploadQueue(get, set)
    set({ isImporting: false })
  },

  async updateLastImportMapping(mapping) {
    const { lastImport } = get()
    if (!lastImport) return
    await importParsedFile(get, set, { ...lastImport, mapping })
  },

  async updateLastImportTags(bank, person) {
    const { lastImport } = get()
    if (!lastImport) return
    await importParsedFile(get, set, { ...lastImport, bank, person })
  },

  dismissLastImport() {
    set({ lastImport: null })
  },

  async labelCluster(normalizedName, category) {
    const { categoryRules, transactions } = get()
    const now = Date.now()
    const matchingTransactions = transactions.filter(
      (t) => t.normalizedName === normalizedName && !t.category,
    )

    const existingRule = categoryRules.find(
      (r) => r.matchType === 'exact' && r.pattern === normalizedName && r.source === 'user-labeled',
    )
    const rule: CategoryRule = existingRule
      ? {
          ...existingRule,
          category,
          lastAppliedAt: now,
          timesApplied: existingRule.timesApplied + matchingTransactions.length,
        }
      : {
          id: crypto.randomUUID(),
          pattern: normalizedName,
          matchType: 'exact',
          category,
          source: 'user-labeled',
          confidence: 1,
          createdAt: now,
          lastAppliedAt: now,
          timesApplied: matchingTransactions.length,
        }

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
      categoryRules: existingRule
        ? categoryRules.map((r) => (r.id === rule.id ? rule : r))
        : [...categoryRules, rule],
    })
  },

  async editTransactionCategory(id, category) {
    const { transactions } = get()
    const updated = transactions.map((t) =>
      t.id === id ? { ...t, category, categorySource: 'manual' as const } : t,
    )
    const changed = updated.find((t) => t.id === id)
    if (changed) await putTransactions([changed])
    set({ transactions: updated })
  },

  async editTransactionCategories(ids, category) {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const { transactions } = get()
    const updated = transactions.map((t) =>
      idSet.has(t.id) ? { ...t, category, categorySource: 'manual' as const } : t,
    )
    const changed = updated.filter((t) => idSet.has(t.id))
    await putTransactions(changed)
    set({ transactions: updated })
  },

  async addCustomCategory(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const { categories } = get()
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return

    const category: Category = { name: trimmed, color: null, isBuiltIn: false, createdAt: Date.now() }
    await putCategory(category)
    set({ categories: [...categories, category] })
  },

  exportTrainingCsv() {
    const rows = get().transactions.filter((t) => t.datasetType === 'training')
    downloadTransactionsCsv(rows, 'training-data.csv')
  },

  exportCategorizedCsv() {
    const rows = get().transactions.filter((t) => t.datasetType === 'categorize')
    downloadTransactionsCsv(rows, 'categorized-transactions.csv')
  },

  async updateTrainingDataFromCategorized() {
    const { transactions, categoryRules } = get()
    const amended = transactions.filter(
      (t) => t.datasetType === 'categorize' && t.categorySource === 'manual' && t.category,
    )
    if (amended.length === 0) {
      set({ actionMessage: 'No manually-corrected rows to teach yet — edit a category first.' })
      return
    }
    const now = Date.now()

    // Upsert categoryRules keyed by merchant name — same mechanism labelCluster uses.
    const ruleByPattern = new Map(
      categoryRules
        .filter((r) => r.matchType === 'exact' && r.source === 'user-labeled')
        .map((r) => [r.pattern, r]),
    )
    const rulesToPersist: CategoryRule[] = []
    for (const t of amended) {
      const category = t.category as string
      const existingRule = ruleByPattern.get(t.normalizedName)
      const rule: CategoryRule = existingRule
        ? { ...existingRule, category, lastAppliedAt: now }
        : {
            id: crypto.randomUUID(),
            pattern: t.normalizedName,
            matchType: 'exact',
            category,
            source: 'user-labeled',
            confidence: 1,
            createdAt: now,
            lastAppliedAt: now,
            timesApplied: 0,
          }
      ruleByPattern.set(t.normalizedName, rule)
      rulesToPersist.push(rule)
    }
    await putCategoryRules(rulesToPersist)
    const ruleById = new Map(rulesToPersist.map((r) => [r.id, r]))
    const finalCategoryRules = [...categoryRules.filter((r) => !ruleById.has(r.id)), ...rulesToPersist]

    // Mirror into the training dataset — update the existing training example
    // for that merchant if one exists, else add a new one.
    const trainingByName = new Map(
      transactions.filter((t) => t.datasetType === 'training').map((t) => [t.normalizedName, t]),
    )
    const trainingUpserts: Transaction[] = []
    for (const t of amended) {
      const category = t.category as string
      const existing = trainingByName.get(t.normalizedName)
      const row: Transaction = existing
        ? { ...existing, category, categorySource: 'manual' }
        : {
            ...t,
            id: crypto.randomUUID(),
            datasetType: 'training',
            sourceFileId: 'amended-from-categorize',
            sourceFileName: 'Amended via Categorize tab',
            createdAt: now,
          }
      trainingByName.set(t.normalizedName, row)
      trainingUpserts.push(row)
    }
    await putTransactions(trainingUpserts)
    const trainingById = new Map(trainingUpserts.map((t) => [t.id, t]))
    const finalTransactions = [...transactions.filter((t) => !trainingById.has(t.id)), ...trainingUpserts]

    set({
      transactions: finalTransactions,
      categoryRules: finalCategoryRules,
      actionMessage: `Taught ${amended.length} correction${amended.length === 1 ? '' : 's'} to the categorizer and updated training-data.csv.`,
    })

    downloadTransactionsCsv(
      finalTransactions.filter((t) => t.datasetType === 'training'),
      'training-data.csv',
    )
  },

  async consolidateAndDownload() {
    const { transactions, masterLedger } = get()
    const categorizeRows = transactions.filter((t) => t.datasetType === 'categorize')
    const { merged, added, addedCount, skippedCount } = mergeIntoLedger(masterLedger, categorizeRows)

    if (addedCount > 0) await putMasterLedgerEntries(added)

    set({
      masterLedger: merged,
      actionMessage:
        `Added ${addedCount} new transaction${addedCount === 1 ? '' : 's'} to your consolidated file` +
        (skippedCount > 0 ? ` (${skippedCount} already there).` : '.'),
    })

    downloadTransactionsCsv(merged, 'consolidated-transactions.csv')
  },

  async clearCategorizeBatch() {
    const { transactions, sourceFiles } = get()
    const categorizeIds = transactions.filter((t) => t.datasetType === 'categorize').map((t) => t.id)
    const categorizeSourceFileIds = new Set(
      transactions.filter((t) => t.datasetType === 'categorize').map((t) => t.sourceFileId),
    )
    const sourceFileIdsToRemove = sourceFiles
      .filter((f) => categorizeSourceFileIds.has(f.id))
      .map((f) => f.id)

    await Promise.all([deleteTransactions(categorizeIds), deleteSourceFiles(sourceFileIdsToRemove)])

    set({
      transactions: transactions.filter((t) => t.datasetType !== 'categorize'),
      sourceFiles: sourceFiles.filter((f) => !sourceFileIdsToRemove.includes(f.id)),
      actionMessage: null,
      lastImport: null,
    })
  },
}))
