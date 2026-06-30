import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { RedisWarningBanner } from '@/components/system/RedisWarningBanner';
import { PendingLink } from '@/components/system/PendingLink';
import { ToastOnQuery } from '@/components/system/ToastOnQuery';

const nav = [
  { href: '/dashboard', label: 'Overview', pending: 'Opening overview...' },
  { href: '/dashboard/approvals', label: 'Approval History', pending: 'Opening approvals...' },
  { href: '/dashboard/audit', label: 'Audit Logs', pending: 'Opening audit logs...' },
  { href: '/dashboard/export', label: 'Compliance Export', pending: 'Opening export...' },
  { href: '/dashboard/settings/integrations', label: 'Integrations', pending: 'Opening integrations...' },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-[#090b12]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200/80 bg-white/90 p-5 shadow-[10px_0_40px_rgba(15,23,42,0.04)] backdrop-blur lg:block">
        <Link href="/" className="mb-8 flex items-center gap-3 rounded-xl px-2 py-2 text-xl font-black text-[#2155d9]">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#2155d9] shadow-lg shadow-blue-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="#dbe7ff" strokeWidth="1.9" />
              <path d="m8.8 12 2.1 2.1 4.5-5" stroke="#dbe7ff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            <span className="block leading-none">ApprovLine</span>
            <span className="mt-1 block text-xs font-semibold text-slate-500">Every approval. Captured. Proven.</span>
          </span>
        </Link>
        <nav className="grid gap-2">
          {nav.map((item) => (
            <PendingLink
              key={item.href}
              href={item.href}
              pendingText={item.pending}
              className="rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            >
              {item.label}
            </PendingLink>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Workspace status</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">Read-only evidence capture is active when integrations are connected.</p>
        </div>
      </aside>
      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance Workspace</p>
            <h1 className="text-xl font-black tracking-tight text-slate-950">Decision intelligence dashboard</h1>
            <p className="hidden text-sm text-slate-500 sm:block">Searchable approval evidence, audit logs, and integration health.</p>
          </div>
          {hasClerk ? <UserButton /> : <div className="text-sm font-semibold text-slate-500">Local build</div>}
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
      </main>
    </div>
  );
}
