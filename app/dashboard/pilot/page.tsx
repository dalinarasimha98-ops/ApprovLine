import { redirect } from 'next/navigation';
import { getDashboardTenant } from '@/lib/auth';
import {
  buildPilotReadiness,
  createPilotFeedback,
  createPilotInvite,
  setPilotFeatureFlag,
} from '@/services/pilot';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import type { Role } from '@prisma/client';

export const dynamic = 'force-dynamic';

const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100';
const textareaClass =
  'min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100';

function cleanString(value: FormDataEntryValue | null, fallback = '') {
  return String(value ?? fallback).trim();
}

async function invitePilotUser(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(3000);
  if (!tenant.organization || !tenant.user) redirect('/dashboard/pilot?pilot=error');
  const email = cleanString(formData.get('email')).toLowerCase();
  const role = cleanString(formData.get('role'), 'EMPLOYEE') as Role;
  if (!email.includes('@')) redirect('/dashboard/pilot?pilot=invalid_invite');
  await createPilotInvite({
    organizationId: tenant.organization.id,
    inviterUserId: tenant.user.id,
    email,
    role,
  });
  redirect('/dashboard/pilot?pilot=invited');
}

async function submitPilotFeedback(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(3000);
  if (!tenant.organization || !tenant.user) redirect('/dashboard/pilot?pilot=error');

  const type = cleanString(formData.get('type'), 'feedback');
  const title = cleanString(formData.get('title'));
  const body = cleanString(formData.get('body'));
  const pageUrl = cleanString(formData.get('pageUrl'));
  const file = formData.get('screenshot');
  const screenshot =
    file && typeof file === 'object' && 'name' in file && 'size' in file && Number(file.size) > 0
      ? {
          name: String(file.name),
          size: Number(file.size),
          type: 'type' in file ? String(file.type) : 'application/octet-stream',
          storage: 'metadata-only',
        }
      : undefined;

  if (!title || !body) redirect('/dashboard/pilot?pilot=invalid_feedback');
  await createPilotFeedback({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    type,
    title,
    body,
    pageUrl: pageUrl || null,
    screenshot,
  });
  redirect('/dashboard/pilot?pilot=feedback_submitted');
}

async function updateFeatureFlag(formData: FormData) {
  'use server';
  const tenant = await getDashboardTenant(3000);
  if (!tenant.organization || !tenant.user) redirect('/dashboard/pilot?pilot=error');
  await setPilotFeatureFlag({
    organizationId: tenant.organization.id,
    userId: tenant.user.id,
    key: cleanString(formData.get('key')),
    enabled: cleanString(formData.get('enabled')) === 'true',
  });
  redirect('/dashboard/pilot?pilot=flag_updated');
}

function queryNotice(status?: string) {
  const messages: Record<string, { title: string; body: string; tone: string }> = {
    invited: { title: 'Invite recorded', body: 'The beta invite is saved for your customer success follow-up.', tone: 'success' },
    feedback_submitted: { title: 'Feedback submitted', body: 'Thanks. The report is now visible in pilot activity.', tone: 'success' },
    flag_updated: { title: 'Feature flag updated', body: 'The workspace feature setting was changed safely.', tone: 'success' },
    invalid_invite: { title: 'Invite needs a valid email', body: 'Enter a beta user work email and try again.', tone: 'error' },
    invalid_feedback: { title: 'Feedback needs detail', body: 'Add a short title and description before submitting.', tone: 'error' },
    migration_required: { title: 'Pilot storage compatibility mode active', body: 'Pilot actions are saved through audit logs while dedicated pilot tables are pending.', tone: 'success' },
    error: { title: 'Pilot action unavailable', body: 'Workspace state could not be loaded. Retry in a moment.', tone: 'error' },
  };
  return status ? messages[status] : null;
}

