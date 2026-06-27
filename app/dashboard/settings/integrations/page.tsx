import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';

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
          return (
            <div key={provider} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-black">{provider.replaceAll('_', ' ')}</h3>
              <p className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${stateStyles[status] ?? stateStyles.NOT_CONNECTED}`}>
                {stateLabel(status)}
              </p>
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
