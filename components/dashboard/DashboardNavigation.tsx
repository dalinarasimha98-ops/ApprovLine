'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  Cable,
  CheckSquare,
  FileCheck2,
  FileSearch,
  GitBranch,
  LayoutDashboard,
  Network,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { findRoutePermission, hasAnyRole, type Role } from '@/lib/rbac';
import { markNavigationPending, markNavigationSettled } from '@/lib/navigation-pending';

// Mirrors PendingLink's stuck-transition fallback (components/system/PendingLink.tsx) -
// this nav renders its own Link/pending-state pair instead of reusing PendingLink (it
// needs one shared "currently navigating" href across every item, for the progress bar
// and active-item highlighting), so without this it never inherited that fix. A
// concurrent router.refresh() - e.g. AutoRetryOnDegraded polling while a page it's
// rendered on is in its degraded state - can interrupt an in-flight click the same way
// it did for PendingLink before that fix, leaving a sidebar click looking like it does
// nothing forever. Falls back to a real browser navigation, which can't be interrupted
// the way a client-side transition can.
const STUCK_TRANSITION_TIMEOUT_MS = 10_000;

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

type NavSection = {
  title: string;
  items: NavigationItem[];
};

const sections: NavSection[] = [
  {
    title: 'Core Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/pending-actions', label: 'Action Center', icon: CheckSquare },
      { href: '/dashboard/approvals', label: 'Approvals', icon: FileCheck2 },
      { href: '/evidence', label: 'Unified Evidence', icon: Boxes, badge: 'New' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/copilot', label: 'AI Copilot', icon: Bot },
      { href: '/playbooks', label: 'Playbook AI', icon: BrainCircuit },
      { href: '/memory', label: 'Memory Graph', icon: Network },
      { href: '/analytics', label: 'Executive Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Governance & Risk',
    items: [
      { href: '/trust/compliance', label: 'Compliance Hub', icon: ShieldCheck },
      { href: '/dashboard/alerts', label: 'Alerts & Risks', icon: ShieldAlert },
      { href: '/dashboard/audit', label: 'Reports & Exports', icon: ScrollText },
      { href: '/dashboard/audit-log', label: 'Audit Logs', icon: Activity },
      { href: '/investigations', label: 'Investigation Center', icon: FileSearch },
    ],
  },
  {
    title: 'Integrations & Platform',
    items: [
      { href: '/dashboard/gateway', label: 'Universal Gateway', icon: GitBranch },
      { href: '/dashboard/settings/integrations', label: 'Integrations', icon: Cable },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/settings/users', label: 'Users & Teams', icon: Users },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      { href: '/settings/profile', label: 'User Settings', icon: UserCog },
    ],
  },
];

export function DashboardNavigation({ mobile = false, role = null }: { mobile?: boolean; role?: Role | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const currentRoute = pendingHref ?? pathname;

  // Purely cosmetic: hides links the current role can't reach so the nav
  // doesn't advertise pages that will just redirect away. The actual
  // security boundary is enforcePageRole() on each destination page and the
  // matching role check on its API routes - not this filter. A null role
  // (tenant lookup unavailable) shows every item rather than blocking
  // rendering, matching this component's existing fail-open rendering style.
  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        items: !role
          ? section.items
          : section.items.filter(({ href }) => {
              const allowedRoles = findRoutePermission(href);
              return !allowedRoles || hasAnyRole(role, allowedRoles);
            }),
      }))
      .filter((section) => section.items.length > 0);
  }, [role]);

  // Flat list of all visible items — used for active-state detection, prefetching, and mobile nav.
  const visibleItems = useMemo(() => visibleSections.flatMap((s) => s.items), [visibleSections]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    markNavigationPending();
    const stuckHref = pendingHref;
    const timeout = setTimeout(() => {
      setPendingHref(null);
      window.location.href = stuckHref;
    }, STUCK_TRANSITION_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      markNavigationSettled();
    };
  }, [pendingHref]);

  useEffect(() => {
    const warmRoutes = () => {
      visibleItems.forEach(({ href }) => router.prefetch(href));
    };
    const canUseIdleCallback =
      typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function';
    const routeWarmupHandle = canUseIdleCallback
      ? window.requestIdleCallback(warmRoutes, { timeout: 1600 })
      : window.setTimeout(warmRoutes, 500);

    return () => {
      if (canUseIdleCallback) {
        window.cancelIdleCallback(routeWarmupHandle);
        return;
      }
      window.clearTimeout(routeWarmupHandle);
    };
  }, [router, visibleItems]);

  const activeHref = useMemo(() => {
    if (pendingHref) return pendingHref;

    return visibleItems
        .filter(({ href }) => {
          const route = href.split('?')[0];
          const current = currentRoute.split('?')[0];
          if (route === '/dashboard') return current === route;
          if (route === '/dashboard/settings') return current === route;
          return current === route || current.startsWith(`${route}/`);
        })
        .sort((a, b) => b.href.split('?')[0].length - a.href.split('?')[0].length)[0]?.href;
  }, [currentRoute, pendingHref, visibleItems]);

  const beginNavigation = (href: string) => {
    const target = href.split('?')[0];
    if (target !== pathname) setPendingHref(href);
  };

  if (mobile) {
    return (
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {visibleItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            prefetch
            onMouseEnter={() => router.prefetch(href)}
            onPointerDown={() => beginNavigation(href)}
            onClick={() => beginNavigation(href)}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
              activeHref === href
                ? 'border-al-accent/50 bg-al-accent/15 text-al-accent'
                : 'border-al-border bg-al-surface-elevated text-al-text-secondary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {pendingHref === href ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-al-accent" /> : null}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:rgb(var(--al-text-muted-rgb)/.65)_transparent] [scrollbar-width:thin]">
      {pendingHref ? (
        <div className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden bg-al-accent/20">
          <span className="block h-full w-1/3 animate-[route-progress_1s_ease-in-out_infinite] rounded-r-full bg-al-accent shadow-[0_0_18px_rgb(var(--al-accent-rgb)/.75)]" />
        </div>
      ) : null}
      <div className="grid gap-0">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 ? 'mt-4' : ''}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-al-text-muted">
              {section.title}
            </p>
            <div className="grid gap-0.5">
              {section.items.map(({ href, label, icon: Icon, badge }) => {
                const active = activeHref === href;
                const pending = pendingHref === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch
                    onMouseEnter={() => router.prefetch(href)}
                    onPointerDown={() => beginNavigation(href)}
                    onClick={() => beginNavigation(href)}
                    className={`group flex min-h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition ${
                      active
                        ? 'bg-al-accent text-al-accent-text shadow-[0_8px_24px_rgb(var(--al-accent-rgb)/.22)]'
                        : 'text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-al-accent-text' : 'text-al-text-muted group-hover:text-al-text-secondary'}`} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badge ? (
                      <span className="rounded bg-al-accent/25 px-1.5 py-0.5 text-[9px] font-bold uppercase text-al-accent">
                        {badge}
                      </span>
                    ) : null}
                    {pending ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-al-accent-text" aria-label="Opening" /> : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

/**
 * Renders whatever real state DashboardShell resolved via
 * lib/capture-status.ts's getCaptureStatus() - never an unconditional
 * "Live Capture," since no connector has been certified against a real
 * provider account (see docs/qa/PRODUCTION_CERTIFICATION_EVIDENCE.md). Only
 * the "live" state pulses; every other state is a steady dot, so the
 * animation itself never implies activity that didn't happen.
 */
export function LiveCaptureBadge({ status }: { status: { state: 'live' | 'connected-stale' | 'connected-none' | 'none'; label: string } }) {
  const tone =
    status.state === 'live'
      ? 'border-al-success/20 bg-al-success/[0.07] text-al-success'
      : status.state === 'connected-stale' || status.state === 'connected-none'
        ? 'border-al-warning/20 bg-al-warning/[0.07] text-al-warning'
        : 'border-al-border bg-al-surface-elevated text-al-text-muted';
  const dotColor =
    status.state === 'live' ? 'bg-al-success' : status.state === 'none' ? 'bg-al-text-muted' : 'bg-al-warning';

  return (
    <div className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-semibold ${tone}`}>
      <span className="relative flex h-2 w-2">
        {status.state === 'live' ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotColor} opacity-50`} />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      {status.label}
    </div>
  );
}

export function SystemPulse() {
  return <Activity className="h-4 w-4 text-al-success" aria-hidden="true" />;
}
