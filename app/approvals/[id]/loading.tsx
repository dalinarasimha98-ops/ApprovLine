export default function ApprovalDetailLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-6" aria-busy="true" aria-label="Loading approval">
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-48 rounded-3xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-28 rounded-2xl bg-slate-200" />)}</div>
        <div className="grid gap-6 lg:grid-cols-2"><div className="h-96 rounded-2xl bg-slate-200" /><div className="h-96 rounded-2xl bg-slate-200" /></div>
      </div>
    </main>
  );
}

