export default function ApprovalDetailLoading() {
  return (
    <div className="min-h-screen bg-[#030b18] lg:pl-[248px]">
      <div className="p-3 sm:p-4 xl:p-5">
        <div className="flex overflow-hidden rounded-2xl border border-[#1E2D4A]" style={{ minHeight: 'calc(100svh - 5.5rem)' }}>
          {/* Left panel skeleton */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-[#1E2D4A] bg-[#07111f] xl:flex">
            <div className="border-b border-[#1E2D4A] px-4 py-3.5">
              <div className="h-4 w-28 animate-pulse rounded-md bg-[#1E2D4A]" />
            </div>
            <div className="px-4 pb-1 pt-3">
              <div className="h-2.5 w-12 animate-pulse rounded bg-[#1E2D4A]" />
            </div>
            <div className="grid gap-1 px-2 py-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-[#0E1830]" />
              ))}
            </div>
          </aside>

          {/* Center skeleton */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#030b18]">
            {/* Header skeleton */}
            <div className="shrink-0 border-b border-[#1E2D4A] bg-[#07111f] px-6 pb-5 pt-5">
              <div className="mb-3 h-3 w-24 animate-pulse rounded bg-[#1E2D4A]" />
              <div className="h-7 w-3/4 animate-pulse rounded-lg bg-[#0E1830]" />
              <div className="mt-3 flex gap-2">
                <div className="h-6 w-20 animate-pulse rounded-full bg-[#1E2D4A]" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-[#1E2D4A]" />
                <div className="h-6 w-28 animate-pulse rounded-full bg-[#1E2D4A]" />
              </div>
            </div>
            {/* Tab bar skeleton */}
            <div className="flex shrink-0 gap-1 border-b border-[#1E2D4A] bg-[#07111f] px-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-11 w-24 animate-pulse rounded-t-md bg-[#0E1830]" />
              ))}
            </div>
            {/* Content skeleton */}
            <div className="grid gap-4 p-6">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-[#0E1830]" />
              ))}
            </div>
          </div>

          {/* Right panel skeleton */}
          <aside className="hidden w-72 shrink-0 flex-col border-l border-[#1E2D4A] bg-[#07111f] 2xl:flex">
            <div className="border-b border-[#1E2D4A] px-5 py-4">
              <div className="h-4 w-32 animate-pulse rounded-md bg-[#1E2D4A]" />
            </div>
            <div className="grid gap-4 p-5">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-[#0E1830]" />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
