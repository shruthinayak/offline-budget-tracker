import { CsvUploadPanel } from '../training/CsvUploadPanel'
import { ImportReviewCard } from '../training/ImportReviewCard'
import { StatsRow } from '../training/StatsRow'
import { CoverageGateBanner } from '../training/CoverageGateBanner'
import { TopUncategorizedQueue } from '../training/TopUncategorizedQueue'
import { ReviewTable } from '../training/ReviewTable'
import { CategoryPieChart } from './CategoryPieChart'
import { CategorizeActionsBar } from './CategorizeActionsBar'

export function CategorizeTabPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-headline-lg text-on-background">Categorize</h1>
        <p className="text-body-md text-on-surface-variant">
          Upload this month&apos;s statements to auto-categorize them using what you&apos;ve already taught the
          categorizer.
        </p>
      </div>

      <CsvUploadPanel datasetType="categorize" />
      <ImportReviewCard datasetType="categorize" />
      <StatsRow datasetType="categorize" />
      <CategoryPieChart datasetType="categorize" />
      <CoverageGateBanner datasetType="categorize" />
      <TopUncategorizedQueue datasetType="categorize" />
      <div className="mb-6">
        <ReviewTable datasetType="categorize" selectable />
      </div>
      <CategorizeActionsBar />
    </div>
  )
}
