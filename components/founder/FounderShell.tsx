import type { ReactNode } from 'react';
import Link from 'next/link';
import type { FounderRole } from '@/services/founder';
import { FounderNavClient } from './FounderNavClient';

export function FounderShell({
  children,
  email,
  role,
}: {
  children: ReactNode;
  email: string;
  role: FounderRole;
}) {
  return <FounderNavClient email={email} role={role}>{children}</FounderNavClient>;
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
