# BudgetLocal — Project Spec & Progress

A living handoff document for this project. Read this first in any fresh session to
get full context without re-deriving decisions already made. Update it whenever a
phase completes or a significant design decision is made.

## 1. Product overview

Privacy-first, 100%-browser-only budget categorization tool (see `PRD.pdf` at repo
root for the original spec). Core promise: **no user financial data ever leaves the
browser** — no backend, no remote API calls for processing/categorization/chat.
Ships as a static site on GitHub Pages.

**Single-page flow (as of Phase 3 — see §8):** upload statement CSVs (historical
or this month's, no distinction), get them auto-categorized using what's been
taught so far, correct mistakes inline. Every correction teaches the categorizer
immediately — there's no separate "training" step. Originally shipped as a
two-tab header ("Create Training Data" + "Categorize"); merged into one flow
after the two tabs turned out to be doing the same thing (§8 explains why, and
notes the resulting **deviation from PRD acceptance criterion #1**, which asked
for two header tabs).

A third PRD feature (chat popup with an "Audit my expenses" preloaded action) has
**not been built yet** — out of scope so far.

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Vite + React 19 + TypeScript | Real cross-component state (upload wizard, inline-editable tables, shared store across two tabs) — not worth hand-rolling in vanilla JS. |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, compiled — not the CDN the design mockup used) | Offline-safe; matches `offline-style.zip`'s design tokens (see `src/styles/index.css` `@theme` block). |
| State | Zustand (`src/store/useBudgetStore.ts`) | Single lightweight store, easy to sync with IndexedDB, no provider boilerplate. |
| Persistence | IndexedDB via `idb` wrapper — **not** localStorage | Statement data can be thousands of rows; localStorage's ~5MB sync string-only quota isn't viable. |
| CSV parsing | PapaParse | Handles real-world quoting/escaping; worker-thread parsing for large files. |
| Icons | `lucide-react` (SVG, tree-shakeable) | Replaces the mockup's Material Symbols Google Fonts dependency. |
| Fonts | `@fontsource/inter` (self-hosted WOFF2) | Replaces the mockup's Google Fonts CDN link — app has **zero runtime network requests** after first load, verified in Network tab. |
| Testing | Vitest | Pure-logic modules (categorization, clustering, column-guessing, dedup) are unit tested — 30 tests passing as of last verification. |
| Charts | Hand-rolled SVG (no charting library) | Matches the existing `CoverageRingCard` technique; `dataviz` skill's validated categorical palette used for the pie chart, run through its contrast/CVD validator script against this app's actual surface color. |

## 3. Data model & IndexedDB schema

DB name `budgetlocal`, current version **2** (`src/lib/db/schema.ts`). Upgrade
callback is version-gated (`if (oldVersion < 1)` / `if (oldVersion < 2)`) so it's
safe to keep bumping without breaking existing users.

```
transactions      { id, date(ISO), rawDescription, normalizedName, amount(int cents, signed),
                     category, categorySource('rule'|'heuristic'|'manual'|null),
                     bank, person, sourceFileId, sourceFileName, createdAt,
                     datasetType('training'|'categorize') }
                   indexes: normalizedName, category, sourceFileId, bank, person, date

sourceFiles       { id, fileName, bank, person, columnMapping, rowCount, importedAt }

categoryRules     { id, pattern, matchType('exact'|'contains'|'startsWith'),
                     category, source('user-labeled'|'seed-heuristic'),
                     confidence, createdAt, lastAppliedAt, timesApplied }

categories        { name, color, isBuiltIn, createdAt }

masterLedger      { ...same shape as transactions }   // added in schema v2

meta              { key, value }   // seedVersion, etc.
```

