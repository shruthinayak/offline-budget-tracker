import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Transaction, SourceFile, CategoryRule, Category } from '../../types/models'

interface BudgetDB extends DBSchema {
  transactions: {
    key: string
    value: Transaction
    indexes: {
      normalizedName: string
      category: string
      sourceFileId: string
      bank: string
      person: string
      date: string
    }
  }
  sourceFiles: {
    key: string
    value: SourceFile
  }
  categoryRules: {
    key: string
    value: CategoryRule
    indexes: { pattern: string }
  }
  categories: {
    key: string
    value: Category
  }
  meta: {
    key: string
    value: { key: string; value: unknown }
  }
  masterLedger: {
    key: string
    value: Transaction
  }
}

const DB_NAME = 'budgetlocal'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<BudgetDB>> | null = null

export function getDb(): Promise<IDBPDatabase<BudgetDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BudgetDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const transactions = db.createObjectStore('transactions', { keyPath: 'id' })
          transactions.createIndex('normalizedName', 'normalizedName')
          transactions.createIndex('category', 'category')
          transactions.createIndex('sourceFileId', 'sourceFileId')
          transactions.createIndex('bank', 'bank')
          transactions.createIndex('person', 'person')
          transactions.createIndex('date', 'date')

          db.createObjectStore('sourceFiles', { keyPath: 'id' })

          const categoryRules = db.createObjectStore('categoryRules', { keyPath: 'id' })
          categoryRules.createIndex('pattern', 'pattern')

          db.createObjectStore('categories', { keyPath: 'name' })

          db.createObjectStore('meta', { keyPath: 'key' })
        }

        if (oldVersion < 2) {
          db.createObjectStore('masterLedger', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}
