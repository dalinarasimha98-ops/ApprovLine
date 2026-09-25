import { PendingLink } from '@/components/system/PendingLink';

export default function ExportPage() {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-al-accent">Evidence package</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-al-text">Compliance export</h2>
        <p className="mt-2 text-sm leading-6 text-al-text-secondary">Export approval history and audit evidence for legal, finance, and compliance reviews.</p>
      </div>
      <div className="grid gap-4 rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h3 className="text-lg font-black text-al-text">Approval records CSV</h3>
          <p className="mt-1 text-sm text-al-text-muted">Includes approval type, confidence, approver, source platform, category, and timestamps.</p>
        </div>
        <PendingLink className="inline-flex min-h-0 h-11 items-center justify-center rounded-lg bg-al-accent px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd]" href="/api/export/approvals" pendingText="Preparing CSV...">
          Download CSV
        </PendingLink>
      </div>
    </section>
  );
}
