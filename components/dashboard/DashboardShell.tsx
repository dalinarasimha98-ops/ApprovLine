import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

const nav = [
  { href: '/dashboard/approvals', label: 'Approval History' },
  { href: '/dashboard/audit', label: 'Audit Logs' },
  { href: '/dashboard/export', label: 'Compliance Export' },
  { href: '/dashboard/settings/integrations', label: 'Integrations' },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const hasClerk = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#090b12]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white p-5 lg:block">
        <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-black text-[#2155d9]">
          ApprovLine
        </Link>
        <nav className="grid gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#2155d9]">Compliance Workspace</p>
            <h1 className="text-lg font-black">Decision intelligence dashboard</h1>
          </div>
          {hasClerk ? <UserButton /> : <div className="text-sm font-semibold text-slate-500">Local build</div>}
        </header>
        <div className="p-5 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
