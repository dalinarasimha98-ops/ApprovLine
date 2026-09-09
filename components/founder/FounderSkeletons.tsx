// Route-level loading.tsx skeletons for the Founder Console, matching the
// light card/table styling already used across app/founder/* pages
// (rounded-2xl/3xl white cards, border-slate-200, animate-pulse blocks).
// Kept purely presentational — no data, no client interactivity.

export function FounderHeaderSkeleton({ withButton = false }: { withButton?: boolean }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
        </div>
        {withButton ? <div className="h-11 w-44 shrink-0 animate-pulse rounded-xl bg-slate-100" /> : null}
      </div>
    </section>
  );
}

export function FounderKpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-3 h-7 w-14 animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </section>
  );
}

export function FounderTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <div className="h-9 w-full max-w-sm animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="ml-auto h-4 w-14 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function FounderCustomer360Skeleton() {
  return (
    <div className="space-y-6">
      <FounderHeaderSkeleton />
      <FounderKpiStripSkeleton count={4} />
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-6 border-b border-slate-100 px-5 py-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 w-16 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-50" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FounderFormSkeleton() {
  return (
    <div className="space-y-6">
      <FounderHeaderSkeleton />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-3 w-32 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function FounderOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <FounderKpiStripSkeleton count={6} />
      <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <FounderTableSkeleton rows={5} />
          <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}
