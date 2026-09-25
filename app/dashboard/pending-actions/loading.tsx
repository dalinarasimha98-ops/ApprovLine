export default function Loading() {
  return (
    <div className="grid gap-5">
      <div className="h-24 animate-pulse rounded-xl border border-al-border bg-al-surface" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-al-border bg-al-surface" />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-xl border border-al-border bg-al-surface" />
      <div className="rounded-2xl border border-al-border bg-al-surface p-4">
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-al-surface-elevated" />
          ))}
        </div>
      </div>
    </div>
  );
}
