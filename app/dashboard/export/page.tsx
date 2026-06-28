export default function ExportPage() {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Evidence package</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Compliance export</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Export approval history and audit evidence for legal, finance, and compliance reviews.</p>
      </div>
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h3 className="text-lg font-black text-slate-950">Approval records CSV</h3>
          <p className="mt-1 text-sm text-slate-500">Includes approval type, confidence, approver, source platform, category, and timestamps.</p>
        </div>
        <a className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]" href="/api/export/approvals">
          Download CSV
        </a>
      </div>
    </section>
  );
}
