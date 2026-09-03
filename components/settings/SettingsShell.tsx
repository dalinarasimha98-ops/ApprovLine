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
  Clock,
  ExternalLink,
  Globe,
  Key,
  Layers,
  Lock,
  RefreshCw,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Sliders,
  Tag,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import type { SettingsOverview } from '@/services/settings';

type Tab = 'overview' | 'organization' | 'security' | 'workflow' | 'evidence' | 'integrations' | 'notifications' | 'billing' | 'audit' | 'system';

const TABS: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'workflow', label: 'Workflow & Approvals', icon: Sliders },
  { id: 'evidence', label: 'Evidence & Data', icon: ShieldCheck },
  { id: 'integrations', label: 'Integrations', icon: Cable },
  { id: 'notifications', label: 'Notifications', icon: Activity },
  { id: 'billing', label: 'Billing & Plan', icon: Tag },
  { id: 'audit', label: 'Audit', icon: ScrollText },
  { id: 'system', label: 'System Preferences', icon: Settings2 },
];

function relDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatusDot({ status }: { status: string }) {
  if (status === 'ok') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />;
  if (status === 'error') return <span className="inline-block h-2 w-2 rounded-full bg-red-400" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />;
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

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: SettingsOverview }) {
  const { organization: org, stats, systemStatus, recentActivity } = data;

  const statTiles = [
    { label: 'Organization', value: org.name, sub: org.slug ? `/${org.slug}` : org.companyDomain ?? '—', icon: Building2 },
    { label: 'Members', value: stats.totalUsers.toString(), sub: `${stats.totalTeams} team${stats.totalTeams !== 1 ? 's' : ''}`, icon: Users },
    { label: 'Integrations', value: stats.activeIntegrations.toString(), sub: 'connected', icon: Cable },
    { label: 'Playbooks', value: stats.totalPlaybooks.toString(), sub: 'configured', icon: ShieldCheck },
    { label: 'Security', value: 'Clerk', sub: 'identity provider', icon: Lock },
    { label: 'Onboarded', value: org.onboardedAt ? new Date(org.onboardedAt).toLocaleDateString() : 'Pending', sub: org.onboardedAt ? 'complete' : 'incomplete', icon: CheckCircle2 },
  ];

  const checks = [
    { label: 'PostgreSQL', check: systemStatus.postgresql },
    { label: 'Redis', check: systemStatus.redis },
    { label: 'Anthropic AI', check: systemStatus.anthropic },
    { label: 'OpenAI Fallback', check: systemStatus.openai },
  ];

  return (
    <div className="grid gap-6">
      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statTiles.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
              <Icon className="h-4 w-4 text-blue-300" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{value}</p>
              <p className="truncate text-[11px] text-slate-500">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* System health */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">System Health</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${systemStatus.ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {systemStatus.ready ? 'All systems operational' : 'Degraded'}
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {checks.map(({ label, check }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <StatusDot status={check.status} />
                <span className="text-xs font-medium text-slate-300">{label}</span>
              </div>
              <span className={`text-[11px] font-semibold ${check.status === 'ok' ? 'text-emerald-400' : check.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                {check.status}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Link href="/health" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            Full system status <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Manage Integrations', href: '/dashboard/settings/integrations', icon: Cable },
          { label: 'Identity Center', href: '/settings/identity', icon: Key },
          { label: 'Compliance Hub', href: '/trust/compliance', icon: ShieldCheck },
          { label: 'Audit Logs', href: '/dashboard/audit', icon: ScrollText },
          { label: 'Users & Teams', href: '/settings/users', icon: Users },
          { label: 'Service Health', href: '/health', icon: Activity },
        ].map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
          >
            <Icon className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="flex-1">{label}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-5">
          <h3 className="text-sm font-semibold text-slate-200">Recent Configuration Activity</h3>
          <ul className="mt-3 space-y-1">
            {recentActivity.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-xs hover:bg-white/[0.03]">
                <Clock className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span className="flex-1 text-slate-300">{actionLabel(ev.action)}</span>
                <span className="shrink-0 text-slate-600">{relDate(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Organization ────────────────────────────────────────────────────────

function OrgField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
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
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function field(key: keyof typeof form) {
    return { value: form[key], onChange: (v: string) => setForm((f) => ({ ...f, [key]: v })) };
  }

  function save() {
    setResult(null);
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
      } else {
        const body = await res.json().catch(() => ({}));
        setResult({ ok: false, msg: body.error ?? 'Save failed.' });
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Organization Details</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <OrgField label="Organization Name" {...field('name')} />
          <OrgField label="Company Domain" {...field('companyDomain')} />
          <OrgField label="Industry" {...field('industry')} />
          <OrgField label="Company Size" {...field('companySize')} />
          <OrgField label="Country" {...field('country')} />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Organization ID</label>
            <p className="mt-1.5 rounded-lg border border-white/[0.05] bg-white/[0.03] px-3 py-2 text-sm font-mono text-slate-500 select-all">{org.id}</p>
          </div>
        </div>

        {result && (
          <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${result.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.msg}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* Departments & Categories (read-only display; managed via onboarding) */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Departments</h3>
            <p className="mt-1 text-xs text-slate-500">Configure via onboarding or the Organization profile.</p>
          </div>
          <Link href="/settings/onboarding" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            Edit <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {org.departments.length > 0 ? org.departments.map((d) => (
            <span key={d} className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-xs text-slate-300">{d}</span>
          )) : <span className="text-xs text-slate-600">No departments configured.</span>}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Approval Categories</h3>
            <p className="mt-1 text-xs text-slate-500">Drives classification labels across all approvals.</p>
          </div>
          <Link href="/settings/onboarding" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            Edit <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {org.approvalCategories.length > 0 ? org.approvalCategories.map((c) => (
            <span key={c} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">{c}</span>
          )) : <span className="text-xs text-slate-600">No categories configured.</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Authentication</h3>
        <p className="mt-1 text-xs text-slate-500">Identity and SSO are managed through Clerk. Configure SAML, SCIM, and enterprise SSO in the Identity Center.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Identity Provider', value: 'Clerk', icon: Key },
            { label: 'MFA', value: 'Enforced via Clerk', icon: Shield },
            { label: 'OAuth Tokens', value: 'AES-256-GCM encrypted at rest', icon: Lock },
            { label: 'Session Management', value: 'Clerk-managed', icon: Globe },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-start gap-3 rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-0.5 text-xs text-slate-300">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link
            href="/settings/identity"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
          >
            <Key className="h-4 w-4" />
            Open Identity Center
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Security Posture</h3>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            'Read-only connector scopes',
            'AES-256-GCM token encryption',
            'Complete audit trail',
            'Tenant column isolation',
            'IDOR prevention on all mutations',
            'GDPR-ready architecture',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="text-xs text-slate-300">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Trust & Compliance</h3>
        <p className="mt-1 text-xs text-slate-500">Review compliance controls, playbook evaluations, and evidence attestations.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/trust" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Security & Trust Center <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/trust/compliance" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Compliance Hub <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Workflow & Approvals ────────────────────────────────────────────────

function WorkflowTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Approval Pipeline</h3>
        <p className="mt-1 text-xs text-slate-500">The classification pipeline ingests events from integrations, evaluates them against playbooks, and produces an auditable evidence trail.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { label: 'Primary Classifier', value: 'Anthropic Claude (LLM)', icon: Zap },
            { label: 'Fallback Classifier', value: 'OpenAI GPT', icon: Zap },
            { label: 'Queue', value: 'BullMQ + Redis', icon: Activity },
            { label: 'Playbooks', value: `${data.stats.totalPlaybooks} configured`, icon: ShieldCheck },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-start gap-3 rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-0.5 text-xs text-slate-300">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Approval Categories</h3>
            <p className="mt-1 text-xs text-slate-500">{data.organization.approvalCategories.length} categories drive the classifier labels.</p>
          </div>
          <Link href="/settings/onboarding" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">Edit <ExternalLink className="h-3 w-3" /></Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.organization.approvalCategories.length > 0
            ? data.organization.approvalCategories.map((c) => (
                <span key={c} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">{c}</span>
              ))
            : <span className="text-xs text-slate-600">No categories configured.</span>}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Playbook AI</h3>
        <p className="mt-1 text-xs text-slate-500">Upload and manage compliance playbooks that guide approval evaluation.</p>
        <div className="mt-3">
          <Link href="/playbooks" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Open Playbook AI <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Evidence & Data ─────────────────────────────────────────────────────

function EvidenceTab() {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Evidence Pipeline</h3>
        <p className="mt-1 text-xs text-slate-500">Canonical evidence events are captured before classification, content-hashed for idempotency, and unified across providers into a memory graph timeline.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { label: 'Deduplication', value: 'Content-hash idempotency' },
            { label: 'Retention', value: 'Organization-scoped, GDPR-ready' },
            { label: 'Cross-source', value: 'UnifiedEvidenceRecord correlation' },
            { label: 'Memory Graph', value: 'Entity-relationship timeline' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-0.5 text-xs text-slate-300">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/evidence" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Unified Evidence <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/memory" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Memory Graph <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.04] p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-amber-200">Data Management</h3>
            <p className="mt-1 text-xs text-slate-400">
              Data deletion, export, and retention configuration changes are high-impact operations. Contact your administrator or use the Founder Control Center for bulk data operations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Integrations ────────────────────────────────────────────────────────

function IntegrationsTab({ activeIntegrations }: { activeIntegrations: number }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Connected Integrations</h3>
            <p className="mt-1 text-xs text-slate-500">{activeIntegrations} integration{activeIntegrations !== 1 ? 's' : ''} currently connected.</p>
          </div>
          <Link
            href="/dashboard/settings/integrations"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
          >
            Manage <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          ApprovLine connects to Slack, Gmail, Microsoft Teams, Jira, ServiceNow, and Zoom via OAuth, plus enterprise systems (SAP, Oracle, Coupa, Workday, Salesforce, HubSpot) via the Universal Approval Gateway.
          All connector tokens are encrypted at rest with AES-256-GCM.
        </p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Universal Approval Gateway</h3>
        <p className="mt-1 text-xs text-slate-500">Enterprise systems connect via API key authentication. API keys are environment-scoped and never exposed to the frontend.</p>
        <div className="mt-3">
          <Link href="/dashboard/gateway" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
            Universal Gateway <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab() {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
      <div className="flex items-start gap-3">
        <Activity className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Notification Preferences</h3>
          <p className="mt-1 text-xs text-slate-500">
            Alert and risk notification preferences are configured in the Alerts & Risks section. Email digests and webhook delivery are managed per-integration.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/alerts" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">
              Alerts & Risks <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Billing ─────────────────────────────────────────────────────────────

function BillingTab({ org }: { org: SettingsOverview['organization'] }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Plan & Billing</h3>
        <p className="mt-1 text-xs text-slate-500">Billing is managed by your account representative. Contact support for plan changes or seat additions.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Organization</p>
            <p className="mt-0.5 text-xs text-slate-300">{org.name}</p>
          </div>
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.03] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Onboarded</p>
            <p className="mt-0.5 text-xs text-slate-300">{org.onboardedAt ? new Date(org.onboardedAt).toLocaleDateString() : 'Pending'}</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.04] p-6">
        <p className="text-xs text-slate-400">For billing inquiries, seat management, or plan upgrades contact <span className="text-blue-400">support@approvline.ai</span></p>
      </div>
    </div>
  );
}

// ─── Tab: Audit ───────────────────────────────────────────────────────────────

function AuditTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Recent Configuration Events</h3>
          <Link href="/dashboard/audit" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            Full audit log <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className="mt-4 text-xs text-slate-600">No recent configuration events.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.04]">
            {data.recentActivity.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 py-2.5 text-xs">
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span className="flex-1 text-slate-300">{actionLabel(ev.action)}</span>
                <span className="shrink-0 text-[11px] text-slate-600">{relDate(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Tab: System Preferences ──────────────────────────────────────────────────

function SystemTab({ data }: { data: SettingsOverview }) {
  const { systemStatus } = data;
  const checks = [
    { label: 'PostgreSQL database', check: systemStatus.postgresql },
    { label: 'Redis / BullMQ', check: systemStatus.redis },
    { label: 'Anthropic AI classifier', check: systemStatus.anthropic },
    { label: 'OpenAI fallback classifier', check: systemStatus.openai },
  ];

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Live System Status</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${systemStatus.ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
            {systemStatus.ready ? 'Operational' : 'Degraded'}
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {checks.map(({ label, check }) => (
            <li key={label} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.03] px-3 py-3">
              <div className="flex items-center gap-2.5">
                <StatusDot status={check.status} />
                <span className="text-xs font-medium text-slate-300">{label}</span>
              </div>
              <div className="text-right">
                <span className={`text-[11px] font-semibold ${check.status === 'ok' ? 'text-emerald-400' : check.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                  {check.status}
                </span>
                {check.message && <p className="text-[10px] text-slate-600">{check.message}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end">
          <Link href="/health" className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300">
            Full system status page <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-6">
        <h3 className="text-sm font-semibold text-slate-200">Demo Workspace</h3>
        <p className="mt-1 text-xs text-slate-500">Generate or reset demo approvals, Slack/Gmail evidence, audit logs, and export-ready records.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <form action="/api/demo/seed" method="post">
            <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500">
              Generate Demo Data
            </button>
          </form>
          <form action="/api/demo/reset" method="post">
            <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-semibold text-slate-300 transition hover:text-white">
              Reset Demo Data
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function SettingsShell({ data }: { data: SettingsOverview }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* Sidebar nav */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <nav className="sticky top-4 grid gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
                activeTab === id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${activeTab === id ? 'text-blue-100' : 'text-slate-500'}`} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile tab scroll */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold ${
              activeTab === id ? 'border-blue-500/50 bg-blue-500/15 text-blue-200' : 'border-white/10 bg-white/[0.04] text-slate-400'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'organization' && <OrganizationTab data={data} />}
        {activeTab === 'security' && <SecurityTab />}
        {activeTab === 'workflow' && <WorkflowTab data={data} />}
        {activeTab === 'evidence' && <EvidenceTab />}
        {activeTab === 'integrations' && <IntegrationsTab activeIntegrations={data.stats.activeIntegrations} />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'billing' && <BillingTab org={data.organization} />}
        {activeTab === 'audit' && <AuditTab data={data} />}
        {activeTab === 'system' && <SystemTab data={data} />}
      </div>
    </div>
  );
}