Important nuance: **`datasetType` has no data migration** — it's read with a
default (`t.datasetType ?? 'training'` in `repository.ts`'s `getAllTransactions`)
rather than backfilled, since adding an optional field needs no version bump.

**Post-merge (§8): `datasetType` is vestigial.** It's still on the `Transaction`
type and every row written gets the literal `'categorize'`, but nothing reads it
anymore — no selector or component filters by it. It was kept (rather than
migrated away) purely to avoid an unnecessary schema change; a browser that still
has old `'training'`-tagged rows from before the merge just sees them as
ordinary rows now, same as everything else.

`categoryRules` and `categories` are the durable "learned knowledge" — they
persist independent of whatever's currently in `transactions`, which is really
just the current working batch (see §8, `startNewBatch`).

## 4. Categorization engine (`src/lib/categorization/`)

- **`categorizationEngine.ts`** — `findMatchingRule(normalizedName, rules)`: exact
  match wins first; otherwise `contains`/`startsWith` rules are tried
  **most-specific (longest pattern) first** — so `"uber eats"→Takeout` beats the
  generic `"uber"→Transport"`. This is a *general precedence rule*, not a
  special case, so it auto-handles future sub-brand cases too.
  `categorizeTransaction`/`categorizeAll` take an optional
  `onRuleApplied?: (rule) => void` callback (backward-compatible — existing calls
  without it still work) used to tally rule usage; see §8 "rule usage tracking."
- **`clustering.ts`** — `computeTopUncategorizedClusters`: groups uncategorized
  rows by `normalizedName`, ranks by frequency desc (tie-break: most recent date),
  returns top N with sample rows for context.
- **`coverage.ts`** — `computeCoverage`, `COVERAGE_GOAL = 0.9`.
- **`seedData.ts`** — `SEED_VERSION` (currently **2**) gates a one-time reseed:
  when a browser's stored `meta.seedVersion` doesn't match, stale
  `source: 'seed-heuristic'` rules are deleted and replaced, and any transaction
  whose `categorySource === 'heuristic'` gets reset and recategorized (manual
  edits and user-labeled-rule matches are never touched). This exists because a
  real bug was found and fixed: editing `seedMerchantCategories.json` was
  silently masked by whatever a browser had already cached — see §8.
  `BUILT_IN_CATEGORIES` is **derived automatically** from the distinct categories
  present in `seedMerchantCategories.json` (plus `'Misc'`) rather than
  hand-maintained, specifically to prevent that class of drift bug recurring.
- **`src/data/seedMerchantCategories.json`** — curated merchant→category seed
  list, built partly from generic US merchants and partly (after user review)
  from real Canadian bank CSV formats (CIBC/TD) the user provided as test data —
  includes categories like `Transfers`, `Property tax`, `Home improvements`,
  `Insurance`, `Utility`, `Childcare`, `Mortgage`, `Restaurant`, `Amazon` that the
  user added/edited by hand. **This file is user-owned data — don't silently
  revert or "clean up" entries in it.**

## 5. CSV ingestion pipeline (`src/lib/csv/`)

1. **`parseCsvFile.ts`** — parses with `header: false` always (PapaParse), then
   `buildParsedCsv()` decides per-file whether row 0 is a real header
   (`looksLikeHeaderRow` in `columnMapping.ts`, normalizes punctuation before
   comparing against known alias words) or not. **This matters a lot**: real bank
   exports (CIBC, TD) ship with **no header row at all** — the naive
   `header: true` approach was tested against real data and found to silently
   eat the first transaction as a fake header. If no header, synthetic keys
   (`column_0`, `column_1`, ...) are used with human-readable `headerLabels`
   showing a sample value (`"Column 1 (e.g. \"2026-04-29\")"`) for the mapping UI.
2. **`columnMapping.ts`** — `detectColumnMapping()` does alias-based detection
   for real headers. `guessMappingFromContent()` is the **headerless fallback**:
   scores each column for date-likeness / amount-likeness, and — this is the
   nontrivial part — uses a **mutual-exclusivity check** to correctly identify a
   real debit/credit column *pair* (each row has exactly one of the two filled)
   versus an unrelated always-filled numeric column like a running balance.
   Verified against real CIBC-shaped (debit+credit) and TD-shaped
   (debit+credit+balance) layouts in `columnMapping.test.ts`.
3. **`filenameTagParser.ts`** — best-effort `name_bank_month.csv` convention
   parsing (e.g. `shruthi_chase_may.csv` → bank="Chase", person="Shruthi").
   Never blocks import if the filename doesn't match.
4. **`normalizeMerchantName.ts`** — shared normalization used both at ingestion
   and by clustering, so they never drift into different keys for the same
   merchant.
5. **`buildTransactions.ts`** — turns mapped rows into `Transaction` records
   (uncategorized), given a `datasetType`.
6. **Import flow is non-blocking** (`src/store/useBudgetStore.ts`,
   `drainUploadQueue`/`importParsedFile`): a file is parsed, auto-guessed, and
   **immediately imported and categorized** — there's no "confirm columns before
   import" gate. A dismissible `ImportReviewCard` shows the guess afterward;
   editing any field in it **live re-applies** against the same `sourceFileId`
   (deletes the stale rows, rebuilds, recategorizes, re-persists) rather than
   requiring a separate "confirm" step.

## 6. Export system (`src/lib/export/`)

- **`exportTransactionsCsv.ts`** — dataset-agnostic `downloadTransactionsCsv(transactions, filename)`.
  Canonical 7-column schema: `date, normalized_name, raw_description, amount, category, bank, person`
  (raw_description was added to the originally-6-column PRD schema per an
  explicit user request, for cross-checking against the original statement line).
- **`consolidation.ts`** — `transactionDedupKey(t)` = `date|normalizedName|amount|bank|person`
  (deliberately not the row's random `id`, since re-uploading the same file
  produces fresh ids). `mergeIntoLedger(ledger, incoming)` appends only
  genuinely-new rows, returns `{ merged, added, addedCount, skippedCount }`.

Two downloadable outputs exist post-merge (§8) and must not be confused:
- **`transactions.csv`** — the current working batch (everything in `transactions`
  right now), via "Download CSV."
- **`consolidated-transactions.csv`** — the **entire** `masterLedger` (all months
  ever appended, deduped), via "Consolidated Transactions."

## 7. Phase 1 + Phase 2 history (superseded by §8 — kept for context)

The app originally shipped as two header tabs, built in two phases. **Both tabs'
functionality still exists — it was merged into one page in Phase 3 (§8), not
removed.** This section is kept because it explains the origin of patterns still
in the code (e.g. why `datasetType` is on the `Transaction` type at all).

**Training tab (Phase 1)** — `OneTimeSetupBanner` → `CsvUploadPanel` →
`ImportReviewCard` → `StatsRow` → `CoverageGateBanner` (≥90% coverage) →
`TopUncategorizedQueue` (top-10 recurring uncategorized merchants, card grid,
each a `ClusterLabelCard` with a `CategoryDropdown`) → `ReviewTable` →
`DownloadTrainingCsvButton`. Labeling a cluster (`labelCluster` action) writes one
`categoryRules` entry and bulk-updates every matching uncategorized transaction
at once — dataset-agnostic on purpose, and still exactly how cluster labeling
works today.

**Categorize tab (Phase 2)** — the same components reused via a `datasetType:
'training' | 'categorize'` prop (`StatsRow`, `CoverageRingCard`,
`CoverageGateBanner`, `TopUncategorizedQueue`, `CsvUploadPanel`,
`ImportReviewCard`, `ReviewTable`), plus new ones: `CategoryPieChart`,
multi-select bulk edit on `ReviewTable`, an "Update Training Data" action that
swept manual corrections into `categoryRules` *and* the training dataset, a
"Consolidated Transactions" master-ledger action, and a "Start a new month"
batch-clear action. Rule usage tracking (`timesApplied`/`lastAppliedAt`) was
added here too.

**A real bug was caught and fixed during the Phase 2 reuse pass**: `lastImport`
(the review-card state) was global in the store — without a check, switching
tabs without dismissing the card would show the *other* tab's review card. Fixed
by gating on `lastImport.datasetType === datasetType` at the time; superseded by
the `recentImports` array design in §8's post-launch fixes.

### What Phase 1/2 built (still true today, just no longer tab-scoped)

- **`CategoryPieChart.tsx`** — hand-rolled SVG donut (stacked `<circle>` elements
  with `stroke-dasharray`/`stroke-dashoffset`, same technique as
  `CoverageRingCard`). Groups the batch by category, sums `Math.abs(amount)`.
  Interactive legend: each category has a checkbox that includes/excludes it from
  both the chart and the running total (local component state, **not persisted**
  — a documented, deliberate scope cut). **Color is assigned by category
  identity from the full unfiltered category list, not by current sort rank** —
  toggling a category never repaints the others' colors, per the dataviz skill's
  "color follows the entity, never its rank" rule. Caps at 8 color slots; a 9th+
  category (by total amount) folds into a merged "Other" arc, while still being
  individually listed/toggleable in the legend (tagged "· in Other"). Colors are
  the dataviz skill's reference categorical palette, validated with
  `scripts/validate_palette.js` against this app's actual white card surface
  before use.
- **Multi-select bulk edit** — `ReviewTable`'s new `selectable` prop adds a
  checkbox column + a "N selected" action bar with a `CategoryDropdown` that
  applies to every selected row via the new `editTransactionCategories(ids, category)`
  store action (bulk sibling of the existing single-row `editTransactionCategory`).
- **"Update Training Data"** (`updateTrainingDataFromCategorized` action,
  **removed in Phase 3, §8** — every manual correction now upserts a rule
  immediately via `upsertUserRule`, so this became redundant) — swept every
  Categorize-tab transaction with `categorySource === 'manual'` and upserted a
  `categoryRules` entry + a training-dataset row for each.
- **"Consolidated Transactions"** (`consolidateAndDownload` action, still exists,
  now merges *all* current transactions rather than just `datasetType ===
  'categorize'` ones) — the user explicitly chose an **in-app IndexedDB ledger
  over a real File System Access API file** (works in every browser, not just
  Chrome/Edge). One click does both append-with-dedup (via `mergeIntoLedger`)
  and download-the-full-ledger. Verified live: clicking twice on the same batch
  correctly reports "41 new" then "0 new (41 already there)."
- **"Start a new month"** (`clearCategorizeBatch` action, renamed `startNewBatch`
  in Phase 3, §8 — now clears *all* current transactions, not just
  `datasetType === 'categorize'` ones) — deletes the current batch's
  transactions + their `sourceFiles` records so starting fresh next month is a
  clean slate. Gated behind a `window.confirm()` in the component since it's
  destructive to unsaved-batch data.
- **Rule usage tracking** — `timesApplied`/`lastAppliedAt` on `CategoryRule` now
  actually get bumped (`applyRuleUsage()` helper in `useBudgetStore.ts`, fed by
  the `onRuleApplied` callback threaded through every `categorizeAll()` call).
  **The prune UI itself was explicitly deferred** — still true post-merge, no
  "Manage Rules" screen exists yet (see §12).
- **CSV export split** (**collapsed back into one export in Phase 3, §8**, since
  there's only one dataset now) — `exportTrainingCsv()` and
  `exportCategorizedCsv()` were briefly separate store actions to avoid leaking
  Categorize-tab rows into the Training CSV.

### Post-launch fixes (user feedback pass, pre-merge)

- **Pie chart "Other" promotion** — unchecking a category in the legend now
  recomputes the individual-vs-Other split against the *currently visible*
  categories, so the highest-ranked category still in "Other" gets promoted
  to its own slice once a slot frees up (and demoted back if the excluded
  category is re-checked). Colors are assigned per category identity and
  persisted in a `useRef` map across renders — a category keeps its own color
  as long as it stays individually shown, so promoting/demoting others never
  repaints it. This required moving off the previous "color follows
  full-list rank" scheme (§7 above), which couldn't support promotion without
  visually reshuffling every other visible slice.
- **Income vs. expenses** — new `IncomeExpenseSummary.tsx`, sitting next to
  the pie chart. Sums all of the batch's transactions (not just categorized
  ones) by amount sign — positive/credit = income, negative/debit = expense
  (see `extractAmount` in `columnMapping.ts`) — shown as two bars plus a net
  surplus/deficit line.
- **Multi-file import review** — `lastImport` (single object) became
  `recentImports: ImportedFileReview[]` in the store, so uploading a batch of
  files shows one editable review card per file instead of only the most
  recently processed one clobbering the rest. `updateLastImportMapping` /
  `updateLastImportTags` / `dismissLastImport` were renamed to take a
  `sourceFileId` (`updateImportMapping`, `updateImportTags`, `dismissImport`)
  so each card acts on its own file.

## 8. Single-page merge (Phase 3 — complete, verified)

**Why**: with §7's "Update Training Data" flow already teaching the categorizer
automatically from Categorize-tab corrections, and a merchant seed list that
will cover most common Canadian merchants out of the box (`seedMerchantCategories.json`,
§4 — a fuller Canadian list is expected to be supplied later), the Training
tab's one job — bulk-teach before you start categorizing — stopped pulling its
weight. The two tabs were doing the same thing through two different doors.
User confirmed via explicit choice: merge into one page rather than keep the
tabs or reframe Training as optional.

**This is a deliberate deviation from PRD acceptance criterion #1** (two header
tabs) — flagged to the user before implementing, since it reverses a documented
requirement rather than just refactoring internals.

