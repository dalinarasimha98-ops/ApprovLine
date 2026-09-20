'use client';

/**
 * Founder Settings (/founder/settings) — a compact, read-only Founder
 * Console overview. See services/founder-settings.ts for the full
 * architecture note on why every fact here is read from Certification
 * Center's already-computed output rather than a second call to Security
 * or Readiness.
 *
 * DELIBERATELY ZERO MUTATIONS. There is no dedicated, persistent Founder
 * Preferences model in this codebase, so this page introduces no toggles
 * (Founder Mode, notifications, default dashboard, dark mode, etc.) that
 * would have nothing real to persist to — every value shown is either
 * read-only architecture, or a real status already computed elsewhere.
 * Where a capability genuinely isn't configurable from here, it says so
 * rather than pretending otherwise.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@clerk/nextjs';
import { FounderBadge } from './FounderShell';
import { CERTIFICATION_STATUS_LABELS, certificationStatusTone, type CertificationStatus } from '@/lib/founder-certification';
import type { CertificationDecision } from '@/services/founder-certification';
import type { FounderSettingsControlView } from '@/services/founder-settings';
import type { FounderRole } from '@/services/founder';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const DECISION_COPY: Record<CertificationDecision, { label: string; tone: 'green' | 'amber' | 'slate' | 'red' }> = {
  ALL_VERIFIED: { label: 'Certification Ready', tone: 'green' },
  NEEDS_ATTENTION: { label: 'Requires Attention', tone: 'amber' },
  HAS_FAILURES: { label: 'Has Failures', tone: 'red' },
  INSUFFICIENT_DATA: { label: 'Status Unknown', tone: 'slate' },
};

const ROLE_LABELS: Record<FounderRole, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  FOUNDER_ADMIN: 'FOUNDER_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
};

// Every href below is a real, existing /founder/* route — verified against
// components/founder/FounderNavClient.tsx's own NAV array, not invented.
// Omitting a destination is preferred over a dead link; every one here
// resolves to a real, already-shipped page.
const CONSOLE_CONTROLS: { label: string; href: string }[] = [
  { label: 'Feature Management', href: '/founder/features' },
  { label: 'Integration Catalog', href: '/founder/integrations' },
  { label: 'Plans & Billing', href: '/founder/billing' },
  { label: 'Seats & Usage', href: '/founder/seats' },
  { label: 'Revenue', href: '/founder/revenue' },
  { label: 'Customer Health', href: '/founder/customer-health' },
  { label: 'System Health', href: '/founder/system-health' },
  { label: 'Integration Health', href: '/founder/integration-health' },
  { label: 'Background Jobs', href: '/founder/background-jobs' },
  { label: 'Observability', href: '/founder/observability' },
  { label: 'Certification', href: '/founder/certification' },
  { label: 'Founder Audit Logs', href: '/founder/audit' },
];

function StatusRow({ item }: { item: FounderSettingsControlView }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-slate-800">{item.label}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500" title={item.summary}>{item.summary}</p>
      </div>
      <FounderBadge tone={certificationStatusTone(item.status)}>{CERTIFICATION_STATUS_LABELS[item.status]}</FounderBadge>
    </div>
  );
}

export type FounderSettingsProps = {
  email: string;
  role: FounderRole;
  readOnly: boolean;
  generatedAt: string;
  certificationDecision: CertificationDecision;
  securityKpis: { totalControls: number; verified: number; attention: number; notVerified: number; failed: number };
  securityItems: FounderSettingsControlView[];
  operationalItems: FounderSettingsControlView[];
  isolationReportHref: string;
  reliabilityReportHref: string;
};

export function FounderSettingsClient(props: FounderSettingsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function refresh() {
    if (pending) return;
    startTransition(() => {
      router.refresh();
    });
  }

  const decisionCopy = DECISION_COPY[props.certificationDecision];
  const worstSecurityStatus: CertificationStatus =
    props.securityKpis.failed > 0 ? 'FAILED' : props.securityKpis.attention > 0 ? 'ATTENTION' : props.securityKpis.notVerified > 0 ? 'NOT_VERIFIED' : 'VERIFIED';

  const kpiCards = [
    { label: 'Founder Role', value: ROLE_LABELS[props.role], detail: 'Resolved server-side on every request.' },
    { label: 'Access Mode', value: props.readOnly ? 'Read Only' : 'Full Access', detail: props.readOnly ? 'Write actions are disabled.' : 'Write access enabled.' },
    { label: 'Security', value: CERTIFICATION_STATUS_LABELS[worstSecurityStatus], detail: `${props.securityKpis.totalControls} controls evaluated.` },
    { label: 'Certification', value: decisionCopy.label, detail: 'From the live Certification Center report.' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Settings</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Founder Settings</h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
              Manage Founder Console access, configuration visibility, security posture, and operational controls.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-right text-xs font-bold text-slate-500">
              Last checked<br />
              <span className="text-sm text-slate-700">{fmtDateTime(props.generatedAt)}</span>
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              aria-busy={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={pending ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
              {pending ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section aria-label="Founder Settings summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((kpi) => (
          <article key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{kpi.label}</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{kpi.value}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{kpi.detail}</p>
          </article>
        ))}
      </section>

      {/* Identity / Access / Security */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Founder Identity</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Signed-in account</dt>
              <dd className="truncate font-bold text-slate-800">{props.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Identity verification</dt>
              <dd><FounderBadge tone="green">Verified</FounderBadge></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Access model</dt>
              <dd className="font-bold text-slate-800">Founder identity gate</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Session</dt>
              <dd className="inline-flex items-center gap-1.5 font-bold text-slate-800"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Active</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-xs font-semibold leading-5 text-blue-800">
            Founder Console access is restricted by the configured Founder identity (a Clerk session cross-checked against server-only identity configuration) and server-side role resolution — never a client-supplied role or email.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Access &amp; Role</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Current role</dt>
              <dd className="font-black text-slate-950">{ROLE_LABELS[props.role]}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Write access</dt>
              <dd><FounderBadge tone={props.readOnly ? 'amber' : 'green'}>{props.readOnly ? 'Disabled' : 'Enabled'}</FounderBadge></dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Role resolution</dt>
              <dd className="text-right font-bold text-slate-800">Environment / Clerk metadata / PlatformAdmin</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-semibold leading-5 text-slate-600">
            Role changes are managed outside this console (environment configuration, Clerk metadata, or a PlatformAdmin record) — Founder Settings cannot change its own authorization.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-black text-slate-950">Security Summary</h3>
            <FounderBadge tone={certificationStatusTone(worstSecurityStatus)}>{CERTIFICATION_STATUS_LABELS[worstSecurityStatus]}</FounderBadge>
          </div>
          <div className="mt-4 space-y-2">
            {props.securityItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-600">{item.label}</span>
                <FounderBadge tone={certificationStatusTone(item.status)}>{CERTIFICATION_STATUS_LABELS[item.status]}</FounderBadge>
              </div>
            ))}
          </div>
          <Link href="/founder/security" className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-[#2557dc] hover:text-[#2557dc]">
            Open Security <span aria-hidden="true">→</span>
          </Link>
          {/* A real, already-shipped page not listed in the main sidebar —
              reachable only from here, so this link must not be dropped. */}
          <Link href={props.isolationReportHref} className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-[#2557dc] hover:text-[#2557dc]">
            Tenant Isolation Report <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      {/* Certification summary */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-950">Certification Summary</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">Production Certification</p>
          </div>
          <FounderBadge tone={decisionCopy.tone}>{decisionCopy.label}</FounderBadge>
        </div>
        <Link href="/founder/certification" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-[#2557dc] hover:text-[#2557dc]">
          Open Certification <span aria-hidden="true">→</span>
        </Link>
      </section>

      {/* Console controls */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-slate-950">Founder Console Controls</h3>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {CONSOLE_CONTROLS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-black text-slate-700 transition hover:border-[#2557dc] hover:bg-white hover:text-[#2557dc]"
            >
              {item.label} <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Operational configuration */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-slate-950">Operational Configuration</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">Read-only status from the same live checks /founder/certification and /founder/security already run.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {props.operationalItems.map((item) => <StatusRow key={item.key} item={item} />)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/founder/system-health" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-[#2557dc] hover:text-[#2557dc]">
            Open System Health <span aria-hidden="true">→</span>
          </Link>
          {/* A real, already-shipped page not listed in the main sidebar —
              reachable only from here and the Overview page, so this link
              must not be dropped. */}
          <Link href={props.reliabilityReportHref} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-[#2557dc] hover:text-[#2557dc]">
            Reliability Report <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* Session + Audit */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Session &amp; Account</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Current session</dt>
              <dd className="inline-flex items-center gap-1.5 font-bold text-slate-800"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Active</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Signed-in identity</dt>
              <dd className="truncate font-bold text-slate-800">{props.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Founder role</dt>
              <dd className="font-bold text-slate-800">{ROLE_LABELS[props.role]}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="font-semibold text-slate-500">Access mode</dt>
              <dd className="font-bold text-slate-800">{props.readOnly ? 'Read only' : 'Full access'}</dd>
            </div>
          </dl>
          <SignOutButton redirectUrl="/">
            <button type="button" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-100">
              Sign Out
            </button>
          </SignOutButton>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-black text-slate-950">Audit &amp; Governance</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Review privileged Founder actions and configuration changes.</p>
          <Link href="/founder/audit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#2557dc] px-3.5 py-2.5 text-xs font-black text-white transition hover:bg-blue-700">
            View Audit Logs <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
