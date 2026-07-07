import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import type { FounderRole } from '@/services/founder';

const navItems = [
  { href: '/founder', label: 'Command Center' },
  { href: '/founder/customers', label: 'Customers' },
  { href: '/founder/provision', label: 'Provision' },
  { href: '/founder/features', label: 'Features' },
  { href: '/founder/integrations', label: 'Integrations' },
  { href: '/founder/audit', label: 'Audit' },
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
  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-[286px] border-r border-slate-200 bg-[#07111f] px-5 py-6 text-white lg:block">
        <Link href="/founder" className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2557dc] text-lg font-black">A</span>
          <span>
            <span className="block text-xl font-black">ApprovLine</span>
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Founder Console</span>
          </span>
        </Link>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-200">Access</p>
          <p className="mt-2 text-sm font-bold">{role.replace('_', ' ')}</p>
          <p className="mt-1 break-all text-xs font-semibold text-slate-400">{email}</p>
        </div>

        <nav className="mt-7 grid gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-xs font-semibold leading-5 text-blue-100">
          Customer credentials stay customer-owned. Founder access only controls provisioning, feature gates, and support readiness.
        </div>
      </aside>

      <section className="lg:pl-[286px]">
        <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2557dc]">Internal Operations</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Founder Control Center</h1>
          </div>
          <div className="flex items-center gap-3">
            {role === 'SUPPORT_ADMIN' ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-700">Read only</span>
            ) : null}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <div className="px-5 py-7 lg:px-10">{children}</div>
      </section>
    </main>
  );
}

export function FounderForbidden() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Founder access required</p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">This area is restricted</h1>
        <p className="mt-3 text-base font-semibold leading-7 text-slate-600">
          Customer workspace roles cannot access the founder operations console. Ask a super admin to add your email to the platform admin allowlist.
        </p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white">
          Return to dashboard
        </Link>
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

export function FounderBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-wide ${classes}`}>{children}</span>;
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