export default async function PilotReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ pilot?: string }>;
}) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) {
    return (
      <section className={cardClass}>
        <p className="text-xs font-black uppercase tracking-wide text-amber-700">Pilot readiness unavailable</p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">Workspace could not load</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">{tenant.error ?? 'Retry after the database is ready.'}</p>
      </section>
    );
  }

  const query = await searchParams;
  const notice = queryNotice(query.pilot);
  const readiness = await buildPilotReadiness(tenant.organization.id).catch((error) => {
    console.error('[pilot] failed to build readiness payload', error);
    return {
      metrics: {
        activeUsers: 0,
        connectedIntegrations: 0,
        approvalsCaptured: 0,
        errors: 0,
        feedbackSubmitted: 0,
      },
      integrations: [],
      checklist: [
        { key: 'connect_slack', label: 'Connect Slack', href: '/dashboard/settings/integrations', provider: 'SLACK' as const, complete: false },
        { key: 'connect_gmail', label: 'Connect Gmail', href: '/dashboard/settings/integrations', provider: 'GMAIL' as const, complete: false },
        { key: 'connect_teams', label: 'Connect Microsoft Teams', href: '/dashboard/settings/integrations', provider: 'MICROSOFT_TEAMS' as const, complete: false },
        { key: 'connect_jira', label: 'Connect Jira', href: '/dashboard/settings/integrations', provider: 'JIRA' as const, complete: false },
        { key: 'upload_playbook', label: 'Upload first playbook', href: '/playbooks', complete: false },
        { key: 'audit_report', label: 'Generate first audit report', href: '/dashboard/export', complete: false },
      ],
      invites: [],
      flags: [
        { id: 'demo_mode', key: 'demo_mode', enabled: true, description: 'Allow clearly marked sample data and demo previews for sales calls.' },
        { id: 'beta_features', key: 'beta_features', enabled: true, description: 'Show pilot-only surfaces such as investigations, Playbook AI, and ROI drilldowns.' },
        { id: 'slack_connector', key: 'slack_connector', enabled: true, description: 'Enable Slack OAuth, event ingestion, and sync controls.' },
        { id: 'gmail_connector', key: 'gmail_connector', enabled: true, description: 'Enable Gmail OAuth and approval-thread sync.' },
        { id: 'teams_connector', key: 'teams_connector', enabled: true, description: 'Enable Microsoft Teams OAuth and read-only sync.' },
        { id: 'jira_connector', key: 'jira_connector', enabled: true, description: 'Enable Jira OAuth and issue evidence sync.' },
      ],
      activityLogs: [],
      migrationRequired: false,
      storageFallback: true,
      degraded: true,
      safeError: error instanceof Error ? error.message.slice(0, 220) : 'Pilot readiness payload failed to load.',
    };
  });
  const checklistComplete = readiness.checklist.filter((item) => item.complete).length;

  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2155d9]">Pilot Readiness</p>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Beta customer command center</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Prepare this workspace for real pilot users, monitor early usage, collect issues, and keep demo data separated from live customer evidence.
            </p>
          </div>
          <PendingLink href="/dashboard/settings/integrations" pendingText="Opening connectors..." className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200">
            Connect integrations
          </PendingLink>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border p-4 text-sm font-semibold shadow-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <h3 className="font-black">{notice.title}</h3>
          <p className="mt-1">{notice.body}</p>
        </div>
      ) : null}

      {readiness.storageFallback ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-950 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide">Pilot compatibility mode</p>
          <p className="mt-1 text-sm font-semibold leading-6">
            Pilot invites, feedback, feature flags, and activity events are being recorded in ApprovLine audit logs. Dedicated pilot tables can still be deployed later, but this page is ready to use now.
          </p>
        </div>
      ) : null}

      {readiness.degraded ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide">Pilot diagnostics</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Pilot mode is running in safe fallback</h3>
          <p className="mt-2 text-sm font-semibold leading-6">
            The dashboard is intentionally staying online while production finishes database readiness. Safe diagnostic: {readiness.safeError ?? 'pilot readiness fallback active'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ['Active users', readiness.metrics.activeUsers],
          ['Connected integrations', readiness.metrics.connectedIntegrations],
          ['Approvals captured', readiness.metrics.approvalsCaptured],
          ['Errors', readiness.metrics.errors],
          ['Feedback submitted', readiness.metrics.feedbackSubmitted],
        ].map(([label, value]) => (
          <div key={label} className={cardClass}>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Pilot workspace checklist</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{checklistComplete} of {readiness.checklist.length} complete</h3>
            </div>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-[#2155d9]" style={{ width: `${Math.round((checklistComplete / readiness.checklist.length) * 100)}%` }} />
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            {readiness.checklist.map((item) => (
              <PendingLink key={item.key} href={item.href} pendingText="Opening..." className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white">
                <span className="flex items-center gap-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${item.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>
                    {item.complete ? '✓' : '○'}
                  </span>
                  {item.label}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-400">{item.complete ? 'Ready' : 'Open'}</span>
              </PendingLink>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Admin invite flow</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Invite beta users</h3>
          <form action={invitePilotUser} className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-black text-slate-700">
              Work email
              <input name="email" type="email" required placeholder="customer@company.com" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm font-black text-slate-700">
              Role
              <select name="role" defaultValue="EMPLOYEE" className={inputClass}>
                <option value="ADMIN">Admin</option>
                <option value="MANAGER">Manager</option>
                <option value="COMPLIANCE_OFFICER">Compliance Officer</option>
                <option value="EMPLOYEE">Employee</option>
              </select>
            </label>
            <FormSubmitButton pendingText="Saving invite..." className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200">
              Save beta invite
            </FormSubmitButton>
          </form>
          <div className="mt-5 grid gap-2">
            {readiness.invites.length ? readiness.invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate font-bold text-slate-800">{invite.email}</span>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black uppercase text-slate-500">{invite.status}</span>
              </div>
            )) : <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">No beta users invited yet.</p>}
          </div>
        </div>
      </div>

      <div id="feedback" className="grid gap-6 xl:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Feedback button destination</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Submit pilot feedback</h3>
          <form action={submitPilotFeedback} className="mt-5 grid gap-3">
            <input type="hidden" name="type" value="feedback" />
            <input name="title" required placeholder="Short feedback title" className={inputClass} />
            <textarea name="body" required placeholder="What should we improve before the pilot expands?" className={textareaClass} />
            <input name="pageUrl" placeholder="Page URL or workflow affected" className={inputClass} />
            <FormSubmitButton pendingText="Submitting..." className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200">
              Submit feedback
            </FormSubmitButton>
          </form>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-rose-600">Issue reporting</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Report an issue with screenshot</h3>
          <form action={submitPilotFeedback} className="mt-5 grid gap-3">
            <input type="hidden" name="type" value="issue" />
            <input name="title" required placeholder="What broke?" className={inputClass} />
            <textarea name="body" required placeholder="Steps to reproduce, expected result, and actual result." className={textareaClass} />
            <input name="pageUrl" placeholder="Affected URL" className={inputClass} />
            <input name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600" />
            <p className="text-xs font-semibold text-slate-500">For privacy, ApprovLine stores screenshot metadata in this MVP. Connect object storage before storing files.</p>
            <FormSubmitButton pendingText="Reporting..." className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-black text-white shadow-sm shadow-rose-200">
              Report issue
            </FormSubmitButton>
          </form>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Feature flags</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Pilot controls</h3>
          <div className="mt-5 grid gap-3">
            {readiness.flags.map((flag) => (
              <form key={flag.id} action={updateFeatureFlag} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-sm font-black text-slate-950">{flag.key.replaceAll('_', ' ')}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{flag.description}</p>
                </div>
                <input type="hidden" name="key" value={flag.key} />
                <input type="hidden" name="enabled" value={flag.enabled ? 'false' : 'true'} />
                <FormSubmitButton pendingText="Saving..." className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-black ${flag.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>
                  {flag.enabled ? 'Enabled' : 'Disabled'}
                </FormSubmitButton>
              </form>
            ))}
          </div>
        </div>

        <div className={cardClass}>
          <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Pilot activity logs</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Recent usage signals</h3>
          <div className="mt-5 grid gap-3">
            {readiness.activityLogs.length ? readiness.activityLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-950">{log.action}</p>
                  <p className="text-xs font-bold text-slate-400">{log.createdAt.toLocaleString()}</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-500">{log.entityType ?? 'Workspace'} {log.entityId ? `• ${log.entityId.slice(0, 8)}` : ''}</p>
              </div>
            )) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">Pilot activity will appear as beta users submit feedback, update flags, and generate demo workspaces.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide">Production safety</p>
        <div className="mt-3 grid gap-3 text-sm font-bold md:grid-cols-3">
          <span className="rounded-xl bg-white/70 p-3">Destructive demo reset requires confirmation.</span>
          <span className="rounded-xl bg-white/70 p-3">Demo records remain marked with demo metadata.</span>
          <span className="rounded-xl bg-white/70 p-3">Integration disconnect actions require explicit confirmation.</span>
        </div>
      </div>
    </section>
  );
}
