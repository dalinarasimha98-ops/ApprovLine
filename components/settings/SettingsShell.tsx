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
  Trash2,
  Upload,
  Users,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type { SettingsOverview } from '@/services/settings';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { isValidHexColor, hexToRgb, contrastRatio, AA_NORMAL_TEXT_CONTRAST } from '@/lib/color-contrast';
import { DATE_FORMAT_OPTIONS } from '@/lib/dateFormat';
import { WORKSPACE_VIEW_OPTIONS } from '@/lib/workspaceViews';

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

// ─── Branding: brand color, logo, custom domain (real, persisted) ─────────────

const DOMAIN_STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  NOT_CONFIGURED: { label: 'Not configured', tone: 'neutral' },
  PENDING_VERIFICATION: { label: 'Pending verification', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  ACTIVE: { label: 'Active', tone: 'success' },
  FAILED: { label: 'Verification failed', tone: 'danger' },
};

function BrandColorEditor({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [hex, setHex] = useState(org.brandColor ?? '#7C3AED');
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const rgb = isValidHexColor(hex) ? hexToRgb(hex) : null;
  const ratio = rgb ? contrastRatio(rgb, [255, 255, 255]) : null;
  const contrastOk = ratio !== null && ratio >= AA_NORMAL_TEXT_CONTRAST;

  function save() {
    setError(null);
    if (!isValidHexColor(hex)) { setError('Enter a valid 6-digit hex color.'); return; }
    if (!contrastOk) { setError(`Too light for white text (${ratio?.toFixed(2)}:1). Choose a darker shade.`); return; }
    startSaving(async () => {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandColor: hex }),
      });
      if (res.ok) { onSaved(); setEditing(false); }
      else { const body = await res.json().catch(() => ({})) as { error?: string }; setError(body.error ?? 'Could not save brand color.'); }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-sm text-al-text-muted">Brand color</span>
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border border-al-border" style={{ backgroundColor: org.brandColor ?? undefined }} />
          <span className="text-xs font-semibold text-al-text">{org.brandColor ?? 'Not set'}</span>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-al-accent hover:text-al-info">Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-al-text-muted">Brand color</span>
        <div className="flex items-center gap-2">
          <input type="color" value={isValidHexColor(hex) ? hex : '#7C3AED'} onChange={(e) => setHex(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-al-border bg-transparent" aria-label="Brand color picker" />
          <input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            maxLength={7}
            className="w-24 rounded-lg border border-al-border bg-al-surface px-2 py-1 text-xs font-mono text-al-text focus:border-al-accent focus:outline-none"
          />
        </div>
      </div>
      {rgb && (
        <p className={`mt-1.5 text-right text-[11px] font-semibold ${contrastOk ? 'text-al-success' : 'text-al-danger'}`}>
          {contrastOk ? `Passes contrast (${ratio?.toFixed(2)}:1 with white text)` : `Fails contrast (${ratio?.toFixed(2)}:1 with white text)`}
        </p>
      )}
      {error && <p className="mt-1 text-right text-[11px] font-semibold text-al-danger">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={() => { setEditing(false); setHex(org.brandColor ?? '#7C3AED'); setError(null); }} disabled={saving} className="rounded-lg border border-al-border px-3 py-1 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50">Cancel</button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-al-accent px-3 py-1 text-xs font-semibold text-white hover:bg-al-accent-hover disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function LogoEditor({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUploading] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startUploading(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/organization/logo', { method: 'POST', body: formData });
      if (res.ok) { onSaved(); }
      else { const body = await res.json().catch(() => ({})) as { error?: string }; setError(body.error ?? 'Could not upload logo.'); }
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  function remove() {
    setError(null);
    startUploading(async () => {
      const res = await fetch('/api/settings/organization/logo', { method: 'DELETE' });
      if (res.ok) onSaved();
      else setError('Could not remove logo.');
    });
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-al-text-muted">Logo</span>
        <div className="flex items-center gap-2">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Vercel Blob URL, not a static local asset
            <img src={org.logoUrl} alt="Organization logo" className="h-8 w-8 rounded-lg border border-al-border object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-dashed border-al-border-strong text-al-text-muted"><Upload className="h-3.5 w-3.5" /></span>
          )}
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-lg border border-al-border px-3 py-1.5 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50">
            {uploading ? 'Uploading…' : org.logoUrl ? 'Replace' : 'Upload'}
          </button>
          {org.logoUrl && (
            <button onClick={remove} disabled={uploading} aria-label="Remove logo" className="rounded-lg border border-al-border p-1.5 text-al-text-muted hover:bg-al-danger/10 hover:text-al-danger disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="mt-1 text-right text-[11px] font-semibold text-al-danger">{error}</p>}
    </div>
  );
}

function CustomDomainEditor({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [domain, setDomain] = useState(org.customDomain ?? '');
  const [dnsRecord, setDnsRecord] = useState<{ name: string; value: string } | null>(null);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const statusInfo = DOMAIN_STATUS_LABEL[org.customDomainStatus] ?? DOMAIN_STATUS_LABEL.NOT_CONFIGURED;
  const toneText: Record<string, string> = { success: 'text-al-success', warning: 'text-al-warning', danger: 'text-al-danger', neutral: 'text-al-text-muted' };

  function startVerification() {
    setError(null);
    startBusy(async () => {
      const res = await fetch('/api/settings/organization/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; dnsRecord?: { name: string; value: string } };
      if (res.ok) { setDnsRecord(body.dnsRecord ?? null); onSaved(); }
      else setError(body.error ?? 'Could not start domain verification.');
    });
  }

  function checkVerification() {
    setCheckResult(null);
    startBusy(async () => {
      const res = await fetch('/api/settings/organization/domain', { method: 'PATCH' });
      const body = await res.json().catch(() => ({})) as { status?: string; verified?: boolean };
      if (res.ok && body.status === 'VERIFIED') { setCheckResult('Verified!'); onSaved(); }
      else setCheckResult('DNS record not found yet - this can take a few minutes to propagate.');
    });
  }

  function removeDomain() {
    startBusy(async () => {
      const res = await fetch('/api/settings/organization/domain', { method: 'DELETE' });
      if (res.ok) { setEditing(false); setDomain(''); setDnsRecord(null); onSaved(); }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-sm text-al-text-muted">Custom domain</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-al-text">{org.customDomain ?? 'Not set'}</span>
          <span className={`text-[11px] font-bold ${toneText[statusInfo.tone]}`}>{statusInfo.label}</span>
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-al-accent hover:text-al-info">Configure</button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-al-text-muted">Custom domain</span>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="app.yourcompany.com"
          className="w-48 rounded-lg border border-al-border bg-al-surface px-2 py-1 text-xs text-al-text placeholder:text-al-text-muted focus:border-al-accent focus:outline-none"
        />
      </div>
      {error && <p className="mt-1 text-right text-[11px] font-semibold text-al-danger">{error}</p>}
      {dnsRecord && (
        <div className="mt-2 rounded-lg border border-al-border bg-al-surface-sunken p-2.5 text-[11px]">
          <p className="font-bold text-al-text">Add this TXT record to verify ownership:</p>
          <p className="mt-1 break-all font-mono text-al-text-secondary">{dnsRecord.name}</p>
          <p className="break-all font-mono text-al-text-secondary">{dnsRecord.value}</p>
        </div>
      )}
      {checkResult && <p className="mt-1.5 text-right text-[11px] font-semibold text-al-text-secondary">{checkResult}</p>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button onClick={() => setEditing(false)} disabled={busy} className="rounded-lg border border-al-border px-3 py-1 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50">Close</button>
        {org.customDomainStatus !== 'NOT_CONFIGURED' && (
          <button onClick={removeDomain} disabled={busy} className="rounded-lg border border-al-danger/30 px-3 py-1 text-xs font-semibold text-al-danger hover:bg-al-danger/10 disabled:opacity-50">Remove</button>
        )}
        {org.customDomainStatus === 'PENDING_VERIFICATION' && (
          <button onClick={checkVerification} disabled={busy} className="rounded-lg border border-al-border px-3 py-1 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50">Check verification</button>
        )}
        <button onClick={startVerification} disabled={busy || !domain.trim()} className="rounded-lg bg-al-accent px-3 py-1 text-xs font-semibold text-white hover:bg-al-accent-hover disabled:opacity-50">
          {busy ? 'Working…' : 'Start verification'}
        </button>
      </div>
    </div>
  );
}

function BrandingCard({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  return (
    <SectionCard>
      <SectionHeader title="Organization Branding" subtitle="Customize how your organization appears" />
      <div className="divide-y divide-al-border px-6">
        <ConfigRow label="Display name" value={org.name} />
        <LogoEditor org={org} onSaved={onSaved} />
        <BrandColorEditor org={org} onSaved={onSaved} />
        <CustomDomainEditor org={org} onSaved={onSaved} />
      </div>
      <div className="px-6 pb-4 pt-2 text-[11px] text-al-text-muted">
        Display name reuses your organization name (edit via Organization Information above). Custom domain verification uses a
        real DNS TXT lookup - it only shows Verified once that record is actually found.
      </div>
    </SectionCard>
  );
}

// ─── Default Settings: real, persisted, org-level preferences ─────────────────

const RISK_LEVEL_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

function DefaultSettingsCard({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  const [form, setForm] = useState({
    defaultTimeZone: org.defaultTimeZone ?? '',
    defaultDateFormat: org.defaultDateFormat ?? '',
    defaultWorkspaceView: org.defaultWorkspaceView ?? '',
    defaultRiskLevel: org.defaultRiskLevel ?? '',
  });
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const zones = useState(() => timezoneOptions())[0];

  const initial = { defaultTimeZone: org.defaultTimeZone ?? '', defaultDateFormat: org.defaultDateFormat ?? '', defaultWorkspaceView: org.defaultWorkspaceView ?? '', defaultRiskLevel: org.defaultRiskLevel ?? '' };
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
  }

  function save() {
    startSaving(async () => {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultTimeZone: form.defaultTimeZone || null,
          defaultDateFormat: form.defaultDateFormat || null,
          defaultWorkspaceView: form.defaultWorkspaceView || null,
          defaultRiskLevel: form.defaultRiskLevel || null,
        }),
      });
      if (res.ok) { setResult({ ok: true, msg: 'Default settings saved.' }); onSaved(); }
      else { const body = await res.json().catch(() => ({})) as { error?: string }; setResult({ ok: false, msg: body.error ?? 'Save failed.' }); }
    });
  }

  const selectClass = 'mt-1.5 w-full rounded-lg border border-al-border bg-al-surface px-3 py-2 text-sm text-al-text focus:border-al-accent focus:outline-none focus:ring-2 focus:ring-al-info/20';

  return (
    <SectionCard>
      <SectionHeader title="Default Settings" subtitle="Organization-wide defaults - each has a real effect described below" />
      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-al-text-secondary">Default time zone</label>
          <select value={form.defaultTimeZone} onChange={(e) => update('defaultTimeZone', e.target.value)} className={selectClass}>
            <option value="">Not set</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-al-text-muted">Fallback shown in User Settings when a member hasn&apos;t set their own time zone.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-al-text-secondary">Date format</label>
          <select value={form.defaultDateFormat} onChange={(e) => update('defaultDateFormat', e.target.value)} className={selectClass}>
            <option value="">Not set (MM/DD/YYYY)</option>
            {DATE_FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-al-text-muted">Applied to dates shown in Organization Settings.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-al-text-secondary">Default workspace view</label>
          <select value={form.defaultWorkspaceView} onChange={(e) => update('defaultWorkspaceView', e.target.value)} className={selectClass}>
            <option value="">Not set (Dashboard)</option>
            {WORKSPACE_VIEW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-al-text-muted">Where members land after signing in.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-al-text-secondary">Default risk level</label>
          <select value={form.defaultRiskLevel} onChange={(e) => update('defaultRiskLevel', e.target.value)} className={selectClass}>
            <option value="">Not set</option>
            {RISK_LEVEL_OPTIONS.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-al-text-muted">Used when Risk Detection (Approval Settings) is turned off.</p>
        </div>
      </div>
      <div className="border-t border-al-border px-6 py-3 text-[11px] text-al-text-muted">
        Language: English (US) — the only language ApprovLine supports today.
      </div>
      {result && (
        <div className={`mx-6 mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${result.ok ? 'border-al-success/30 bg-al-success/10 text-al-success' : 'border-al-danger/30 bg-al-danger/10 text-al-danger'}`}>
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {result.msg}
        </div>
      )}
      <div className="flex justify-end border-t border-al-border px-6 py-4">
        <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-1.5 rounded-lg bg-al-accent px-4 py-2 text-xs font-semibold text-white hover:bg-al-accent-hover disabled:opacity-50">
          {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
          {saving ? 'Saving…' : 'Save defaults'}
        </button>
      </div>
    </SectionCard>
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

        <BrandingCard org={org} onSaved={onOrgSaved} />
      </div>

      <DefaultSettingsCard org={org} onSaved={onOrgSaved} />

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
          <ConfigRow label="Administrators" value={`${data.stats.adminUsers}`} />
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

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-al-accent' : 'bg-al-border-strong'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ApprovalPolicyCard({ org, onSaved }: { org: SettingsOverview['organization']; onSaved: () => void }) {
  const [autoCategorization, setAutoCategorization] = useState(org.autoCategorizationEnabled);
  const [riskDetection, setRiskDetection] = useState(org.riskDetectionEnabled);
  const [dueDateDays, setDueDateDays] = useState(org.defaultDueDateDays !== null ? String(org.defaultDueDateDays) : '');
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function patch(body: Record<string, unknown>, revert: () => void) {
    setError(null);
    startBusy(async () => {
      const res = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) onSaved();
      else {
        revert();
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setError(errBody.error ?? 'Could not save.');
      }
    });
  }

  function toggleAutoCategorization(next: boolean) {
    const prev = autoCategorization;
    setAutoCategorization(next);
    patch({ autoCategorizationEnabled: next }, () => setAutoCategorization(prev));
  }
  function toggleRiskDetection(next: boolean) {
    const prev = riskDetection;
    setRiskDetection(next);
    patch({ riskDetectionEnabled: next }, () => setRiskDetection(prev));
  }
  function saveDueDate() {
    const days = dueDateDays.trim() === '' ? null : parseInt(dueDateDays, 10);
    if (days !== null && (!Number.isFinite(days) || days < 1 || days > 90)) {
      setError('Enter a number of days between 1 and 90.');
      return;
    }
    patch({ defaultDueDateDays: days }, () => {});
  }

  return (
    <SectionCard>
      <SectionHeader title="Approval Policy" subtitle="Real organization-level policy - toggling these changes what new approvals persist" />
      <div className="divide-y divide-al-border px-6">
        <ConfigRow label="Primary classifier" value="Anthropic Claude" />
        <ConfigRow label="Fallback classifier" value="OpenAI GPT" />
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-al-text-muted">Auto-categorization</p>
            <p className="text-[11px] text-al-text-muted">When off, new approvals are stored without a category.</p>
          </div>
          <Toggle checked={autoCategorization} onChange={toggleAutoCategorization} disabled={busy} label="Auto-categorization" />
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-al-text-muted">Risk detection</p>
            <p className="text-[11px] text-al-text-muted">When off, new approvals use Default Risk Level instead of AI scoring.</p>
          </div>
          <Toggle checked={riskDetection} onChange={toggleRiskDetection} disabled={busy} label="Risk detection" />
        </div>
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm text-al-text-muted">Default due date</p>
            <p className="text-[11px] text-al-text-muted">Applied to new approvals with no explicit due date.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={90}
              value={dueDateDays}
              onChange={(e) => setDueDateDays(e.target.value)}
              placeholder="—"
              className="w-16 rounded-lg border border-al-border bg-al-surface px-2 py-1 text-xs text-al-text focus:border-al-accent focus:outline-none"
            />
            <span className="text-xs text-al-text-muted">days</span>
            <button onClick={saveDueDate} disabled={busy} className="rounded-lg border border-al-border px-2.5 py-1 text-xs font-semibold text-al-text-secondary hover:bg-al-surface-sunken disabled:opacity-50">Save</button>
          </div>
        </div>
        <ConfigRow label="Queue" value="BullMQ + Redis (concurrency 10)" />
      </div>
      {error && <p className="px-6 pb-3 text-[11px] font-semibold text-al-danger">{error}</p>}
      <div className="border-t border-al-border px-6 py-4 text-[11px] text-al-text-muted">
        These policies apply only to newly created approvals - existing records are never modified. Message capture and
        evidence collection are never skipped, regardless of policy.
      </div>
    </SectionCard>
  );
}

function ApprovalSettingsTab({ data, onOrgSaved }: { data: SettingsOverview; onOrgSaved: () => void }) {
  const channels = [
    { label: 'Email notifications', status: 'Via alert configuration' },
    { label: 'In-app alerts', status: 'Enabled' },
    { label: 'Slack alerts', status: 'Via Slack integration' },
    { label: 'Webhook delivery', status: 'Per-integration' },
  ];

  return (
    <div className="grid gap-4">
      <ApprovalPolicyCard org={data.organization} onSaved={onOrgSaved} />

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
          ) : (
            <ConfigRow label="Plan status" value="Not provisioned" valueClass="text-al-warning" />
          )}
          <ConfigRow label="Members" value={`${data.stats.totalUsers}`} />
        </div>
        {billing ? (
          <div className="border-t border-al-border px-6 py-4">
            <button onClick={() => setTab('usage')} className="inline-flex items-center gap-1 text-xs font-semibold text-al-accent hover:text-al-info">
              View seats & usage <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="border-t border-al-warning/20 bg-al-warning/10 px-6 py-4">
            <p className="text-xs font-semibold text-al-warning">No active plan/seat allocation has been configured for this workspace.</p>
            <p className="mt-2 text-xs text-al-text-secondary">
              Contact your account administrator, or reach{' '}
              <a href="mailto:support@approvline.ai" className="font-semibold text-al-info underline">ApprovLine support</a>{' '}
              to provision a plan.
            </p>
          </div>
        )}
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

/**
 * System is an operational diagnostic area for customer admins, not a
 * founder/SRE debugging console - so unlike /founder/system-health (the
 * real venue for raw internal error strings, gated by the separate
 * founder-role system), this view never renders a readiness check's raw
 * message (e.g. "readiness:postgres timed out after 3000ms"). It also
 * never marks the fallback AI classifier "unavailable"/red when the
 * primary is healthy - an unconfigured optional fallback is not a system
 * degradation.
 */
function humanSystemStatus(status: string, isOptionalFallback: boolean): { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  if (status === 'ok') return { text: 'Healthy', tone: 'success' };
  if (isOptionalFallback) return { text: 'Not configured (optional - primary is healthy)', tone: 'neutral' };
  if (status === 'error') return { text: 'Unavailable', tone: 'danger' };
  return { text: 'Degraded', tone: 'warning' };
}

const SYSTEM_STATUS_DESCRIPTION: Record<'success' | 'warning' | 'danger' | 'neutral', string> = {
  success: 'Operating normally.',
  warning: 'Experiencing a temporary issue. No action needed from you.',
  danger: 'Currently unavailable. Some features may be affected.',
  neutral: 'Optional fallback provider - not required while the primary service is healthy.',
};

function SystemTab({ data }: { data: SettingsOverview }) {
  const { systemStatus } = data;
  const anthropicOk = systemStatus.anthropic.status === 'ok';
  const checks: { label: string; status: string; isOptionalFallback?: boolean }[] = [
    { label: 'Database', status: systemStatus.postgresql.status },
    { label: 'Background job queue', status: systemStatus.redis.status },
    { label: 'AI classifier (primary)', status: systemStatus.anthropic.status },
    { label: 'AI classifier (fallback)', status: systemStatus.openai.status, isOptionalFallback: anthropicOk },
  ];
  const toneClasses: Record<string, string> = {
    success: 'bg-al-success',
    warning: 'bg-al-warning',
    danger: 'bg-al-danger',
    neutral: 'bg-al-text-muted',
  };
  const toneText: Record<string, string> = {
    success: 'text-al-success',
    warning: 'text-al-warning',
    danger: 'text-al-danger',
    neutral: 'text-al-text-muted',
  };

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
          {checks.map(({ label, status, isOptionalFallback }) => {
            const human = humanSystemStatus(status, isOptionalFallback ?? false);
            return (
              <li key={label} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${toneClasses[human.tone]}`} />
                  <span className="text-sm text-al-text-secondary">{label}</span>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold ${toneText[human.tone]}`}>{human.text}</span>
                  {human.tone !== 'success' && <p className="text-[11px] text-al-text-muted">{SYSTEM_STATUS_DESCRIPTION[human.tone]}</p>}
                </div>
              </li>
            );
          })}
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
        {activeTab === 'approvals' && <ApprovalSettingsTab data={data} onOrgSaved={onOrgSaved} />}
        {activeTab === 'security' && <SecurityTab data={data} />}
        {activeTab === 'billing' && <BillingTab data={data} setTab={setActiveTab} />}
        {activeTab === 'usage' && <UsageLimitsTab data={data} />}
        {activeTab === 'audit' && <AuditTab data={data} />}
        {activeTab === 'system' && <SystemTab data={data} />}
      </div>
    </div>
  );
}
