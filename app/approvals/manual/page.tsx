import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ManualApprovalForm } from '@/components/approvals/ManualApprovalForm';
import { getDashboardTenant } from '@/lib/auth';
import { canManageManualApprovals } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';

export default async function ManualApprovalPage() {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (!tenant.organization || !tenant.user) redirect('/onboarding');
  if (!canManageManualApprovals(tenant.user.role)) redirect('/dashboard/approvals');
  return <DashboardShell><section className="grid gap-6"><header className="rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Defensible evidence capture</p><h2 className="mt-2 text-3xl font-black">Record a verbal or manual approval</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Capture decisions made by phone, in person, or outside connected systems without presenting them as automatically verified evidence.</p></header><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><ManualApprovalForm /></div></section></DashboardShell>;
}
