import { OneTimeSetupBanner } from '../shared/OneTimeSetupBanner'
import { CsvUploadPanel } from '../shared/CsvUploadPanel'
import { ImportReviewCard } from '../shared/ImportReviewCard'
import { StatsRow } from '../shared/StatsRow'
import { CoverageGateBanner } from '../shared/CoverageGateBanner'
import { TopUncategorizedQueue } from '../shared/TopUncategorizedQueue'
import { ReviewTable } from '../shared/ReviewTable'
import { CategoryPieChart } from './CategoryPieChart'
import { IncomeExpenseSummary } from './IncomeExpenseSummary'
import { ActionsBar } from './ActionsBar'
import { useTotalDatapoints } from '../../store/selectors'

export function MainPage() {
  const totalDatapoints = useTotalDatapoints()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-headline-lg text-on-background">Categorize your spending</h1>
        <p className="text-body-md text-on-surface-variant">
          Upload statement CSVs to auto-categorize them using what you&apos;ve already taught the categorizer —
          correcting a category teaches it immediately, so it gets smarter every month.
        </p>
      </div>

      {totalDatapoints === 0 && <OneTimeSetupBanner />}
      <CsvUploadPanel />
      <ImportReviewCard />
      <StatsRow />
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CategoryPieChart />
        <IncomeExpenseSummary />
      </div>
      <CoverageGateBanner />
      <TopUncategorizedQueue />
      <div className="mb-6">
        <ReviewTable />
      </div>
      <ActionsBar />
    </div>
  )
}
