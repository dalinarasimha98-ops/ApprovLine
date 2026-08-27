'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'aianalysis', label: 'AI Analysis' },
  { key: 'related', label: 'Related Records' },
  { key: 'audit', label: 'Audit Trail' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

export const VALID_TABS: readonly TabKey[] = TABS.map((t) => t.key);

export function isTabKey(s: string): s is TabKey {
  return (VALID_TABS as readonly string[]).includes(s);
}

export function ApprovalDetailWorkspace({
  initialTab,
  panels,
}: {
  initialTab: TabKey;
  panels: Record<TabKey, React.ReactNode>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    startTransition(() => {
      router.replace(`${pathname}?tab=${tab}`, { scroll: false });
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex shrink-0 items-end overflow-x-auto border-b border-[#1E2D4A] bg-[#07111f] px-4"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
        aria-label="Approval sections"
      >
        {TABS.map(({ key, label }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${key}`}
              id={`tab-${key}`}
              onClick={() => switchTab(key)}
              className={[
                'shrink-0 whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-semibold transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500',
                isActive
                  ? 'border-violet-500 text-[#E8EEFF]'
                  : 'border-transparent text-[#6B7FA8] hover:text-[#A8BAD8]',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panels — all rendered server-side; client only toggles visibility */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {TABS.map(({ key }) => (
          <div
            key={key}
            id={`tabpanel-${key}`}
            role="tabpanel"
            aria-labelledby={`tab-${key}`}
            className={activeTab === key ? 'min-h-full' : 'hidden'}
          >
            {panels[key]}
          </div>
        ))}
      </div>
    </div>
  );
}
