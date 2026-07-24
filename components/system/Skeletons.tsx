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
    <section className="grid gap-3">
      <div className="space-y-2">
        <div className="h-6 w-52 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-900" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-[134px] animate-pulse rounded-lg border border-white/[0.08] bg-[#071525] p-4">
            <div className="h-3 w-24 rounded bg-slate-800" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-700" />
            <div className="mt-8 h-6 rounded bg-slate-900" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-72 animate-pulse rounded-lg border border-white/[0.08] bg-[#071525] p-4">
            <div className="h-4 w-40 rounded bg-slate-800" />
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 5 }).map((__, row) => <div key={row} className="h-9 rounded bg-slate-900" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-[#071525] xl:col-span-3" />
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-[#071525] xl:col-span-5" />
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-[#071525] xl:col-span-4" />
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
