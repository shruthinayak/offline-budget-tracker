export type AppTab = 'training' | 'categorize'

interface HeaderTabsProps {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

const TABS: { id: AppTab; label: string }[] = [
  { id: 'training', label: 'Create Training Data' },
  { id: 'categorize', label: 'Categorize' },
]

export function HeaderTabs({ activeTab, onChange }: HeaderTabsProps) {
  return (
    <nav className="flex min-w-0 items-center gap-3 sm:gap-8">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative shrink-0 pb-1 text-body-sm font-medium transition-colors sm:text-body-md ${
            activeTab === tab.id ? 'text-primary' : 'text-on-surface-variant hover:text-primary'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute -bottom-[1px] left-0 h-[3px] w-full rounded-full bg-primary" />
          )}
        </button>
      ))}
    </nav>
  )
}
