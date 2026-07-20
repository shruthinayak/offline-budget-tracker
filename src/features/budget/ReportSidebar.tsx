import { CategoryPieChart } from './CategoryPieChart'
import { IncomeExpenseSummary } from './IncomeExpenseSummary'
import { RulesBackupCard } from './RulesBackupCard'

/** The "report" side of the page — category breakdown, income vs.
 *  expenses, and rules backup/restore. Pulled out of the main column into a
 *  sidebar so the upload → review → export flow isn't competing with a
 *  chart and four bars for attention. */
export function ReportSidebar() {
  return (
    <aside className="flex flex-col gap-6 lg:w-[360px] lg:shrink-0">
      <CategoryPieChart />
      <IncomeExpenseSummary />
      <RulesBackupCard />
    </aside>
  )
}
