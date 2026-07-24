import { DashboardShell } from '@/components/dashboard/DashboardShell';

export default function EvidenceLoading() {
  return (
    <DashboardShell>
      <div className="grid animate-pulse gap-6">
        <div className="h-44 rounded-3xl bg-slate-900" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-28 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-96 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </DashboardShell>
  );
}
