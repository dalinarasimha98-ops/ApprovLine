'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Cable,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Key,
  Layers,
  RefreshCw,
  ScrollText,
  Settings2,
  Shield,
  Sliders,
  Tag,
  Users,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type { SettingsOverview } from '@/services/settings';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';

type Tab =
  | 'overview'
  | 'users'
  | 'integrations'
  | 'approvals'
  | 'security'
  | 'billing'
  | 'usage'
  | 'audit'
  | 'system';

const TABS: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'overview', label: 'Overview', icon: Layers },
  { id: 'users', label: 'Users & Teams', icon: Users },
  { id: 'integrations', label: 'Integrations', icon: Cable },
  { id: 'approvals', label: 'Approval Settings', icon: Sliders },
  { id: 'security', label: 'Security & Compliance', icon: Shield },
  { id: 'billing', label: 'Billing & Plan', icon: Tag },
  { id: 'usage', label: 'Usage & Limits', icon: BarChart3 },
  { id: 'audit', label: 'Audit & Logs', icon: ScrollText },
  { id: 'system', label: 'System', icon: Settings2 },
];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-al-border bg-al-surface shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-al-border px-6 py-4">
      <div>
        <h3 className="text-sm font-bold text-al-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-al-text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ManageLink({ href, label = 'Manage' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info"
    >
      {label} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

function ConfigRow({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-al-text-muted">{label}</span>
      <span className={`text-sm font-semibold text-al-text ${valueClass}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ ok, trueLabel = 'Configured', falseLabel = 'Not configured' }: { ok: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${ok ? 'bg-al-success/10 text-al-success' : 'bg-al-text-muted/15 text-al-text-secondary'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-al-success' : 'bg-al-text-muted'}`} />
      {ok ? trueLabel : falseLabel}
    </span>
  );
}

// ─── KPI strip ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-al-border bg-al-surface p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-al-accent/10 text-al-accent">
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-al-text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-black tracking-tight text-al-text">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-al-text-muted">{detail}</p>
    </div>
  );
}

function KpiStrip({ data }: { data: SettingsOverview }) {
  const { stats, kpis } = data;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard
        icon={Users}
        label="Total Users"
        value={`${stats.totalUsers}`}
        detail={kpis.pendingInvites > 0 ? `${kpis.pendingInvites} pending invite${kpis.pendingInvites === 1 ? '' : 's'}` : 'No pending invites'}
      />
      <KpiCard
        icon={Cable}
        label="Connected Integrations"
        value={`${kpis.connectedIntegrations}`}
        detail={kpis.integrationsInCatalog > 0 ? `${kpis.integrationsInCatalog} in catalog` : 'Catalog unavailable'}
      />
      <KpiCard
        icon={Sliders}
        label="Approval Workflows"
        value={`${kpis.workflowsTotal}`}
        detail={`${kpis.workflowsActive} active`}
      />
      <KpiCard
        icon={Database}
        label="Data Sources"
        value={`${kpis.dataSourcesTotal}`}
        detail={`${kpis.dataSourcesCapturing} capturing`}
      />
      <KpiCard
        icon={BarChart3}
        label="Monthly Usage"
        value={`${kpis.approvalsThisMonth}`}
        detail="No plan limit configured"
      />
    </div>
  );
}

// ─── Edit Organization Information drawer ──────────────────────────────────────

type OrgForm = {
  name: string;
  companyDomain: string;
  industry: string;
  companySize: string;
  country: string;
  primaryAdminName: string;
  primaryAdminEmail: string;
};

function orgFormFromData(org: SettingsOverview['organization']): OrgForm {
  return {
    name: org.name,
    companyDomain: org.companyDomain ?? '',
    industry: org.industry ?? '',
    companySize: org.companySize ?? '',
    country: org.country ?? '',
    primaryAdminName: org.primaryAdminName ?? '',
    primaryAdminEmail: org.primaryAdminEmail ?? '',
  };
}

const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];

