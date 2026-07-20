# BudgetLocal — Project Spec & Progress

A living handoff document for this project. Read this first in any fresh session to
get full context without re-deriving decisions already made. Update it whenever a
phase completes or a significant design decision is made.

## 1. Product overview

Privacy-first, 100%-browser-only budget categorization tool (see `PRD.pdf` at repo
root for the original spec). Core promise: **no user financial data ever leaves the
browser** — no backend, no remote API calls for processing/categorization/chat.
Ships as a static site on GitHub Pages.

Two-tab header UI:
- **Create Training Data** — one-time(ish) bulk upload of historical statements to
  teach the categorizer.
- **Categorize** — recurring (monthly) flow: upload new statements, get them
  auto-categorized using what's been taught, correct mistakes, export.

A third PRD feature (chat popup with an "Audit my expenses" preloaded action) has
**not been built yet** — out of scope for both phases so far.

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
| Testing | Vitest | Pure-logic modules (categorization, clustering, column-guessing, dedup) are unit tested — 19 tests passing as of last verification. |
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

`categoryRules` and `categories` are **shared** between both tabs by design — the
whole point of the Training tab is to seed rules the Categorize tab then uses (and
vice versa: corrections made in Categorize can feed back into training data).
`transactions` is a single IndexedDB store holding **both** tabs' rows,
distinguished by `datasetType`; the two tabs never see each other's rows because
every selector/component that reads transactions is parameterized by
`datasetType` (see §4 in the codebase, `src/store/selectors.ts`).

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

Two separate downloadable outputs exist and must not be confused:
- **`training-data.csv`** — the Training tab's data (`datasetType === 'training'`),
  re-downloadable any time via "Download Training CSV," and also re-triggered by
  "Update Training Data" (see §7).
- **`categorized-transactions.csv`** — one Categorize-tab batch
  (`datasetType === 'categorize'`), via "Download Categorized CSV."
- **`consolidated-transactions.csv`** — the **entire** `masterLedger` (all months
  ever appended), via "Consolidated Transactions" (see §7).

## 7. Training tab (Phase 1 — complete, verified)

`src/features/training/TrainingTabPage.tsx` composes:
`OneTimeSetupBanner` → `CsvUploadPanel` → `ImportReviewCard` → `StatsRow`
(total/coverage-ring/remaining) → `CoverageGateBanner` (shown at ≥90% coverage)
→ `TopUncategorizedQueue` (top-10 recurring uncategorized merchants, card grid,
each a `ClusterLabelCard` with a `CategoryDropdown`) → `ReviewTable` (all rows,
searchable/filterable) → `DownloadTrainingCsvButton`.

Labeling a cluster (`labelCluster` action) writes one `categoryRules` entry and
bulk-updates every matching uncategorized transaction at once — this is
**dataset-agnostic on purpose**: a merchant label is true regardless of which tab
surfaced it, so it can affect rows in either dataset.

## 8. Categorize tab (Phase 2 — complete, verified against real data)

`src/features/categorize/CategorizeTabPage.tsx` composes (mostly **reused**
Training-tab components, now parameterized by a `datasetType` prop — see below):
`CsvUploadPanel(datasetType="categorize")` → `ImportReviewCard` → `StatsRow` →
`CategoryPieChart` (new) → `CoverageGateBanner` → `TopUncategorizedQueue` →
`ReviewTable(selectable)` (new: multi-select) → `CategorizeActionsBar` (new).

### Reuse strategy (why so few new files)
Most Training-tab components got a `datasetType: 'training' | 'categorize'` prop
instead of being duplicated: `StatsRow`, `CoverageRingCard`, `CoverageGateBanner`,
`TopUncategorizedQueue`, `CsvUploadPanel`, `ImportReviewCard`, `ReviewTable`. Their
underlying selector hooks (`src/store/selectors.ts`: `useCoverage`,
`useTopUncategorizedClusters`, `useRemainingUncategorizedCount`,
`useTotalDatapoints`, `useDatasetTransactions`) all take the same parameter and
filter `state.transactions` by it.

**A real bug was caught and fixed during this reuse pass**: `lastImport` (the
review-card state) is global in the store — without a check, switching from
Training to Categorize (or vice versa) without dismissing the card would show the
*other* tab's review card. Fixed by gating `ImportReviewCard` on
`lastImport.datasetType === datasetType`.

