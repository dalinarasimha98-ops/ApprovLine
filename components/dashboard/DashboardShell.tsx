import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';
import { PendingLink } from '@/components/system/PendingLink';
import { ToastOnQuery } from '@/components/system/ToastOnQuery';

const nav = [
  { href: '/dashboard', label: 'Overview', pending: 'Opening overview...' },
  { href: '/dashboard/approvals', label: 'Approval History', pending: 'Opening approvals...' },
  { href: '/evidence', label: 'Unified Evidence', pending: 'Opening evidence...' },
  { href: '/copilot', label: 'AI Copilot', pending: 'Opening Copilot...' },
  { href: '/memory', label: 'Memory Graph', pending: 'Opening memory graph...' },
  { href: '/analytics', label: 'Executive ROI', pending: 'Opening analytics...' },
  { href: '/investigations', label: 'Investigations', pending: 'Opening investigations...' },
  { href: '/dashboard/audit', label: 'Audit Logs', pending: 'Opening audit logs...' },
  { href: '/playbooks', label: 'Playbook AI', pending: 'Opening playbooks...' },
  { href: '/dashboard/settings/integrations', label: 'Integrations', pending: 'Opening integrations...' },
  { href: '/dashboard/gateway', label: 'Universal Gateway', pending: 'Opening gateway...' },
  { href: '/dashboard/pilot', label: 'Pilot Readiness', pending: 'Opening pilot readiness...' },
  { href: '/dashboard/customer-success', label: 'Customer Success', pending: 'Opening customer success...' },
  { href: '/trust', label: 'Security & Trust', pending: 'Opening trust center...' },
  { href: '/trust/compliance', label: 'Compliance Hub', pending: 'Opening compliance hub...' },
  { href: '/settings/identity', label: 'Identity Center', pending: 'Opening identity center...' },
  { href: '/dashboard/settings', label: 'Settings', pending: 'Opening settings...' },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#090b12]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-slate-200/80 bg-[#07111f] p-5 text-white shadow-[10px_0_40px_rgba(15,23,42,0.10)] lg:flex">
        <Link href="/" className="mb-6 flex shrink-0 items-center gap-3 rounded-xl px-2 py-2 text-xl font-black text-white">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#2155d9] shadow-lg shadow-blue-950/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="#dbe7ff" strokeWidth="1.9" />
              <path d="m8.8 12 2.1 2.1 4.5-5" stroke="#dbe7ff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            <span className="block leading-none">ApprovLine</span>
            <span className="mt-1 block text-xs font-semibold text-slate-400">Every approval. Captured. Proven.</span>
          </span>
        </Link>
        <div className="mb-4 shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">Workspace</p>
          <p className="mt-1 truncate text-sm font-black text-white">Personal Workspace</p>
          <p className="text-xs font-semibold text-slate-400">Production</p>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.45)_transparent]">
          <div className="grid gap-1.5">
          {nav.map((item) => (
            <PendingLink
              key={item.href}
              href={item.href}
              pendingText={item.pending}
              className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </PendingLink>
          ))}
          </div>
        </nav>
        <div className="mt-4 shrink-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
          <p className="text-[11px] font-black uppercase leading-none tracking-[0.18em] text-blue-200">Workspace status</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
            Read-only evidence capture activates when Slack or Gmail is connected.
          </p>
        </div>
      </aside>
      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance Workspace</p>
              <h1 className="text-xl font-black tracking-tight text-slate-950">Decision intelligence dashboard</h1>
              <p className="hidden text-sm text-slate-500 sm:block">Searchable approval evidence, audit logs, and integration health.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/dashboard/settings" className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm hover:bg-slate-50 sm:inline-flex">
                Settings
              </Link>
              {hasClerk ? <UserButton /> : <div className="text-sm font-semibold text-slate-500">Local build</div>}
            </div>
          </div>
          <nav className="mx-auto mt-4 flex max-w-7xl gap-2 overflow-x-auto pb-1 lg:hidden">
            {nav.map((item) => (
              <PendingLink
                key={item.href}
                href={item.href}
                pendingText={item.pending}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm"
              >
                {item.label}
              </PendingLink>
            ))}
          </nav>
        </header>
        <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 lg:p-8">
          <RedisWarningBanner />
          <ToastOnQuery />
          {children}
        </div>
        <PendingLink
          href="/dashboard/pilot#feedback"
          pendingText="Opening feedback..."
          className="fixed bottom-5 right-5 z-30 inline-flex min-h-0 h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-800 shadow-[0_18px_50px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(15,23,42,0.24)]"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2155d9] text-xs text-white">?</span>
          Feedback
        </PendingLink>
      </main>
    </div>
  );
}
