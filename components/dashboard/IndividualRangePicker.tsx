'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { IndividualDashboardRangeKey } from '@/services/individualDashboard';
import { str, type RawSearchParams } from '@/lib/search-params';

/**
 * Date range control for the Individual User Dashboard. Modeled on the same
 * interaction pattern components/analytics/AnalyticsDatePicker.tsx already
 * established (preset pills + an inline custom from/to form) rather than a
 * new UI paradigm, but built against this page's own URL contract
 * (?range=7d|30d|90d|thisMonth|lastMonth|custom&from=&to=, matching
 * services/individualDashboard.ts's resolveIndividualDashboardRange()) -
 * AnalyticsDatePicker's own param scheme (always raw from/to, no `range`
 * key, no month presets) doesn't match what this page needs to persist.
 *
 * The 5 fixed presets are plain server-rendered Links (robust without JS,
 * keyboard-accessible by default); only the custom-range disclosure needs
 * client state, kept to the minimum (open/closed + the two input values).
 */
export function IndividualRangePicker({
  rangeOptions,
  activeKey,
  rawParams,
}: {
  rangeOptions: { key: IndividualDashboardRangeKey; label: string }[];
  activeKey: IndividualDashboardRangeKey;
  rawParams: RawSearchParams;
}) {
  const [customOpen, setCustomOpen] = useState(activeKey === 'custom');
  const [from, setFrom] = useState(str(rawParams, 'from') ?? '');
  const [to, setTo] = useState(str(rawParams, 'to') ?? '');

  return (
    <div className="relative flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-y-1 rounded-md border border-al-border bg-al-surface-elevated p-0.5 text-[11px] font-semibold">
        {rangeOptions.map((opt) => (
          <Link
            key={opt.key}
            href={`/dashboard/me?range=${opt.key}`}
            onClick={() => setCustomOpen(false)}
            className={`rounded px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent ${activeKey === opt.key ? 'bg-al-accent text-al-accent-text' : 'text-al-text-muted hover:text-al-text'}`}
            aria-current={activeKey === opt.key ? 'true' : undefined}
          >
            {opt.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          aria-expanded={customOpen}
          aria-controls="individual-custom-range-form"
          className={`rounded px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent ${activeKey === 'custom' ? 'bg-al-accent text-al-accent-text' : 'text-al-text-muted hover:text-al-text'}`}
        >
          Custom
        </button>
      </div>

      {customOpen ? (
        <form
          id="individual-custom-range-form"
          method="GET"
          action="/dashboard/me"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setCustomOpen(false);
          }}
          className="absolute right-0 top-full z-10 mt-2 flex items-center gap-2 rounded-md border border-al-border bg-al-surface-elevated p-2 shadow-[0_12px_36px_rgba(0,0,0,.24)]"
        >
          <input type="hidden" name="range" value="custom" />
          <label className="sr-only" htmlFor="individual-range-from">From date</label>
          <input
            id="individual-range-from"
            type="date"
            name="from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
            className="h-8 rounded-md border border-al-border bg-al-bg px-2 text-xs text-al-text-secondary outline-none focus-visible:border-al-accent"
          />
          <span className="text-xs text-al-text-muted">to</span>
          <label className="sr-only" htmlFor="individual-range-to">To date</label>
          <input
            id="individual-range-to"
            type="date"
            name="to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
            className="h-8 rounded-md border border-al-border bg-al-bg px-2 text-xs text-al-text-secondary outline-none focus-visible:border-al-accent"
          />
          <button
            type="submit"
            className="rounded-md bg-al-accent px-3 py-1.5 text-xs font-bold text-al-accent-text hover:bg-al-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-al-accent"
          >
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
