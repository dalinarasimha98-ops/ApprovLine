export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-4 h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-6 grid gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <section className="grid gap-6">
      <CardSkeleton rows={2} />
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton rows={4} />
        <CardSkeleton rows={4} />
      </div>
    </section>
  );
}

export function TableSkeleton() {
  return (
    <section className="grid gap-6">
      <CardSkeleton rows={1} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] gap-3">
              <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
              <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OnboardingSkeleton() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="h-4 w-24 animate-pulse rounded-full bg-blue-100" />
        <div className="mt-6 h-10 w-3/4 animate-pulse rounded-xl bg-slate-200" />
        <div className="mt-4 h-5 w-full animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-8 h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-8 flex justify-between">
          <div className="h-11 w-24 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-11 w-36 animate-pulse rounded-xl bg-blue-100" />
        </div>
      </div>
    </main>
  );
}
