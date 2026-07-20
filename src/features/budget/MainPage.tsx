import { PlayCircle } from 'lucide-react'
import { OneTimeSetupBanner } from '../shared/OneTimeSetupBanner'
import { CsvUploadPanel } from '../shared/CsvUploadPanel'
import { ImportReviewCard } from '../shared/ImportReviewCard'
import { StatsRow } from '../shared/StatsRow'
import { CoverageGateBanner } from '../shared/CoverageGateBanner'
import { TopUncategorizedQueue } from '../shared/TopUncategorizedQueue'
import { ReviewTable } from '../shared/ReviewTable'
import { ReportSidebar } from './ReportSidebar'
import { ActionsBar } from './ActionsBar'
import { useTotalDatapoints } from '../../store/selectors'

export function MainPage() {
  const totalDatapoints = useTotalDatapoints()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-headline-lg text-on-background">Categorize your spending</h1>
        <p className="text-body-md text-on-surface-variant">
          Upload statement CSVs to auto-categorize them using what it&apos;s already learned —
          correcting a category teaches it immediately, so it gets smarter every month.
        </p>
        <a
          href="https://youtu.be/Or0QKfRIBck"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-2 text-label-md font-medium text-primary hover:underline"
        >
          <PlayCircle size={18} />
          Watch what BudgetLocal offers
        </a>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {totalDatapoints === 0 && <OneTimeSetupBanner />}
          <CsvUploadPanel />
          <ImportReviewCard />
          <StatsRow />
          <CoverageGateBanner />
          <TopUncategorizedQueue />
          <div className="mb-6">
            <ReviewTable />
          </div>
          <ActionsBar />
        </div>

        <ReportSidebar />
      </div>
    </div>
  )
}
