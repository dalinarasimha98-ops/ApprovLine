import { getFounderAccess } from '@/services/founder';
import { buildFounderSystemHealth } from '@/services/founder-system-health';
import { SystemHealthClient } from '@/components/founder/SystemHealthClient';

export const dynamic = 'force-dynamic';

export default async function FounderSystemHealthPage() {
  await getFounderAccess();

  const report = await buildFounderSystemHealth();

  return (
    <SystemHealthClient
      generatedAt={report.generatedAt.toISOString()}
      overall={report.overall}
      cards={report.cards.map((card) => ({ ...card, lastChecked: card.lastChecked.toISOString() }))}
      queue={{ ...report.queue, workerLastSeenAt: report.queue.workerLastSeenAt?.toISOString() ?? null }}
      integrations={report.integrations.map((row) => ({ ...row, lastCheck: row.lastCheck?.toISOString() ?? null }))}
      recentEvents={report.recentEvents.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }))}
    />
  );
}