### What changed

- **`src/shell/HeaderTabs.tsx` deleted; `AppShell.tsx` renders one page** —
  `src/features/budget/MainPage.tsx` (renamed from `CategorizeTabPage.tsx`).
  No more tab state.
- **Every `datasetType`-parameterized component and selector dropped the
  parameter** — `StatsRow`, `CoverageRingCard`, `CoverageGateBanner`,
  `TopUncategorizedQueue`, `CsvUploadPanel`, `ImportReviewCard`, `ReviewTable`,
  `CategoryPieChart`, `IncomeExpenseSummary`, and every `selectors.ts` hook now
  just read `state.transactions` directly. `useDatasetTransactions` was deleted
  (its callers switched to reading `state.transactions` straight from the
  store).
- **Folder rename to match**: `features/training/` → `features/shared/` (its
  components are shared building blocks now, not Training-tab-specific);
  `features/categorize/` → `features/budget/`, containing `MainPage.tsx`,
  `CategoryPieChart.tsx`, `IncomeExpenseSummary.tsx`, and `ActionsBar.tsx`
  (renamed from `CategorizeActionsBar.tsx`). `TrainingTabPage.tsx` and
  `DownloadTrainingCsvButton.tsx` were deleted outright (no longer needed).
- **Auto-teach on every manual correction** — the actual functional heart of
  this phase. `editTransactionCategory` and `editTransactionCategories` (single
  and bulk row edits in `ReviewTable`) now call a new shared `upsertUserRule()`
  helper and immediately create/update a `categoryRules` entry, exactly like
  `labelCluster` already did for cluster labeling. Previously, a plain
  dropdown edit only updated that one transaction — a correction had **no**
  effect on future imports until the user separately clicked "Update Training
  Data." Now every correction — single edit, bulk edit, or cluster label —
  teaches the categorizer the moment it happens, with no separate step.
  Verified live: editing one row's category immediately writes a
  `source: 'user-labeled'` rule to IndexedDB (checked directly against the
  `categoryRules` object store).
