import { DashboardSkeleton } from '@/components/system/Skeletons';

export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <DashboardSkeleton />
    </main>
  );
}
