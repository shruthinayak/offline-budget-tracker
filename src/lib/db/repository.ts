import { getDb } from './schema'
import type { Transaction, SourceFile, CategoryRule, Category } from '../../types/models'

export async function getAllTransactions(): Promise<Transaction[]> {
  const rows = await (await getDb()).getAll('transactions')
  // Rows persisted before `datasetType` existed default to 'training'.
  return rows.map((t) => ({ ...t, datasetType: t.datasetType ?? 'training' }))
}

export async function putTransactions(transactions: Transaction[]): Promise<void> {
  if (transactions.length === 0) return
  const db = await getDb()
  const tx = db.transaction('transactions', 'readwrite')
  await Promise.all(transactions.map((t) => tx.store.put(t)))
  await tx.done
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDb()
  const tx = db.transaction('transactions', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function getAllSourceFiles(): Promise<SourceFile[]> {
  return (await getDb()).getAll('sourceFiles')
}

export async function putSourceFile(file: SourceFile): Promise<void> {
  await (await getDb()).put('sourceFiles', file)
}

export async function deleteSourceFiles(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDb()
  const tx = db.transaction('sourceFiles', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function getAllCategoryRules(): Promise<CategoryRule[]> {
  return (await getDb()).getAll('categoryRules')
}

export async function putCategoryRule(rule: CategoryRule): Promise<void> {
  await (await getDb()).put('categoryRules', rule)
}

export async function putCategoryRules(rules: CategoryRule[]): Promise<void> {
  if (rules.length === 0) return
  const db = await getDb()
  const tx = db.transaction('categoryRules', 'readwrite')
  await Promise.all(rules.map((r) => tx.store.put(r)))
  await tx.done
}

export async function deleteCategoryRules(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDb()
  const tx = db.transaction('categoryRules', 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

export async function getAllCategories(): Promise<Category[]> {
  return (await getDb()).getAll('categories')
}

export async function putCategory(category: Category): Promise<void> {
  await (await getDb()).put('categories', category)
}

export async function getAllMasterLedgerEntries(): Promise<Transaction[]> {
  return (await getDb()).getAll('masterLedger')
}

export async function putMasterLedgerEntries(entries: Transaction[]): Promise<void> {
  if (entries.length === 0) return
  const db = await getDb()
  const tx = db.transaction('masterLedger', 'readwrite')
  await Promise.all(entries.map((e) => tx.store.put(e)))
  await tx.done
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const record = await (await getDb()).get('meta', key)
  return record?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('meta', { key, value })
}