function EditOrganizationDrawer({
  org,
  onClose,
  onSaved,
}: {
  org: SettingsOverview['organization'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<OrgForm>(() => orgFormFromData(org));
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = orgFormFromData(org);
  const dirty = (Object.keys(form) as (keyof OrgForm)[]).some((k) => form[k] !== initial[k]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  function update(key: keyof OrgForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  function save() {
    setError(null);
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
          primaryAdminName: form.primaryAdminName || null,
          primaryAdminEmail: form.primaryAdminEmail || null,
        }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? 'Could not save organization information. Please try again.');
      }
    });
  }

  return (
    <DetailDrawer open onClose={onClose} titleId={titleId} size="md">
      <div className="flex shrink-0 items-center justify-between border-b border-al-border px-6 py-4">
        <div>
          <p id={titleId} className="text-base font-black text-al-text">Edit Organization Information</p>
          <p className="mt-0.5 text-xs text-al-text-muted">Changes are audited and visible to all workspace admins.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-al-text-muted hover:bg-al-surface-elevated">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-al-danger/30 bg-al-danger/10 px-4 py-3 text-sm font-semibold text-al-danger">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid gap-4">
          <div>
            <label htmlFor="org-name" className="block text-xs font-semibold text-al-text-secondary">Organization name</label>
            <input
              ref={firstFieldRef}
              id="org-name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              maxLength={200}
              className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
            />
          </div>
          <div>
            <label htmlFor="org-domain" className="block text-xs font-semibold text-al-text-secondary">Website / domain</label>
            <input
              id="org-domain"
              type="text"
              value={form.companyDomain}
              onChange={(e) => update('companyDomain', e.target.value)}
              placeholder="acme.com"
              maxLength={200}
              className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text placeholder:text-al-text-muted focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="org-industry" className="block text-xs font-semibold text-al-text-secondary">Industry</label>
              <input
                id="org-industry"
                type="text"
                value={form.industry}
                onChange={(e) => update('industry', e.target.value)}
                placeholder="e.g. Financial Services"
                maxLength={100}
                className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text placeholder:text-al-text-muted focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
              />
            </div>
            <div>
              <label htmlFor="org-size" className="block text-xs font-semibold text-al-text-secondary">Company size</label>
              <select
                id="org-size"
                value={form.companySize}
                onChange={(e) => update('companySize', e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
              >
                <option value="">Select size…</option>
                {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="org-country" className="block text-xs font-semibold text-al-text-secondary">Country / Region</label>
            <input
              id="org-country"
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              placeholder="e.g. United States"
              maxLength={100}
              className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text placeholder:text-al-text-muted focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="org-contact-name" className="block text-xs font-semibold text-al-text-secondary">Primary contact</label>
              <input
                id="org-contact-name"
                type="text"
                value={form.primaryAdminName}
                onChange={(e) => update('primaryAdminName', e.target.value)}
                maxLength={200}
                className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
              />
            </div>
            <div>
              <label htmlFor="org-contact-email" className="block text-xs font-semibold text-al-text-secondary">Contact email</label>
              <input
                id="org-contact-email"
                type="email"
                value={form.primaryAdminEmail}
                onChange={(e) => update('primaryAdminEmail', e.target.value)}
                maxLength={320}
                className="mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20"
              />
            </div>
          </div>
        </div>

        <p className="mt-5 rounded-xl border border-al-border bg-al-surface-sunken px-4 py-3 text-xs leading-5 text-al-text-muted">
          Phone number and street address are not yet part of Organization Settings. Departments and Approval Categories are managed from the onboarding wizard.
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-al-border px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-al-border bg-al-surface px-4 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || !form.name.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-al-accent px-4 py-2 text-xs font-semibold text-white hover:bg-al-accent-hover disabled:opacity-50"
        >
          {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </DetailDrawer>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ data, setTab, onOrgSaved }: { data: SettingsOverview; setTab: (t: Tab) => void; onOrgSaved: () => void }) {
  const { organization: org, systemStatus } = data;
  const [editOpen, setEditOpen] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const systemOk = systemStatus.ready;
  const systemChecks = [
    { label: 'Gateway', ok: systemStatus.postgresql.status === 'ok' },
    { label: 'Queue', ok: systemStatus.redis.status === 'ok' },
    { label: 'AI', ok: systemStatus.anthropic.status === 'ok' || systemStatus.openai.status === 'ok' },
  ];

  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(false), 4000);
    return () => clearTimeout(t);
  }, [savedNote]);

  return (
    <div className="grid gap-4">
      {/* Compact system status row */}
      <div className="flex items-center gap-3 rounded-xl border border-al-border bg-al-surface px-4 py-3 shadow-sm">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${systemOk ? 'text-al-success' : 'text-al-warning'}`}>
          <span className={`h-2 w-2 rounded-full ${systemOk ? 'bg-al-success' : 'bg-al-warning'}`} />
          {systemOk ? 'All systems operational' : 'System degraded'}
        </span>
        <span className="text-al-text-secondary">|</span>
        {systemChecks.map(({ label, ok }) => (
          <span key={label} className={`flex items-center gap-1 text-[11px] font-semibold ${ok ? 'text-al-text-muted' : 'text-al-danger'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-al-success' : 'bg-red-400'}`} />
            {label}
          </span>
        ))}
        <Link href="/health" className="ml-auto flex items-center gap-1 text-[11px] text-al-accent hover:text-al-info">
          View status <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <KpiStrip data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Organization Information */}
        <SectionCard>
          <SectionHeader
            title="Organization Information"
            subtitle="Manage your organization's basic details"
            action={
              <button
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-1.5 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken"
              >
                Edit Information
              </button>
            }
          />
          {savedNote && (
            <div className="mx-6 mt-4 inline-flex items-center gap-1.5 rounded-full bg-al-success/10 px-3 py-1 text-xs font-bold text-al-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </div>
          )}
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Organization name" value={org.name} />
            <ConfigRow label="Website" value={org.companyDomain ?? 'Not set'} />
            <ConfigRow label="Industry" value={org.industry ?? 'Not set'} />
            <ConfigRow label="Company size" value={org.companySize ?? 'Not set'} />
            <ConfigRow label="Primary contact" value={org.primaryAdminName ?? 'Not set'} />
            <ConfigRow label="Contact email" value={org.primaryAdminEmail ?? 'Not set'} />
            <ConfigRow label="Country / Region" value={org.country ?? 'Not set'} />
          </div>
          <div className="px-6 pb-4 pt-2 text-[11px] text-al-text-muted">
            Phone and street address aren&apos;t part of Organization Settings yet.
          </div>
        </SectionCard>

        {/* Organization Branding */}
        <SectionCard>
          <SectionHeader title="Organization Branding" subtitle="Customize how your organization appears" />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Display name" value={org.name} />
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-al-text-muted">Logo upload</span>
              <StatusBadge ok={false} falseLabel="Not yet available" />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-al-text-muted">Brand color</span>
              <StatusBadge ok={false} falseLabel="Not yet available" />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-al-text-muted">Custom domain</span>
              <StatusBadge ok={false} falseLabel="Not yet available" />
            </div>
          </div>
          <div className="px-6 pb-4 pt-2 text-[11px] text-al-text-muted">
            Logo upload, brand color, and custom domains are not yet part of the ApprovLine architecture — this section will
            become editable once that infrastructure exists rather than showing controls that don&apos;t persist.
          </div>
        </SectionCard>
      </div>

      {/* Quick-link summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard>
          <SectionHeader title="Approval Settings" action={<ManageLink href="/playbooks" label="Playbooks" />} />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Workflows (playbooks)" value={`${data.kpis.workflowsTotal}`} />
            <ConfigRow label="Active" value={`${data.kpis.workflowsActive}`} />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('approvals')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              Configure approval settings <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader title="Security & Compliance" action={<ManageLink href="/settings/identity" label="Configure" />} />
          <div className="divide-y divide-al-border px-6">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-al-text-muted">Authentication</span>
              <StatusBadge ok={true} />
            </div>
            <ConfigRow label="Compliance frameworks" value={`${data.complianceFrameworks.filter((f) => f.isEnabled).length} enabled`} />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('security')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              Manage security <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader title="Integrations" action={<ManageLink href="/dashboard/settings/integrations" />} />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Connected" value={`${data.kpis.connectedIntegrations}`} />
            <ConfigRow label="In catalog" value={`${data.kpis.integrationsInCatalog}`} />
          </div>
          <div className="px-6 pb-4">
            <Link href="/dashboard/settings/integrations" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              Manage integrations <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader title="Users & Teams" action={<ManageLink href="/settings/users" />} />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Users" value={`${data.stats.totalUsers}`} />
            <ConfigRow label="Teams" value={`${data.stats.totalTeams}`} />
          </div>
          <div className="px-6 pb-4">
            <Link href="/settings/users" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              Manage users & teams <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader title="Billing & Plan" action={data.billing ? <ManageLink href="mailto:support@approvline.ai" label="Contact" /> : undefined} />
          <div className="divide-y divide-al-border px-6">
            {data.billing ? (
              <>
                <ConfigRow label="Plan" value={data.billing.planLabel} />
                <ConfigRow label="Status" value={data.billing.accountStatus} />
              </>
            ) : (
              <p className="py-3 text-sm text-al-text-muted">Not yet provisioned</p>
            )}
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('billing')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              View billing & plan <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader title="Audit & Logs" action={<ManageLink href="/dashboard/audit-log" />} />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Recent events" value={`${data.recentActivity.length}`} />
          </div>
          <div className="px-6 pb-4">
            <button onClick={() => setTab('audit')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              Open audit & logs <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </SectionCard>
      </div>

      {editOpen && (
        <EditOrganizationDrawer
          org={org}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            onOrgSaved();
            setSavedNote(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Tab: Users & Teams ───────────────────────────────────────────────────────

function UsersTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Users & Teams" subtitle="Manage workspace members, teams, roles, and permissions" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Total users" value={`${data.stats.totalUsers}`} />
          <ConfigRow label="Total teams" value={`${data.stats.totalTeams}`} />
          <ConfigRow label="Pending invites" value={`${data.kpis.pendingInvites}`} />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link
            href="/settings/users"
            className="inline-flex items-center gap-2 rounded-lg bg-al-accent px-4 py-2 text-sm font-semibold text-white hover:bg-al-accent-hover"
          >
            <UserPlus className="h-4 w-4" />
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
              <tr className="border-b border-al-border">
                <th className="py-3 pl-6 text-left font-semibold text-al-text-muted">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-al-text-muted">Analytics</th>
                <th className="px-4 py-3 text-left font-semibold text-al-text-muted">Settings</th>
                <th className="px-4 py-3 text-left font-semibold text-al-text-muted">Investigations</th>
                <th className="px-4 py-3 text-left font-semibold text-al-text-muted">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-al-border">
              {[
                { role: 'OWNER', analytics: true, settings: true, investigations: true, compliance: true },
                { role: 'ADMIN', analytics: true, settings: true, investigations: true, compliance: true },
                { role: 'MANAGER', analytics: false, settings: false, investigations: true, compliance: false },
                { role: 'AUDITOR', analytics: false, settings: false, investigations: false, compliance: true },
                { role: 'MEMBER', analytics: false, settings: false, investigations: false, compliance: false },
                { role: 'VIEWER', analytics: false, settings: false, investigations: false, compliance: false },
              ].map(({ role, analytics, settings, investigations, compliance }) => (
                <tr key={role}>
                  <td className="py-3 pl-6 font-bold text-al-text">{role}</td>
                  <td className="px-4 py-3">{analytics ? <CheckCircle2 className="h-4 w-4 text-al-success" /> : <span className="text-al-text-secondary">—</span>}</td>
                  <td className="px-4 py-3">{settings ? <CheckCircle2 className="h-4 w-4 text-al-success" /> : <span className="text-al-text-secondary">—</span>}</td>
                  <td className="px-4 py-3">{investigations ? <CheckCircle2 className="h-4 w-4 text-al-success" /> : <span className="text-al-text-secondary">—</span>}</td>
                  <td className="px-4 py-3">{compliance ? <CheckCircle2 className="h-4 w-4 text-al-success" /> : <span className="text-al-text-secondary">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
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
          subtitle={`${data.kpis.connectedIntegrations} connected · ${data.kpis.integrationsInCatalog} in catalog`}
        />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Token security" value="AES-256-GCM encrypted at rest" />
          <ConfigRow label="OAuth scopes" value="Read-only by design" />
          <ConfigRow label="Providers" value="Slack, Gmail, Teams, Jira, ServiceNow, Zoom" />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link
            href="/dashboard/settings/integrations"
            className="inline-flex items-center gap-2 rounded-lg bg-al-accent px-4 py-2 text-sm font-semibold text-white hover:bg-al-accent-hover"
          >
            <Cable className="h-4 w-4" />
            Manage Integrations
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Evidence Data Sources" subtitle="Evidence provider connections feeding the capture pipeline" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Configured" value={`${data.kpis.dataSourcesTotal}`} />
          <ConfigRow label="Actively capturing" value={`${data.kpis.dataSourcesCapturing}`} />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/evidence" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Unified Evidence <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Universal Approval Gateway" subtitle="Enterprise system connections via API key" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Authentication" value="Static API key (timing-safe comparison)" />
          <ConfigRow label="Enterprise systems" value="SAP, Oracle, Coupa, Workday, Salesforce, HubSpot" />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/dashboard/gateway" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Universal Gateway <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Approval Settings (Workflow + Evidence retention + Notifications) ────

function ApprovalSettingsTab({ data }: { data: SettingsOverview }) {
  const channels = [
    { label: 'Email notifications', status: 'Via alert configuration' },
    { label: 'In-app alerts', status: 'Enabled' },
    { label: 'Slack alerts', status: 'Via Slack integration' },
    { label: 'Webhook delivery', status: 'Per-integration' },
  ];

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Classification Pipeline" subtitle="AI-powered approval detection and classification" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Primary classifier" value="Anthropic Claude" />
          <ConfigRow label="Fallback classifier" value="OpenAI GPT" />
          <ConfigRow label="Auto-categorization" value="Always on — runs on every ingested message" />
          <ConfigRow label="Risk detection" value="Always on — every approval is compliance-evaluated" />
          <ConfigRow label="Queue" value="BullMQ + Redis (concurrency 10)" />
        </div>
        <div className="border-t border-al-border px-6 py-4 text-[11px] text-al-text-muted">
          Auto-categorization and risk detection run for every organization today — there is no per-org opt-out in the
          current classification architecture, so this is shown as status rather than a toggle with no effect.
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Playbook AI — Approval Workflows" subtitle="Compliance playbooks that define approval evaluation rules" action={<ManageLink href="/playbooks" label="Manage playbooks" />} />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Configured workflows" value={`${data.kpis.workflowsTotal}`} />
          <ConfigRow label="Active (ready)" value={`${data.kpis.workflowsActive}`} />
          <ConfigRow label="Evidence requirements" value="Defined per playbook rule, not a single org-wide toggle" />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/playbooks" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
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
                <span key={c} className="rounded-full border border-al-info/30 bg-al-info/10 px-2.5 py-1 text-xs font-medium text-al-info">{c}</span>
              ))
            : <span className="text-sm text-al-text-muted">No categories configured.</span>}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Notification Triggers" subtitle="Alert channels and categories for approval events" action={<ManageLink href="/dashboard/alerts" label="Configure alerts" />} />
        <div className="divide-y divide-al-border px-6">
          {channels.map(({ label, status }) => (
            <ConfigRow key={label} label={label} value={status} />
          ))}
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/dashboard/alerts" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Configure Alerts & Risks <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Evidence Pipeline" subtitle="Capture, deduplication, and correlation settings" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Evidence capture" value="Enabled" valueClass="text-al-success" />
          <ConfigRow label="Deduplication" value="Content-hash idempotency" />
          <ConfigRow label="Cross-source correlation" value="UnifiedEvidenceRecord" />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-al-border px-6 py-4">
          <Link href="/evidence" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Unified Evidence <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/memory" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Memory Graph <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <div className="flex items-start gap-3 rounded-xl border border-al-warning/30 bg-al-warning/10 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-al-warning" />
        <div>
          <p className="text-sm font-semibold text-al-warning">Data retention & deletion</p>
          <p className="mt-1 text-xs text-al-text-secondary">
            Bulk data deletion, retention policy changes, and export operations are high-impact. Contact your administrator or use the Founder Control Center for these operations.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Security & Compliance ────────────────────────────────────────────────

function SecurityTab({ data }: { data: SettingsOverview }) {
  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader title="Authentication" subtitle="Identity and access management via Clerk" action={<ManageLink href="/settings/identity" label="Configure" />} />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Identity provider" value="Clerk" />
          <ConfigRow label="Single Sign-On (SSO)" value="Configure in Identity Center" />
          <ConfigRow label="Two-factor authentication" value="Per-user, enforced via Clerk (not an org-wide policy today)" />
          <ConfigRow label="Password policy" value="Managed by Clerk" />
          <ConfigRow label="Session management" value="Clerk-managed" />
          <ConfigRow label="OAuth connector tokens" value="AES-256-GCM encrypted at rest" />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link
            href="/settings/identity"
            className="inline-flex items-center gap-2 rounded-lg border border-al-info/30 bg-al-info/10 px-4 py-2 text-sm font-semibold text-al-info hover:bg-al-info/15"
          >
            <Key className="h-4 w-4" />
            Open Identity Center
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader
          title="Compliance Frameworks"
          subtitle="Frameworks enabled for this organization in the Compliance Hub"
          action={<ManageLink href="/trust/compliance" label="Compliance Hub" />}
        />
        {data.complianceFrameworks.length === 0 ? (
          <p className="p-6 text-sm text-al-text-muted">No compliance frameworks configured yet.</p>
        ) : (
          <div className="divide-y divide-al-border px-6">
            {data.complianceFrameworks.map((f) => (
              <div key={f.slug} className="flex items-center justify-between py-3">
                <div>
                  <span className="text-sm font-semibold text-al-text">{f.name}</span>
                  {f.lastAssessmentAt && (
                    <span className="ml-2 text-[11px] text-al-text-muted">
                      Last assessed {new Date(f.lastAssessmentAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <StatusBadge ok={f.isEnabled} trueLabel="Enabled" falseLabel="Disabled" />
              </div>
            ))}
          </div>
        )}
        <div className="px-6 pb-4 pt-2 text-[11px] text-al-text-muted">
          Enabled reflects internal configuration in ApprovLine&apos;s Compliance Hub — it is not a claim of third-party certification.
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Data Retention & Audit Log Retention" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow
            label="Data retention"
            value={data.dataRetentionDays !== null ? `${data.dataRetentionDays} days` : 'Not yet provisioned'}
          />
          <ConfigRow label="Audit log retention" value="Full history retained" />
        </div>
        <div className="px-6 pb-4 pt-2 text-[11px] text-al-text-muted">
          Data retention is provisioned by ApprovLine at account setup — it is informational here, not a customer-editable control.
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
            <div key={item} className="flex items-start gap-2.5 rounded-lg border border-al-success/20 bg-al-success/10 px-3 py-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-al-success" />
              <span className="text-xs text-al-text-secondary">{item}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Trust & Compliance" />
        <div className="flex flex-wrap gap-2 p-6">
          <Link href="/trust" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Security & Trust Center <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href="/trust/compliance" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Compliance Hub <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Tab: Billing & Plan ────────────────────────────────────────────────────────

const ACCOUNT_STATUS_TONE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-al-success/10 text-al-success' },
  TRIAL: { label: 'Trial', className: 'bg-al-info/10 text-al-info' },
  SUSPENDED: { label: 'Suspended', className: 'bg-al-warning/10 text-al-warning' },
  CHURNED: { label: 'Churned', className: 'bg-al-danger/10 text-al-danger' },
};

function BillingTab({ data, setTab }: { data: SettingsOverview; setTab: (t: Tab) => void }) {
  const org = data.organization;
  const billing = data.billing;

  return (
    <div className="grid gap-4">
      <SectionCard>
        <SectionHeader
          title="Current Plan"
          action={
            billing ? (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ACCOUNT_STATUS_TONE[billing.accountStatus]?.className ?? 'bg-al-surface-elevated text-al-text-secondary'}`}>
                {ACCOUNT_STATUS_TONE[billing.accountStatus]?.label ?? billing.accountStatus}
              </span>
            ) : null
          }
        />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Organization" value={org.name} />
          <ConfigRow label="Onboarded" value={org.onboardedAt ? new Date(org.onboardedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Pending'} />
          {billing ? (
            <>
              <ConfigRow label="Plan" value={billing.planLabel} />
              <ConfigRow label="Price" value={billing.planPrice} />
            </>
          ) : null}
          <ConfigRow label="Members" value={`${data.stats.totalUsers}`} />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <button onClick={() => setTab('usage')} className="inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
            View seats & usage <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </SectionCard>

      <div className="rounded-xl border border-al-info/20 bg-al-info/10 p-5">
        <p className="text-sm font-semibold text-al-info">Billing is managed externally</p>
        <p className="mt-1 text-xs text-al-text-secondary">
          For plan changes, seat additions, or billing inquiries, contact your account representative at{' '}
          <a href="mailto:support@approvline.ai" className="font-semibold text-al-info underline">support@approvline.ai</a>
        </p>
      </div>
    </div>
  );
}

// ─── Tab: Usage & Limits ──────────────────────────────────────────────────────

function UsageLimitsTab({ data }: { data: SettingsOverview }) {
  const billing = data.billing;

  return (
    <div className="grid gap-4">
      {billing ? (
        <SectionCard>
          <SectionHeader title="Seats & Usage" subtitle="Purchased, allocated, and used seats for this workspace — same source as Billing & Plan" />
          <div className="divide-y divide-al-border px-6">
            <ConfigRow label="Purchased seats" value={`${billing.purchasedSeats}`} />
            <ConfigRow label="Allocated seats" value={`${billing.allocatedSeats}`} />
            <ConfigRow label="Used seats" value={`${billing.usedSeats}`} />
            <ConfigRow label="Available seats" value={`${Math.max(0, billing.purchasedSeats - billing.usedSeats)}`} />
            <ConfigRow
              label="Utilization"
              value={billing.purchasedSeats > 0 ? `${Math.round((billing.usedSeats / billing.purchasedSeats) * 100)}%` : '—'}
              valueClass={billing.purchasedSeats > 0 && billing.usedSeats / billing.purchasedSeats >= 0.9 ? 'text-al-warning' : ''}
            />
          </div>
        </SectionCard>
      ) : (
        <SectionCard>
          <SectionHeader title="Seats & Usage" />
          <p className="p-6 text-sm text-al-text-muted">This workspace has not yet been provisioned with a plan and seat allocation.</p>
        </SectionCard>
      )}

      <SectionCard>
        <SectionHeader title="Approval Usage" subtitle="Approvals processed this calendar month" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Approvals this month" value={`${data.kpis.approvalsThisMonth}`} />
          <ConfigRow label="Plan limit" value="No plan limit configured" />
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Connected Systems" subtitle="Integrations and data sources against catalog availability" />
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Connected integrations" value={`${data.kpis.connectedIntegrations}`} />
          <ConfigRow label="Evidence data sources" value={`${data.kpis.dataSourcesTotal} configured, ${data.kpis.dataSourcesCapturing} capturing`} />
        </div>
      </SectionCard>

      <div className="rounded-xl border border-al-info/20 bg-al-info/10 p-5">
        <p className="text-sm font-semibold text-al-info">Contractual limits</p>
        <p className="mt-1 text-xs text-al-text-secondary">
          Limits not shown here (e.g. storage, API usage) are contract-defined rather than tracked as live metrics in this
          architecture. Contact your account representative for contract-specific limits.
        </p>
      </div>
    </div>
  );
}

// ─── Tab: Audit & Logs ───────────────────────────────────────────────────────

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
        <div className="divide-y divide-al-border px-6">
          <ConfigRow label="Audit logging" value="Enabled — all mutations" />
          <ConfigRow label="Scope" value="Organization-scoped with actor tracking" />
          <ConfigRow label="Retention" value="Full history retained" />
        </div>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/dashboard/audit-log" className="inline-flex items-center gap-2 rounded-lg bg-al-accent px-4 py-2 text-sm font-semibold text-white hover:bg-al-accent-hover">
            <ScrollText className="h-4 w-4" />
            Open Audit Logs
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Recent Configuration Events" />
        {data.recentActivity.length === 0 ? (
          <p className="p-6 text-sm text-al-text-muted">No recent configuration events.</p>
        ) : (
          <ul className="divide-y divide-al-border">
            {data.recentActivity.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 px-6 py-3 text-xs">
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-al-text-muted" />
                <span className="flex-1 text-al-text-secondary">{actionLabel(ev.action)}</span>
                <span className="shrink-0 text-al-text-muted">{relDate(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: System ──────────────────────────────────────────────────────────────

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
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${systemStatus.ready ? 'bg-al-success/10 text-al-success' : 'bg-al-danger/10 text-al-danger'}`}>
              {systemStatus.ready ? 'Operational' : 'Degraded'}
            </span>
          }
        />
        <ul className="divide-y divide-al-border">
          {checks.map(({ label, status, message }) => (
            <li key={label} className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${status === 'ok' ? 'bg-al-success' : status === 'error' ? 'bg-al-danger' : 'bg-al-warning'}`} />
                <span className="text-sm text-al-text-secondary">{label}</span>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold ${status === 'ok' ? 'text-al-success' : status === 'error' ? 'text-al-danger' : 'text-al-warning'}`}>
                  {status}
                </span>
                {message && status !== 'ok' && <p className="text-[11px] text-al-text-muted">{message}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-al-border px-6 py-4">
          <Link href="/health" className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-2 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
            Full system status <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard>
        <SectionHeader title="Demo Workspace" subtitle="Generate or reset demo data for testing" />
        <div className="flex flex-wrap gap-2 p-6">
          <form action="/api/demo/seed" method="post">
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-al-accent px-4 text-xs font-semibold text-white hover:bg-al-accent-hover">
              Generate Demo Data
            </button>
          </form>
          <form action="/api/demo/reset" method="post">
            <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-4 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken">
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
  const router = useRouter();

  // The PATCH route already revalidates the server cache tag (settingsCacheTag);
  // router.refresh() re-runs the Server Component tree so the Organization
  // Information card reflects the saved values immediately, without a manual
  // page reload. A local state bump alone would not re-fetch anything.
  const onOrgSaved = () => router.refresh();

  return (
    <div className="grid gap-4">
      {/* Top settings navigation */}
      <nav className="flex gap-1 overflow-x-auto border-b border-al-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              activeTab === id
                ? 'border-al-accent text-al-accent'
                : 'border-transparent text-al-text-secondary hover:text-al-text'
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="min-w-0">
        {activeTab === 'overview' && <OverviewTab data={data} setTab={setActiveTab} onOrgSaved={onOrgSaved} />}
        {activeTab === 'users' && <UsersTab data={data} />}
        {activeTab === 'integrations' && <IntegrationsTab data={data} />}
        {activeTab === 'approvals' && <ApprovalSettingsTab data={data} />}
        {activeTab === 'security' && <SecurityTab data={data} />}
        {activeTab === 'billing' && <BillingTab data={data} setTab={setActiveTab} />}
        {activeTab === 'usage' && <UsageLimitsTab data={data} />}
        {activeTab === 'audit' && <AuditTab data={data} />}
        {activeTab === 'system' && <SystemTab data={data} />}
      </div>
    </div>
  );
}
