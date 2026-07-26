'use client';

import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  File,
  FileText,
  Filter,
  Fingerprint,
  History,
  Link2,
  Loader2,
  LockKeyhole,
  MoreHorizontal,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type JsonValue = unknown;

type EvidenceMembership = {
  id: string;
  status: string;
  matchConfidence: number;
  matchingReasons: string[];
  reviewedAt?: string | null;
};

type EvidenceEvent = {
  id: string;
  providerKey: string;
  providerEventType: string;
  occurredAt: string;
  receivedAt: string;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  objectType: string;
  objectId?: string | null;
  threadId?: string | null;
  parentId?: string | null;
  relatedIds: string[];
  participants?: JsonValue;
  attachments?: JsonValue;
  links?: JsonValue;
  content?: string | null;
  metadata?: JsonValue;
  evidenceHash: string;
  correlationId: string;
  correlationKeys: string[];
  confidence: number;
  status: string;
  lastProcessedAt?: string | null;
  membership?: EvidenceMembership | null;
};

type ProviderConnection = {
  providerKey: string;
  displayName: string;
  status: string;
  lastSyncAt?: string | null;
  health?: {
    status: string;
    latencyMs?: number | null;
    syncStatus?: string | null;
    lastEventAt?: string | null;
    lastSuccessfulSyncAt?: string | null;
    consecutiveFailures: number;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    checkedAt: string;
  } | null;
};

type EvidenceProvider = {
  providerKey: string;
  eventCount: number;
  latestEventAt?: string | null;
  connection?: ProviderConnection | null;
};

type PrimaryApproval = {
  id: string;
  title?: string | null;
  approvalType?: string | null;
  approvalTimestamp?: string | null;
  sourcePlatform?: string | null;
  businessImpact?: string | null;
  status?: string | null;
};

export type UnifiedEvidenceData = {
  id: string;
  subject: string;
  decision?: string | null;
  outcome?: string | null;
  category?: string | null;
  department?: string | null;
  approverName?: string | null;
  approverEmail?: string | null;
  amount?: string | null;
  currency?: string | null;
  riskLevel?: string | null;
  confidence: number;
  verificationStatus: string;
  sourceCount: number;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata?: JsonValue;
  createdAt: string;
  updatedAt: string;
  primaryApproval?: PrimaryApproval | null;
  events: EvidenceEvent[];
  members: EvidenceMembershipWithEvent[];
  eventPage: { hasMore: boolean; cursor?: string | null; limit: number };
  liveCursor?: string | null;
  providers: EvidenceProvider[];
};

type EvidenceMembershipWithEvent = EvidenceMembership & {
  eventId: string;
};

type TimelineTab =
  | 'timeline'
  | 'analysis'
  | 'details'
  | 'participants'
  | 'supporting'
  | 'related'
  | 'audit';

type AttachmentItem = {
  id: string;
  name: string;
  url?: string | null;
  type?: string | null;
  size?: string | null;
  providerKey: string;
  evidenceHash: string;
  eventId: string;
};

type RelatedItem = {
  id: string;
  label: string;
  type: string;
  providerKey: string;
  eventId: string;
};

const providerStyles: Record<string, { label: string; glyph: string; color: string }> = {
  gmail: { label: 'Gmail', glyph: 'M', color: '#ef4444' },
  email: { label: 'Email', glyph: '@', color: '#3b82f6' },
  outlook: { label: 'Outlook', glyph: 'O', color: '#0ea5e9' },
  slack: { label: 'Slack', glyph: 'S', color: '#d946ef' },
  teams: { label: 'Teams', glyph: 'T', color: '#8b5cf6' },
  microsoft_teams: { label: 'Teams', glyph: 'T', color: '#8b5cf6' },
  google_chat: { label: 'Google Chat', glyph: 'G', color: '#22c55e' },
  jira: { label: 'Jira', glyph: 'J', color: '#2563eb' },
  github: { label: 'GitHub', glyph: 'GH', color: '#e2e8f0' },
  gitlab: { label: 'GitLab', glyph: 'GL', color: '#f97316' },
  azure_devops: { label: 'Azure DevOps', glyph: 'AZ', color: '#38bdf8' },
  jenkins: { label: 'Jenkins', glyph: 'JK', color: '#f59e0b' },
  servicenow: { label: 'ServiceNow', glyph: 'SN', color: '#10b981' },
  salesforce: { label: 'Salesforce', glyph: 'SF', color: '#0ea5e9' },
  ironclad: { label: 'Ironclad', glyph: 'IC', color: '#10b981' },
  asana: { label: 'Asana', glyph: 'A', color: '#fb7185' },
  monday: { label: 'Monday.com', glyph: 'M', color: '#facc15' },
  monday_com: { label: 'Monday.com', glyph: 'M', color: '#facc15' },
  zoom: { label: 'Zoom', glyph: 'Z', color: '#3b82f6' },
  manual: { label: 'Manual approval', glyph: 'MA', color: '#f59e0b' },
  verbal: { label: 'Verbal approval', glyph: 'VA', color: '#f59e0b' },
  universal_gateway: { label: 'Universal Gateway', glyph: 'UG', color: '#14b8a6' },
};

