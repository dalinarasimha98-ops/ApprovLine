import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { getDashboardTenant } from '@/lib/auth';
import {
  getIdentityCenterData,
  revokeIdentitySession,
  saveIdentityConfiguration,
  testIdentityConnection,
  type IdentityDashboardData,
  type IdentityProviderCard,
} from '@/services/identity';

export const dynamic = 'force-dynamic';

async function saveIdentity(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');
  await saveIdentityConfiguration(tenant, formData);
}

async function testConnection(_formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');
  await testIdentityConnection(tenant);
}

async function revokeSession(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');
  await revokeIdentitySession(tenant, formData);
}

export default async function IdentitySettingsPage() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization) redirect('/onboarding');

  const data = await getIdentityCenterData(tenant);

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950 sm:px-6">
      <section className="mx-auto grid max-w-7xl gap-6">
        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-8 bg-[#07111f] p-6 text-white lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200">Enterprise Identity Center</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">Manage SSO, identity policies, sessions, and access control.</h1>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                Connect Microsoft Entra ID, Okta, Google Workspace, SAML, or OIDC so enterprise customers can govern ApprovLine from their existing identity provider.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <StatusPill tone={data.connectionStatus === 'Not configured' ? 'amber' : 'green'}>{data.connectionStatus}</StatusPill>
                <StatusPill tone="blue">{data.usersSynced} users synced</StatusPill>
                <StatusPill tone="slate">{data.scimStatus}</StatusPill>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Workspace</p>
              <h2 className="mt-2 text-2xl font-black">{data.organizationName}</h2>
              <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-300">
                <Row label="Verified domain" value={data.domain} />
                <Row label="Provider" value={providerLabel(data.selectedProvider)} />
                <Row label="Last sync" value={data.lastSync} />
                <Row label="Provisioning" value={data.provisioningStatus} />
              </div>
            </div>
          </div>
        </div>

        {!data.canEdit ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
            You can view identity settings, but only organization admins can configure SSO, group mappings, access policies, or sessions.
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="Identity provider" value={providerLabel(data.selectedProvider)} detail={data.connectionStatus} />
          <Metric label="Users synced" value={String(data.usersSynced)} detail="Workspace users ready for mapping" />
          <Metric label="Provisioning" value={data.provisioningStatus} detail="JIT user creation prepared" />
          <Metric label="SCIM" value="Prepared" detail="Architecture ready for future group sync" />
        </div>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Identity Providers</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Supported SSO providers</h2>
              </div>
              <Link href="/dashboard/settings" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 shadow-sm">
                Back to settings
              </Link>
            </div>
            <div className="mt-5 grid gap-3">
              {data.providers.map((provider) => (
                <ProviderCard key={provider.key} provider={provider} />
              ))}
            </div>
          </div>

          <form action={saveIdentity} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">SSO Setup Wizard</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Configure identity provider</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Save metadata and policy choices here. Runtime sign-in remains delegated to Clerk and the customer identity provider.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-black text-slate-700">
                Select provider
                <select name="provider" defaultValue={data.selectedProvider} disabled={!data.canEdit} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100">
                  <option value="azure_ad">Microsoft Entra ID</option>
                  <option value="okta">Okta</option>
                  <option value="google_workspace">Google Workspace</option>
                  <option value="saml">Generic SAML 2.0</option>
                  <option value="oidc">Generic OIDC</option>
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  SAML Entity ID
                  <input name="entityId" disabled={!data.canEdit} placeholder="https://idp.company.com/entity" className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  SSO URL
                  <input name="ssoUrl" disabled={!data.canEdit} placeholder="https://idp.company.com/sso" className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  OIDC Issuer
                  <input name="oidcIssuer" disabled={!data.canEdit} placeholder="https://login.microsoftonline.com/{tenant}/v2.0" className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Client ID hint
                  <input name="clientIdHint" disabled={!data.canEdit} placeholder="Optional client identifier" className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100" />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-black text-slate-700">
                Upload metadata
                <input name="metadataFile" type="file" disabled={!data.canEdit} accept=".xml,.json,.txt" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#2155d9] file:px-3 file:py-2 file:text-sm file:font-black file:text-white" />
              </label>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">JIT provisioning</p>
                <label className="grid gap-2 text-sm font-black text-slate-700">
                  Default role for new SSO users
                  <select name="defaultRole" defaultValue={data.defaultRole} disabled={!data.canEdit} className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100">
                    <option value="EMPLOYEE">Viewer / Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="COMPLIANCE_OFFICER">Compliance Officer</option>
                    <option value="ADMIN">Org Admin</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <input name="domainVerified" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-[#2155d9]" />
                  Domain verified for restricted access
                </label>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Access policies</p>
                {data.accessPolicies.map((policy) => (
                  <label key={policy.key} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <input name={policy.key} type="checkbox" defaultChecked={policy.enabled} disabled={!data.canEdit} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#2155d9]" />
                    <span>
                      <span className="block text-sm font-black text-slate-900">{policy.label}</span>
                      <span className="block text-xs font-semibold leading-5 text-slate-500">{policy.detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <FormSubmitButton pendingText="Saving identity..." className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200 disabled:opacity-60">
                  Save identity settings
                </FormSubmitButton>
                <button formAction={testConnection} className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm disabled:opacity-60">
                  Test connection
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Group Mapping</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Map identity groups to ApprovLine roles</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Provider group</th>
                    <th className="px-4 py-3">ApprovLine role</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.groupMappings.map((mapping) => (
                    <tr key={`${mapping.providerGroup}-${mapping.approvLineRole}`}>
                      <td className="px-4 py-3 font-bold text-slate-900">{mapping.providerGroup}</td>
                      <td className="px-4 py-3 font-semibold text-slate-600">{mapping.approvLineRole}</td>
                      <td className="px-4 py-3 font-semibold text-slate-600">{mapping.department}</td>
                      <td className="px-4 py-3"><StatusPill tone="blue">{mapping.status}</StatusPill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">SCIM Preparation</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Provisioning architecture</h2>
            <div className="mt-5 grid gap-3">
              {['User provisioning', 'User deprovisioning', 'Group sync', 'Role sync'].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <span className="font-black text-slate-900">{item}</span>
                  <StatusPill tone="amber">Prepared</StatusPill>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Session Management</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Active sessions</h2>
            <div className="mt-5 grid gap-3">
              {data.sessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-black text-slate-950">{session.user}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{session.device} · {session.ipAddress} · {session.lastLogin}</p>
                    </div>
                    <form action={revokeSession}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <FormSubmitButton pendingText="Logging..." className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-60">
                        Revoke session
                      </FormSubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Security Center</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Identity health</h2>
            <div className="mt-5 grid gap-3">
              {data.securityHealth.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-950">{item.label}</p>
                    <StatusPill tone={item.tone}>{item.status}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Founder Visibility</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Customer identity posture</h2>
            <div className="mt-5 grid gap-3">
              <RowCard label="Identity Provider" value={providerLabel(data.selectedProvider)} />
              <RowCard label="SSO Status" value={data.connectionStatus} />
              <RowCard label="User Count" value={`${data.usersSynced} users`} />
              <RowCard label="Sync Health" value={data.provisioningStatus} />
            </div>
            <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Founder views show provider health and user counts only. Passwords and identity secrets are never exposed.</p>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Audit Logging</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Identity event trail</h2>
            <div className="mt-5 grid gap-3">
              {data.audits.length ? data.audits.map((audit) => (
                <div key={audit.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <p className="font-black text-slate-950">{audit.action}</p>
                    <span className="text-xs font-bold text-slate-500">{audit.createdAt}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Actor: {audit.actor}</p>
                  <p className="mt-2 break-words text-xs font-semibold leading-5 text-slate-500">{audit.detail}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                  No identity audit events yet. Saving or testing SSO configuration will record provider updates, connection tests, session actions, and role assignment events.
                </div>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    azure_ad: 'Microsoft Entra ID',
    okta: 'Okta',
    google_workspace: 'Google Workspace',
    saml: 'Generic SAML 2.0',
    oidc: 'Generic OIDC',
  };
  return labels[provider] ?? provider;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function ProviderCard({ provider }: { provider: IdentityProviderCard }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-950">{provider.name}</p>
            <StatusPill tone="slate">{provider.protocol}</StatusPill>
          </div>
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">{provider.category}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{provider.description}</p>
        </div>
        <StatusPill tone={provider.status === 'connected' ? 'green' : 'amber'}>
          {provider.status === 'connected' ? 'Connected' : 'Ready'}
        </StatusPill>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">Last verified: {provider.lastVerified}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2 last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}

function RowCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-black text-slate-600">{label}</span>
      <span className="text-right text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'blue' | 'slate' }) {
  const tones = {
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-[#2155d9]',
    slate: 'border-slate-200 bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${tones[tone]}`}>{children}</span>;
}
