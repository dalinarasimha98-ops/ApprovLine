'use client';

import Link from 'next/link';
import { Bell, CalendarDays, ChevronDown, Filter, HelpCircle, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function WorkspaceSwitcherLink() {
  return (
    <Link
      href="/dashboard/settings"
      title="Open workspace settings"
      className="mb-3 flex shrink-0 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.045] p-2.5 transition hover:border-blue-400/30 hover:bg-white/[0.07]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-500/20 text-xs font-black text-emerald-300">AW</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-white">ApprovLine Workspace</span>
        <span className="block text-[10px] text-slate-500">Production</span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
    </Link>
  );
}

export function DashboardSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <form
      action="/dashboard/approvals"
      className="hidden h-9 min-w-[260px] max-w-[480px] flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs text-slate-300 transition focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/15 md:flex"
    >
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <input
        ref={inputRef}
        name="q"
        type="search"
        aria-label="Search approvals"
        placeholder="Search approvals, people, decisions, tickets..."
        className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
      />
      <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-500">⌘ K</kbd>
    </form>
  );
}

export function DashboardUtilityLinks() {
  return (
    <>
      <Link
        href="/investigations?risk=high"
        title="Open alerts and high-risk investigations"
        className="relative grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
        aria-label="Notifications and alerts"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-0 top-0 rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">3</span>
      </Link>
      <Link
        href="/trust"
        title="Open Security and Trust Center"
        className="hidden h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.06] hover:text-white sm:grid"
        aria-label="Help and trust center"
      >
        <HelpCircle className="h-4 w-4" />
      </Link>
    </>
  );
}

export function DashboardFilterLinks() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const from = sevenDaysAgo.toISOString().slice(0, 10);

  return (
    <div className="flex justify-end gap-2">
      <Link
        href={`/dashboard/approvals?from=${from}`}
        title="View approvals captured during the last seven days"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-[11px] font-medium text-slate-300 transition hover:border-blue-500/40 hover:bg-white/[0.07] hover:text-white"
      >
        <CalendarDays className="h-3.5 w-3.5" /> Last 7 days
      </Link>
      <Link
        href="/dashboard/approvals#filters"
        title="Open approval filters"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-[11px] font-medium text-slate-300 transition hover:border-blue-500/40 hover:bg-white/[0.07] hover:text-white"
      >
        <Filter className="h-3.5 w-3.5" /> Filters
      </Link>
    </div>
  );
}