**`ReviewTable`** was also changed to own its filter state locally (`useState`)
instead of a global `reviewTableFilters` store slice — that slice was removed
entirely, since there's no reason a search box's text should survive a tab switch.

### New in this phase

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
- **"Update Training Data"** (`updateTrainingDataFromCategorized` action) —
  sweeps every Categorize-tab transaction with `categorySource === 'manual'`
  (covers dropdown edits, bulk edits, *and* cluster-labeling — all three already
  set that field) and for each: upserts an exact-match `categoryRules` entry
  (same mechanism `labelCluster` uses) **and** upserts a matching row into the
  `'training'`-dataset transactions (update-by-`normalizedName` if one exists,
  else add), then re-downloads `training-data.csv` with the merged set — so the
  correction is reflected in the rule engine immediately *and* in the portable
  exported file, not just in-memory state.
- **"Consolidated Transactions"** (`consolidateAndDownload` action) — the user
  explicitly chose an **in-app IndexedDB ledger over a real File System Access
  API file** (works in every browser, not just Chrome/Edge). One click does both
  append-with-dedup (via `mergeIntoLedger`) and download-the-full-ledger. Verified
  live: clicking twice on the same batch correctly reports "41 new" then "0 new
  (41 already there)."
- **"Start a new month"** (`clearCategorizeBatch` action) — deletes the current
  batch's `datasetType === 'categorize'` transactions + their `sourceFiles`
  records (both from IndexedDB and in-memory state) so re-opening the tab starts
  fresh. Gated behind a `window.confirm()` in the component (not the store
  action) since it's destructive to unsaved-batch data.
