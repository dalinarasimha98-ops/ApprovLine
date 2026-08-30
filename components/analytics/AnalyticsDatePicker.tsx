'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

type Preset = {
  label: string;
  days: number;
};

const PRESETS: Preset[] = [
  { label: 'Today', days: 0 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'Quarter', days: 91 },
  { label: 'Year', days: 365 },
];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(f)} – ${fmt(t)}`;
}

type Props = {
  currentFrom?: string;
  currentTo?: string;
  compareEnabled?: boolean;
};

export function AnalyticsDatePicker({ currentFrom, currentTo, compareEnabled }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(currentFrom ?? '');
  const [customTo, setCustomTo] = useState(currentTo ?? '');
  const [compare, setCompare] = useState(Boolean(compareEnabled));

  const applyRange = useCallback(
    (from: string, to: string, withCompare: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('from', from);
      params.set('to', to);
      if (withCompare) {
        // Previous period of equal length
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const durationMs = toDate.getTime() - fromDate.getTime();
        const prevTo = new Date(fromDate.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - durationMs);
        params.set('prevFrom', toDateStr(prevFrom));
        params.set('prevTo', toDateStr(prevTo));
      } else {
        params.delete('prevFrom');
        params.delete('prevTo');
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const applyPreset = useCallback(
    (days: number) => {
      const to = new Date();
      const from = days === 0 ? new Date() : new Date();
      if (days > 0) from.setDate(from.getDate() - days);
      applyRange(toDateStr(from), toDateStr(to), compare);
      setShowCustom(false);
    },
    [applyRange, compare],
  );

  const activePreset = PRESETS.find((p) => {
    if (!currentFrom || !currentTo) return false;
    if (p.days === 0) {
      return currentFrom === toDateStr(new Date()) && currentTo === toDateStr(new Date());
    }
    const expected = new Date();
    expected.setDate(expected.getDate() - p.days);
    return toDateStr(expected) === currentFrom;
  });

  const displayLabel = currentFrom && currentTo
    ? formatDateRange(currentFrom, currentTo)
    : 'All time';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset pills */}
      <div className="flex rounded-lg border border-[#1E2D4A] bg-[#0D1526] p-0.5 gap-0.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset.days)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activePreset?.label === preset.label
                ? 'bg-violet-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            showCustom ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Current range display */}
      <span className="text-xs font-medium text-slate-400 hidden sm:inline">
        {displayLabel}
      </span>

      {/* Compare toggle */}
      <button
        onClick={() => {
          const next = !compare;
          setCompare(next);
          if (currentFrom && currentTo) applyRange(currentFrom, currentTo, next);
        }}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
          compare
            ? 'border-violet-500/50 bg-violet-500/10 text-violet-300'
            : 'border-[#1E2D4A] bg-[#0D1526] text-slate-400 hover:text-white'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${compare ? 'bg-violet-400' : 'bg-slate-500'}`} />
        Compare
      </button>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex items-center gap-2 rounded-lg border border-[#1E2D4A] bg-[#0D1526] p-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
          />
          <span className="text-xs text-slate-500">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 rounded-md border border-[#1E2D4A] bg-[#0A0E1A] px-2 text-xs text-slate-200 outline-none focus:border-violet-500"
          />
          <button
            onClick={() => {
              if (customFrom && customTo) {
                applyRange(customFrom, customTo, compare);
                setShowCustom(false);
              }
            }}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
