'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import type { FounderRole } from '@/services/founder';

type NavItem = { label: string; href?: string; exact?: boolean; soon?: boolean };
type NavGroup = { id: string; label: string; items: NavItem[] };

// Route mapping: every href is a real existing /founder/* route.
// Items without href are marked soon and rendered as non-interactive.
const NAV: NavGroup[] = [
  {
    id: 'command',
    label: 'Command Center',
    items: [
      { label: 'Overview', href: '/founder', exact: true },
      { label: 'Founder Attention', href: '/founder/health' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { label: 'All Customers', href: '/founder/customers' },
      { label: 'Customer 360', href: '/founder/customers' },
      { label: 'Customer Health', href: '/founder/health' },
      { label: 'Provision Customer', href: '/founder/provision' },
    ],
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    items: [
      { label: 'Onboarding Pipeline', href: '/founder/pilots' },
      { label: 'Active Onboardings', soon: true },
      { label: 'Onboarding Templates', soon: true },
      { label: 'Go-Live Readiness', href: '/founder/readiness' },
    ],
  },
  {
    id: 'product',
    label: 'Product Control',
    items: [
      { label: 'Feature Access', href: '/founder/features' },
      { label: 'Feature Flags', href: '/founder/features' },
      { label: 'Integration Catalog', href: '/founder/integrations' },
      { label: 'Customer Integrations', href: '/founder/integrations' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    items: [
      { label: 'Plans & Billing', href: '/founder/billing' },
      { label: 'Seats & Usage', href: '/founder/users' },
      { label: 'Revenue', href: '/founder/revenue' },
    ],
  },
  {
    id: 'success',
    label: 'Customer Success',
    items: [
      { label: 'Support & Notes', href: '/founder/notes' },
      { label: 'Customer Activity', href: '/founder/audit' },
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    items: [
      { label: 'System Health', href: '/founder/operations' },
      { label: 'Integration Health', href: '/founder/operations' },
      { label: 'Background Jobs', href: '/founder/reliability' },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    items: [
      { label: 'Founder Audit Logs', href: '/founder/audit' },
      { label: 'Security', href: '/founder/security/isolation' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [{ label: 'Founder Settings', href: '/founder/settings' }],
  },
];

// Existing engineering-internal pages retained but kept separate from primary nav.
const ENGINEERING: NavItem[] = [
  { label: 'Demo Generator', href: '/founder/demo-generator' },
  { label: 'Observability', href: '/founder/observability' },
  { label: 'Certification', href: '/founder/certification' },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.soon || !item.href) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function getPageTitle(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.href && isItemActive(item, pathname)) return item.label;
    }
  }
  for (const item of ENGINEERING) {
    if (item.href && isItemActive(item, pathname)) return item.label;
  }
  return 'Founder Console';
}

// Sub-component so the same nav tree can be rendered for desktop and mobile
// without React key collision (each is in its own subtree).
function SidebarContent({
  pathname,
  email,
  role,
  onClose,
}: {
  pathname: string;
  email: string;
  role: FounderRole;
  onClose: () => void;
}) {
  const readOnly = role === 'SUPPORT_ADMIN';

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="shrink-0 border-b border-white/8 px-5 py-4">
        <Link href="/founder" className="flex items-center gap-3" onClick={onClose}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#2557dc] text-[15px] font-black text-white select-none">
            A
          </span>
          <div className="min-w-0">
            <span className="block text-[15px] font-black leading-snug text-white">ApprovLine</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/70">
              Founder Console
            </span>
          </div>
        </Link>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-500/10 px-3 py-1.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-orange-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
            Founder Mode
          </span>
        </div>
      </div>

      {/* Scrollable nav */}
      <nav
        aria-label="Founder navigation"
        className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-color:rgba(148,163,184,0.15)_transparent] [scrollbar-width:thin]"
      >
        {NAV.map((group) => (
          <div key={group.id} className="mt-4 first:mt-0">
            <p className="mb-0.5 px-2 text-[9.5px] font-black uppercase tracking-[0.22em] text-slate-600">
              {group.label}
            </p>
            {group.items.map((item, idx) => {
              const active = isItemActive(item, pathname);
              if (item.soon) {
                return (
                  <span
                    key={`${group.id}-${idx}`}
                    className="flex cursor-default select-none items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700"
                    title="Coming soon"
                  >
                    {item.label}
                    <span className="rounded border border-slate-700/50 px-1 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-slate-600">
                      soon
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={`${group.id}-${idx}`}
                  href={item.href!}
                  onClick={onClose}
                  className={`flex items-center rounded-lg px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] ${
                    active
                      ? 'bg-[#2557dc]/18 font-semibold text-white'
                      : 'font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Engineering — internal tooling retained at the bottom */}
        <div className="mt-5 border-t border-white/8 pt-3">
          <p className="mb-0.5 px-2 text-[9.5px] font-black uppercase tracking-[0.22em] text-slate-600">
            Engineering
          </p>
          {ENGINEERING.map((item) => {
            const active = isItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href!}
                onClick={onClose}
                className={`flex items-center rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] ${
                  active
                    ? 'bg-[#2557dc]/18 font-semibold text-slate-200'
                    : 'font-medium text-slate-600 hover:bg-white/5 hover:text-slate-400'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Identity footer */}
      <div className="shrink-0 border-t border-white/8 px-4 py-3">
        {readOnly && (
          <div className="mb-2 rounded border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-center text-[9.5px] font-black uppercase tracking-wide text-amber-400">
            Read only
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-700 text-[11px] font-black text-white select-none">
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-300">{email}</p>
            <p className="text-[10px] font-bold text-slate-500">{role.replace(/_/g, ' ')}</p>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </div>
  );
}

export function FounderNavClient({
  email,
  role,
  children,
}: {
  email: string;
  role: FounderRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const readOnly = role === 'SUPPORT_ADMIN';
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="min-h-screen bg-[#f0f2f7] text-slate-950">
      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-hidden="true"
          onClick={closeDrawer}
          onKeyDown={undefined}
          role="presentation"
        />
      )}

      {/* Desktop sidebar — always visible on lg+ */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] bg-[#0c1424] shadow-xl lg:block">
        <SidebarContent
          pathname={pathname}
          email={email}
          role={role}
          onClose={closeDrawer}
        />
      </aside>

      {/* Mobile drawer — slides in from left */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-[#0c1424] shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Founder navigation"
      >
        <button
          type="button"
          onClick={closeDrawer}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc]"
          aria-label="Close navigation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <SidebarContent
          pathname={pathname}
          email={email}
          role={role}
          onClose={closeDrawer}
        />
      </aside>

      {/* Main content */}
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        {/* Sticky header */}
        <header className="sticky top-0 z-20 flex min-h-[58px] items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-sm lg:px-7">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] lg:hidden"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="founder-mobile-nav"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2.5 5H15.5M2.5 9H15.5M2.5 13H15.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Breadcrumb / page context */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-orange-600 lg:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" aria-hidden="true" />
              Founder Console
            </span>
            <span className="hidden text-slate-300 lg:block" aria-hidden="true">/</span>
            <span className="truncate text-sm font-bold text-slate-700">{pageTitle}</span>
          </div>

          {/* Search — routes to existing /founder/customers?q= */}
          <form method="get" action="/founder/customers" role="search" aria-label="Search customers" className="hidden sm:block">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                name="q"
                type="search"
                placeholder="Search customers…"
                autoComplete="off"
                className="h-8 w-44 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[13px] text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-[#2557dc] focus:bg-white focus:ring-2 focus:ring-blue-100 lg:w-52"
              />
            </div>
          </form>

          {/* Right controls */}
          <div className="flex shrink-0 items-center gap-2">
            {readOnly && (
              <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700 sm:inline-block">
                Read only
              </span>
            )}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
