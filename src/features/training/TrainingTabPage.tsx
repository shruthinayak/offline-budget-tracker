import { OneTimeSetupBanner } from './OneTimeSetupBanner'
import { CsvUploadPanel } from './CsvUploadPanel'
import { ImportReviewCard } from './ImportReviewCard'
import { StatsRow } from './StatsRow'
import { TopUncategorizedQueue } from './TopUncategorizedQueue'
import { CoverageGateBanner } from './CoverageGateBanner'
import { ReviewTable } from './ReviewTable'
import { DownloadTrainingCsvButton } from './DownloadTrainingCsvButton'

export function TrainingTabPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-headline-lg text-on-background">Create Training Data</h1>
          <p className="text-body-md text-on-surface-variant">
            Upload statements, label recurring merchants, and export a reusable training dataset.
          </p>
        </div>
        <DownloadTrainingCsvButton />
      </div>

      <OneTimeSetupBanner />
      <CsvUploadPanel datasetType="training" />
      <ImportReviewCard datasetType="training" />
      <StatsRow datasetType="training" />
      <CoverageGateBanner datasetType="training" />
      <TopUncategorizedQueue datasetType="training" />
      <ReviewTable datasetType="training" />
    </div>
  )
}