const tabs: Array<{ id: TimelineTab; label: string; icon: typeof Activity }> = [
  { id: 'timeline', label: 'Timeline', icon: Activity },
  { id: 'analysis', label: 'AI Analysis', icon: Sparkles },
  { id: 'details', label: 'Decision Details', icon: ClipboardCheck },
  { id: 'participants', label: 'Participants', icon: UserRound },
  { id: 'supporting', label: 'Supporting Evidence', icon: FileText },
  { id: 'related', label: 'Linked Records', icon: Link2 },
  { id: 'audit', label: 'Audit Trail', icon: History },
];

function titleCase(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerInfo(value: string) {
  const key = value.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  return providerStyles[key] ?? {
    label: titleCase(value),
    glyph: value.slice(0, 2).toUpperCase(),
    color: '#60a5fa',
  };
}

function dateTime(value?: string | null) {
  if (!value) return 'Not captured';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function dateOnly(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

function amountText(amount?: string | null, currency?: string | null) {
  if (!amount) return 'Not captured';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(numeric);
}

function arrayValue(value: JsonValue): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (
      parsed.username ||
      parsed.password ||
      parsed.hostname === 'localhost' ||
      parsed.hostname.endsWith('.example') ||
      ['example.com', 'example.org', 'example.net'].includes(parsed.hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function eventSourceUrl(event: EvidenceEvent) {
  for (const item of arrayValue(event.links)) {
    if (typeof item === 'string') {
      const url = safeUrl(item);
      if (url) return url;
    }
    const itemRecord = recordValue(item);
    const url = safeUrl(itemRecord.url ?? itemRecord.href ?? itemRecord.webUrl);
    if (url) return url;
  }
  return null;
}

function eventMembership(event: EvidenceEvent, members: EvidenceMembershipWithEvent[]) {
  return event.membership ?? members.find((member) => member.eventId === event.id) ?? null;
}

function attachmentItems(events: EvidenceEvent[]): AttachmentItem[] {
  const seen = new Set<string>();
  const result: AttachmentItem[] = [];
  for (const event of events) {
    for (const [index, item] of arrayValue(event.attachments).entries()) {
      const itemRecord = recordValue(item);
      const name =
        String(itemRecord.name ?? itemRecord.filename ?? itemRecord.title ?? '').trim() ||
        `Evidence attachment ${index + 1}`;
      const url = safeUrl(itemRecord.url ?? itemRecord.href ?? itemRecord.downloadUrl);
      const id = String(itemRecord.id ?? `${event.id}:${index}`);
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({
        id,
        name,
        url,
        type: typeof itemRecord.type === 'string' ? itemRecord.type : null,
        size: typeof itemRecord.size === 'string' ? itemRecord.size : null,
        providerKey: event.providerKey,
        evidenceHash: event.evidenceHash,
        eventId: event.id,
      });
    }
  }
  return result;
}

function relatedItems(events: EvidenceEvent[]): RelatedItem[] {
  const seen = new Set<string>();
  const result: RelatedItem[] = [];
  for (const event of events) {
    const values = [
      ...(event.objectId ? [event.objectId] : []),
      ...(event.threadId ? [event.threadId] : []),
      ...event.relatedIds,
    ];
    for (const value of values) {
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push({
        id: value,
        label: value,
        type: event.objectType || 'Related record',
        providerKey: event.providerKey,
        eventId: event.id,
      });
    }
  }
  return result;
}

function eventStatus(event: EvidenceEvent, membership: EvidenceMembership | null) {
  return titleCase(membership?.status ?? event.status);
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (
    normalized.includes('verified') ||
    normalized.includes('approved') ||
    normalized.includes('confirmed') ||
    normalized.includes('processed')
  ) {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  }
  if (
    normalized.includes('suggest') ||
    normalized.includes('pending') ||
    normalized.includes('verbal')
  ) {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  }
  if (normalized.includes('reject') || normalized.includes('fail') || normalized.includes('dispute')) {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
  }
  return 'border-blue-400/20 bg-blue-400/10 text-blue-300';
}

function ProviderMark({ providerKey, size = 'md' }: { providerKey: string; size?: 'sm' | 'md' | 'lg' }) {
  const info = providerInfo(providerKey);
  const dimensions = size === 'lg' ? 'h-11 w-11 text-xs' : size === 'sm' ? 'h-7 w-7 text-[8px]' : 'h-9 w-9 text-[10px]';
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] font-black shadow-inner ${dimensions}`}
      style={{ color: info.color }}
      title={info.label}
    >
      {info.glyph}
    </span>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[88px] border-l border-white/[0.08] px-4 first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accent ? 'text-emerald-300' : 'text-slate-100'}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
      <div>
        <Archive className="mx-auto h-8 w-8 text-slate-600" />
        <h3 className="mt-4 text-sm font-bold text-slate-200">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">{text}</p>
      </div>
    </div>
  );
}

export function UnifiedEvidenceExperience({ initialData }: { initialData: UnifiedEvidenceData }) {
  const [events, setEvents] = useState(initialData.events);
  const [page, setPage] = useState(initialData.eventPage);
  const [liveCursor, setLiveCursor] = useState(initialData.liveCursor);
  const [activeTab, setActiveTab] = useState<TimelineTab>('timeline');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'none' | 'source' | 'day'>('none');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newEvidenceCount, setNewEvidenceCount] = useState(0);
  const [providerDrawer, setProviderDrawer] = useState<EvidenceProvider | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const memberships = initialData.members;
  const attachments = useMemo(() => attachmentItems(events), [events]);
  const related = useMemo(() => relatedItems(events), [events]);
  const participants = useMemo(() => {
    const map = new Map<string, { name: string; email?: string | null; count: number }>();
    for (const event of events) {
      const key = event.actorEmail ?? event.actorId ?? event.actorName;
      if (!key) continue;
      const current = map.get(key);
      map.set(key, {
        name: event.actorName ?? event.actorEmail ?? 'Unknown participant',
        email: event.actorEmail,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [events]);

  const suggestedCount = initialData.members.filter((member) => member.status === 'SUGGESTED').length;
  const matchingReasons = useMemo(
    () =>
      [...new Set(initialData.members.flatMap((member) => member.matchingReasons))]
        .filter(Boolean)
        .slice(0, 8),
    [initialData.members],
  );

  const filteredEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return events.filter((event) => {
      if (providerFilter !== 'all' && event.providerKey !== providerFilter) return false;
      if (!normalized) return true;
      return [
        event.content,
        event.actorName,
        event.actorEmail,
        event.providerKey,
        event.providerEventType,
        event.objectType,
        event.objectId,
        event.threadId,
        ...event.relatedIds,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [events, providerFilter, query]);

  const groupedEvents = useMemo(() => {
    if (groupBy === 'none') return [{ label: '', events: filteredEvents }];
    const groups = new Map<string, EvidenceEvent[]>();
    for (const event of filteredEvents) {
      const label =
        groupBy === 'source'
          ? providerInfo(event.providerKey).label
          : new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date(event.occurredAt));
      groups.set(label, [...(groups.get(label) ?? []), event]);
    }
    return [...groups.entries()].map(([label, grouped]) => ({ label, events: grouped }));
  }, [filteredEvents, groupBy]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const fetchEvents = useCallback(
    async (cursor: string | null | undefined, mode: 'append' | 'poll') => {
      const response = await fetch(
        `/api/evidence/records/${encodeURIComponent(initialData.id)}/events?limit=40${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
        }`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error('The evidence timeline could not be refreshed.');
      const payload = (await response.json()) as {
        events: EvidenceEvent[];
        page: { hasMore: boolean; cursor?: string | null; limit: number };
      };
      if (mode === 'append') {
        setEvents((current) => {
          const ids = new Set(current.map((event) => event.id));
          return [...current, ...payload.events.filter((event) => !ids.has(event.id))];
        });
        setPage(payload.page);
      } else if (payload.events.length) {
        setEvents((current) => {
          const ids = new Set(current.map((event) => event.id));
          return [...current, ...payload.events.filter((event) => !ids.has(event.id))];
        });
        setLiveCursor(payload.events.at(-1)?.id ?? cursor);
        setNewEvidenceCount((count) => count + payload.events.length);
      }
      return payload;
    },
    [initialData.id],
  );

  const loadMore = useCallback(async () => {
    if (!page.hasMore || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      await fetchEvents(page.cursor, 'append');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load more evidence.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchEvents, loadingMore, page.cursor, page.hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !page.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '320px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, page.hasMore]);

  useEffect(() => {
    if (!liveCursor) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchEvents(liveCursor, 'poll').catch(() => undefined);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [fetchEvents, liveCursor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProviderDrawer(null);
        setActionsOpen(false);
      }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        document.getElementById('evidence-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const exportRecord = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            record: initialData,
            events,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `approvline-evidence-${initialData.id}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Immutable evidence export prepared.');
  };

  const shareRecord = async () => {
    await navigator.clipboard.writeText(window.location.href);
    showToast('Secure record link copied.');
  };

  const renderTimeline = () => (
    <div className="min-h-[520px]">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Complete Timeline of All Mentions</h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Chronological, immutable evidence from every correlated source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-[220px] sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id="evidence-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search evidence..."
              className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-blue-500/60"
            />
          </label>
          <label className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="h-9 appearance-none rounded-lg border border-white/10 bg-[#071426] pl-9 pr-8 text-xs font-semibold text-slate-300 outline-none focus:border-blue-500/60"
            >
              <option value="all">All sources</option>
              {initialData.providers.map((provider) => (
                <option key={provider.providerKey} value={provider.providerKey}>
                  {providerInfo(provider.providerKey).label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          </label>
          <label className="relative">
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as typeof groupBy)}
              className="h-9 appearance-none rounded-lg border border-white/10 bg-[#071426] pl-3 pr-8 text-xs font-semibold text-slate-300 outline-none focus:border-blue-500/60"
            >
              <option value="none">Group: None</option>
              <option value="source">Group: Source</option>
              <option value="day">Group: Day</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          </label>
        </div>
      </div>

      {newEvidenceCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            setNewEvidenceCount(0);
            document.getElementById('timeline-end')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="mx-auto mt-3 flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-300"
        >
          <CircleDot className="h-3.5 w-3.5" />
          {newEvidenceCount} new evidence {newEvidenceCount === 1 ? 'event' : 'events'} detected
        </button>
      ) : null}

      {filteredEvents.length ? (
        <div className="px-3 pb-3">
          {groupedEvents.map((group) => (
            <div key={group.label || 'all'}>
              {group.label ? (
                <div className="sticky top-0 z-[2] border-b border-white/[0.07] bg-[#06101f]/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
                  {group.label}
                </div>
              ) : null}
              {group.events.map((event) => {
                const membership = eventMembership(event, memberships);
                const sourceUrl = eventSourceUrl(event);
                const expanded = expandedId === event.id;
                const provider = providerInfo(event.providerKey);
                const metadata = recordValue(event.metadata);
                return (
                  <article
                    key={event.id}
                    className="border-b border-white/[0.065] last:border-b-0"
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '74px' }}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : event.id)}
                      className="grid w-full grid-cols-[82px_1fr_auto] items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.025] sm:grid-cols-[95px_185px_minmax(180px,1fr)_155px_auto]"
                    >
                      <span className="relative pl-4">
                        <span
                          className="absolute left-0 top-1 h-2 w-2 rounded-full ring-4 ring-[#06101f]"
                          style={{ backgroundColor: provider.color }}
                        />
                        <span className="block text-[11px] font-semibold text-blue-300">
                          {timeOnly(event.occurredAt)}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-slate-600">
                          {dateOnly(event.occurredAt)}
                        </span>
                      </span>
                      <span className="hidden min-w-0 items-center gap-3 sm:flex">
                        <ProviderMark providerKey={event.providerKey} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold text-slate-200">{provider.label}</span>
                          <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                            {event.threadId ?? titleCase(event.providerEventType)}
                          </span>
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 sm:hidden">
                          <ProviderMark providerKey={event.providerKey} size="sm" />
                          <span className="truncate text-xs font-bold text-slate-200">{provider.label}</span>
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-300 sm:mt-0">
                          {event.content || titleCase(event.providerEventType)}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-slate-600">
                          {event.objectType}
                          {event.objectId ? ` · ${event.objectId}` : ''}
                        </span>
                      </span>
                      <span className="hidden min-w-0 items-center gap-2 sm:flex">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/30 text-[9px] font-black text-blue-200">
                          {(event.actorName ?? event.actorEmail ?? '?')
                            .split(/\s+/)
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-slate-300">
                            {event.actorName ?? event.actorEmail ?? 'Unknown actor'}
                          </span>
                          <span className="block truncate text-[9px] text-slate-600">
                            {typeof metadata.role === 'string' ? metadata.role : event.actorEmail ?? 'Role not captured'}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <span
                          className={`hidden rounded-full border px-2 py-1 text-[9px] font-bold sm:inline-flex ${statusTone(
                            eventStatus(event, membership),
                          )}`}
                        >
                          {eventStatus(event, membership)}
                        </span>
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </span>
                    </button>
                    {expanded ? (
                      <div className="grid gap-4 border-t border-white/[0.05] bg-black/15 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)]">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            Original captured content
                          </p>
                          <div className="mt-2 rounded-lg border border-white/[0.07] bg-[#020a15] p-3 text-xs leading-6 text-slate-300">
                            {event.content || 'The source supplied metadata without a text body.'}
                          </div>
                          {membership?.matchingReasons.length ? (
                            <div className="mt-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                AI clustering explanation
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {membership.matchingReasons.map((reason) => (
                                  <span
                                    key={reason}
                                    className="rounded-md border border-blue-400/15 bg-blue-400/[0.07] px-2 py-1 text-[10px] font-semibold text-blue-200"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {sourceUrl ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold text-blue-300 hover:border-blue-500/40"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Open immutable source
                              </a>
                            ) : (
                              <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-[10px] font-semibold text-slate-600">
                                <LockKeyhole className="h-3.5 w-3.5" />
                                Source URL unavailable
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(event.evidenceHash);
                                showToast('Evidence hash copied.');
                              }}
                              className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold text-slate-300 hover:border-blue-500/40"
                            >
                              <Fingerprint className="h-3.5 w-3.5" />
                              Copy evidence hash
                            </button>
                          </div>
                        </div>
                        <dl className="grid content-start gap-2 rounded-lg border border-white/[0.07] bg-[#020a15] p-3 text-[10px]">
                          {[
                            ['Confidence', `${membership?.matchConfidence ?? event.confidence}%`],
                            ['Correlation ID', event.correlationId],
                            ['Evidence hash', event.evidenceHash],
                            ['Received', dateTime(event.receivedAt)],
                            ['Processed', dateTime(event.lastProcessedAt)],
                            ['Related records', String(event.relatedIds.length)],
                            ['Attachments', String(arrayValue(event.attachments).length)],
                            ['Raw payload', 'Encrypted and access-restricted'],
                          ].map(([label, value]) => (
                            <div key={label} className="grid grid-cols-[92px_1fr] gap-3 border-b border-white/[0.05] pb-2 last:border-0 last:pb-0">
                              <dt className="font-semibold text-slate-600">{label}</dt>
                              <dd className="min-w-0 break-all text-right font-semibold text-slate-300">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ))}
          <div id="timeline-end" ref={sentinelRef} className="grid min-h-14 place-items-center">
            {loadingMore ? (
              <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more evidence...
              </span>
            ) : loadError ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] font-bold text-rose-300"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {loadError} Retry
              </button>
            ) : page.hasMore ? null : (
              <span className="text-[10px] font-semibold text-slate-700">Complete evidence history loaded</span>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4">
          <EmptyPanel
            title="No evidence matches these filters"
            text="Clear the source filter or search query to return to the complete immutable timeline."
          />
        </div>
      )}
    </div>
  );

  const renderTab = () => {
    if (activeTab === 'timeline') return renderTimeline();
    if (activeTab === 'analysis') {
      return (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">What AI observed</p>
            <h2 className="mt-2 text-lg font-bold text-white">{initialData.subject}</h2>
            <p className="mt-2 text-xs leading-6 text-slate-400">
              {initialData.evidenceCount} evidence events across {initialData.sourceCount} sources were correlated
              into this record with {initialData.confidence}% confidence.
            </p>
            <div className="mt-4 grid gap-2">
              {matchingReasons.length ? (
                matchingReasons.map((reason) => (
                  <div key={reason} className="flex items-start gap-2 rounded-lg bg-white/[0.025] p-2.5 text-xs text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {reason}
                  </div>
                ))
              ) : (
                <p className="text-xs leading-5 text-slate-500">
                  No classifier rationale was persisted for the loaded events. ApprovLine will not fabricate an explanation.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">Confidence breakdown</p>
            <div className="mt-4 grid gap-4">
              {[
                ['Record confidence', initialData.confidence],
                [
                  'Average event confidence',
                  events.length
                    ? Math.round(events.reduce((sum, event) => sum + event.confidence, 0) / events.length)
                    : 0,
                ],
                [
                  'Human verification coverage',
                  initialData.members.length
                    ? Math.round(
                        (initialData.members.filter((member) => member.status === 'HUMAN_VERIFIED').length /
                          initialData.members.length) *
                          100,
                      )
                    : 0,
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-400">{label}</span>
                    <span className="font-bold text-slate-200">{value}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {suggestedCount ? (
              <div className="mt-5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] p-3">
                <p className="text-xs font-bold text-amber-300">{suggestedCount} association(s) require human review</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-200/70">
                  Suggested evidence remains distinct from verified evidence until an authorized user reviews it.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      );
    }
    if (activeTab === 'details') {
      return (
        <dl className="grid gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Decision', initialData.decision ?? initialData.outcome ?? 'Not captured'],
            ['Category', initialData.category ?? 'Not captured'],
            ['Department', initialData.department ?? 'Not captured'],
            ['Amount', amountText(initialData.amount, initialData.currency)],
            ['Primary approver', initialData.approverName ?? 'Not captured'],
            ['Approver email', initialData.approverEmail ?? 'Not captured'],
            ['Verification', titleCase(initialData.verificationStatus)],
            ['Risk level', initialData.riskLevel ?? 'Not assessed'],
            ['Primary approval', initialData.primaryApproval?.id ?? 'Not linked'],
          ].map(([label, value]) => (
            <div key={label} className="bg-[#06101f] p-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</dt>
              <dd className="mt-2 break-words text-sm font-semibold text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      );
    }
    if (activeTab === 'participants') {
      return participants.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {participants.map((participant) => (
            <div key={participant.email ?? participant.name} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/30 text-xs font-black text-blue-200">
                {participant.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-200">{participant.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500">{participant.email ?? 'Email not captured'}</span>
                <span className="mt-1 block text-[9px] font-semibold text-blue-300">{participant.count} evidence events</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4"><EmptyPanel title="No participants captured" text="Participant identities will appear when source evidence supplies actor metadata." /></div>
      );
    }
    if (activeTab === 'supporting') {
      return attachments.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-500/10 text-blue-300"><File className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-slate-200">{attachment.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-500">{providerInfo(attachment.providerKey).label} · {attachment.type ?? 'Attachment'}</span>
              </span>
              {attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-blue-300" title="Open signed source"><ExternalLink className="h-3.5 w-3.5" /></a>
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.06] text-slate-700" title="Source unavailable"><LockKeyhole className="h-3.5 w-3.5" /></span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4"><EmptyPanel title="No supporting files captured" text="Attachments, transcripts, contracts, screenshots, and call notes will appear here when supplied by source systems." /></div>
      );
    }
    if (activeTab === 'related') {
      return related.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {related.map((item) => (
            <button key={item.id} type="button" onClick={() => { setActiveTab('timeline'); setExpandedId(item.eventId); }} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left hover:border-blue-500/30">
              <ProviderMark providerKey={item.providerKey} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-200">{item.label}</span>
                <span className="mt-0.5 block text-[10px] text-slate-500">{titleCase(item.type)} · {providerInfo(item.providerKey).label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-4"><EmptyPanel title="No linked records captured" text="Contracts, tickets, opportunities, pull requests, and graph relationships will appear when source identifiers are available." /></div>
      );
    }
    return (
      <div className="grid gap-3 p-4">
        {events.map((event) => (
          <div key={event.id} className="grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 sm:grid-cols-[160px_1fr_auto] sm:items-center">
            <span className="text-[10px] font-semibold text-slate-500">{dateTime(event.receivedAt)}</span>
            <span className="text-xs text-slate-300">
              Evidence received from <strong>{providerInfo(event.providerKey).label}</strong> and recorded as {titleCase(event.status)}.
            </span>
            <span className="font-mono text-[9px] text-slate-600">{event.evidenceHash.slice(0, 14)}…</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="-m-3 min-h-[calc(100vh-76px)] bg-[#020a15] text-slate-100 sm:-m-4 xl:-m-5">
      {toast ? (
        <div className="fixed right-5 top-20 z-50 flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-[#071426] px-4 py-3 text-xs font-bold text-emerald-300 shadow-2xl">
          <Check className="h-4 w-4" /> {toast}
        </div>
      ) : null}

      <div className="border-b border-white/[0.07] px-4 py-3 xl:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-500">
            <Link href="/evidence" className="hover:text-blue-300">Unified Evidence</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate text-slate-300">{initialData.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportRecord} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[11px] font-bold text-slate-300 hover:border-blue-500/40 hover:text-white">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Export
            </button>
            <button type="button" onClick={() => void shareRecord()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[11px] font-bold text-slate-300 hover:border-blue-500/40 hover:text-white">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button type="button" onClick={() => setActiveTab('audit')} className="hidden h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-[11px] font-bold text-slate-300 hover:border-blue-500/40 hover:text-white sm:inline-flex">
              <History className="h-3.5 w-3.5" /> Audit Log
            </button>
            <div className="relative">
              <button type="button" onClick={() => setActionsOpen((open) => !open)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-[11px] font-bold text-white hover:bg-blue-500">
                <MoreHorizontal className="h-3.5 w-3.5" /> Actions <ChevronDown className="h-3 w-3" />
              </button>
              {actionsOpen ? (
                <div className="absolute right-0 top-11 z-30 w-52 rounded-xl border border-white/10 bg-[#071426] p-1.5 shadow-2xl">
                  {initialData.primaryApproval ? (
                    <Link href={`/approvals/${initialData.primaryApproval.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"><ClipboardCheck className="h-3.5 w-3.5" /> View full approval</Link>
                  ) : null}
                  <button type="button" onClick={() => { setActiveTab('analysis'); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"><Sparkles className="h-3.5 w-3.5" /> Explain correlation</button>
                  <Link href="/investigations" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"><AlertTriangle className="h-3.5 w-3.5" /> Open investigation center</Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 xl:p-4">
        <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-gradient-to-br from-[#07192c] to-[#06101f] shadow-2xl shadow-black/20">
          <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300">
                <ShieldCheck className="h-8 w-8" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusTone(initialData.verificationStatus)}`}>
                    {titleCase(initialData.verificationStatus)}
                  </span>
                  {initialData.riskLevel ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-bold text-slate-400">
                      {titleCase(initialData.riskLevel)} risk
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-2 truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{initialData.subject}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span>{initialData.category ?? 'Unified decision record'}</span>
                  <span className="text-slate-700">|</span>
                  <span>ID: {initialData.id}</span>
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(initialData.id); showToast('Decision ID copied.'); }} title="Copy decision ID"><Copy className="h-3 w-3 hover:text-blue-300" /></button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center">
              <Metric label="Sources" value={initialData.sourceCount} />
              <Metric label="Mentions" value={initialData.evidenceCount} />
              <Metric label="Confidence" value={`${initialData.confidence}%`} accent />
              <div className="ml-3 grid h-12 w-12 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 ${initialData.confidence}%, rgba(255,255,255,.08) 0)` }}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#071426] text-[10px] font-bold text-emerald-300">{initialData.confidence}%</span>
              </div>
            </div>
          </div>
          <dl className="grid border-t border-white/[0.08] bg-black/10 sm:grid-cols-2 lg:grid-cols-7">
            {[
              ['Status', titleCase(initialData.outcome ?? initialData.decision ?? initialData.verificationStatus)],
              ['Amount', amountText(initialData.amount, initialData.currency)],
              ['Decision type', titleCase(initialData.primaryApproval?.approvalType ?? initialData.decision)],
              ['Approver', initialData.approverName ?? 'Not captured'],
              ['Department', initialData.department ?? 'Not captured'],
              ['First seen', dateTime(initialData.firstSeenAt)],
              ['Last updated', dateTime(initialData.lastSeenAt)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 border-b border-r border-white/[0.07] p-3 last:border-r-0 sm:border-b-0">
                <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
                <dd className="mt-1 truncate text-[11px] font-semibold text-slate-200" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 overflow-hidden rounded-xl border border-white/[0.09] bg-[#06101f] shadow-xl shadow-black/10">
            <nav className="flex overflow-x-auto border-b border-white/[0.08] px-2 [scrollbar-width:none]">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const count =
                  tab.id === 'participants' ? participants.length :
                  tab.id === 'supporting' ? attachments.length :
                  tab.id === 'related' ? related.length :
                  tab.id === 'timeline' ? initialData.evidenceCount : null;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex h-11 shrink-0 items-center gap-2 px-3 text-[11px] font-semibold transition ${
                      activeTab === tab.id ? 'text-blue-300' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                    {count !== null ? <span className="text-[9px] text-slate-600">({count})</span> : null}
                    {activeTab === tab.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-blue-500" /> : null}
                  </button>
                );
              })}
            </nav>
            {renderTab()}
          </main>

          <aside className="grid content-start gap-3">
            <section className="rounded-xl border border-white/[0.09] bg-[#06101f] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white">AI Summary</h2>
                <span className="text-[9px] text-slate-600">Live evidence</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                ApprovLine observed {initialData.evidenceCount} mentions across {initialData.sourceCount} sources and correlated them into this decision with{' '}
                <strong className="text-slate-200">{initialData.confidence}% confidence</strong>.
              </p>
              <div className="mt-3 grid gap-2">
                {matchingReasons.length ? matchingReasons.slice(0, 5).map((reason) => (
                  <div key={reason} className="flex items-start gap-2 text-[11px] leading-5 text-slate-400">
                    <CheckCircle2 className="mt-1 h-3 w-3 shrink-0 text-emerald-400" /> {reason}
                  </div>
                )) : (
                  <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                    <Bot className="mt-1 h-3 w-3 shrink-0 text-violet-400" />
                    Detailed classifier reasoning was not persisted for this record.
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setActiveTab('analysis')} className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-blue-300 hover:text-blue-200">
                View AI reasoning <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </section>

            <section className="rounded-xl border border-white/[0.09] bg-[#06101f] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Source Platforms ({initialData.providers.length})</h2>
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {initialData.providers.map((provider) => (
                  <button
                    key={provider.providerKey}
                    type="button"
                    onClick={() => setProviderDrawer(provider)}
                    className="group grid min-w-0 place-items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.025] px-1 py-2 hover:border-blue-500/30"
                    title={`Open ${providerInfo(provider.providerKey).label} diagnostics`}
                  >
                    <ProviderMark providerKey={provider.providerKey} />
                    <span className="w-full truncate text-center text-[8px] font-semibold text-slate-500 group-hover:text-slate-300">{providerInfo(provider.providerKey).label}</span>
                    <span className="text-[8px] font-bold text-blue-300">{provider.eventCount}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.09] bg-[#06101f] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Supporting Evidence ({attachments.length})</h2>
                <button type="button" onClick={() => setActiveTab('supporting')} className="text-[9px] font-bold text-blue-300">View all</button>
              </div>
              <div className="mt-3 grid gap-2">
                {attachments.length ? attachments.slice(0, 4).map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-lg bg-white/[0.025] p-2">
                    <FileText className="h-4 w-4 shrink-0 text-blue-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-semibold text-slate-300">{attachment.name}</span>
                      <span className="block truncate text-[8px] text-slate-600">{providerInfo(attachment.providerKey).label} · {attachment.type ?? 'Attachment'}</span>
                    </span>
                    {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer" title="Open source"><ExternalLink className="h-3 w-3 text-slate-500 hover:text-blue-300" /></a> : <LockKeyhole className="h-3 w-3 text-slate-700" />}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-white/[0.07] p-3 text-[10px] leading-5 text-slate-600">No files were supplied by the loaded evidence.</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-white/[0.09] bg-[#06101f] p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Related Records ({related.length})</h2>
                <button type="button" onClick={() => setActiveTab('related')} className="text-[9px] font-bold text-blue-300">View all</button>
              </div>
              <div className="mt-3 grid gap-2">
                {related.length ? related.slice(0, 4).map((item) => (
                  <button key={item.id} type="button" onClick={() => { setActiveTab('timeline'); setExpandedId(item.eventId); }} className="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.025] p-2 text-left">
                    <ProviderMark providerKey={item.providerKey} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold text-slate-300">{item.label}</span>
                      <span className="block truncate text-[8px] text-slate-600">{titleCase(item.type)}</span>
                    </span>
                  </button>
                )) : (
                  <p className="rounded-lg border border-dashed border-white/[0.07] p-3 text-[10px] leading-5 text-slate-600">No related source identifiers were captured.</p>
                )}
              </div>
            </section>
          </aside>
        </div>

        <footer className="mt-3 grid overflow-hidden rounded-xl border border-white/[0.09] bg-[#06101f] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            { icon: AlertTriangle, label: 'Decision impact', value: initialData.primaryApproval?.businessImpact ?? 'Not assessed', color: 'text-amber-300' },
            { icon: ShieldCheck, label: 'Compliance', value: initialData.metadata && typeof recordValue(initialData.metadata).complianceStatus === 'string' ? String(recordValue(initialData.metadata).complianceStatus) : 'Not assessed', color: 'text-emerald-300' },
            { icon: Activity, label: 'Risk', value: initialData.riskLevel ?? 'Not assessed', color: 'text-blue-300' },
            { icon: CalendarClock, label: 'Retention', value: typeof recordValue(initialData.metadata).retention === 'string' ? String(recordValue(initialData.metadata).retention) : 'Workspace policy', color: 'text-amber-300' },
            { icon: LockKeyhole, label: 'Evidence locked', value: 'Yes', color: 'text-emerald-300' },
            { icon: UserRound, label: 'Created by', value: typeof recordValue(initialData.metadata).createdBy === 'string' ? String(recordValue(initialData.metadata).createdBy) : 'ApprovLine', color: 'text-slate-300' },
            { icon: Clock3, label: 'Last updated', value: dateTime(initialData.updatedAt), color: 'text-slate-300' },
            { icon: Fingerprint, label: 'Version', value: typeof recordValue(initialData.metadata).classificationVersion === 'string' ? String(recordValue(initialData.metadata).classificationVersion) : 'Current', color: 'text-violet-300' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="min-w-0 border-b border-r border-white/[0.07] p-3 last:border-r-0 sm:border-b-0">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-600">{item.label}</p>
                <p className={`mt-1 flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold ${item.color}`} title={item.value}>
                  <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{item.value}</span>
                </p>
              </div>
            );
          })}
        </footer>
      </div>

      {providerDrawer ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onMouseDown={() => setProviderDrawer(null)}>
          <aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#06101f] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ProviderMark providerKey={providerDrawer.providerKey} size="lg" />
                <div>
                  <h2 className="text-lg font-bold text-white">{providerInfo(providerDrawer.providerKey).label}</h2>
                  <p className="text-[10px] text-slate-500">Connector diagnostics</p>
                </div>
              </div>
              <button type="button" onClick={() => setProviderDrawer(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6 grid gap-3">
              {[
                ['Connection', titleCase(providerDrawer.connection?.status ?? 'Evidence received')],
                ['Health', titleCase(providerDrawer.connection?.health?.status ?? 'Not reported')],
                ['Events in record', String(providerDrawer.eventCount)],
                ['Latest event', dateTime(providerDrawer.latestEventAt)],
                ['Latest sync', dateTime(providerDrawer.connection?.lastSyncAt)],
                ['Latency', providerDrawer.connection?.health?.latencyMs != null ? `${providerDrawer.connection.health.latencyMs}ms` : 'Not reported'],
                ['Consecutive failures', String(providerDrawer.connection?.health?.consecutiveFailures ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
                  <span className="text-xs font-semibold text-slate-500">{label}</span>
                  <span className="text-right text-xs font-bold text-slate-200">{value}</span>
                </div>
              ))}
            </div>
            {providerDrawer.connection?.health?.lastErrorMessage ? (
              <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300">Latest connector error</p>
                <p className="mt-2 text-xs leading-5 text-rose-200/70">{providerDrawer.connection.health.lastErrorMessage}</p>
              </div>
            ) : null}
            <div className="mt-6 rounded-lg border border-white/[0.07] bg-[#020a15] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Security boundary</p>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Connector diagnostics expose health and mapping metadata only. Encrypted credentials and raw source payloads are never returned to this client.
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
