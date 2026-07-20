export type MatchType = 'exact' | 'contains' | 'startsWith'
export type CategorySource = 'rule' | 'heuristic' | 'manual' | null
export type RuleSource = 'user-labeled' | 'seed-heuristic'
export type DatasetType = 'training' | 'categorize'

export interface Transaction {
  id: string
  date: string // ISO 8601 yyyy-mm-dd
  rawDescription: string
  normalizedName: string
  amount: number // signed integer cents
  category: string | null
  categorySource: CategorySource
  bank: string
  person: string
  sourceFileId: string
  sourceFileName: string
  createdAt: number
  /** Which tab this row belongs to. Rows persisted before this field existed
   *  are treated as 'training' at read time (see repository.ts). */
  datasetType: DatasetType
}

export interface SourceFile {
  id: string
  fileName: string
  bank: string
  person: string
  columnMapping: Record<string, string>
  rowCount: number
  importedAt: number
}

export interface CategoryRule {
  id: string
  pattern: string
  matchType: MatchType
  category: string
  source: RuleSource
  confidence: number
  createdAt: number
  lastAppliedAt: number
  timesApplied: number
}

export interface Category {
  name: string
  color: string | null
  isBuiltIn: boolean
  createdAt: number
}

export interface UncategorizedCluster {
  normalizedName: string
  count: number
  totalAmount: number
  sampleRows: Transaction[]
}

export interface ReviewTableFilters {
  search: string
  category: string | null
  bank: string | null
  person: string | null
}
