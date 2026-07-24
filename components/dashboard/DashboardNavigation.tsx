'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  Cable,
  FileCheck2,
  FileSearch,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Network,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

const items: NavigationItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/evidence', label: 'Unified Evidence', icon: Boxes, badge: 'New' },
  { href: '/dashboard/approvals', label: 'Approvals', icon: FileCheck2 },
  { href: '/copilot', label: 'AI Copilot', icon: Bot },
  { href: '/investigations', label: 'Investigation Center', icon: FileSearch },
  { href: '/playbooks', label: 'Playbook AI', icon: BrainCircuit },
  { href: '/memory', label: 'Memory Graph', icon: Network },
  { href: '/analytics', label: 'Executive Analytics', icon: BarChart3 },
  { href: '/dashboard/gateway', label: 'Universal Gateway', icon: GitBranch },
  { href: '/dashboard/settings/integrations', label: 'Integrations', icon: Cable },
  { href: '/dashboard/audit', label: 'Reports & Exports', icon: ScrollText },
  { href: '/investigations?risk=high', label: 'Alerts & Risks', icon: ShieldAlert },
  { href: '/trust/compliance', label: 'Compliance Hub', icon: ShieldCheck },
  { href: '/settings/identity', label: 'Users & Teams', icon: Users },
  { href: '/founder', label: 'Founder Control Center', icon: Gauge },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function DashboardNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const activeHref = items
    .filter(({ href }) => {
      const route = href.split('?')[0];
      return route === '/dashboard' ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);
    })
    .sort((a, b) => b.href.split('?')[0].length - a.href.split('?')[0].length)[0]?.href;

  if (mobile) {
    return (
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
              activeHref === href
                ? 'border-blue-500/50 bg-blue-500/15 text-blue-200'
                : 'border-white/10 bg-white/[0.04] text-slate-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:rgba(71,85,105,.65)_transparent] [scrollbar-width:thin]">
      <div className="grid gap-0.5">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              className={`group flex min-h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition ${
                active
                  ? 'bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,.22)]'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-100' : 'text-slate-500 group-hover:text-slate-300'}`} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {badge ? (
                <span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-200">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function LiveCaptureBadge() {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 text-[11px] font-semibold text-emerald-200">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Live Capture
    </div>
  );
}

export function SystemPulse() {
  return <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
}