- **`transactions` is now just "the current working batch"** — `startNewBatch`
  (renamed from `clearCategorizeBatch`) clears *all* current transactions, not
  a `datasetType`-filtered subset, since there's no longer a permanent
  "training" bucket living alongside it. The durable memory is `categoryRules`
  (grows forever, survives batch-clearing) and `masterLedger` (the
  append-only historical record via "Save to All-Time History," renamed from
  "Consolidated Transactions" in the copy pass below) — not the `transactions`
  store itself. **Known side effect**: pre-merge browsers with
  old `datasetType: 'training'` rows now see those rows folded into the same
  working view as everything else (and subject to "Start a new month"
  clearing) — a one-time, harmless consequence of unifying the concept, not a
  bug.
- **Exports collapsed to one**: `exportCsv()` (renamed from
  `exportCategorizedCsv`) downloads `transactions.csv` — everything in the
  current batch, no dataset filter. `exportTrainingCsv` and
  `updateTrainingDataFromCategorized` were deleted.
- **`OneTimeSetupBanner`** — kept, copy rewritten (no longer says "one-time
  setup step" tied to a separate tab), now shown on `MainPage` only when
  `totalDatapoints === 0` (first run) instead of unconditionally on a
  dedicated tab.
- **`ReviewTable`'s `selectable` prop removed** — multi-select bulk edit is
  always on now; there was never a second, non-selectable usage site once the
  tabs merged.

### Phase 4: copy pass, income/transfer/investment split, report sidebar

**Copy pass** — every user-facing string was audited for ML/dev jargon a
non-technical user wouldn't recognize and reworded. Notable renames: "Total
Datapoints" → "Transactions," "Coverage" → "Categorized," "Requires Label" →
"Needs a Category," "Download CSV" → "Download Transactions," "Consolidated
Transactions" → "Save to All-Time History" (was a noun phrase that didn't
read as an action — new label describes what clicking it actually does).
"Label"/"labeling" language throughout (banner, recurring-merchant section)
became "categorize"/"categorizing." **`BudgetLocal` itself and "Local-only"
were deliberately kept** — the name carries the privacy positioning that's
the app's core differentiator, and a generic rename would lose that signal.

