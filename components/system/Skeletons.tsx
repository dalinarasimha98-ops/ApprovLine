export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
      <div className="h-4 w-28 animate-pulse rounded-full bg-al-border-strong" />
      <div className="mt-4 h-8 w-2/3 animate-pulse rounded-lg bg-al-border-strong" />
      <div className="mt-6 grid gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-xl bg-al-surface-elevated" />
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
          <div key={index} className="h-[134px] animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken p-4">
            <div className="h-3 w-24 rounded bg-slate-800" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-700" />
            <div className="mt-8 h-6 rounded bg-slate-900" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-72 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken p-4">
            <div className="h-4 w-40 rounded bg-slate-800" />
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 5 }).map((__, row) => <div key={row} className="h-9 rounded bg-slate-900" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-3" />
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-5" />
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-4" />
      </div>
    </section>
  );
}

/**
 * Dedicated skeleton for the Organization Dashboard (app/dashboard/page.tsx)
 * only - deliberately NOT the shared DashboardSkeleton() above, which
 * several other pages (Executive Analytics, Settings, Gateway,
 * Customer Success loading states) also reuse as a generic approximation.
 * This page's real layout (5 KPI cards, then activity+category,
 * approvals+activity, integrations+workflows+risk, users+compliance+open
 * items) is different enough from that shared shape that reusing it here
 * would both misrepresent this page's own loading state and, if edited to
 * fit this page, silently degrade the other five pages that already share it.
 */
export function OrganizationDashboardSkeleton() {
  return (
    <section className="grid gap-3">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="space-y-2">
          <div className="h-6 w-52 animate-pulse rounded bg-slate-800" />
          <div className="h-3 w-80 max-w-full animate-pulse rounded bg-slate-900" />
        </div>
        <div className="h-8 w-48 animate-pulse rounded-md bg-slate-800" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[116px] animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken p-4">
            <div className="h-3 w-24 rounded bg-slate-800" />
            <div className="mt-3 h-7 w-16 rounded bg-slate-700" />
            <div className="mt-6 h-3 w-20 rounded bg-slate-900" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-7" />
        <div className="h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-5" />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        <div className="h-72 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-8" />
        <div className="h-72 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken xl:col-span-4" />
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-64 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken p-4 xl:col-span-4">
            <div className="h-4 w-32 rounded bg-slate-800" />
            <div className="mt-5 grid gap-3">
              {Array.from({ length: 4 }).map((__, row) => <div key={row} className="h-8 rounded bg-slate-900" />)}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-12">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="min-h-56 animate-pulse rounded-lg border border-white/[0.08] bg-al-surface-sunken p-4 xl:col-span-4" />
        ))}
      </div>
    </section>
  );
}

export function TableSkeleton() {
  return (
    <section className="grid gap-6">
      <CardSkeleton rows={1} />
      <div className="rounded-2xl border border-al-border bg-al-surface p-4 shadow-sm">
        <div className="grid gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.5fr_1fr_1fr_0.7fr] gap-3">
              <div className="h-10 animate-pulse rounded-lg bg-al-surface-elevated" />
              <div className="h-10 animate-pulse rounded-lg bg-al-surface-elevated" />
              <div className="h-10 animate-pulse rounded-lg bg-al-surface-elevated" />
              <div className="h-10 animate-pulse rounded-lg bg-al-surface-elevated" />
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
      <div className="mx-auto max-w-2xl rounded-[24px] border border-al-border bg-al-surface p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="h-4 w-24 animate-pulse rounded-full bg-blue-100" />
        <div className="mt-6 h-10 w-3/4 animate-pulse rounded-xl bg-al-border-strong" />
        <div className="mt-4 h-5 w-full animate-pulse rounded-lg bg-al-surface-elevated" />
        <div className="mt-8 h-12 animate-pulse rounded-xl bg-al-surface-elevated" />
        <div className="mt-8 flex justify-between">
          <div className="h-11 w-24 animate-pulse rounded-xl bg-al-surface-elevated" />
          <div className="h-11 w-36 animate-pulse rounded-xl bg-blue-100" />
        </div>
      </div>
    </main>
  );
}
