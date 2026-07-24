import Link from 'next/link';
import { ApprovalConfirmationForm } from '@/components/approvals/ApprovalConfirmationForm';

export const dynamic = 'force-dynamic';

export default async function ConfirmApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-black tracking-tight text-slate-950">ApprovLine</Link>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-black text-[#2155d9]">Secure response</span>
        </header>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2155d9]">Approval evidence</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Review a recorded approval</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Confirm, dispute, or correct a verbal approval attributed to you. ApprovLine preserves both the original entry and your response.</p>
          <div className="mt-7"><ApprovalConfirmationForm token={token} /></div>
        </section>
        <p className="text-center text-xs leading-5 text-slate-500">Only respond if you recognize this business decision. ApprovLine will never ask for your password on this page.</p>
      </div>
    </main>
  );
}