**Income/expense/transfer/investment split** — previously income vs. expenses
was computed purely from amount sign (positive = income, negative = expense),
which meant moving money between your own accounts, or into an investment
account, inflated both sides. Fixed by giving every `Category` a `kind:
'income' | 'expense' | 'transfer' | 'investment'` field (`types/models.ts`):
- `inferCategoryKind()` (`seedData.ts`) assigns the default by name — `Income`
  → income, `Transfers` → transfer, `Investments` → investment, everything
  else → expense — used both to seed `buildSeedCategories()` and as a
  read-time fallback in `repository.ts#getAllCategories` for categories
  persisted before `kind` existed (same no-migration pattern as
  `datasetType`/§3).
- `computeIncomeExpenseBreakdown()` (`lib/categorization/incomeExpense.ts`,
  +`.test.ts`) buckets transactions by their category's `kind`; an
  uncategorized transaction (or one whose category has no recognized kind)
  falls back to the amount-sign heuristic, preserving old behavior for the
  unclassified case.
- **`CategoryKindEditor.tsx`** (new, in `IncomeExpenseSummary`) — a
  collapsed-by-default list of every category with a kind dropdown, so a user
  can reclassify e.g. "Rent Payment" as a Transfer instead of an Expense.
  Verified live: reclassifying "Shopping" as Transfer moved its dollar amount
  out of the Expenses bar and into the Transfers bar immediately, no reload.
- `IncomeExpenseSummary` now renders up to 4 bars (Income, Expenses, always
  shown; Transfers, Investments, shown only when their total is > 0) plus Net
  (Income − Expenses only — transfers/investments are deliberately excluded
  from Net, since they're not spending).

**Report sidebar** — `CategoryPieChart` and `IncomeExpenseSummary` moved out
of the main column into a new `ReportSidebar.tsx` (`lg:w-[360px]`, stacks
below the main column under the `lg` breakpoint) to declutter the main
upload → review → export flow. `CategoryPieChart`'s internal layout changed
from a side-by-side `md:flex-row` chart+legend to always-stacked
(chart-on-top, single-column legend list) since it now lives in a narrow
column rather than full-width main content.

### Phase 5: personalized rules backup/restore

**Why**: user-labeled `categoryRules` already persist indefinitely in
IndexedDB — closing/reopening the browser doesn't lose them, so "does the
system get better over time" was already true. The actual gap (confirmed
with the user before building this) was **portability**: rules live in one
browser only, with no way to back them up or carry them to a new browser or
machine. A literal "auto-write a file when the browser session closes" isn't
implementable client-side (no reliable unload-time file-write hook, and the
File System Access API is Chrome/Edge-only — the same reason the master
ledger uses IndexedDB instead of it, §9). So this is **user-triggered
export/import**, not automatic background writing.

