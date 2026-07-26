import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardSkeleton } from '@/components/system/Skeletons';

export function DashboardRouteSkeleton() {
  return (
    <DashboardShell>
      <DashboardSkeleton />
    </DashboardShell>
  );
}
