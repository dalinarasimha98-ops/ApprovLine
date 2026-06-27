export default function ExportPage() {
  return (
    <section className="grid gap-5">
      <div>
        <h2 className="text-2xl font-black">Compliance export</h2>
        <p className="text-slate-600">Export approval history and audit evidence for reviews.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <a className="inline-flex rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white" href="/api/export/approvals">
          Download CSV
        </a>
      </div>
    </section>
  );
}