- **Rule usage tracking** — `timesApplied`/`lastAppliedAt` on `CategoryRule` now
  actually get bumped (`applyRuleUsage()` helper in `useBudgetStore.ts`, fed by
  the `onRuleApplied` callback threaded through every `categorizeAll()` call in
  both tabs' import flows and the reseed-recompute path). **The prune UI itself
  was explicitly deferred** — the user only asked for counting this phase, no
  "Manage Rules" screen exists yet.
- **CSV export split** — `exportTrainingCsv()` and `exportCategorizedCsv()` are
  now separate store actions, each filtering by `datasetType` before calling
  `downloadTransactionsCsv`. Before this fix, one shared `exportTrainingCsv`
  action would have leaked Categorize-tab rows into the Training CSV once
  `datasetType` existed — caught and fixed proactively, then verified live
  (Training tab's export contained exactly 2 rows — only the ones mirrored in via
  "Update Training Data" — not all 41 Categorize-tab rows).

### Post-launch fixes (user feedback pass)

- **Pie chart "Other" promotion** — unchecking a category in the legend now
  recomputes the individual-vs-Other split against the *currently visible*
  categories, so the highest-ranked category still in "Other" gets promoted
  to its own slice once a slot frees up (and demoted back if the excluded
  category is re-checked). Colors are assigned per category identity and
  persisted in a `useRef` map across renders — a category keeps its own color
  as long as it stays individually shown, so promoting/demoting others never
  repaints it. This required moving off the previous "color follows
  full-list rank" scheme (§8 above), which couldn't support promotion without
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

## 9. Key design decisions & rationale (quick-reference)

| Decision | Why |
|---|---|
| Two-tab **header**, not the mockup's sidebar | PRD acceptance criterion #1 explicitly requires header tabs; mockup's visual language (colors/shapes/shadows) was kept, layout wasn't. |
| Self-hosted fonts/icons | Mockup used Google Fonts/Material Symbols CDN — conflicts with "offline after first load." |
| IndexedDB over localStorage | Thousands of rows; localStorage's sync string-only 5MB quota isn't viable. |
| 7-column export (raw_description added) | Explicit user request, deviates from PRD's stated 6 columns, for cross-checking exported rows against the original statement text. |
| Longest-match-wins rule precedence | User's explicit ask: "uber eats" must resolve differently than "uber." General rule, not hardcoded per-merchant. |
| Non-blocking import + editable review card | User's explicit ask: "do not ask 'Confirm columns', auto guess, provide a way to modify if wrong." |
| `BUILT_IN_CATEGORIES` derived, not hand-listed | Root-caused an actual reported bug ("why is Amazon categorized as Bills?") back to stale cached seed data + a categories list that could drift from the JSON file it was meant to mirror. |
| `SEED_VERSION` reseed mechanism | Same root cause as above — editing the seed JSON silently did nothing for browsers that already seeded, since seeding only ran once. |
| Master ledger = IndexedDB, not File System Access API | User's explicit choice — universal browser support over Chrome/Edge-only real file-append. |
| Pie chart color-by-identity, not sort-rank | dataviz skill non-negotiable: "a filter that changes the series count must not repaint the survivors." |
| `datasetType` field over separate IndexedDB stores | Keeps `categoryRules`/`categories` trivially shared while still letting every selector cleanly scope `transactions` per tab. |
| `testdata/` gitignored, never committed | Contains the user's and their partner's real bank statements (CIBC/TD/Wealthsimple) — committing real financial data to GitHub would contradict the app's entire privacy premise. |

## 10. File manifest

```
src/
├── App.tsx, main.tsx
├── shell/
│   ├── AppShell.tsx          top header, tab state, loadInitialData on mount
│   └── HeaderTabs.tsx
├── components/
│   └── CategoryDropdown.tsx  shared: existing categories + "Other"(free text) + "Misc"
├── features/training/        (mostly reused by Categorize via datasetType prop)
│   ├── TrainingTabPage.tsx
│   ├── OneTimeSetupBanner.tsx        Training-only, not reused
│   ├── CsvUploadPanel.tsx            datasetType prop
│   ├── ImportReviewCard.tsx          datasetType prop (gates on lastImport.datasetType)
│   ├── StatsRow.tsx                  datasetType prop
│   ├── CoverageRingCard.tsx          datasetType prop
│   ├── CoverageGateBanner.tsx        datasetType prop, CTA text/action varies
│   ├── TopUncategorizedQueue.tsx     datasetType prop
│   ├── ClusterLabelCard.tsx          dataset-agnostic (labelCluster affects both)
│   ├── ReviewTable.tsx               datasetType + selectable props
│   └── DownloadTrainingCsvButton.tsx Training-only
├── features/categorize/
│   ├── CategorizeTabPage.tsx
│   ├── CategoryPieChart.tsx
│   └── CategorizeActionsBar.tsx
├── lib/csv/
│   ├── parseCsvFile.ts, columnMapping.ts (+.test), buildTransactions.ts
│   ├── normalizeMerchantName.ts, parseDate.ts, filenameTagParser.ts
├── lib/categorization/
│   ├── categorizationEngine.ts (+.test), clustering.ts (+.test), coverage.ts, seedData.ts
├── lib/db/
│   ├── schema.ts (idb schema, v2), repository.ts (CRUD)
├── lib/export/
│   ├── exportTransactionsCsv.ts, consolidation.ts (+.test)
├── data/seedMerchantCategories.json   user-curated, don't silently edit
├── store/
│   ├── useBudgetStore.ts     central Zustand store, all actions
│   └── selectors.ts          datasetType-parameterized derived-state hooks
├── styles/index.css          Tailwind v4 @theme tokens from DESIGN.md
└── types/models.ts           Transaction, CategoryRule, Category, SourceFile, DatasetType, etc.

.github/workflows/deploy.yml  build+test+deploy to GitHub Pages (Actions must be
                               set as the Pages source in repo Settings — one-time
                               manual step, not automatable)
testdata/                     gitignored — real personal bank CSVs, local-only
```

## 11. Current repo/git state

- Branch: `feat/categorize-tab` (checked out locally, in sync with
  `origin/feat/categorize-tab` — nothing to commit or push).
- Both phases are committed and pushed: `51d4231` (Training tab, also the tip of
  `feat/training-tab`) and `bdf10a3` (Categorize tab, tip of `feat/categorize-tab`).
- PR open/merge status for either branch is **unconfirmed** — `gh` CLI isn't
  installed on this machine and the repo returns 404 on unauthenticated
  `WebFetch` (private repo), so check the GitHub UI directly.
- `npm run test` (19 tests) and `npm run build` both passing as of last check.
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
