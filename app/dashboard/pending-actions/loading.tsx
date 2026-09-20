export default function Loading() {
  return (
    <div className="grid gap-5">
      <div className="h-28 animate-pulse rounded-xl border border-[#1E2D4A] bg-[#0E1830]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-[#1E2D4A] bg-[#0E1830]" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-xl border border-[#1E2D4A] bg-[#0E1830]" />
      <div className="rounded-2xl border border-[#1E2D4A] bg-[#0E1830] p-4">
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-[#152040]" />
          ))}
        </div>
      </div>
    </div>
  );
}
