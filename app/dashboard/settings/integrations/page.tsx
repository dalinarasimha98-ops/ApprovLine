import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { env } from '@/config/env';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { PendingLink } from '@/components/system/PendingLink';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const stateStyles: Record<string, string> = {
  CONNECTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DISCONNECTED: 'border-slate-200 bg-slate-100 text-slate-700',
  ERROR: 'border-rose-200 bg-rose-50 text-rose-700',
  NEEDS_REAUTH: 'border-amber-200 bg-amber-50 text-amber-700',
  SYNCING: 'border-blue-200 bg-blue-50 text-blue-700',
  NOT_CONNECTED: 'border-slate-200 bg-slate-100 text-slate-700',
};

function stateLabel(status?: string) {
  if (!status) return 'Not connected';
  if (status === 'NEEDS_REAUTH') return 'Needs re-authentication';
  return status.toLowerCase().replaceAll('_', ' ');
}

function metadataValue(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata[key as keyof typeof metadata];
  return typeof value === 'string' ? value : null;
}

function metadataNumber(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  const value = metadata[key as keyof typeof metadata];
  return typeof value === 'number' ? value : 0;
}

function oauthMessage(provider: 'Slack' | 'Gmail', status?: string, reason?: string) {
  if (status === 'connected') {
    return {
      tone: 'success',
      title: `${provider} connected`,
      body: `${provider} authorization succeeded. ApprovLine is ready to capture read-only approval evidence.`,
    };
  }
  if (status !== 'error') return null;

  const messages: Record<string, string> = {
    access_denied: `${provider} installation was canceled before ApprovLine received authorization.`,
    missing_oauth_code_or_state: `${provider} did not return the required OAuth code or state. Start the install again from this page.`,
    invalid_oauth_state: `The ${provider} install session expired or did not match this organization. Start the install again.`,
    missing_workspace_token: `${provider} did not return a workspace token. Confirm scopes and OAuth settings.`,
    missing_google_account_profile: 'Google did not return an email profile. Confirm profile and email scopes are enabled.',
  };
  return {
    tone: 'error',
    title: `${provider} connection failed`,
    body: messages[reason ?? ''] ?? reason ?? `${provider} OAuth failed. Confirm credentials and redirect URL, then try again.`,
  };
}

