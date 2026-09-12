import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerAccountDetailsCard, type CustomerAccountDetailsActionState } from '@/components/founder/CustomerAccountDetailsCard';
import { FounderBadge, MigrationNotice } from '@/components/founder/FounderShell';
import { TabNav, TABS, type TabId } from '@/components/founder/Customer360Tabs';
import { planDisplayName } from '@/lib/plans';
import {
  addCustomerNote,
  deleteCustomerNote,
  deleteFounderCustomer,
  founderInviteLink,
  getFounderAccess,
  getFounderCustomerProfile,
  toggleCustomerNotePinned,
  updateCustomerAccountDetails,
  updateCustomerNote,
  updateCustomerStatus,
  type FounderAccess,
} from '@/services/founder';

export const dynamic = 'force-dynamic';

// ─── Server actions (all preserved) ─────────────────────────────────────────

async function createNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await addCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function editNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await updateCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function pinNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await toggleCustomerNotePinned(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function removeNote(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await deleteCustomerNote(access, formData);
  revalidatePath(`/founder/customers/${String(formData.get('customerAccountId'))}`);
}

async function changeStatus(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  const customerId = String(formData.get('customerAccountId') ?? '');
  await updateCustomerStatus(access, customerId, String(formData.get('status') ?? 'ACTIVE'));
  revalidatePath(`/founder/customers/${customerId}`);
  revalidatePath('/founder/customers');
}

async function deleteCustomer(formData: FormData) {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return;
  await deleteFounderCustomer(access, formData);
  revalidatePath('/founder/customers');
}

async function saveAccountDetails(_state: CustomerAccountDetailsActionState, formData: FormData): Promise<CustomerAccountDetailsActionState> {
  'use server';
  const access = await getFounderAccess();
  if (!access.ok) return { error: 'Founder access is required to update customer details.' };
  try {
    await updateCustomerAccountDetails(access, formData);
    const customerId = String(formData.get('customerAccountId') ?? '');
    revalidatePath(`/founder/customers/${customerId}`);
    revalidatePath('/founder/customers');
    revalidatePath('/founder/audit');
    return { ok: true, message: 'Customer account details updated.' };
  } catch (error) {
    console.error('[founder] account details update failed', error);
    return { error: error instanceof Error ? error.message : 'Could not update customer details. Please try again.' };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function lifecycleLabel(status: string, planTier: string, healthScore: number): string {
  if (status === 'CHURNED') return 'Lost';
  if (status === 'ACTIVE' && planTier !== 'FREE_TRIAL') return 'Converted';
  if (status === 'SUSPENDED' || healthScore < 35) return 'Pilot At Risk';
  if (healthScore >= 55) return 'Pilot Active';
  if (status === 'TRIAL') return 'Demo Scheduled';
  return 'Prospect';
}

function healthTone(status: string): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'HEALTHY') return 'green';
  if (status === 'NEEDS_ATTENTION') return 'amber';
  if (status === 'AT_RISK') return 'amber';
  if (status === 'CRITICAL') return 'red';
  return 'slate';
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'slate' | 'blue' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'SUSPENDED') return 'red';
  if (status === 'TRIAL') return 'blue';
  if (status === 'CHURNED') return 'slate';
  return 'amber';
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/**
 * estimatedArrUsd is Founder-entered at provisioning (see ProvisionWizard /
 * services/founder.ts) and nullable — customers provisioned before that
 * field existed have no value. Render "Not set" rather than fabricating a
 * number from plan/seats.
 */
function fmtArr(estimatedArrUsd: number | null): string {
  return estimatedArrUsd != null ? fmtMoney(estimatedArrUsd) : 'Not set';
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(String(d));
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function identityPosture(integrationSetup: unknown, usersSynced: number) {
  const setup = integrationSetup && typeof integrationSetup === 'object' && !Array.isArray(integrationSetup)
    ? integrationSetup as Record<string, unknown>
    : {};
  const identity = setup.identity && typeof setup.identity === 'object' && !Array.isArray(setup.identity)
    ? setup.identity as Record<string, unknown>
    : {};
  const provider = typeof identity.provider === 'string' ? identity.provider : 'not_configured';
  const status = typeof identity.status === 'string' ? identity.status : 'not_configured';
  const providerLabel = ({
    azure_ad: 'Microsoft Entra ID',
    okta: 'Okta',
    google_workspace: 'Google Workspace',
    saml: 'Generic SAML 2.0',
    oidc: 'Generic OIDC',
    not_configured: 'Not configured',
  } as Record<string, string>)[provider] ?? provider;

  return [
    { label: 'Identity provider', value: providerLabel, detail: 'Customer-managed enterprise IdP.', tone: provider === 'not_configured' ? 'amber' as const : 'blue' as const },
    { label: 'SSO status', value: status.replaceAll('_', ' '), detail: 'Workspace SSO configuration state.', tone: status === 'connected' ? 'green' as const : 'amber' as const },
    { label: 'Users synced', value: String(usersSynced), detail: 'Workspace users available for identity mapping.', tone: usersSynced > 0 ? 'green' as const : 'amber' as const },
    { label: 'Sync health', value: status === 'connected' ? 'Healthy' : 'Prepared', detail: 'SCIM/group sync readiness.', tone: status === 'connected' ? 'green' as const : 'slate' as const },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHead({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">{label}</p>
      {action}
    </div>
  );
}

function MetricPill({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="text-xl font-black tabular-nums text-slate-950">{value}</span>
      {sub ? <span className="text-xs font-semibold text-slate-400">{sub}</span> : null}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-400 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function MilestoneRow({ label, done, detail }: { label: string; done: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className={`mt-0.5 h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-xs font-black ${done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200 text-slate-300'}`}>
        {done ? '✓' : ''}
      </div>
      <div>
        <p className={`text-sm font-black ${done ? 'text-slate-800' : 'text-slate-400'}`}>{label}</p>
        {detail ? <p className="text-xs font-semibold text-slate-400">{detail}</p> : null}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function FounderCustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawTab = sp?.tab ?? 'overview';
  const activeTab: TabId = (TABS.map((t) => t.id) as string[]).includes(rawTab) ? rawTab as TabId : 'overview';

  const access = await getFounderAccess().catch((): FounderAccess => ({ ok: false, reason: 'forbidden' }));
  const result = await getFounderCustomerProfile(id);
  if (!result.data && !result.migrationRequired) notFound();

  if (!result.data) {
    return (
      <div className="space-y-6">
        <MigrationNotice message={result.safeError} />
      </div>
    );
  }

  try {
  const { customer, usage } = result.data;
  const inviteLink = founderInviteLink(customer.primaryAdminEmail);

  // Seat metrics
  const purchasedSeats = customer.seatAllocation?.purchasedSeats ?? customer.seatAllocation?.allocatedSeats ?? 5;
  const occupiedSeats = customer.managedUsers.filter((u) => u.status === 'ACTIVE' || u.status === 'INVITED').length;
  const activeUsers = customer.managedUsers.filter((u) => u.status === 'ACTIVE').length;
  const availableSeats = Math.max(0, purchasedSeats - occupiedSeats);

  // Derived values
  const healthScore = customer.health?.score ?? 50;
  const healthStatus = customer.health?.status ?? 'NEEDS_ATTENTION';
  const connectedIntegrations = customer.integrationStatuses.filter((i) => i.connectionState === 'CONNECTED').length;
  const estimatedArr = customer.estimatedArrUsd;
  const lifecycle = lifecycleLabel(customer.status, customer.planTier, healthScore);

  const canEditAccountDetails = access.ok && (access.role === 'SUPER_ADMIN' || access.role === 'FOUNDER_ADMIN');
  const canWrite = access.ok && !access.readOnly;
  const isSuperAdmin = access.ok && access.role === 'SUPER_ADMIN';

  // Tab hrefs (server-computed, no client hooks needed)
  const tabHrefs = Object.fromEntries(
    TABS.map((t) => [t.id, `/founder/customers/${id}?tab=${t.id}`])
  ) as Record<TabId, string>;

  return (
    <div className="space-y-0">
      {result.migrationRequired ? <MigrationNotice message={result.safeError} /> : null}

      {/* ── Customer header ─────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3 border-b border-slate-100">
          <Link href="/founder/customers" className="text-xs font-black uppercase tracking-wide text-slate-400 hover:text-slate-700">
            ← Customers
          </Link>
          <span className="text-slate-200">/</span>
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">{customer.companyName}</span>
        </div>

        {/* Header body */}
        <div className="px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            {/* Identity */}
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 shrink-0 rounded-2xl bg-[#2557dc] flex items-center justify-center">
                <span className="text-xl font-black text-white">{initials(customer.companyName)}</span>
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">{customer.companyName}</h2>
                <p className="text-sm font-semibold text-slate-500 mt-0.5">
                  {customer.domain}
                  {customer.industry ? ` · ${customer.industry}` : ''}
                  {' · '}{customer.primaryAdminEmail}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>
                  <FounderBadge tone="blue">{planDisplayName(customer.planTier)}</FounderBadge>
                  <FounderBadge tone={healthTone(healthStatus)}>{healthStatus.replaceAll('_', ' ')}</FounderBadge>
                  <FounderBadge tone="slate">{lifecycle}</FounderBadge>
                </div>
              </div>
            </div>

            {/* KPI strip */}
            <div className="flex flex-wrap gap-6 lg:shrink-0 lg:items-start">
              <MetricPill label="Health" value={`${healthScore}/100`} sub={healthStatus.replaceAll('_', ' ')} />
              <MetricPill label="Seats" value={`${activeUsers}/${purchasedSeats}`} sub={`${availableSeats} available`} />
              <MetricPill label="Integrations" value={connectedIntegrations} sub="Connected" />
              <MetricPill label="Est. ARR" value={fmtArr(estimatedArr)} sub={planDisplayName(customer.planTier)} />
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <TabNav activeTab={activeTab} tabHrefs={tabHrefs} />
      </section>

      {/* ── Tab content + Quick Actions ─────────────────────────────────── */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_280px]">
        {/* Main content */}
        <div className="space-y-6 min-w-0">

          {/* ══ OVERVIEW ════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <>
              {/* Account Snapshot + Health */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <SectionHead label="Account Snapshot" />
                  <InfoRow label="Status" value={<FounderBadge tone={statusTone(customer.status)}>{customer.status}</FounderBadge>} />
                  <InfoRow label="Lifecycle" value={lifecycle} />
                  <InfoRow label="Plan" value={planDisplayName(customer.planTier)} />
                  <InfoRow label="Seats" value={`${activeUsers} active · ${purchasedSeats} purchased`} />
                  <InfoRow label="Integrations" value={`${connectedIntegrations} connected`} />
                  <InfoRow label="Est. ARR" value={fmtArr(estimatedArr)} />
                  <InfoRow label="Admin" value={customer.primaryAdminEmail} />
                  <InfoRow label="Customer since" value={fmtDate(customer.createdAt)} />
                  <InfoRow label="Last updated" value={fmtDate(customer.updatedAt)} />
                </Card>

                <Card>
                  <SectionHead label="Customer Health" />
                  {/* Score bar */}
                  <div className="mb-5">
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-4xl font-black tabular-nums text-slate-950">{healthScore}</span>
                      <span className="text-sm font-black text-slate-400">/100</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-400' : healthScore >= 35 ? 'bg-orange-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${healthScore}%` }}
                      />
                    </div>
                  </div>
                  <InfoRow label="Status" value={<FounderBadge tone={healthTone(healthStatus)}>{healthStatus.replaceAll('_', ' ')}</FounderBadge>} />
                  <InfoRow label="Approvals" value={usage.approvals.toLocaleString()} />
                  <InfoRow label="Playbooks" value={usage.playbooks} />
                  <InfoRow label="Investigations" value={usage.investigations} />
                  <InfoRow label="Audit logs" value={usage.auditLogs.toLocaleString()} />
                  <p className="mt-4 text-xs font-semibold text-slate-400">Health score is authoritative from CustomerHealth record, not recalculated.</p>
                </Card>
              </div>

              {/* Product Adoption */}
              <Card>
                <SectionHead label="Product Adoption" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <AdoptionTile label="Approvals" value={usage.approvals} max={500} unit="captured" />
                  <AdoptionTile label="Playbooks" value={usage.playbooks} max={10} unit="configured" />
                  <AdoptionTile label="Investigations" value={usage.investigations} max={20} unit="opened" />
                  <AdoptionTile label="Integrations" value={connectedIntegrations} max={8} unit="connected" />
                </div>
              </Card>

              {/* Users + Integrations summary */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <SectionHead
                    label="Users"
                    action={
                      <Link href={`/founder/customers/${customer.id}/users`} className="text-xs font-black uppercase tracking-wide text-[#2557dc]">
                        Manage →
                      </Link>
                    }
                  />
                  <div className="space-y-2">
                    {customer.managedUsers.slice(0, 5).map((user) => (
                      <div key={user.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{user.firstName} {user.lastName}</p>
                          <p className="text-xs font-semibold text-slate-500">{user.role.replaceAll('_', ' ')}</p>
                        </div>
                        <FounderBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'INVITED' ? 'blue' : user.status === 'SUSPENDED' ? 'red' : 'slate'}>
                          {user.status}
                        </FounderBadge>
                      </div>
                    ))}
                    {!customer.managedUsers.length ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No managed users yet.</p>
                    ) : null}
                  </div>
                </Card>

                <Card>
                  <SectionHead label="Integrations" />
                  <div className="space-y-2">
                    {customer.integrationStatuses.slice(0, 5).map((integration) => (
                      <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-black text-slate-900">{integration.provider.replaceAll('_', ' ')}</p>
                        <FounderBadge tone={integration.connectionState === 'CONNECTED' ? 'green' : integration.accessEnabled ? 'blue' : 'slate'}>
                          {integration.connectionState.replaceAll('_', ' ')}
                        </FounderBadge>
                      </div>
                    ))}
                    {!customer.integrationStatuses.length ? (
                      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No integration access configured.</p>
                    ) : null}
                  </div>
                </Card>
              </div>

              {/* Recent Notes */}
              {customer.notes.length > 0 && (
                <Card>
                  <SectionHead
                    label="Recent Notes"
                    action={
                      <a href={`/founder/customers/${id}?tab=notes`} className="text-xs font-black uppercase tracking-wide text-[#2557dc]">
                        All notes →
                      </a>
                    }
                  />
                  <div className="space-y-3">
                    {customer.notes.slice(0, 3).map((note) => (
                      <div key={note.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-400">{note.authorEmail ?? 'Founder'} · {fmtDate(note.createdAt)}</span>
                          {note.pinned ? <FounderBadge tone="blue">Pinned</FounderBadge> : null}
                        </div>
                        <p className="text-sm font-semibold leading-6 text-slate-700 line-clamp-3">{note.body}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Recent Activity */}
              <Card>
                <SectionHead
                  label="Recent Activity"
                  action={
                    <a href={`/founder/customers/${id}?tab=activity`} className="text-xs font-black uppercase tracking-wide text-[#2557dc]">
                      All activity →
                    </a>
                  }
                />
                <div className="space-y-2">
                  {customer.auditLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2557dc]" />
                      <div>
                        <p className="text-sm font-black text-slate-900">{log.action}</p>
                        <p className="text-xs font-semibold text-slate-400">{log.actorEmail ?? 'system'} · {fmtDate(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {!customer.auditLogs.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No activity recorded yet.</p>
                  ) : null}
                </div>
              </Card>
            </>
          )}

          {/* ══ ONBOARDING ══════════════════════════════════════════════════ */}
          {activeTab === 'onboarding' && (
            <>
              <Card>
                <SectionHead label="Onboarding Milestones" />
                <MilestoneRow
                  label="Account provisioned"
                  done={true}
                  detail={`Customer account created on ${fmtDate(customer.createdAt)}`}
                />
                <MilestoneRow
                  label="Primary admin identified"
                  done={!!customer.primaryAdminEmail}
                  detail={customer.primaryAdminEmail ? `Admin: ${customer.primaryAdminEmail}` : 'No primary admin set'}
                />
                <MilestoneRow
                  label="First workspace user active"
                  done={activeUsers > 0}
                  detail={activeUsers > 0 ? `${activeUsers} active user${activeUsers !== 1 ? 's' : ''}` : 'No active users yet — share the invite link below'}
                />
                <MilestoneRow
                  label="First integration connected"
                  done={connectedIntegrations > 0}
                  detail={connectedIntegrations > 0 ? `${connectedIntegrations} integration${connectedIntegrations !== 1 ? 's' : ''} connected` : 'Customer has not connected any integrations yet'}
                />
                <MilestoneRow
                  label="First approval captured"
                  done={usage.approvals > 0}
                  detail={usage.approvals > 0 ? `${usage.approvals.toLocaleString()} approvals captured` : 'No approvals captured yet — connect an integration first'}
                />
                <MilestoneRow
                  label="Compliance playbook configured"
                  done={usage.playbooks > 0}
                  detail={usage.playbooks > 0 ? `${usage.playbooks} playbook${usage.playbooks !== 1 ? 's' : ''} configured` : 'No playbooks configured yet'}
                />
                <MilestoneRow
                  label="Investigation workflow used"
                  done={usage.investigations > 0}
                  detail={usage.investigations > 0 ? `${usage.investigations} investigation${usage.investigations !== 1 ? 's' : ''} opened` : 'Customer has not opened an investigation yet'}
                />
              </Card>

              <Card>
                <SectionHead label="Admin Invite" />
                <p className="text-sm font-semibold leading-6 text-slate-600 mb-4">
                  Send this link to the customer admin to complete workspace setup. ApprovLine does not store integration credentials — all OAuth tokens are customer-managed.
                </p>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-mono font-bold text-slate-600 break-all">{inviteLink}</div>
              </Card>

              <Card>
                <SectionHead label="Progress Summary" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <AdoptionTile label="Approvals" value={usage.approvals} max={100} unit="target: 100" />
                  <AdoptionTile label="Playbooks" value={usage.playbooks} max={3} unit="target: 3" />
                  <AdoptionTile label="Users" value={activeUsers} max={purchasedSeats} unit={`of ${purchasedSeats} seats`} />
                  <AdoptionTile label="Integrations" value={connectedIntegrations} max={3} unit="target: 3" />
                </div>
              </Card>
            </>
          )}

          {/* ══ USERS ═══════════════════════════════════════════════════════ */}
          {activeTab === 'users' && (
            <>
              <Card>
                <SectionHead
                  label="User Management"
                  action={
                    <Link href={`/founder/customers/${customer.id}/users`} className="rounded-xl bg-[#2557dc] px-4 py-2.5 text-xs font-black text-white">
                      Manage users and seats →
                    </Link>
                  }
                />
                <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <MetricPill label="Purchased" value={purchasedSeats} sub="Allocated seats" />
                  <MetricPill label="Active" value={activeUsers} sub="Active users" />
                  <MetricPill label="Occupied" value={occupiedSeats} sub="Active + invited" />
                  <MetricPill label="Available" value={availableSeats} sub="Open seats" />
                </div>
                <div className="space-y-2">
                  {customer.managedUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-black text-slate-950">{user.firstName} {user.lastName}</p>
                        <p className="text-xs font-semibold text-slate-500">{user.email} · {user.role.replaceAll('_', ' ')}</p>
                      </div>
                      <FounderBadge tone={user.status === 'ACTIVE' ? 'green' : user.status === 'INVITED' ? 'blue' : user.status === 'SUSPENDED' ? 'red' : 'slate'}>
                        {user.status}
                      </FounderBadge>
                    </div>
                  ))}
                  {!customer.managedUsers.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No managed users yet. Share the admin invite link below.</p>
                  ) : null}
                </div>
                {customer.managedUsers.length === 8 ? (
                  <p className="mt-3 text-xs font-semibold text-slate-400">Showing 8 most recent users. Open the full user management page to see all users.</p>
                ) : null}
              </Card>

              <Card>
                <SectionHead label="Admin Invite Link" />
                <p className="text-sm font-semibold text-slate-600 mb-3">Invite the customer admin to set up their workspace.</p>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs font-mono font-bold text-slate-600 break-all">{inviteLink}</div>
              </Card>
            </>
          )}

          {/* ══ INTEGRATIONS ════════════════════════════════════════════════ */}
          {activeTab === 'integrations' && (
            <>
              <Card>
                <SectionHead label="Integration Access" />
                <p className="mb-4 text-sm font-semibold text-slate-500">Integration access granted by founder. Customers manage their own OAuth credentials — tokens are never shown here.</p>
                <div className="space-y-2">
                  {customer.integrationStatuses.map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-black text-slate-950">{integration.provider.replaceAll('_', ' ')}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          Access {integration.accessEnabled ? 'enabled' : 'disabled'} · Customer IT owns OAuth setup
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <FounderBadge tone={integration.accessEnabled ? 'blue' : 'slate'}>
                          {integration.accessEnabled ? 'Enabled' : 'Disabled'}
                        </FounderBadge>
                        <FounderBadge tone={integration.connectionState === 'CONNECTED' ? 'green' : 'slate'}>
                          {integration.connectionState.replaceAll('_', ' ')}
                        </FounderBadge>
                      </div>
                    </div>
                  ))}
                  {!customer.integrationStatuses.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No integration access configured yet.</p>
                  ) : null}
                </div>
              </Card>

              <Card>
                <SectionHead label="Connected Accounts" />
                <p className="mb-4 text-sm font-semibold text-slate-500">OAuth connections from the customer workspace. Credentials are encrypted at rest and never displayed.</p>
                <div className="space-y-2">
                  {customer.organization.integrations.map((integration) => (
                    <div key={integration.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-black text-slate-950">{integration.provider}</p>
                        <p className="text-xs font-semibold text-slate-500">
                          {integration.externalAccount ?? 'Customer-owned connection'}
                        </p>
                      </div>
                      <FounderBadge tone={integration.status === 'CONNECTED' ? 'green' : integration.status === 'ERROR' ? 'red' : 'slate'}>
                        {integration.status}
                      </FounderBadge>
                    </div>
                  ))}
                  {!customer.organization.integrations.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No OAuth accounts connected by this customer yet.</p>
                  ) : null}
                </div>
                <p className="mt-4 text-xs font-semibold text-slate-400">OAuth tokens are encrypted with AES-256-GCM and are never exposed in this console.</p>
              </Card>
            </>
          )}

          {/* ══ BILLING ═════════════════════════════════════════════════════ */}
          {activeTab === 'billing' && (
            <>
              <Card>
                <SectionHead label="Commercial" />
                <InfoRow label="Plan" value={planDisplayName(customer.planTier)} />
                <InfoRow label="Seats purchased" value={purchasedSeats} />
                <InfoRow label="Active seats" value={activeUsers} />
                <InfoRow label="Est. ARR" value={fmtArr(estimatedArr)} />
                <InfoRow label="Data retention" value={`${customer.dataRetentionDays} days`} />
                <InfoRow label="Customer since" value={fmtDate(customer.createdAt)} />
                <InfoRow label="Last updated" value={fmtDate(customer.updatedAt)} />
              </Card>

              <Card>
                <SectionHead label="Feature Flags" />
                <div className="space-y-2">
                  {customer.featureFlags.map((flag) => (
                    <div key={flag.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-black text-slate-950">{flag.key.replaceAll('_', ' ')}</p>
                        <p className="text-xs font-semibold text-slate-500">{flag.category ?? 'General'} · Updated by {flag.updatedBy ?? 'system'}</p>
                      </div>
                      <FounderBadge tone={flag.enabled ? 'green' : 'slate'}>{flag.enabled ? 'Enabled' : 'Disabled'}</FounderBadge>
                    </div>
                  ))}
                  {!customer.featureFlags.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No feature flags configured yet.</p>
                  ) : null}
                </div>
              </Card>

              <CustomerAccountDetailsCard
                canEdit={canEditAccountDetails}
                customer={{
                  id: customer.id,
                  companyName: customer.companyName,
                  domain: customer.domain,
                  industry: customer.industry,
                  planTier: customer.planTier,
                  status: customer.status,
                  seatLimit: purchasedSeats,
                  dataRetentionDays: customer.dataRetentionDays,
                  primaryAdminName: customer.primaryAdminName,
                  primaryAdminEmail: customer.primaryAdminEmail,
                  createdAt: customer.createdAt.toISOString(),
                  updatedAt: customer.updatedAt.toISOString(),
                }}
                saveAction={saveAccountDetails}
              />
            </>
          )}

          {/* ══ HEALTH ══════════════════════════════════════════════════════ */}
          {activeTab === 'health' && (
            <>
              <Card>
                <SectionHead label="Customer Health" />
                <div className="mb-6">
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <span className="text-5xl font-black tabular-nums text-slate-950">{healthScore}</span>
                      <span className="ml-1 text-xl font-black text-slate-300">/100</span>
                    </div>
                    <FounderBadge tone={healthTone(healthStatus)}>{healthStatus.replaceAll('_', ' ')}</FounderBadge>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        healthScore >= 80 ? 'bg-emerald-500' : healthScore >= 60 ? 'bg-amber-400' : healthScore >= 35 ? 'bg-orange-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${healthScore}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-400">Score and status from the authoritative CustomerHealth record. Not recalculated here.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <MetricPill label="Approvals" value={usage.approvals.toLocaleString()} sub="Captured" />
                  <MetricPill label="Playbooks" value={usage.playbooks} sub="Active" />
                  <MetricPill label="Investigations" value={usage.investigations} sub="Opened" />
                  <MetricPill label="Integrations" value={connectedIntegrations} sub="Connected" />
                </div>
              </Card>

              <Card>
                <SectionHead label="Identity Posture" />
                <div className="space-y-2">
                  {identityPosture(customer.organization.integrationSetup, customer.organization.users.length).map((item) => (
                    <div key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="font-black text-slate-950">{item.label}</p>
                        <p className="text-xs font-semibold text-slate-500">{item.detail}</p>
                      </div>
                      <FounderBadge tone={item.tone}>{item.value}</FounderBadge>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs font-semibold text-slate-400">Founder visibility is limited to provider, SSO status, and sync health. Passwords and identity secrets are never shown.</p>
              </Card>

              <Card>
                <SectionHead label="Risk Signals" />
                <div className="space-y-2">
                  <RiskRow
                    label="Health score below 60"
                    active={healthScore < 60}
                    detail={healthScore < 60 ? `Score is ${healthScore} — attention required` : 'Score is healthy'}
                  />
                  <RiskRow
                    label="No integrations connected"
                    active={connectedIntegrations === 0}
                    detail={connectedIntegrations === 0 ? 'Customer has not connected any integrations' : `${connectedIntegrations} integration${connectedIntegrations !== 1 ? 's' : ''} connected`}
                  />
                  <RiskRow
                    label="No approvals captured"
                    active={usage.approvals === 0}
                    detail={usage.approvals === 0 ? 'No approvals in workspace yet' : `${usage.approvals.toLocaleString()} approvals captured`}
                  />
                  <RiskRow
                    label="No active users"
                    active={activeUsers === 0}
                    detail={activeUsers === 0 ? 'No active workspace users' : `${activeUsers} active user${activeUsers !== 1 ? 's' : ''}`}
                  />
                  <RiskRow
                    label="Account suspended"
                    active={customer.status === 'SUSPENDED'}
                    detail={customer.status === 'SUSPENDED' ? 'Account is currently suspended' : 'Account is active'}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ══ ACTIVITY ════════════════════════════════════════════════════ */}
          {activeTab === 'activity' && (
            <Card>
              <SectionHead label="Founder Audit Trail" />
              <div className="space-y-2">
                {customer.auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2557dc]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-950">{log.action}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {log.actorEmail ?? 'system'} · {log.createdAt.toLocaleString()}
                      </p>
                      {log.targetType ? (
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {log.targetType}{log.targetId ? ` · ${log.targetId}` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!customer.auditLogs.length ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No founder audit activity recorded yet.</p>
                ) : null}
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-400">Showing the 12 most recent founder audit events for this customer.</p>
            </Card>
          )}

          {/* ══ NOTES ═══════════════════════════════════════════════════════ */}
          {activeTab === 'notes' && (
            <>
              {canWrite ? (
                <Card>
                  <SectionHead label="Add Note" />
                  <form action={createNote} className="grid gap-3">
                    <input type="hidden" name="customerAccountId" value={customer.id} />
                    <textarea
                      name="body"
                      placeholder="Add a founder or customer success note..."
                      className="min-h-28 rounded-2xl border border-slate-200 p-4 text-sm font-semibold outline-none focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100"
                    />
                    <button className="rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white self-start">Save note</button>
                  </form>
                </Card>
              ) : null}

              <Card>
                <SectionHead label="Customer Notes" />
                <div className="space-y-3">
                  {customer.notes.map((note) => (
                    <div key={note.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-400">{note.authorEmail ?? 'Founder'} · {note.createdAt.toLocaleString()}</p>
                        {note.pinned ? <FounderBadge tone="blue">Pinned</FounderBadge> : null}
                      </div>
                      {canWrite ? (
                        <form action={editNote} className="grid gap-3">
                          <input type="hidden" name="customerAccountId" value={customer.id} />
                          <input type="hidden" name="noteId" value={note.id} />
                          <textarea
                            name="body"
                            defaultValue={note.body}
                            className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#2557dc]"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Update</button>
                            <button
                              formAction={pinNote}
                              name="pinned"
                              value={note.pinned ? 'false' : 'true'}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
                            >
                              {note.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              formAction={removeNote}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"
                            >
                              Delete
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="text-sm font-semibold leading-6 text-slate-700">{note.body}</p>
                      )}
                    </div>
                  ))}
                  {!customer.notes.length ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">No notes yet. Add one above.</p>
                  ) : null}
                </div>
              </Card>
            </>
          )}
        </div>

        {/* ── Quick Actions sidebar ────────────────────────────────────────── */}
        <aside className="space-y-4">
          <Card>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc] mb-4">Quick Actions</p>
            <div className="space-y-2">
              <Link
                href={`/founder/customers/${customer.id}/users`}
                className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors text-center"
              >
                Manage users and seats
              </Link>
              {canEditAccountDetails ? (
                <a
                  href={`/founder/customers/${id}?tab=billing`}
                  className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-50 transition-colors text-center"
                >
                  Edit account details
                </a>
              ) : null}
              {canWrite ? (
                <a
                  href={`/founder/customers/${id}?tab=notes`}
                  className="block w-full rounded-2xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white hover:bg-blue-700 transition-colors text-center"
                >
                  Add note
                </a>
              ) : null}
            </div>

            {canWrite ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <form action={changeStatus}>
                  <input type="hidden" name="customerAccountId" value={customer.id} />
                  <input type="hidden" name="status" value={customer.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED'} />
                  <button className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                    {customer.status === 'SUSPENDED' ? 'Reactivate customer' : 'Suspend customer'}
                  </button>
                </form>
                <form action={changeStatus}>
                  <input type="hidden" name="customerAccountId" value={customer.id} />
                  <input type="hidden" name="status" value="CHURNED" />
                  <button className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 hover:bg-amber-100">
                    Archive customer
                  </button>
                </form>
              </div>
            ) : null}
          </Card>

          {/* Account summary card */}
          <Card>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 mb-3">Account</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-slate-500">Plan</span>
                <span className="font-black text-slate-800 text-right">{planDisplayName(customer.planTier)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-slate-500">Seats</span>
                <span className="font-black text-slate-800">{activeUsers}/{purchasedSeats}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-slate-500">Est. ARR</span>
                <span className="font-black text-slate-800">{fmtArr(estimatedArr)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-slate-500">Health</span>
                <span className="font-black text-slate-800">{healthScore}/100</span>
              </div>
            </div>
          </Card>

          {/* Danger zone (SUPER_ADMIN only) */}
          {isSuperAdmin ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700 mb-3">Danger Zone</p>
              <p className="text-sm font-semibold leading-5 text-rose-900 mb-4">Permanently removes the founder customer account and cascades founder operational data. Type the company name to confirm.</p>
              <form action={deleteCustomer} className="space-y-2">
                <input type="hidden" name="customerAccountId" value={customer.id} />
                <input name="confirmation" placeholder={customer.companyName} className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-bold outline-none" />
                <button className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white">Delete customer</button>
              </form>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
  } catch (renderError: unknown) {
    if (renderError !== null && typeof renderError === 'object' && typeof (renderError as Record<string, unknown>).digest === 'string') {
      throw renderError;
    }
    const safeMsg = renderError instanceof Error
      ? renderError.message.replace(/postgresql:\/\/[^ ]+/g, '[db-url-redacted]').slice(0, 200)
      : 'Unexpected render error';
    console.error('[founder] customer 360 render error', renderError);
    return (
      <div className="space-y-6">
        <MigrationNotice message={safeMsg} />
      </div>
    );
  }
}

// ─── Small render helpers ────────────────────────────────────────────────────

function AdoptionTile({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = Math.min(100, max > 0 ? Math.round((value / max) * 100) : 0);
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-950">{value.toLocaleString()}</p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full bg-[#2557dc]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-400">{unit}</p>
    </div>
  );
}

function RiskRow({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 border ${active ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${active ? 'bg-rose-500' : 'bg-emerald-500'}`} />
      <div>
        <p className={`text-sm font-black ${active ? 'text-rose-900' : 'text-slate-600'}`}>{label}</p>
        <p className={`text-xs font-semibold ${active ? 'text-rose-600' : 'text-slate-400'}`}>{detail}</p>
      </div>
    </div>
  );
}
