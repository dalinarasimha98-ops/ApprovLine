export default function ApprovalNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Approval unavailable</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">This record may have been deleted</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">The approval does not exist in this workspace, or you no longer have permission to view it.</p>
        <a href="/dashboard/approvals" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white">Return to Approval History</a>
      </section>
    </main>
  );
}

