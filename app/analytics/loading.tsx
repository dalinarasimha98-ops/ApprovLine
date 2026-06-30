import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardSkeleton } from '@/components/system/Skeletons';

export default function Loading() {
  return (
    <DashboardShell>
      <DashboardSkeleton />
    </DashboardShell>
  );
}