- **`lib/categorization/personalizedRules.ts`** (+`.test.ts`) —
  `exportPersonalizedRules(categoryRules)` filters to `source: 'user-labeled'`
  and strips internal metadata (confidence/timesApplied/createdAt/etc. are
  usage stats, not portable teaching data), producing the **same shape as
  `seedMerchantCategories.json`** (`{ pattern, matchType, category }[]`) —
  deliberately, so it's a directly comparable personal counterpart to the
  master list, not a different format. `parsePersonalizedRules(json)`
  validates on import and **silently drops malformed entries** rather than
  failing the whole file — a hand-edit typo in one row shouldn't lose every
  other rule.
- **`downloadJson()`** (`lib/export/downloadJson.ts`) — generic JSON-blob
  download, sibling to the existing `downloadTransactionsCsv`.
- **Store**: `exportRules()` downloads
  `personalized-merchant-categories.json`. `importRules(file)` upserts by
  `matchType:pattern` key (update-in-place if a rule for that exact
  pattern+matchType already exists, else create), persists to IndexedDB, and
  **re-runs categorization for any currently-uncategorized transaction**
  against the updated rule set (same reseed pattern as `loadInitialData` —
  `categorizeTransaction` is a no-op for already-categorized rows, so this
  only fills gaps, never overwrites an existing categorization).
- **`importRules` returns a result** (`{ importedCount } | { error }`)
  instead of writing to the store's shared `uploadError`/`actionMessage`
  fields. **A real bug was caught during verification**: those fields are
  also read by `ActionsBar` and `CsvUploadPanel` — an early version set them
  from `importRules`, and a "rules imported" message leaked into the
  unrelated `ActionsBar` (visible under "Save to All-Time History"). Fixed
  by having `RulesBackupCard` keep its own local feedback state instead.
- **`RulesBackupCard.tsx`** (new, in `ReportSidebar`) — shows a count of
  learned rules, "Download"/"Restore" buttons (Download disabled at zero
  rules), a hidden file input for restore. Verified live: importing a file
  with one new pattern and one pattern matching an existing rule correctly
  upserted (count went from 3 → 4, not 3 → 5), and the existing rule's
  category updated in place rather than creating a duplicate.

### Phase 6: quick-pick category chips on merchant labeling

