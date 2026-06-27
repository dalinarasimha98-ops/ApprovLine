import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';
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

export default async function IntegrationsPage() {
  const { organization } = await getCurrentTenant();
  const integrations = await prisma.integration.findMany({
    where: { organizationId: organization.id },
    orderBy: { provider: 'asc' },
  });

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-black">Read-only integrations</h2>
        <p className="text-slate-600">Connect Slack, Gmail, Teams, and Zoom using least-privilege scopes.</p>
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
    </section>
  );
}
