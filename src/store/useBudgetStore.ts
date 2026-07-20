import { create } from 'zustand'
import type { ColumnMapping } from '../lib/csv/columnMapping'
import { detectColumnMapping, guessMappingFromContent } from '../lib/csv/columnMapping'
import { buildTransactions } from '../lib/csv/buildTransactions'
import { parseFilenameTags } from '../lib/csv/filenameTagParser'
import { parseCsvFile } from '../lib/csv/parseCsvFile'
import { categorizeAll } from '../lib/categorization/categorizationEngine'
import { buildSeedCategories, buildSeedCategoryRules, SEED_VERSION } from '../lib/categorization/seedData'
import { downloadTrainingCsv } from '../lib/export/exportTrainingCsv'
import {
  deleteCategoryRules,
  deleteTransactions,
  getAllCategories,
  getAllCategoryRules,
  getAllSourceFiles,
  getAllTransactions,
  getMeta,
  putCategory,
  putCategoryRule,
  putCategoryRules,
  putSourceFile,
  putTransactions,
  setMeta,
} from '../lib/db/repository'
import type { Category, CategoryRule, ReviewTableFilters, SourceFile, Transaction } from '../types/models'

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

interface BudgetStoreState {
  isLoading: boolean
  transactions: Transaction[]
  sourceFiles: SourceFile[]
  categoryRules: CategoryRule[]
  categories: Category[]

  uploadQueue: File[]
  isImporting: boolean
  lastImport: ImportedFileReview | null
  uploadError: string | null

  reviewTableFilters: ReviewTableFilters

  loadInitialData: () => Promise<void>
  queueFiles: (files: File[]) => Promise<void>
  updateLastImportMapping: (mapping: ColumnMapping) => Promise<void>
  updateLastImportTags: (bank: string, person: string) => Promise<void>
  dismissLastImport: () => void
  labelCluster: (normalizedName: string, category: string) => Promise<void>
  editTransactionCategory: (id: string, category: string) => Promise<void>
  addCustomCategory: (name: string) => Promise<void>
  setReviewTableFilters: (filters: Partial<ReviewTableFilters>) => void
  exportTrainingCsv: () => void
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

  const newTransactions = categorizeAll(
    buildTransactions({
      rows: review.rows,
      mapping: review.mapping,
      bank: review.bank || 'Unknown',
      person: review.person || 'Unknown',
      sourceFileId: review.sourceFileId,
      sourceFileName: review.fileName,
    }),
    categoryRules,
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

  const otherTransactions = transactions.filter((t) => t.sourceFileId !== review.sourceFileId)
  const otherSourceFiles = sourceFiles.filter((f) => f.id !== review.sourceFileId)

  set({
    transactions: [...otherTransactions, ...newTransactions],
    sourceFiles: [...otherSourceFiles, sourceFile],
    lastImport: review,
    uploadError: null,
  })
}

async function drainUploadQueue(
  get: () => BudgetStoreState,
  set: (partial: Partial<BudgetStoreState>) => void,
): Promise<void> {
  while (get().uploadQueue.length > 0) {
    const [nextFile, ...rest] = get().uploadQueue
    set({ uploadQueue: rest })

    try {
      const { headers, headerLabels, rows } = await parseCsvFile(nextFile)
      const aliasMapping = detectColumnMapping(headers)
      const mapping = guessMappingFromContent(headers, rows, aliasMapping)
      const filenameTags = parseFilenameTags(nextFile.name)

      await importParsedFile(get, set, {
        sourceFileId: crypto.randomUUID(),
        fileName: nextFile.name,
        headers,
        headerLabels,
        rows,
        mapping,
        bank: filenameTags.bank ?? '',
        person: filenameTags.person ?? '',
      })
    } catch {
      set({ uploadError: `Could not parse "${nextFile.name}" as CSV.` })
    }
  }
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
  isLoading: true,
  transactions: [],
  sourceFiles: [],
  categoryRules: [],
  categories: [],

  uploadQueue: [],
  isImporting: false,
  lastImport: null,
  uploadError: null,

  reviewTableFilters: { search: '', category: null, bank: null, person: null },

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

    const [transactions, sourceFiles, categoryRules, categories] = await Promise.all([
      getAllTransactions(),
      getAllSourceFiles(),
      getAllCategoryRules(),
      getAllCategories(),
    ])

    let finalTransactions = transactions
    if (needsReseed) {
      // Re-run categorization only for rows a (now possibly stale) heuristic
      // rule had tagged — manual edits and user-labeled-rule matches are untouched.
      const reset = transactions.map((t) =>
        t.categorySource === 'heuristic' ? { ...t, category: null, categorySource: null } : t,
      )
      finalTransactions = categorizeAll(reset, categoryRules)
      const changed = finalTransactions.filter((t, i) => t !== transactions[i])
      await putTransactions(changed)
    }

    set({ transactions: finalTransactions, sourceFiles, categoryRules, categories, isLoading: false })
  },

  async queueFiles(files) {
    set({ uploadQueue: [...get().uploadQueue, ...files] })
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

  async addCustomCategory(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const { categories } = get()
    if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return

    const category: Category = { name: trimmed, color: null, isBuiltIn: false, createdAt: Date.now() }
    await putCategory(category)
    set({ categories: [...categories, category] })
  },

  setReviewTableFilters(filters) {
    set({ reviewTableFilters: { ...get().reviewTableFilters, ...filters } })
  },

  exportTrainingCsv() {
    downloadTrainingCsv(get().transactions)
  },
}))
