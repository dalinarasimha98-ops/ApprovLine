import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/system/ErrorBoundary';
import type { FounderRole } from '@/services/founder';

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

const primaryNav: NavGroup[] = [
  {
    label: '',
    items: [{ href: '/founder', label: 'Overview' }],
  },
  {
    label: 'Customers',
    items: [
      { href: '/founder/customers', label: 'Customer List' },
      { href: '/founder/provision', label: 'Provision Customer' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/founder/users', label: 'Users' },
      { href: '/founder/billing', label: 'Plans & Billing' },
      { href: '/founder/features', label: 'Feature Access' },
    ],
  },
  {
    label: 'Integrations',
    items: [{ href: '/founder/integrations', label: 'Integration Catalog' }],
  },
  {
    label: 'Support',
    items: [
      { href: '/founder/health', label: 'Customer Health' },
      { href: '/founder/notes', label: 'Support / Notes' },
      { href: '/founder/audit', label: 'Audit Logs' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { href: '/founder/operations', label: 'System Health' },
      { href: '/founder/security/isolation', label: 'Security' },
      { href: '/founder/settings', label: 'Founder Settings' },
    ],
  },
];

const engineeringNav: NavItem[] = [
  { href: '/founder/pilots', label: 'Pilots' },
  { href: '/founder/revenue', label: 'Revenue' },
  { href: '/founder/demo-generator', label: 'Demo Generator' },
  { href: '/founder/reliability', label: 'Reliability' },
  { href: '/founder/observability', label: 'Observability' },
  { href: '/founder/readiness', label: 'Readiness' },
  { href: '/founder/certification', label: 'Certification' },
];

export function FounderShell({
  children,
  email,
  role,
}: {
  children: ReactNode;
  email: string;
  role: FounderRole;
}) {
  const readOnly = role === 'SUPPORT_ADMIN';
  return (
    <main className="min-h-screen bg-[#f0f2f7] text-slate-950">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[272px] flex-col bg-[#0a1628] lg:flex">
        {/* Logo + FOUNDER MODE badge */}
        <div className="shrink-0 border-b border-white/8 px-5 py-5">
          <Link href="/founder" className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#2557dc] text-base font-black text-white">A</span>
            <div className="min-w-0">
              <span className="block text-[15px] font-black leading-none text-white">ApprovLine</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/80">Internal Console</span>
            </div>
          </Link>

          {/* FOUNDER MODE badge — unmistakable */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-500/15 px-3 py-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400 [animation:pulse_2s_ease-in-out_infinite]" style={{boxShadow:'0 0 0 0 rgba(251,146,60,0.4)'}} />
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-300">Founder Mode</span>
          </div>
        </div>

        {/* Access info */}
        <div className="shrink-0 border-b border-white/8 px-5 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Logged in as</p>
          <p className="mt-1 text-xs font-bold text-slate-200">{role.replace(/_/g, ' ')}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">{email}</p>
          {readOnly && (
            <span className="mt-2 inline-block rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-300">
              Read only
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.2)_transparent]">
          <div className="grid gap-0.5">
            {primaryNav.map((group) => (
              <div key={group.label || 'top'} className={group.label ? 'mt-4 first:mt-0' : ''}>
                {group.label ? (
                  <p className="mb-1 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center rounded-lg px-3 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}

            {/* Engineering group */}
            <div className="mt-6 border-t border-white/8 pt-4">
              <p className="mb-1 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                Engineering
              </p>
              {engineeringNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-white/8 hover:text-slate-300"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer note */}
        <div className="shrink-0 border-t border-white/8 px-5 py-4">
          <p className="text-[11px] font-semibold leading-5 text-slate-600">
            Customer credentials stay customer-owned. This console controls provisioning, feature gates, and support readiness only.
          </p>
        </div>
      </aside>

      {/* Main content area */}
      <section className="lg:pl-[272px]">
        {/* Header */}
        <header className="sticky top-0 z-20 flex min-h-[64px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-3">
            {/* FOUNDER MODE pill in header too — always visible on mobile */}
            <span className="flex items-center gap-1.5 rounded-full border border-orange-300/60 bg-orange-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 lg:hidden">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              Founder Mode
            </span>
            <span className="hidden text-xs font-black uppercase tracking-[0.18em] text-orange-600 lg:flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              Founder Control Center
            </span>
          </div>

          {/* Global search */}
          <form method="get" action="/founder/customers" className="hidden max-w-xs flex-1 sm:block">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                name="q"
                type="search"
                placeholder="Search customers…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#2557dc] focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </form>

          <div className="flex shrink-0 items-center gap-3">
            {readOnly ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700">
                Read only
              </span>
            ) : null}
            <ErrorBoundary
              fallback={
                <Link href="/sign-in" className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700">
                  Sign out
                </Link>
              }
            >
              <UserButton afterSignOutUrl="/" />
            </ErrorBoundary>
          </div>
        </header>

        <div className="px-5 py-7 lg:px-8">{children}</div>
      </section>
    </main>
  );
}

export function FounderSystemError({ detail }: { detail?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Founder console unavailable</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">We could not load founder access safely</h1>
        <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
          Your customer workspace is not affected. The founder operations console could not complete its access check, so ApprovLine stopped before rendering protected controls.
        </p>
        {detail ? <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">Safe diagnostic: {detail}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/founder/readiness" className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
            Open founder readiness
          </Link>
          <Link href="/health" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
            Open health check
          </Link>
        </div>
      </section>
    </main>
  );
}

export function FounderMetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{detail}</p>
    </article>
  );
}

export function FounderBadge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red';
}) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <span
      className={`inline-flex h-fit w-fit shrink-0 items-center justify-center self-start whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-black uppercase leading-none tracking-wide ${classes}`}
    >
      {children}
    </span>
  );
}

export function MigrationNotice({ message }: { message?: string }) {
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Database migration required</p>
      <h2 className="mt-2 text-xl font-black text-slate-950">Founder storage is running in compatibility mode</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
        Run <code className="rounded bg-white px-2 py-1">npm run db:deploy</code> in production to enable dedicated founder operations tables.
      </p>
      {message ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-amber-900">Safe diagnostic: {message}</p> : null}
    </section>
  );
}
