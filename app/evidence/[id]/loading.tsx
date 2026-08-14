/**
 * Shown instantly on navigation to /evidence/[id], before page.tsx even
 * starts executing - this is what actually fixes the "feels slow" problem.
 * DashboardShell is an async component (it awaits its own tenant/role
 * lookup for nav filtering) and wraps the page's own inline Suspense
 * boundary, so that inner boundary can't show anything until DashboardShell
 * itself resolves. This route-segment loading.tsx is a separate boundary
 * that Next.js renders immediately, ahead of that whole tree, so a click
 * always gets visible feedback well under 100ms regardless of how long the
 * tenant lookup or the evidence fetch take.
 */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/[0.06] ${className}`} />;
}

function Card({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`rounded-2xl border border-white/[0.08] bg-[#071321]/95 ${className}`}>{children}</div>;
}

export default function EvidenceDetailLoading() {
  return (
    <div className="min-h-screen bg-[#030b18] text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col gap-3 border-r border-white/[0.08] bg-[#020916] p-3 lg:flex">
        <Bar className="h-12 w-full" />
        <Bar className="h-9 w-full" />
        <div className="mt-2 space-y-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <Bar key={index} className="h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="lg:pl-[248px]">
        <div className="border-b border-white/[0.07] bg-[#030b18]/95 px-4 py-3 sm:px-5">
          <Bar className="h-6 w-56" />
        </div>
        <div className="grid gap-4 p-3 sm:p-4 xl:p-5">
          {/* Header: title bar + status badge */}
          <Card className="p-6">
            <Bar className="h-4 w-40" />
            <Bar className="mt-3 h-8 w-2/3 max-w-lg" />
            <div className="mt-4 flex gap-2">
              <Bar className="h-6 w-24 rounded-full" />
              <Bar className="h-6 w-20 rounded-full" />
            </div>
          </Card>

          {/* Metadata strip: 6-7 columns */}
          <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Bar className="h-2.5 w-16" />
                <Bar className="h-4 w-20" />
              </div>
            ))}
          </Card>

          {/* Tab bar */}
          <div className="flex gap-4 border-b border-white/[0.08] px-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <Bar key={index} className="mb-3 h-4 w-20" />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            {/* Timeline skeleton: 4 event rows */}
            <Card className="p-4">
              <Bar className="h-4 w-48" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <Bar className="h-8 w-8 shrink-0 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Bar className="h-3 w-1/3" />
                      <Bar className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Right sidebar: 3 cards */}
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="p-4">
                  <Bar className="h-4 w-32" />
                  <div className="mt-3 space-y-2">
                    <Bar className="h-3 w-full" />
                    <Bar className="h-3 w-4/5" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
