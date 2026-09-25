'use client';

import { useState, useMemo, useCallback } from 'react';
import { RequestIntegrationModal } from '@/components/integrations/RequestIntegrationModal';
import { FormSubmitButton } from '@/components/system/FormSubmitButton';
import { ConfirmSubmitButton } from '@/components/system/ConfirmSubmitButton';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShellProvider = {
  slug: string;
  displayName: string;
  category: string;
  description: string;
  websiteUrl: string | null;
  /** AVAILABLE | BETA | COMING_SOON */
  status: string;
  isNative: boolean;
  /** webhook / api / csv / email_capture slugs */
  isGeneric: boolean;
  requestCount: number;
  /** OAuth install href for native connectors */
  connectHref?: string;
  /** Whether this tenant has an active Integration row */
  isConnected: boolean;
  integrationId?: string;
  /** CONNECTED | SYNCING | ERROR | NEEDS_REAUTH */
  integrationStatus?: string;
  lastSyncAt?: string | null;
  /** POST href for sync actions */
  syncHref?: string;
  /** POST href for disconnect */
  disconnectHref?: string;
};

export type ShellRequest = {
  id: string;
  providerName: string;
  category: string | null;
  priority: string;
  status: string;
  createdAt: string;
};

type Props = {
  providers: ShellProvider[];
  myRequests: ShellRequest[];
};

// ── Provider metadata ─────────────────────────────────────────────────────────

const SLUG_COLORS: Record<string, string> = {
  slack: '#611f69',
  gmail: '#EA4335',
  outlook: '#0078D4',
  microsoft_teams: '#5B5EA6',
  zoom: '#2D8CFF',
  jira: '#0052CC',
  servicenow: '#62BA97',
  github: '#24292F',
  gitlab: '#FC6D26',
  salesforce: '#00A1E0',
  hubspot: '#FF7A59',
  sap: '#0070F2',
  oracle: '#C74634',
  workday: '#F56200',
  coupa: '#1EC16B',
  ironclad: '#5C1B72',
  docusign: '#1C3557',
  asana: '#F06A6A',
  monday: '#FF3D57',
  notion: '#191919',
  confluence: '#0052CC',
  azure_devops: '#0078D4',
  google_chat: '#00AC47',
  whatsapp: '#25D366',
  webhook: '#7C3AED',
  api: '#0EA5E9',
  csv: '#10B981',
  email_capture: '#F59E0B',
};

function providerColor(slug: string): string {
  return SLUG_COLORS[slug] ?? '#6366F1';
}

function providerInitials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function statusLabel(s: string): string {
  return s.toLowerCase().replace(/_/g, ' ');
}

function requestStatusColor(s: string): string {
  switch (s) {
    case 'PENDING': return 'bg-al-warning/10 text-al-warning border-al-warning/30';
    case 'UNDER_REVIEW': return 'bg-al-info/10 text-al-info border-al-info/30';
    case 'PLANNED': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'IN_DEVELOPMENT': return 'bg-al-accent/10 text-al-accent border-al-accent/30';
    case 'AVAILABLE': return 'bg-al-success/10 text-al-success border-al-success/30';
    case 'REJECTED': return 'bg-al-danger/10 text-al-danger border-al-danger/30';
    default: return 'bg-al-surface-sunken text-al-text-secondary border-al-border';
  }
}

function integrationHealthLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'CONNECTED': return { label: 'Healthy', cls: 'text-al-success' };
    case 'SYNCING': return { label: 'Syncing', cls: 'text-blue-600' };
    case 'ERROR': return { label: 'Error', cls: 'text-rose-600' };
    case 'NEEDS_REAUTH': return { label: 'Needs reconnect', cls: 'text-al-warning' };
    default: return { label: 'Not connected', cls: 'text-al-text-muted' };
  }
}