`ClusterLabelCard.tsx` (the per-merchant card in "Categorize your most common
merchants") now shows a row of one-click category chips above the full
`CategoryDropdown`, so the common case doesn't need opening the dropdown at
all. Clicking a chip calls the same `handleApply`/`labelCluster` path as
picking from the dropdown — no new store logic needed.

**Went through two designs before landing on the final one.** First pass was
data-driven: a new `computeTopCategories()` (`lib/categorization/
topCategories.ts`, +tests) ranked categories by how often they're actually
used across the user's transactions, surfaced via a `useTopCategories`
selector. Verified live (uploaded a test merchant, confirmed the top-5 chips
matched real usage frequency, one click correctly bulk-categorized all
matching rows). **The user then asked for a fixed set instead**: Restaurant,
Groceries, Travel, Shopping, always in that order, not usage-ranked. Swapped
to a `QUICK_PICK_CATEGORIES` constant local to `ClusterLabelCard.tsx`,
filtered against the actual `categories` list (so a chip never shows for a
category that doesn't exist in a given setup) — and **removed `topCategories.ts`,
its test file, and the `useTopCategories` selector entirely** rather than
leaving the now-unused data-driven version in the codebase as dead code.

## 9. Key design decisions & rationale (quick-reference)

| Decision | Why |
|---|---|
| **Single-page flow, not the PRD's two header tabs** (§8) | The two tabs converged on doing the same job once corrections auto-taught the categorizer and a merchant seed list existed — kept as two doors into one room only added confusion. User confirmed explicitly; documented here as an intentional PRD deviation, not an oversight. |
| Header (not the mockup's sidebar), even after the tab merge | Mockup's visual language (colors/shapes/shadows) was kept, layout wasn't — this survived the single-page merge even though there's nothing to switch between anymore. |
| Every manual correction auto-teaches a rule (§8) | Point of the single-page merge: "taught to the categorizer as part of categorization," not a separate step. Single/bulk edits now go through the same `upsertUserRule` mechanism cluster-labeling always used. |
| Category `kind` (income/expense/transfer/investment) is per-category, not per-transaction (§8 Phase 4) | User's explicit ask: classify by category, reclassifying "Transfers" once should fix every transaction in it, not require relabeling each row. |
| Transfers/investments excluded from Net, shown as their own report bars (§8 Phase 4) | User's explicit ask: moving your own money between accounts (or into investments) isn't income or spending — counting it as either inflates both sides of the report. |
| `BudgetLocal` app name kept as-is through the copy pass (§8 Phase 4) | It's already plain and it's carrying the privacy positioning ("Local") that's the app's core differentiator — a generic-sounding rename would lose that signal. |
| Personalized rules export/import is user-triggered, not an automatic background file write (§8 Phase 5) | A page can't reliably write a file on browser-close with no backend; the only client-side file-write API (File System Access) is Chrome/Edge-only, which the app already ruled out once for the master ledger. |
| Personalized rules file mirrors `seedMerchantCategories.json`'s exact shape (§8 Phase 5) | Makes it a directly comparable personal counterpart to the master list — same `{pattern, matchType, category}` fields, no separate format to learn or reconcile. |
| Quick-pick category chips are a fixed list, not usage-ranked (§8 Phase 6) | User's explicit ask, after trying the data-driven version — a predictable, always-the-same-order set of chips beat a personalized-but-shifting one for this use case. |
| Self-hosted fonts/icons | Mockup used Google Fonts/Material Symbols CDN — conflicts with "offline after first load." |
| IndexedDB over localStorage | Thousands of rows; localStorage's sync string-only 5MB quota isn't viable. |
| 7-column export (raw_description added) | Explicit user request, deviates from PRD's stated 6 columns, for cross-checking exported rows against the original statement text. |
| Longest-match-wins rule precedence | User's explicit ask: "uber eats" must resolve differently than "uber." General rule, not hardcoded per-merchant. |
| Non-blocking import + editable review card | User's explicit ask: "do not ask 'Confirm columns', auto guess, provide a way to modify if wrong." |
| `BUILT_IN_CATEGORIES` derived, not hand-listed | Root-caused an actual reported bug ("why is Amazon categorized as Bills?") back to stale cached seed data + a categories list that could drift from the JSON file it was meant to mirror. |
| `SEED_VERSION` reseed mechanism | Same root cause as above — editing the seed JSON silently did nothing for browsers that already seeded, since seeding only ran once. |
| Master ledger = IndexedDB, not File System Access API | User's explicit choice — universal browser support over Chrome/Edge-only real file-append. |
| Pie chart color-by-identity, not sort-rank | dataviz skill non-negotiable: "a filter that changes the series count must not repaint the survivors." |
| `datasetType` field over separate IndexedDB stores (now vestigial, §3/§8) | Originally kept `categoryRules`/`categories` trivially shared while letting selectors scope `transactions` per tab; kept as a dead field post-merge rather than a schema migration, since nothing reads it anymore. |
| `testdata/` gitignored, never committed | Contains the user's and their partner's real bank statements (CIBC/TD/Wealthsimple) — committing real financial data to GitHub would contradict the app's entire privacy premise. |

## 10. File manifest

```
src/
├── App.tsx, main.tsx
├── shell/
│   └── AppShell.tsx          header (no tabs), loadInitialData on mount, renders MainPage
├── components/
│   └── CategoryDropdown.tsx  shared: existing categories + "Other"(free text) + "Misc"
├── features/shared/          building blocks used by MainPage (post-merge, §8 —
│   │                         formerly features/training/, no longer tab-specific)
│   ├── OneTimeSetupBanner.tsx      shown on MainPage only when totalDatapoints === 0
│   ├── CsvUploadPanel.tsx
│   ├── ImportReviewCard.tsx        renders one card per src/store/useBudgetStore.ts recentImports entry
│   ├── StatsRow.tsx
│   ├── CoverageRingCard.tsx
│   ├── CoverageGateBanner.tsx
│   ├── TopUncategorizedQueue.tsx
│   ├── ClusterLabelCard.tsx        fixed quick-pick chips: Restaurant/Groceries/Travel/Shopping (§8 Phase 6)
│   └── ReviewTable.tsx             multi-select always on (no more selectable prop)
├── features/budget/           (formerly features/categorize/)
│   ├── MainPage.tsx                the whole app's single page (formerly CategorizeTabPage.tsx)
│   ├── ReportSidebar.tsx            §8 Phase 4: pie chart + income/expense report, right column
│   ├── CategoryPieChart.tsx         Other-promotion logic (§8), always-stacked layout (§8 Phase 4)
│   ├── IncomeExpenseSummary.tsx     4 bars: Income/Expenses/Transfers/Investments + Net (§8 Phase 4)
│   ├── CategoryKindEditor.tsx       §8 Phase 4: per-category income/expense/transfer/investment picker
│   ├── RulesBackupCard.tsx          §8 Phase 5: export/import personalized-rules JSON, local feedback state
│   └── ActionsBar.tsx               formerly CategorizeActionsBar.tsx
├── lib/csv/
│   ├── parseCsvFile.ts, columnMapping.ts (+.test), buildTransactions.ts
│   ├── normalizeMerchantName.ts, parseDate.ts, filenameTagParser.ts
├── lib/categorization/
│   ├── categorizationEngine.ts (+.test), clustering.ts (+.test), coverage.ts, seedData.ts
│   ├── incomeExpense.ts (+.test)    §8 Phase 4: computeIncomeExpenseBreakdown
│   ├── personalizedRules.ts (+.test) §8 Phase 5: export/parse personalized-rules JSON
├── lib/db/
│   ├── schema.ts (idb schema, v2), repository.ts (CRUD)
├── lib/export/
│   ├── exportTransactionsCsv.ts, consolidation.ts (+.test), downloadJson.ts (§8 Phase 5)
├── data/seedMerchantCategories.json   user-curated, don't silently edit
├── store/
│   ├── useBudgetStore.ts     central Zustand store, all actions
│   └── selectors.ts          derived-state hooks, no datasetType param (§8)
├── styles/index.css          Tailwind v4 @theme tokens from DESIGN.md
└── types/models.ts           Transaction, CategoryRule, Category, SourceFile, DatasetType,
                               CategoryKind (§8 Phase 4)
                               (DatasetType still exists but is vestigial, see §3/§8)

.github/workflows/deploy.yml  build+test+deploy to GitHub Pages (Actions must be
                               set as the Pages source in repo Settings — one-time
                               manual step, not automatable)
testdata/                     gitignored — real personal bank CSVs, local-only
```

## 11. Current repo/git state

- Branch: `feat/categorize-tab`, **pushed** — `origin/feat/categorize-tab` is
  up to date with local (`b71971f` at the tip). Full commit list since
  `main`: `51d4231` (Training tab), `bdf10a3` (Categorize tab), `b83d9a8`
  (pie chart Other-promotion / income vs. expenses / multi-file import
  review — §8 "Post-launch fixes"), `b709ebd` (single-page merge — §8),
  `a231f7f` (copy pass + income/expense/transfer/investment split + report
  sidebar — §8 Phase 4), `b71971f` (rules backup/restore + quick-pick chips
  — §8 Phases 5–6).
- **PR not yet created** — `gh` CLI isn't installed on this machine and
  Claude in Chrome wasn't connected in-session (extension not reachable), so
  it couldn't be created programmatically this round; the user needs to open
  it from the pushed branch. Note `feat/training-tab`'s underlying tab UI no
  longer exists on `feat/categorize-tab` post-merge (§8) — reconcile
  deliberately if both branches are ever merged to `main`, not by accident.
- `npm run test` (30 tests) and `npm run build` both passing as of last check.
- Local dev: `cd /Users/shruthinayak/Documents/offline-budget-tracker && npm run dev`
  → `http://localhost:5173/offline-budget-tracker/` (note the base path). nvm was
  installed this session (`~/.nvm`, appended to `~/.zshrc`) since this machine had
  no Node originally — a fresh terminal should have it on `PATH` automatically.
- GitHub Pages is **not yet live** — needs commit → push → merge, plus a one-time
  manual "Settings → Pages → Source = GitHub Actions" toggle only the user can do.

## 12. Known gaps & deferred work

- **Chat popup** (PRD feature C) — not started at all.
- **Rule-pruning UI** — usage counts are tracked (`timesApplied`/`lastAppliedAt`)
  but there's no "Manage Rules" screen to view/prune low-usage ones yet (user
  explicitly deferred this).
- **Pie chart exclusion state isn't persisted** — resets on reload (documented
  scope cut, easy follow-up if wanted).
- **Wealthsimple-format CSVs aren't really supported** — their real export has no
  free-text description column at all (`activity_type`/`activity_sub_type` codes
  like `MoneyMovement`/`AFT_OUT` instead), which the current column-mapping model
  (date/description/amount-or-debit-credit) doesn't fit. Noticed during real-data
  testing, never addressed — would need its own ingestion path.
- **"Google PAY" style ambiguous descriptions** — deliberately left uncategorized
  rather than guessed; nothing to fix, just a reminder this is expected/normal.

## 13. How to resume in a fresh session

1. Read this file first.
2. Check `git status` / `git log` / `gh pr view` (or the GitHub UI) to see if
   anything changed since §11 was last updated.
3. The architecture plan file (Claude Code's own plan-mode artifact, separate
   from this doc) is at `/Users/shruthinayak/.claude/plans/stateful-plotting-flute.md`
   if deeper phase-by-phase planning rationale is needed — this SPEC.md is the
   more complete, durable reference going forward, though.
4. Branch/PR strategy is resolved (§11) — `feat/categorize-tab` is committed and
   pushed. Check GitHub directly for PR/merge status, since local tools can't see it.
5. If starting something new, update §12 and add a new phase section above it
   following the existing format, then update §11's git-state section once
   committed/pushed.
