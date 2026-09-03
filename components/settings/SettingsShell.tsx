'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Building2,
  Cable,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Key,
  Layers,
  RefreshCw,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Sliders,
  Tag,
  Users,
  XCircle,
} from 'lucide-react';
import type { SettingsOverview } from '@/services/settings';

type Tab =
  | 'overview'
  | 'organization'
  | 'security'
  | 'users'
  | 'workflow'
  | 'evidence'
  | 'integrations'
  | 'notifications'
  | 'billing'
  | 'audit'
  | 'system';

const TABS: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'users', label: 'Users & Teams', icon: Users },
  { id: 'workflow', label: 'Workflow & Approvals', icon: Sliders },
  { id: 'evidence', label: 'Evidence & Data', icon: ShieldCheck },
  { id: 'integrations', label: 'Integrations', icon: Cable },
  { id: 'notifications', label: 'Notifications', icon: Activity },
  { id: 'billing', label: 'Billing & Plan', icon: Tag },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'system', label: 'System Preferences', icon: Settings2 },
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ManageLink({ href, label = 'Manage' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function ConfigRow({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold text-slate-900 ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
      {ok ? 'Configured' : 'Not configured'}
    </span>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ data, setTab }: { data: SettingsOverview; setTab: (t: Tab) => void }) {
  const { organization: org, stats, systemStatus } = data;

  const systemOk = systemStatus.ready;
  const systemChecks = [
    { label: 'Gateway', ok: systemStatus.postgresql.status === 'ok' },
    { label: 'Queue', ok: systemStatus.redis.status === 'ok' },
    { label: 'AI', ok: systemStatus.anthropic.status === 'ok' || systemStatus.openai.status === 'ok' },
  ];

  return (
    <div className="grid gap-4">
      {/* Compact system status row */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${systemOk ? 'text-emerald-600' : 'text-amber-600'}`}>
          <span className={`h-2 w-2 rounded-full ${systemOk ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          {systemOk ? 'All systems operational' : 'System degraded'}
        </span>
        <span className="text-slate-200">|</span>
        {systemChecks.map(({ label, ok }) => (
          <span key={label} className={`flex items-center gap-1 text-[11px] font-semibold ${ok ? 'text-slate-500' : 'text-red-600'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {label}
          </span>
        ))}
        <Link href="/health" className="ml-auto flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700">
          View status <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Overview config summary cards — 2-column grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Workspace */}
        <SectionCard>
          <SectionHeader title="Workspace" action={<ManageLink href="/dashboard/settings" label="Edit" />} />
          <div className="divide-y divide-slate-100 px-6">
            <ConfigRow label="Organization" value={org.name} />
            <ConfigRow label="Industry" value={org.industry ?? '—'} />
            <ConfigRow label="Company size" value={org.companySize ?? '—'} />
            <ConfigRow label="Country" value={org.country ?? '—'} />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('organization')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Configure organization <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        {/* Members & Access */}
        <SectionCard>
          <SectionHeader title="Members & Access" action={<ManageLink href="/settings/users" />} />
          <div className="divide-y divide-slate-100 px-6">
            <ConfigRow label="Users" value={`${stats.totalUsers}`} />
            <ConfigRow label="Teams" value={`${stats.totalTeams}`} />
            <ConfigRow label="Approval categories" value={`${org.approvalCategories.length} configured`} />
          </div>
          <div className="px-6 pb-4">
            <Link href="/settings/users" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage users & teams <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SectionCard>

        {/* Security */}
        <SectionCard>
          <SectionHeader title="Security" action={<ManageLink href="/settings/identity" label="Configure" />} />
          <div className="divide-y divide-slate-100 px-6">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500">Authentication</span>
              <StatusBadge ok={true} />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500">MFA</span>
              <span className="text-xs font-semibold text-slate-900">Enforced via Clerk</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-500">Token encryption</span>
              <span className="text-xs font-semibold text-slate-900">AES-256-GCM</span>
            </div>
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('security')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage security <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        {/* Workflows */}
        <SectionCard>
          <SectionHeader title="Workflows" action={<ManageLink href="/playbooks" label="Configure" />} />
          <div className="divide-y divide-slate-100 px-6">
            <ConfigRow label="Playbooks" value={`${stats.totalPlaybooks} configured`} />
            <ConfigRow label="Classifier" value="Anthropic Claude + OpenAI" />
            <ConfigRow label="Queue" value="BullMQ + Redis" />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('workflow')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Configure workflows <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        {/* Evidence & Data */}
        <SectionCard>
          <SectionHeader title="Evidence & Data" action={<ManageLink href="/evidence" label="View" />} />
          <div className="divide-y divide-slate-100 px-6">
            <ConfigRow label="Evidence capture" value="Enabled" valueClass="text-emerald-700" />
            <ConfigRow label="Deduplication" value="Content-hash idempotency" />
            <ConfigRow label="Cross-source correlation" value="Unified evidence records" />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('evidence')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Configure evidence <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        {/* Integrations */}
        <SectionCard>
          <SectionHeader title="Integrations" action={<ManageLink href="/dashboard/settings/integrations" />} />
          <div className="divide-y divide-slate-100 px-6">
            <ConfigRow label="Connected" value={`${stats.activeIntegrations} integration${stats.activeIntegrations !== 1 ? 's' : ''}`} />
            <ConfigRow label="Token security" value="AES-256-GCM at rest" />
          </div>
          <div className="px-6 pb-4">
            <Link href="/dashboard/settings/integrations" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Manage integrations <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

// ─── Tab: Organization ────────────────────────────────────────────────────────

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

function OrganizationTab({ data }: { data: SettingsOverview }) {
  const org = data.organization;
  const [form, setForm] = useState({
    name: org.name,
    companyDomain: org.companyDomain ?? '',
    industry: org.industry ?? '',
    companySize: org.companySize ?? '',
    country: org.country ?? '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setResult(null);
  }

  function discard() {
    setForm({
      name: org.name,
      companyDomain: org.companyDomain ?? '',
      industry: org.industry ?? '',
      companySize: org.companySize ?? '',
      country: org.country ?? '',
    });
    setDirty(false);
    setResult(null);
  }

  function save() {
    startSaving(async () => {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          companyDomain: form.companyDomain || null,
          industry: form.industry || null,
          companySize: form.companySize || null,
          country: form.country || null,
        }),
      });
      if (res.ok) {
        setResult({ ok: true, msg: 'Organization settings saved.' });
        setDirty(false);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setResult({ ok: false, msg: body.error ?? 'Save failed.' });
      }
    });
  }

  const sizes = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];

  return (
    <div className="grid gap-4">
      {/* Unsaved changes banner */}
      {dirty && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-semibold text-amber-800">You have unsaved changes</span>
          <div className="flex gap-2">
            <button onClick={discard} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Discard
            </button>
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {result.msg}
        </div>
      )}

      <SectionCard>
        <SectionHeader title="Organization Details" subtitle="Basic information about your organization" />
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <InputField label="Organization name" value={form.name} onChange={(v) => update('name', v)} placeholder="Acme Corporation" />
          <InputField label="Company domain" value={form.companyDomain} onChange={(v) => update('companyDomain', v)} placeholder="acme.com" />
          <InputField label="Industry" value={form.industry} onChange={(v) => update('industry', v)} placeholder="e.g. Financial Services" />
          <div>
            <label className="block text-xs font-semibold text-slate-700">Company size</label>
            <select
              value={form.companySize}
              onChange={(e) => update('companySize', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Select size…</option>
              {sizes.map((s) => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </div>
          <InputField label="Country / Region" value={form.country} onChange={(v) => update('country', v)} placeholder="e.g. United States" />
        </div>
        {!dirty && (
          <div className="flex justify-end border-t border-slate-100 px-6 py-4">
            <button onClick={() => setDirty(true)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Edit
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="Departments"
          subtitle="Organizational units used for routing and reporting"
          action={<ManageLink href="/settings/onboarding" label="Edit in onboarding" />}
        />
        <div className="flex flex-wrap gap-2 p-6">
          {org.departments.length > 0
            ? org.departments.map((d) => (
                <span key={d} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{d}</span>
              ))
            : <span className="text-sm text-slate-400">No departments configured.</span>}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="Approval Categories"
          subtitle="Labels used by the AI classifier for approval decisions"
          action={<ManageLink href="/settings/onboarding" label="Edit in onboarding" />}
        />
        <div className="flex flex-wrap gap-2 p-6">
          {org.approvalCategories.length > 0
            ? org.approvalCategories.map((c) => (
                <span key={c} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{c}</span>
              ))
            : <span className="text-sm text-slate-400">No categories configured.</span>}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Authentication" subtitle="Identity and access management via Clerk" action={<ManageLink href="/settings/identity" label="Configure" />} />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Identity provider" value="Clerk" />
          <ConfigRow label="MFA enforcement" value="Configured via Clerk organization settings" />
          <ConfigRow label="SSO" value="Configure in Identity Center" />
          <ConfigRow label="Session management" value="Clerk-managed" />
          <ConfigRow label="OAuth connector tokens" value="AES-256-GCM encrypted at rest" />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link
            href="/settings/identity"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Key className="h-4 w-4" />
            Open Identity Center
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Security Posture" subtitle="Active security controls" />
        <div className="grid gap-2 p-6 sm:grid-cols-2">
          {[
            'Read-only OAuth connector scopes',
            'AES-256-GCM token encryption at rest',
            'Complete audit trail for all mutations',
            'Column-based tenant isolation (organizationId)',
            'IDOR prevention on all API mutations',
            'RBAC enforced at page, API, and service layers',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-xs text-slate-700">{item}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Trust & Compliance" />
        <div className="flex flex-wrap gap-2 p-6">
          <Link href="/trust" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Security & Trust Center <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/trust/compliance" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Compliance Hub <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Users & Teams ───────────────────────────────────────────────────────

function UsersTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Users & Teams" subtitle="Manage workspace members, teams, roles, and permissions" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Total users" value={`${data.stats.totalUsers}`} />
          <ConfigRow label="Total teams" value={`${data.stats.totalTeams}`} />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link
            href="/settings/users"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            <Users className="h-4 w-4" />
            Open Users & Teams
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Roles & Permissions" subtitle="ApprovLine uses a six-level role hierarchy" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="py-3 pl-6 text-left font-semibold text-slate-500">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Analytics</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Settings</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Investigations</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                { role: 'OWNER', analytics: true, settings: true, investigations: true, compliance: true },
                { role: 'ADMIN', analytics: true, settings: true, investigations: true, compliance: true },
                { role: 'MANAGER', analytics: false, settings: false, investigations: true, compliance: false },
                { role: 'AUDITOR', analytics: false, settings: false, investigations: false, compliance: true },
                { role: 'MEMBER', analytics: false, settings: false, investigations: false, compliance: false },
                { role: 'VIEWER', analytics: false, settings: false, investigations: false, compliance: false },
              ].map(({ role, analytics, settings, investigations, compliance }) => (
                <tr key={role}>
                  <td className="py-3 pl-6 font-bold text-slate-900">{role}</td>
                  <td className="px-4 py-3">{analytics ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">{settings ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">{investigations ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">{compliance ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Workflow & Approvals ────────────────────────────────────────────────

function WorkflowTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Classification Pipeline" subtitle="AI-powered approval detection and classification" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Primary classifier" value="Anthropic Claude" />
          <ConfigRow label="Fallback classifier" value="OpenAI GPT" />
          <ConfigRow label="Queue" value="BullMQ + Redis (concurrency 10)" />
          <ConfigRow label="Dead-letter handling" value="Enabled" />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Playbook AI" subtitle="Compliance playbooks that guide approval evaluation" action={<ManageLink href="/playbooks" label="Manage playbooks" />} />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Configured playbooks" value={`${data.stats.totalPlaybooks}`} />
          <ConfigRow label="Evaluation" value="Per-approval compliance scoring" />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link href="/playbooks" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Open Playbook AI <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="Approval Categories"
          subtitle="Labels used by the classifier"
          action={<ManageLink href="/settings/onboarding" label="Edit" />}
        />
        <div className="flex flex-wrap gap-2 p-6">
          {data.organization.approvalCategories.length > 0
            ? data.organization.approvalCategories.map((c) => (
                <span key={c} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{c}</span>
              ))
            : <span className="text-sm text-slate-400">No categories configured.</span>}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Evidence & Data ─────────────────────────────────────────────────────

function EvidenceTab() {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Evidence Pipeline" subtitle="Capture, deduplication, and correlation settings" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Evidence capture" value="Enabled" valueClass="text-emerald-700" />
          <ConfigRow label="Deduplication" value="Content-hash idempotency" />
          <ConfigRow label="Cross-source correlation" value="UnifiedEvidenceRecord" />
          <ConfigRow label="Memory graph" value="Entity-relationship timeline" />
          <ConfigRow label="Tenant isolation" value="Column-based (organizationId)" />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-6 py-4">
          <Link href="/evidence" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Unified Evidence <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/memory" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Memory Graph <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Data retention & deletion</p>
          <p className="mt-1 text-xs text-slate-600">
            Bulk data deletion, retention policy changes, and export operations are high-impact. Contact your administrator or use the Founder Control Center for these operations.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Integrations ────────────────────────────────────────────────────────

function IntegrationsTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader
          title="Connected Integrations"
          subtitle={`${data.stats.activeIntegrations} integration${data.stats.activeIntegrations !== 1 ? 's' : ''} currently connected`}
        />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Token security" value="AES-256-GCM encrypted at rest" />
          <ConfigRow label="OAuth scopes" value="Read-only by design" />
          <ConfigRow label="Providers" value="Slack, Gmail, Teams, Jira, ServiceNow, Zoom" />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link
            href="/dashboard/settings/integrations"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
          >
            <Cable className="h-4 w-4" />
            Manage Integrations
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Universal Approval Gateway" subtitle="Enterprise system connections via API key" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Authentication" value="Static API key (timing-safe comparison)" />
          <ConfigRow label="Enterprise systems" value="SAP, Oracle, Coupa, Workday, Salesforce, HubSpot" />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link href="/dashboard/gateway" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Universal Gateway <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab() {
  const channels = [
    { label: 'Email notifications', status: 'Via alert configuration' },
    { label: 'In-app alerts', status: 'Enabled' },
    { label: 'Slack alerts', status: 'Via Slack integration' },
    { label: 'Webhook delivery', status: 'Per-integration' },
  ];
  const categories = [
    'Approval requests',
    'High-risk approvals',
    'Evidence gaps',
    'Compliance issues',
    'Investigation updates',
    'Security alerts',
    'Integration failures',
  ];
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Notification Channels" action={<ManageLink href="/dashboard/alerts" label="Configure alerts" />} />
        <div className="divide-y divide-slate-100 px-6">
          {channels.map(({ label, status }) => (
            <ConfigRow key={label} label={label} value={status} />
          ))}
        </div>
      </SectionCard>
      <SectionCard>
        <SectionHeader title="Notification Categories" subtitle="Alert types delivered through configured channels" />
        <div className="flex flex-wrap gap-2 p-6">
          {categories.map((c) => (
            <span key={c} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{c}</span>
          ))}
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link href="/dashboard/alerts" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Configure Alerts & Risks <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Billing ─────────────────────────────────────────────────────────────

function BillingTab({ data }: { data: SettingsOverview }) {
  const org = data.organization;
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Current Plan" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Organization" value={org.name} />
          <ConfigRow label="Onboarded" value={org.onboardedAt ? new Date(org.onboardedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Pending'} />
          <ConfigRow label="Members" value={`${data.stats.totalUsers}`} />
        </div>
      </SectionCard>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
        <p className="text-sm font-semibold text-blue-900">Billing is managed externally</p>
        <p className="mt-1 text-xs text-slate-600">
          For plan changes, seat additions, or billing inquiries, contact your account representative at{' '}
          <span className="font-semibold text-blue-700">support@approvline.ai</span>
        </p>
      </div>
    </div>
  );
}

// ─── Tab: Audit ───────────────────────────────────────────────────────────────

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'settings.organization_updated': 'Organization settings updated',
    'settings.preferences_updated': 'Preferences updated',
    'onboarding.organization_updated': 'Onboarding org details updated',
    'onboarding.completed': 'Onboarding completed',
    'team.created': 'Team created',
    'team.deleted': 'Team deleted',
    'team.member.role_changed': 'Member role changed',
    'user.invited': 'User invited',
    'security_request_submitted': 'Security request submitted',
  };
  return map[action] ?? action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function AuditTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Audit Configuration" subtitle="All configuration changes are automatically audited" />
        <div className="divide-y divide-slate-100 px-6">
          <ConfigRow label="Audit logging" value="Enabled — all mutations" />
          <ConfigRow label="Scope" value="Organization-scoped with actor tracking" />
          <ConfigRow label="Retention" value="Full history retained" />
        </div>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link href="/dashboard/audit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            <ScrollText className="h-4 w-4" />
            Open Audit Logs
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Recent Configuration Events" />
        {data.recentActivity.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No recent configuration events.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recentActivity.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 px-6 py-3 text-xs">
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="flex-1 text-slate-700">{actionLabel(ev.action)}</span>
                <span className="shrink-0 text-slate-400">{relDate(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: System Preferences ──────────────────────────────────────────────────

function SystemTab({ data }: { data: SettingsOverview }) {
  const { systemStatus } = data;
  const checks: { label: string; status: string; message?: string | null }[] = [
    { label: 'PostgreSQL database', status: systemStatus.postgresql.status, message: systemStatus.postgresql.message },
    { label: 'Redis / BullMQ queue', status: systemStatus.redis.status, message: systemStatus.redis.message },
    { label: 'Anthropic AI classifier', status: systemStatus.anthropic.status, message: systemStatus.anthropic.message },
    { label: 'OpenAI fallback classifier', status: systemStatus.openai.status, message: systemStatus.openai.message },
  ];

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader
          title="System Status"
          action={
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${systemStatus.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {systemStatus.ready ? 'Operational' : 'Degraded'}
            </span>
          }
        />
        <ul className="divide-y divide-slate-100">
          {checks.map(({ label, status, message }) => (
            <li key={label} className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status === 'ok' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
                <span className="text-sm text-slate-700">{label}</span>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold ${status === 'ok' ? 'text-emerald-600' : status === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                  {status}
                </span>
                {message && status !== 'ok' && <p className="text-[11px] text-slate-400">{message}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 px-6 py-4">
          <Link href="/health" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Full system status <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Demo Workspace" subtitle="Generate or reset demo data for testing" />
        <div className="flex flex-wrap gap-2 p-6">
          <form action="/api/demo/seed" method="post">
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500">
              Generate Demo Data
            </button>
          </form>
          <form action="/api/demo/reset" method="post">
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Reset Demo Data
            </button>
          </form>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function SettingsShell({ data }: { data: SettingsOverview }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="flex gap-6">
      {/* Secondary settings nav — desktop sidebar */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <nav className="grid gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                activeTab === id
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${activeTab === id ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tab strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap ${
              activeTab === id ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-w-0 flex-1">
        {activeTab === 'overview' && <OverviewTab data={data} setTab={setActiveTab} />}
        {activeTab === 'organization' && <OrganizationTab data={data} />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'users' && <UsersTab data={data} />}
        {activeTab === 'workflow' && <WorkflowTab data={data} />}
        {activeTab === 'evidence' && <EvidenceTab />}
        {activeTab === 'integrations' && <IntegrationsTab data={data} />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'billing' && <BillingTab data={data} />}
        {activeTab === 'audit' && <AuditTab data={data} />}
        {activeTab === 'system' && <SystemTab data={data} />}
      </div>
    </div>
  );
}
