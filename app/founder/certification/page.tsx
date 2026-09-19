import { getFounderAccess } from '@/services/founder';
import { buildFounderCertificationCenter } from '@/services/founder-certification';
import { CertificationClient } from '@/components/founder/CertificationClient';

export const dynamic = 'force-dynamic';

export default async function FounderCertificationPage() {
  await getFounderAccess();
  const report = await buildFounderCertificationCenter();

  return (
    <CertificationClient
      generatedAt={report.generatedAt.toISOString()}
      decision={report.decision}
      kpis={report.kpis}
      controls={report.controls}
      attentionControls={report.attentionControls}
    />
  );
}