function connectionStatusBadge(status: string): string {
  switch (status) {
    case 'CONNECTED': return 'bg-al-success/10 text-al-success border-al-success/30';
    case 'SYNCING': return 'bg-al-info/10 text-al-info border-al-info/30';
    case 'ERROR': return 'bg-al-danger/10 text-al-danger border-al-danger/30';
    case 'NEEDS_REAUTH': return 'bg-al-warning/10 text-al-warning border-al-warning/30';
    default: return 'bg-al-surface-sunken text-al-text-secondary border-al-border';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProviderIcon({ slug, name, size = 'md' }: { slug: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const bg = providerColor(slug);
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm';
  return (
    <div
      className={`${sizeClass} grid shrink-0 place-items-center rounded-xl font-black text-white`}
      style={{ backgroundColor: bg }}
    >
      {providerInitials(name)}
    </div>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-al-text-muted pointer-events-none"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search integrations (e.g. Slack, Gmail, Jira…)"
        className="w-full rounded-xl border border-al-border bg-al-surface py-3 pl-10 pr-4 text-sm font-semibold text-al-text shadow-sm outline-none placeholder:text-al-text-muted focus:border-al-accent focus:ring-4 focus:ring-al-info/20"
        aria-label="Search integrations"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded-full text-al-text-muted hover:bg-al-surface-elevated hover:text-al-text-secondary"
          aria-label="Clear search"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string;
  onSelect: (c: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 7;
  const allCategories = ['All', ...categories];
  const visible = showAll ? allCategories : allCategories.slice(0, VISIBLE);
  const hasMore = allCategories.length > VISIBLE;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-black transition ${
            active === cat
              ? 'border-al-accent bg-al-accent text-white'
              : 'border-al-border bg-al-surface text-al-text-secondary hover:border-al-border-strong hover:bg-al-surface-sunken'
          }`}
        >
          {cat}
        </button>
      ))}
      {hasMore && (
        <button
          onClick={() => setShowAll((p) => !p)}
          className="rounded-full border border-al-border bg-al-surface px-3.5 py-1.5 text-xs font-black text-al-text-muted hover:bg-al-surface-sunken transition"
        >
          {showAll ? 'Show less' : `More (${allCategories.length - VISIBLE})`}
        </button>
      )}
    </div>
  );
}

function ConnectedCard({ p }: { p: ShellProvider }) {
  const health = integrationHealthLabel(p.integrationStatus ?? 'CONNECTED');
  const isNeedsReauth = p.integrationStatus === 'NEEDS_REAUTH' || p.integrationStatus === 'ERROR';

  return (
    <div className="group flex flex-col gap-4 rounded-2xl border border-al-border bg-al-surface p-5 shadow-sm transition hover:border-al-border-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon slug={p.slug} name={p.displayName} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="block text-sm font-black tracking-tight text-al-text">{p.displayName}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${connectionStatusBadge(p.integrationStatus ?? 'CONNECTED')}`}>
                {p.integrationStatus === 'SYNCING' ? 'Syncing' : p.integrationStatus === 'ERROR' ? 'Error' : p.integrationStatus === 'NEEDS_REAUTH' ? 'Needs reconnect' : 'Connected'}
              </span>
            </div>
            <span className="block text-xs text-al-text-muted mt-0.5">{p.category}</span>
          </div>
        </div>
        {p.connectHref && (
          <a
            href={p.connectHref}
            className="shrink-0 grid h-8 w-8 place-items-center rounded-lg border border-al-border text-al-text-muted hover:bg-al-surface-sunken hover:text-al-text-secondary transition"
            title="Manage connection"
            aria-label={`Manage ${p.displayName} connection`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </a>
        )}
      </div>

      <p className="text-xs font-semibold leading-5 text-al-text-muted line-clamp-2">{p.description}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-al-text-muted">Health</span>
          <p className={`font-black ${health.cls}`}>{health.label}</p>
        </div>
        <div>
          <span className="text-al-text-muted">Last sync</span>
          <p className="font-black text-al-text-secondary">{relativeTime(p.lastSyncAt)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-al-border">
        {isNeedsReauth && p.connectHref && (
          <a
            href={p.connectHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-al-accent px-3 py-1.5 text-xs font-black text-white transition hover:bg-al-accent-hover"
          >
            Reconnect
          </a>
        )}
        {!isNeedsReauth && p.syncHref && p.integrationId && (
          <form action={p.syncHref} method="post">
            <input type="hidden" name="integrationId" value={p.integrationId} />
            <FormSubmitButton
              pendingText="Syncing…"
              className="min-h-0 h-7 rounded-lg border border-al-border bg-al-surface px-3 text-xs font-black text-al-text-secondary shadow-sm hover:bg-al-surface-sunken"
            >
              Sync now
            </FormSubmitButton>
          </form>
        )}
        {p.disconnectHref && (
          <form action={p.disconnectHref} method="post">
            <ConfirmSubmitButton
              pendingText="Disconnecting…"
              confirmMessage={`Disconnect ${p.displayName}? ApprovLine will stop ingesting new evidence. Existing evidence is preserved.`}
              className="min-h-0 h-7 rounded-lg border border-al-danger/30 bg-al-surface px-3 text-xs font-black text-al-danger shadow-sm hover:bg-al-danger/10"
            >
              Disconnect
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function AvailableCard({ p, onRequest }: { p: ShellProvider; onRequest: (name: string, slug?: string) => void }) {
  const isBeta = p.status === 'BETA';
  const isComingSoon = p.status === 'COMING_SOON';

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-al-border bg-al-surface p-4 shadow-sm transition hover:border-al-border-strong hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon slug={p.slug} name={p.displayName} size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-black text-al-text">{p.displayName}</span>
              {isBeta && (
                <span className="rounded-full border border-al-accent/30 bg-al-accent/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-al-accent">
                  Beta
                </span>
              )}
              {isComingSoon && (
                <span className="rounded-full border border-al-border bg-al-surface-sunken px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-al-text-muted">
                  Soon
                </span>
              )}
              {!isBeta && !isComingSoon && (
                <span className="rounded-full border border-al-info/30 bg-al-info/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-600">
                  Available
                </span>
              )}
            </div>
            <span className="block text-[11px] text-al-text-muted mt-0.5">{p.category}</span>
          </div>
        </div>
      </div>

      <p className="text-xs font-semibold leading-5 text-al-text-muted line-clamp-2 flex-1">{p.description}</p>

      <div className="pt-1">
        {p.isNative && p.connectHref && !isComingSoon ? (
          <a
            href={p.connectHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-al-accent px-3 py-1.5 text-xs font-black text-al-accent transition hover:bg-al-accent hover:text-white"
          >
            Connect
          </a>
        ) : isComingSoon ? (
          <button
            onClick={() => onRequest(p.displayName, p.slug)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-al-border bg-al-surface px-3 py-1.5 text-xs font-black text-al-text-secondary transition hover:bg-al-surface-sunken"
          >
            Request
          </button>
        ) : (
          <button
            onClick={() => onRequest(p.displayName, p.slug)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-al-accent/30 bg-al-accent/10 px-3 py-1.5 text-xs font-black text-al-accent transition hover:bg-violet-100"
          >
            Request early access
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, viewAllHref }: { title: string; count: number; viewAllHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-black tracking-tight text-al-text">{title}</h3>
        <span className="rounded-full bg-al-surface-elevated px-2 py-0.5 text-xs font-black text-al-text-secondary">{count}</span>
      </div>
      {viewAllHref && (
        <a href={viewAllHref} className="text-xs font-black text-al-accent hover:underline">
          View all
        </a>
      )}
    </div>
  );
}

function EmptySearchState({ query, onRequest }: { query: string; onRequest: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-al-border bg-al-surface-sunken p-8 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-al-surface-elevated text-al-text-muted">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
        </svg>
      </div>
      <p className="text-sm font-black text-al-text-secondary">No exact integration found for &ldquo;{query}&rdquo;</p>
      <p className="mt-1 text-xs font-semibold text-al-text-muted">Can&apos;t find your tool? Request it and we&apos;ll prioritize by demand.</p>
      <button
        onClick={onRequest}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-al-accent px-5 py-2.5 text-sm font-black text-white transition hover:bg-al-accent-hover"
      >
        Request an Integration
      </button>
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────────────────────

export function IntegrationsClientShell({ providers, myRequests }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProviderName, setModalProviderName] = useState('');
  const [modalProviderSlug, setModalProviderSlug] = useState<string | undefined>();
  const [showAllComingSoon, setShowAllComingSoon] = useState(false);

  const openModal = useCallback((name: string, slug?: string) => {
    setModalProviderName(name);
    setModalProviderSlug(slug);
    setModalOpen(true);
  }, []);

  // Derive categories from non-generic providers
  const categories = useMemo(() => {
    const cats = new Set(providers.filter((p) => !p.isGeneric).map((p) => p.category));
    return Array.from(cats).sort();
  }, [providers]);

  // Filter providers
  const filteredProviders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return providers.filter((p) => {
      if (p.isGeneric) return false;
      if (activeCategory !== 'All' && p.category !== activeCategory) return false;
      if (q) {
        return (
          p.displayName.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [providers, searchQuery, activeCategory]);

  const connected = filteredProviders.filter((p) => p.isConnected);
  const available = filteredProviders.filter((p) => !p.isConnected && p.status === 'AVAILABLE');
  const beta = filteredProviders.filter((p) => !p.isConnected && p.status === 'BETA');
  const comingSoon = filteredProviders.filter((p) => p.status === 'COMING_SOON');

  const COMING_SOON_VISIBLE = 6;
  const visibleComingSoon = showAllComingSoon ? comingSoon : comingSoon.slice(0, COMING_SOON_VISIBLE);

  const isSearching = searchQuery.trim().length > 0;
  const noResults = isSearching && filteredProviders.length === 0;

  // Pending requests (show if not already in connected/available)
  const pendingRequests = myRequests.filter((r) =>
    ['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT'].includes(r.status)
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Search */}
      <SearchBar value={searchQuery} onChange={setSearchQuery} />

      {/* Category tabs */}
      <CategoryTabs categories={categories} active={activeCategory} onSelect={setActiveCategory} />

      {/* Empty search state */}
      {noResults && (
        <EmptySearchState query={searchQuery} onRequest={() => openModal(searchQuery)} />
      )}

      {/* Connected Integrations */}
      {connected.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Connected Integrations" count={connected.length} />
          <div className="grid gap-4 sm:grid-cols-2">
            {connected.map((p) => (
              <ConnectedCard key={p.slug} p={p} />
            ))}
          </div>
        </section>
      )}

      {/* Available Integrations */}
      {available.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Available Integrations" count={available.length} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {available.map((p) => (
              <AvailableCard key={p.slug} p={p} onRequest={openModal} />
            ))}
          </div>
        </section>
      )}

      {/* Beta Integrations */}
      {beta.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Beta Integrations" count={beta.length} />
          <p className="text-xs font-semibold text-al-text-muted -mt-2">
            Early access — contact us to enable for your account.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {beta.map((p) => (
              <AvailableCard key={p.slug} p={p} onRequest={openModal} />
            ))}
          </div>
        </section>
      )}

      {/* Coming Soon */}
      {comingSoon.length > 0 && !isSearching && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Coming Soon" count={comingSoon.length} />
          <p className="text-xs font-semibold text-al-text-muted -mt-2">
            On our roadmap — request the ones you need to help us prioritize.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleComingSoon.map((p) => (
              <AvailableCard key={p.slug} p={p} onRequest={openModal} />
            ))}
          </div>
          {comingSoon.length > COMING_SOON_VISIBLE && (
            <button
              onClick={() => setShowAllComingSoon((s) => !s)}
              className="mx-auto flex items-center gap-2 rounded-xl border border-al-border bg-al-surface px-6 py-2.5 text-sm font-black text-al-text-secondary shadow-sm transition hover:bg-al-surface-sunken"
            >
              {showAllComingSoon ? 'Show fewer' : `Load ${comingSoon.length - COMING_SOON_VISIBLE} more integrations`}
              <svg
                className={`h-4 w-4 transition ${showAllComingSoon ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
              </svg>
            </button>
          )}
        </section>
      )}

      {/* My Requested Integrations */}
      {pendingRequests.length > 0 && !isSearching && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="My Requested Integrations" count={pendingRequests.length} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-xl border border-al-border bg-al-surface p-4 shadow-sm">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-al-surface-elevated text-sm font-black text-al-text-muted">
                  {providerInitials(r.providerName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-al-text truncate">{r.providerName}</p>
                  {r.category && <p className="text-xs text-al-text-muted">{r.category}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${requestStatusColor(r.status)}`}>
                      {statusLabel(r.status)}
                    </span>
                    <span className="text-[10px] text-al-text-muted">
                      Requested {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Don't see your tool CTA */}
      {!isSearching && (
        <div className="rounded-2xl border border-dashed border-al-border-strong bg-al-surface-sunken p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-al-text">Don&apos;t see your tool?</h3>
              <p className="mt-1 max-w-lg text-sm font-semibold text-al-text-muted">
                Request any integration — enterprise ERP, niche ITSM, custom system. We prioritize by customer demand.
              </p>
            </div>
            <button
              onClick={() => openModal('')}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-al-accent px-5 py-2.5 text-sm font-black text-white transition hover:bg-al-accent-hover"
            >
              Request an Integration
            </button>
          </div>
        </div>
      )}

      <RequestIntegrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultProviderName={modalProviderName}
        defaultProviderSlug={modalProviderSlug}
      />
    </div>
  );
}
