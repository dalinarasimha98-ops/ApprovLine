import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Bell, CalendarDays, ChevronDown, Filter, HelpCircle, Search, Sparkles } from 'lucide-react';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';
import { PendingLink } from '@/components/system/PendingLink';
import { ToastOnQuery } from '@/components/system/ToastOnQuery';
import { DashboardNavigation, LiveCaptureBadge } from '@/components/dashboard/DashboardNavigation';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className="min-h-screen bg-[#030b18] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[0.08] bg-[#020916] p-3 text-white lg:flex">
        <Link href="/" className="mb-3 flex h-12 shrink-0 items-center gap-2.5 rounded-lg px-2 text-lg font-black text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 shadow-lg shadow-blue-950/40">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span>ApprovLine</span>
        </Link>
        <div className="mb-3 flex shrink-0 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.045] p-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-emerald-500/20 text-xs font-black text-emerald-300">AW</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">ApprovLine Workspace</p>
            <p className="text-[10px] text-slate-500">Production</p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <DashboardNavigation />
        <div className="mt-3 shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.035] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workspace plan</p>
          <p className="mt-1 text-xs font-semibold text-slate-200">Manage billing and usage</p>
          <Link href="/dashboard/customer-success" className="mt-2 block text-[10px] font-semibold text-blue-300 hover:text-blue-200">Open plan settings</Link>
        </div>
      </aside>
      <main className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#030b18]/95 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-white">Approval Intelligence</h1>
              <p className="hidden text-xs text-slate-500 sm:block">Live evidence, decisions, risk and compliance</p>
            </div>
            <div className="hidden h-9 min-w-[260px] max-w-[480px] flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-xs text-slate-500 md:flex">
              <Search className="h-4 w-4" /><span className="truncate">Search approvals, people, decisions, tickets...</span>
              <kbd className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-500">⌘ K</kbd>
            </div>
            <div className="flex items-center gap-2">
              <LiveCaptureBadge />
              <button className="relative grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Notifications">
                <Bell className="h-4 w-4" /><span className="absolute right-0 top-0 rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">3</span>
              </button>
              <button className="hidden h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/[0.06] sm:grid" aria-label="Help"><HelpCircle className="h-4 w-4" /></button>
              {hasClerk ? <UserButton /> : <div className="text-sm font-semibold text-slate-500">Local build</div>}
            </div>
          </div>
          <div className="mt-3 lg:hidden"><DashboardNavigation mobile /></div>
        </header>
        <div className="grid gap-4 p-3 sm:p-4 xl:p-5">
          <div className="flex justify-end gap-2">
            <button className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-[11px] font-medium text-slate-300"><CalendarDays className="h-3.5 w-3.5" /> Last 7 days</button>
            <button className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 text-[11px] font-medium text-slate-300"><Filter className="h-3.5 w-3.5" /> Filters</button>
          </div>
          <RedisWarningBanner />
          <ToastOnQuery />
          {children}
        </div>
        <PendingLink
          href="/dashboard/pilot#feedback"
          pendingText="Opening feedback..."
          className="fixed bottom-4 right-4 z-30 inline-flex h-9 min-h-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-[#0a1526] px-3 text-xs font-bold text-slate-200 shadow-2xl transition hover:border-blue-500/40 hover:text-white"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[10px] text-white">?</span>
          Feedback
        </PendingLink>
      </main>
    </div>
  );
}
