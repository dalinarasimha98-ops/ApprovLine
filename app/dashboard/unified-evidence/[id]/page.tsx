import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type DashboardUnifiedEvidenceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DashboardUnifiedEvidenceDetailPage({
  params,
}: DashboardUnifiedEvidenceDetailPageProps) {
  const { id } = await params;
  redirect(`/evidence/${id}`);
}
