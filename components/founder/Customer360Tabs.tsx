'use client';

export type TabId = 'overview' | 'onboarding' | 'users' | 'integrations' | 'billing' | 'health' | 'activity' | 'notes';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'users', label: 'Users' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'billing', label: 'Billing' },
  { id: 'health', label: 'Health' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
];

export function TabNav({ activeTab, tabHrefs }: { activeTab: TabId; tabHrefs: Record<TabId, string> }) {
  return (
    <nav className="flex overflow-x-auto border-b border-slate-100 bg-white">
      {TABS.map((tab) => (
        <a
          key={tab.id}
          href={tabHrefs[tab.id]}
          className={`shrink-0 whitespace-nowrap px-5 py-3.5 text-sm font-black border-b-2 transition-colors ${
            tab.id === activeTab
              ? 'border-[#2557dc] text-[#2557dc]'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
