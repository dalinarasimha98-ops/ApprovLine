import { getFounderAccess } from '@/services/founder';
import { buildFounderObservability } from '@/services/founder-observability';
import { ObservabilityClient } from '@/components/founder/ObservabilityClient';

export const dynamic = 'force-dynamic';

export default async function FounderObservabilityPage() {
  await getFounderAccess();

  const report = await buildFounderObservability();

  return (
    <ObservabilityClient
      generatedAt={report.generatedAt.toISOString()}
      platformStatus={report.platformStatus}
      kpis={report.kpis}
      attention={report.attention.map((signal) => ({ ...signal, lastSeen: signal.lastSeen.toISOString() }))}
      dependencies={report.dependencies}
      applicationErrors={report.applicationErrors.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }))}
      operationalSignals={report.operationalSignals.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }))}
      sentryConfigured={report.sentryConfigured}
      availability={report.availability}
    />
  );
}