function setupItem(label: string, complete: boolean, help: string) {
  return (
    <li key={label} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{help}</span>
      </span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
        {complete ? 'Ready' : 'Missing'}
      </span>
    </li>
  );
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string; gmail?: string; reason?: string }>;
}) {
  const { organization } = await getCurrentTenant();
  const query = await searchParams;
  const [integrations, totalApprovals, slackApprovals, gmailApprovals, slackEvents, gmailEvents, queueErrors, classifierErrors] = await prisma.$transaction([
    prisma.integration.findMany({
      where: { organizationId: organization.id },
      orderBy: { provider: 'asc' },
    }),
    prisma.approvalRecord.count({ where: { organizationId: organization.id } }),
    prisma.approvalRecord.count({ where: { organizationId: organization.id, sourcePlatform: { equals: 'slack', mode: 'insensitive' } } }),
    prisma.approvalRecord.count({ where: { organizationId: organization.id, sourcePlatform: { equals: 'gmail', mode: 'insensitive' } } }),
    prisma.event.findMany({
      where: { organizationId: organization.id, type: { startsWith: 'slack.' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.event.findMany({
      where: { organizationId: organization.id, type: { startsWith: 'gmail.' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.event.count({ where: { organizationId: organization.id, type: 'slack.event.queue_error' } }),
    prisma.event.count({ where: { organizationId: organization.id, type: { in: ['slack.event.classifier_error', 'gmail.event.classifier_error'] } } }),
  ]);
  const slackIntegration = integrations.find((item) => item.provider === 'SLACK');
  const gmailIntegration = integrations.find((item) => item.provider === 'GMAIL');
  const slackStatus = slackIntegration?.status ?? 'NOT_CONNECTED';
  const gmailStatus = gmailIntegration?.status ?? 'NOT_CONNECTED';
  const slackNotice = oauthMessage('Slack', query.slack, query.reason);
  const gmailNotice = oauthMessage('Gmail', query.gmail, query.reason);
  const slackLastError = metadataValue(slackIntegration?.metadata ?? null, 'lastError');
  const slackLastSyncAt = metadataValue(slackIntegration?.metadata ?? null, 'lastSyncAt');
  const gmailLastError = metadataValue(gmailIntegration?.metadata ?? null, 'lastError');
  const gmailLastSyncAt = metadataValue(gmailIntegration?.metadata ?? null, 'lastSyncAt');
  const gmailProcessed = metadataNumber(gmailIntegration?.metadata ?? null, 'totalEmailsProcessed');
  const slackChecklist = [
    ['Slack client ID', Boolean(env.SLACK_CLIENT_ID), 'Set SLACK_CLIENT_ID in Vercel.'],
    ['Slack client secret', Boolean(env.SLACK_CLIENT_SECRET), 'Set SLACK_CLIENT_SECRET in Vercel.'],
    ['Slack signing secret', Boolean(env.SLACK_SIGNING_SECRET), 'Set SLACK_SIGNING_SECRET for event verification.'],
    ['App URL', Boolean(env.APP_URL), 'Set APP_URL to the deployed Vercel production URL.'],
    ['Encryption key', Boolean(env.ENCRYPTION_KEY), 'Set ENCRYPTION_KEY before storing workspace tokens.'],
    ['Slack workspace', slackStatus === 'CONNECTED' || slackStatus === 'SYNCING', 'Install the Slack app into the beta workspace.'],
  ] as const;

  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Connector readiness</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Read-only integrations</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Connect Slack, Gmail, Teams, and Zoom using least-privilege scopes.</p>
      </div>
      {slackNotice ? (
        <div className={`rounded-2xl border p-4 shadow-sm ${slackNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <h3 className="font-black">{slackNotice.title}</h3>
          <p className="mt-1 text-sm">{slackNotice.body}</p>
        </div>
      ) : null}
      {gmailNotice ? (
        <div className={`rounded-2xl border p-4 shadow-sm ${gmailNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <h3 className="font-black">{gmailNotice.title}</h3>
          <p className="mt-1 text-sm">{gmailNotice.body}</p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">Slack beta setup checklist</h3>
              <p className="text-sm text-slate-600">Use this before inviting the first customer workspace.</p>
            </div>
            <PendingLink href="/health" pendingText="Opening..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-50">
              Health
            </PendingLink>
          </div>
          <ul className="mt-4 grid gap-2">
            {slackChecklist.map(([label, complete, help]) => setupItem(label, complete, help))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-black">Slack test tools</h3>
          <p className="mt-1 text-sm text-slate-600">Run beta checks without waiting for a real workspace event.</p>
          <div className="mt-4 grid gap-3">
            <form action="/api/integrations/slack/demo" method="post">
              <FormSubmitButton pendingText="Running demo..." className="min-h-0 h-11 w-full rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                Run Slack demo ingestion
              </FormSubmitButton>
            </form>
            <form action="/api/integrations/slack/seed" method="post">
              <FormSubmitButton pendingText="Seeding..." className="min-h-0 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-50">
                Seed sample Slack approvals
              </FormSubmitButton>
            </form>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">Slack approvals</dt>
              <dd className="text-xl font-black">{slackApprovals}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">Gmail approvals</dt>
              <dd className="text-xl font-black">{gmailApprovals}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">Gmail emails</dt>
              <dd className="text-xl font-black">{gmailProcessed}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-slate-500">All approvals</dt>
              <dd className="text-xl font-black">{totalApprovals}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {['SLACK', 'GMAIL', 'MICROSOFT_TEAMS', 'ZOOM'].map((provider) => {
          const integration = integrations.find((item) => item.provider === provider);
          const status = integration?.status ?? 'NOT_CONNECTED';
          const lastSyncAt = metadataValue(integration?.metadata ?? null, 'lastSyncAt');
          const teamName = metadataValue(integration?.metadata ?? null, 'teamName');
          const accountEmail = metadataValue(integration?.metadata ?? null, 'accountEmail');
          const workspaceDomain = metadataValue(integration?.metadata ?? null, 'workspaceDomain');
          return (
            <div key={provider} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{provider.replaceAll('_', ' ')}</h3>
                  {teamName ? <p className="text-sm text-slate-500">{teamName}</p> : null}
                </div>
                {(provider === 'SLACK' || provider === 'GMAIL') && status === 'NOT_CONNECTED' ? (
                  <PendingLink href={`/api/integrations/${provider === 'SLACK' ? 'slack' : 'gmail'}/install`} pendingText="Connecting..." className="inline-flex min-h-0 h-10 items-center justify-center rounded-lg bg-[#2155d9] px-3 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]">
                    Connect
                  </PendingLink>
                ) : null}
              </div>
              <p className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${stateStyles[status] ?? stateStyles.NOT_CONNECTED}`}>
                {stateLabel(status)}
              </p>
              {provider === 'GMAIL' && accountEmail ? <p className="mt-3 text-xs text-slate-500">Account: {accountEmail}</p> : null}
              {provider === 'GMAIL' && workspaceDomain ? <p className="mt-1 text-xs text-slate-500">Domain: {workspaceDomain}</p> : null}
              {lastSyncAt ? <p className="mt-3 text-xs text-slate-500">Last sync: {new Date(lastSyncAt).toLocaleString()}</p> : null}
              {provider === 'GMAIL' && status !== 'NOT_CONNECTED' && status !== 'DISCONNECTED' ? (
                <form action="/api/integrations/gmail/sync" method="post" className="mt-4">
                  <input type="hidden" name="integrationId" value={integration?.id ?? ''} />
                  <FormSubmitButton pendingText="Syncing..." className="min-h-0 h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-50">
                    Sync Gmail
                  </FormSubmitButton>
                </form>
              ) : null}
              {provider === 'SLACK' && status !== 'NOT_CONNECTED' && status !== 'DISCONNECTED' ? (
                <form action="/api/integrations/slack/disconnect" method="post" className="mt-4">
                  <FormSubmitButton pendingText="Disconnecting..." className="min-h-0 h-10 rounded-lg border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 shadow-sm hover:bg-rose-50">
                    Disconnect Slack
                  </FormSubmitButton>
                </form>
              ) : null}
              <p className="mt-3 text-xs text-slate-500">
                States: Connected, Not connected, Error, Needs re-authentication, Syncing
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black">Beta empty states</h3>
          <div className="mt-4 grid gap-3 text-sm">
            {totalApprovals === 0 ? (
              <p className="rounded-xl bg-slate-50 p-3 text-slate-600">No approvals yet. Use demo ingestion, connect Slack, or sync Gmail to create the first approval record.</p>
            ) : null}
            {(slackStatus === 'CONNECTED' || slackStatus === 'SYNCING') && slackApprovals === 0 ? (
              <p className="rounded-xl bg-blue-50 p-3 text-blue-800">Slack is connected, but no Slack messages have been processed yet. Send a human message in an approved channel or run the demo.</p>
            ) : null}
            {(gmailStatus === 'CONNECTED' || gmailStatus === 'SYNCING') && gmailApprovals === 0 ? (
              <p className="rounded-xl bg-blue-50 p-3 text-blue-800">Gmail is connected, but no email approvals have been found yet. Run Sync Gmail or wait for the next scheduled sync.</p>
            ) : null}
            {classifierErrors > 0 ? (
              <p className="rounded-xl bg-rose-50 p-3 text-rose-800">{classifierErrors} classifier error event{classifierErrors === 1 ? '' : 's'} recorded. Check model keys and recent event logs.</p>
            ) : (
              <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">No classifier errors recorded.</p>
            )}
            {queueErrors > 0 ? (
              <p className="rounded-xl bg-rose-50 p-3 text-rose-800">{queueErrors} Slack queue error{queueErrors === 1 ? '' : 's'} recorded. Check Redis and worker health.</p>
            ) : (
              <p className="rounded-xl bg-emerald-50 p-3 text-emerald-800">No queue errors recorded.</p>
            )}
            {slackLastError ? <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Latest Slack error: {slackLastError}</p> : null}
            {slackLastSyncAt ? <p className="rounded-xl bg-slate-50 p-3 text-slate-600">Last Slack sync: {new Date(slackLastSyncAt).toLocaleString()}</p> : null}
            {gmailLastError ? <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Latest Gmail error: {gmailLastError}</p> : null}
            {gmailLastSyncAt ? <p className="rounded-xl bg-slate-50 p-3 text-slate-600">Last Gmail sync: {new Date(gmailLastSyncAt).toLocaleString()}</p> : null}
          </div>
        </div>
        {[
          ['Slack', slackEvents, 'No Slack events have been received yet.'],
          ['Gmail', gmailEvents, 'No Gmail sync events have been recorded yet.'],
        ].map(([label, events, empty]) => (
          <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black">Recent {label as string} event log</h3>
            {(events as typeof slackEvents).length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{empty as string}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {(events as typeof slackEvents).map((event) => (
                  <li key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-900">{event.type.replaceAll('.', ' ')}</span>
                      <span className="text-xs text-slate-500">{event.createdAt.toLocaleString()}</span>
                    </div>
                    {event.failureReason ? <p className="mt-1 text-xs text-rose-700">{event.failureReason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
