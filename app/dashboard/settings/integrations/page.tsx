import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
import { env } from '@/config/env';
import type { Prisma } from '@prisma/client';

const stateStyles: Record<string, string> = {
  CONNECTED: 'bg-emerald-50 text-emerald-700',
  DISCONNECTED: 'bg-slate-100 text-slate-700',
  ERROR: 'bg-rose-50 text-rose-700',
  NEEDS_REAUTH: 'bg-amber-50 text-amber-700',
  SYNCING: 'bg-blue-50 text-blue-700',
  NOT_CONNECTED: 'bg-slate-100 text-slate-700',
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

function oauthMessage(status?: string, reason?: string) {
  if (status === 'connected') {
    return {
      tone: 'success',
      title: 'Slack connected',
      body: 'Workspace authorization succeeded. ApprovLine is ready to receive read-only Slack events.',
    };
  }
  if (status !== 'error') return null;

  const messages: Record<string, string> = {
    access_denied: 'Slack installation was canceled before ApprovLine received authorization.',
    missing_oauth_code_or_state: 'Slack did not return the required OAuth code or state. Start the install again from this page.',
    invalid_oauth_state: 'The Slack install session expired or did not match this organization. Start the install again.',
    missing_workspace_token: 'Slack did not return a workspace access token. Confirm the Slack app scopes and OAuth settings.',
  };
  return {
    tone: 'error',
    title: 'Slack connection failed',
    body: messages[reason ?? ''] ?? reason ?? 'Slack OAuth failed. Confirm the Slack app credentials and redirect URL, then try again.',
  };
}

function setupItem(label: string, complete: boolean, help: string) {
  return (
    <li key={label} className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-white px-3 py-2">
      <span>
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{help}</span>
      </span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
        {complete ? 'Ready' : 'Missing'}
      </span>
    </li>
  );
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ slack?: string; reason?: string }>;
}) {
  const { organization } = await getCurrentTenant();
  const query = await searchParams;
  const [integrations, totalApprovals, slackApprovals, slackEvents, queueErrors, classifierErrors] = await prisma.$transaction([
    prisma.integration.findMany({
      where: { organizationId: organization.id },
      orderBy: { provider: 'asc' },
    }),
    prisma.approvalRecord.count({ where: { organizationId: organization.id } }),
    prisma.approvalRecord.count({ where: { organizationId: organization.id, sourcePlatform: { equals: 'slack', mode: 'insensitive' } } }),
    prisma.event.findMany({
      where: { organizationId: organization.id, type: { startsWith: 'slack.' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.event.count({ where: { organizationId: organization.id, type: 'slack.event.queue_error' } }),
    prisma.event.count({ where: { organizationId: organization.id, type: 'slack.event.classifier_error' } }),
  ]);
  const slackIntegration = integrations.find((item) => item.provider === 'SLACK');
  const slackStatus = slackIntegration?.status ?? 'NOT_CONNECTED';
  const slackNotice = oauthMessage(query.slack, query.reason);
  const slackLastError = metadataValue(slackIntegration?.metadata ?? null, 'lastError');
  const slackLastSyncAt = metadataValue(slackIntegration?.metadata ?? null, 'lastSyncAt');
  const slackChecklist = [
    ['Slack client ID', Boolean(env.SLACK_CLIENT_ID), 'Set SLACK_CLIENT_ID in Vercel.'],
    ['Slack client secret', Boolean(env.SLACK_CLIENT_SECRET), 'Set SLACK_CLIENT_SECRET in Vercel.'],
    ['Slack signing secret', Boolean(env.SLACK_SIGNING_SECRET), 'Set SLACK_SIGNING_SECRET for event verification.'],
    ['App URL', Boolean(env.APP_URL), 'Set APP_URL to the deployed Vercel production URL.'],
    ['Encryption key', Boolean(env.ENCRYPTION_KEY), 'Set ENCRYPTION_KEY before storing workspace tokens.'],
    ['Slack workspace', slackStatus === 'CONNECTED' || slackStatus === 'SYNCING', 'Install the Slack app into the beta workspace.'],
  ] as const;

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-black">Read-only integrations</h2>
        <p className="text-slate-600">Connect Slack, Gmail, Teams, and Zoom using least-privilege scopes.</p>
      </div>
      {slackNotice ? (
        <div className={`rounded-lg border p-4 ${slackNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          <h3 className="font-black">{slackNotice.title}</h3>
          <p className="mt-1 text-sm">{slackNotice.body}</p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">Slack beta setup checklist</h3>
              <p className="text-sm text-slate-600">Use this before inviting the first customer workspace.</p>
            </div>
            <a href="/health" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900">
              Health
            </a>
          </div>
          <ul className="mt-4 grid gap-2">
            {slackChecklist.map(([label, complete, help]) => setupItem(label, complete, help))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-lg font-black">Slack test tools</h3>
          <p className="mt-1 text-sm text-slate-600">Run beta checks without waiting for a real workspace event.</p>
          <div className="mt-4 grid gap-3">
            <form action="/api/integrations/slack/demo" method="post">
              <button className="w-full rounded-md bg-[#2155d9] px-3 py-2 text-sm font-bold text-white">
                Run Slack demo ingestion
              </button>
            </form>
            <form action="/api/integrations/slack/seed" method="post">
              <button className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900">
                Seed sample Slack approvals
              </button>
            </form>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3">
              <dt className="text-slate-500">Slack approvals</dt>
              <dd className="text-xl font-black">{slackApprovals}</dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
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
          return (
            <div key={provider} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{provider.replaceAll('_', ' ')}</h3>
                  {teamName ? <p className="text-sm text-slate-500">{teamName}</p> : null}
                </div>
                {provider === 'SLACK' && status === 'NOT_CONNECTED' ? (
                  <a href="/api/integrations/slack/install" className="rounded-md bg-[#2155d9] px-3 py-2 text-sm font-bold text-white">
                    Connect
                  </a>
                ) : null}
              </div>
              <p className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${stateStyles[status] ?? stateStyles.NOT_CONNECTED}`}>
                {stateLabel(status)}
              </p>
              {lastSyncAt ? <p className="mt-3 text-xs text-slate-500">Last sync: {new Date(lastSyncAt).toLocaleString()}</p> : null}
              {provider === 'SLACK' && status !== 'NOT_CONNECTED' && status !== 'DISCONNECTED' ? (
                <form action="/api/integrations/slack/disconnect" method="post" className="mt-4">
                  <button className="rounded-md border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">
                    Disconnect Slack
                  </button>
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
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-black">Beta empty states</h3>
          <div className="mt-4 grid gap-3 text-sm">
            {totalApprovals === 0 ? (
              <p className="rounded-md bg-slate-50 p-3 text-slate-600">No approvals yet. Use demo ingestion or connect Slack to create the first approval record.</p>
            ) : null}
            {(slackStatus === 'CONNECTED' || slackStatus === 'SYNCING') && slackApprovals === 0 ? (
              <p className="rounded-md bg-blue-50 p-3 text-blue-800">Slack is connected, but no Slack messages have been processed yet. Send a human message in an approved channel or run the demo.</p>
            ) : null}
            {classifierErrors > 0 ? (
              <p className="rounded-md bg-rose-50 p-3 text-rose-800">{classifierErrors} classifier error event{classifierErrors === 1 ? '' : 's'} recorded. Check model keys and recent event logs.</p>
            ) : (
              <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">No classifier errors recorded.</p>
            )}
            {queueErrors > 0 ? (
              <p className="rounded-md bg-rose-50 p-3 text-rose-800">{queueErrors} Slack queue error{queueErrors === 1 ? '' : 's'} recorded. Check Redis and worker health.</p>
            ) : (
              <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">No queue errors recorded.</p>
            )}
            {slackLastError ? <p className="rounded-md bg-amber-50 p-3 text-amber-800">Latest Slack error: {slackLastError}</p> : null}
            {slackLastSyncAt ? <p className="rounded-md bg-slate-50 p-3 text-slate-600">Last Slack sync: {new Date(slackLastSyncAt).toLocaleString()}</p> : null}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-black">Recent Slack event log</h3>
          {slackEvents.length === 0 ? (
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">No Slack events have been received yet.</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {slackEvents.map((event) => (
                <li key={event.id} className="rounded-md border border-slate-200 p-3 text-sm">
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
      </div>
    </section>
  );
}
