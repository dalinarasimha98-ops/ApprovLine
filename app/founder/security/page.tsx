import { getFounderAccess } from '@/services/founder';
import { buildFounderSecurityPosture } from '@/services/founder-security';
import { SecurityClient } from '@/components/founder/SecurityClient';

export const dynamic = 'force-dynamic';

export default async function FounderSecurityPage() {
  await getFounderAccess();
  const report = await buildFounderSecurityPosture();

  if (!report.ok) {
    return <SecurityClient state="error" safeError={report.safeError} />;
  }

  return (
    <SecurityClient
      state="ok"
      generatedAt={report.generatedAt.toISOString()}
      kpis={report.kpis}
      controls={report.controls}
      attentionControls={report.attentionControls}
      events={report.events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }))}
      hasAnyEventsAtAll={report.hasAnyEventsAtAll}
    />
  );
}
