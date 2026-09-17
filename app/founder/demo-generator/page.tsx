import { getFounderAccess } from '@/services/founder';
import { buildDemoGeneratorPageData } from '@/services/founder-demo-generator';
import { DemoGeneratorClient } from '@/components/founder/DemoGeneratorClient';

export const dynamic = 'force-dynamic';

export default async function FounderDemoGeneratorPage() {
  await getFounderAccess();
  const data = await buildDemoGeneratorPageData();

  if (!data.ok) {
    return <DemoGeneratorClient state="error" safeError={data.safeError} />;
  }

  return (
    <DemoGeneratorClient
      state="ok"
      workspaces={data.workspaces.map((w) => ({ ...w, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString() }))}
      recentRuns={data.recentRuns.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      lastGeneratedAt={data.lastGeneratedAt ? data.lastGeneratedAt.toISOString() : null}
    />
  );
}
