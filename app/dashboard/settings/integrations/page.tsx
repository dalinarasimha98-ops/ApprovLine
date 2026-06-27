import { prisma } from '@/lib/prisma';
import { getCurrentTenant } from '@/lib/auth';

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
          return (
            <div key={provider} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-black">{provider.replaceAll('_', ' ')}</h3>
              <p className="text-sm text-slate-500">{integration?.status ?? 'Not connected'}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
