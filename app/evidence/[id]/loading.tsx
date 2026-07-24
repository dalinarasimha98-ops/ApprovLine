import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function EvidenceDetailLoading() {
  return (
    <DashboardShell>
      <div className="grid animate-pulse gap-6">
        <div className="h-72 rounded-3xl border border-slate-200 bg-white" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-[32rem] rounded-3xl border border-slate-200 bg-white" />
      </div>
    </DashboardShell>
  );
}
