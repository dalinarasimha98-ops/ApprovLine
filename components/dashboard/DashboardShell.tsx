import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Sparkles } from 'lucide-react';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';
import { PendingLink } from '@/components/system/PendingLink';
import { ToastOnQuery } from '@/components/system/ToastOnQuery';
import { DashboardNavigation, LiveCaptureBadge } from '@/components/dashboard/DashboardNavigation';
import {
  DashboardFilterLinks,
  DashboardSearch,
  DashboardUtilityLinks,
  WorkspaceSwitcherLink,
} from '@/components/dashboard/DashboardHeaderControls';

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
        <WorkspaceSwitcherLink />
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
            <DashboardSearch />
            <div className="flex items-center gap-2">
              <LiveCaptureBadge />
              <DashboardUtilityLinks />
              {hasClerk ? <UserButton /> : <div className="text-sm font-semibold text-slate-500">Local build</div>}
            </div>
          </div>
          <div className="mt-3 lg:hidden"><DashboardNavigation mobile /></div>
        </header>
        <div className="grid gap-4 p-3 sm:p-4 xl:p-5">
          <DashboardFilterLinks />
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
