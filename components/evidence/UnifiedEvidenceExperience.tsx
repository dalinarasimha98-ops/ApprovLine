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
import { PendingLink } from '@/components/system/PendingLink';
import type { ReactNode } from 'react';
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

type ComplianceEvaluation = {
  score: number;
  status: string;
  severity: string;
  missingApprovers: string[];
  missingDepartments: string[];
  missingEscalationSteps: string[];
  missingEvidence: string[];
  triggeredRule?: string | null;
  explanation: string;
  createdAt: string;
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
  complianceEvaluation?: ComplianceEvaluation | null;
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
  sap: { label: 'SAP', glyph: 'SAP', color: '#0d9488' },
  oracle: { label: 'Oracle', glyph: 'OR', color: '#f43f5e' },
  coupa: { label: 'Coupa', glyph: 'CP', color: '#6366f1' },
  workday: { label: 'Workday', glyph: 'WD', color: '#f97316' },
  hubspot: { label: 'HubSpot', glyph: 'HS', color: '#f97316' },
  api: { label: 'Universal API', glyph: 'API', color: '#64748b' },
  webhook: { label: 'Universal Webhook', glyph: 'WH', color: '#64748b' },
  csv: { label: 'CSV Import', glyph: 'CSV', color: '#94a3b8' },
  email_capture: { label: 'Email Capture', glyph: '@', color: '#94a3b8' },
  sdk: { label: 'Provider SDK', glyph: 'SDK', color: '#818cf8' },
  custom: { label: 'Custom System', glyph: 'CS', color: '#94a3b8' },
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

export function UnifiedEvidenceExperience({ initialData }: { initialData: UnifiedEvidenceData }) {
  const [events, setEvents] = useState<EvidenceEvent[]>(initialData.events);
  const [page, setPage] = useState(initialData.eventPage);
  const [liveCursor, setLiveCursor] = useState(initialData.liveCursor);
  const [activeTab, setActiveTab] = useState<TimelineTab>('timeline');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'none' | 'source' | 'day'>('none');
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newEvidenceCount, setNewEvidenceCount] = useState(0);
  const [providerDrawer, setProviderDrawer] = useState<EvidenceProvider | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const metadata = useMemo(() => recordValue(initialData.metadata), [initialData.metadata]);
  const attachments = useMemo(() => attachmentItems(events), [events]);
  const related = useMemo(() => relatedItems(events), [events]);
  const evidenceHash = events[0]?.evidenceHash ?? String(metadata.evidenceHash ?? initialData.id);

  const providers = useMemo(() => {
    const providerMap = new Map(initialData.providers.map((provider) => [provider.providerKey, provider]));
    for (const event of events) {
      if (!providerMap.has(event.providerKey)) {
        providerMap.set(event.providerKey, {
          providerKey: event.providerKey,
          eventCount: events.filter((candidate) => candidate.providerKey === event.providerKey).length,
          latestEventAt: event.occurredAt,
        });
      }
    }
    return Array.from(providerMap.values()).sort((left, right) => right.eventCount - left.eventCount);
  }, [events, initialData.providers]);

  const copyText = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setToast(`${label} copied`);
      } catch {
        setToast(`Could not copy ${label.toLowerCase()}`);
      }
    },
    [],
  );

  const exportRecord = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      record: initialData,
      events,
      providers,
      attachments,
      related,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${initialData.id}-unified-evidence.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setToast('Unified evidence export started');
  }, [attachments, events, initialData, providers, related]);

  const fetchEvents = useCallback(
    async (cursor: string | null | undefined, mode: 'append' | 'replace' | 'poll') => {
      const response = await fetch(
        `/api/evidence/records/${encodeURIComponent(initialData.id)}/events?limit=40${
          cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
        }`,
        { cache: 'no-store' },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Unable to load evidence events.');
      }

      const payload = (await response.json()) as {
        events: EvidenceEvent[];
        page: { hasMore: boolean; cursor?: string | null; limit: number };
        liveCursor?: string | null;
      };

      setEvents((current) => {
        if (mode === 'replace') {
          return payload.events;
        }

        const existing = new Set(current.map((event) => event.id));
        const nextEvents = payload.events.filter((event) => !existing.has(event.id));
        if (mode === 'poll' && nextEvents.length > 0) {
          setNewEvidenceCount((value) => value + nextEvents.length);
          return [...nextEvents, ...current].sort(
            (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
          );
        }

        return [...current, ...nextEvents].sort(
          (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
        );
      });
      setPage(payload.page);
      setLiveCursor(payload.liveCursor ?? null);
    },
    [initialData.id],
  );

  const refreshTimeline = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await fetchEvents(null, 'replace');
      setToast('Evidence timeline refreshed');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to refresh evidence.');
    } finally {
      setRefreshing(false);
    }
  }, [fetchEvents]);

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
    const node = sentinelRef.current;
    if (!node || !page.hasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, page.hasMore]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!liveCursor) return;
      void fetchEvents(liveCursor, 'poll').catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [fetchEvents, liveCursor]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      if (providerFilter !== 'all' && event.providerKey !== providerFilter) return false;
      if (!normalizedQuery) return true;
      const searchable = [
        providerInfo(event.providerKey).label,
        event.content,
        event.actorName,
        event.actorEmail,
        event.threadId,
        event.objectId,
        event.objectType,
        eventStatus(event, eventMembership(event, initialData.members)),
        ...(event.relatedIds ?? []),
        ...(event.correlationKeys ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [events, initialData.members, providerFilter, query]);

  const groupedEvents = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'All evidence', label: 'Complete Timeline of All Mentions', events: filteredEvents }];
    const buckets = new Map<string, EvidenceEvent[]>();
    for (const event of filteredEvents) {
      const key = groupBy === 'source' ? providerInfo(event.providerKey).label : dateOnly(event.occurredAt);
      buckets.set(key, [...(buckets.get(key) ?? []), event]);
    }
    return Array.from(buckets.entries()).map(([key, value]) => ({ key, label: key, events: value }));
  }, [filteredEvents, groupBy]);

  const participants = useMemo(() => {
    const people = new Map<string, { name: string; email?: string | null; role: string; events: number }>();
    for (const event of events) {
      const name = event.actorName ?? event.actorEmail ?? 'Unknown participant';
      const key = event.actorEmail ?? name;
      const current = people.get(key);
      people.set(key, {
        name,
        email: event.actorEmail,
        role: event.actorId ?? providerInfo(event.providerKey).label,
        events: (current?.events ?? 0) + 1,
      });
    }
    return Array.from(people.values()).sort((left, right) => right.events - left.events);
  }, [events]);

  const confidenceReasons = useMemo(() => {
    const reasons = new Set<string>();
    for (const event of events) {
      const membership = eventMembership(event, initialData.members);
      for (const reason of membership?.matchingReasons ?? []) reasons.add(reason);
      for (const key of event.correlationKeys ?? []) reasons.add(`Shared key: ${key}`);
    }
    return Array.from(reasons).slice(0, 6);
  }, [events, initialData.members]);

  const status = initialData.outcome ?? initialData.verificationStatus ?? 'captured';
  const primaryApprover = initialData.approverName ?? initialData.approverEmail ?? 'Unknown approver';
  const policyStatus =
    typeof metadata.complianceStatus === 'string' ? metadata.complianceStatus : initialData.riskLevel === 'high' ? 'Review required' : 'Compliant';
  const retention = typeof metadata.retention === 'string' ? metadata.retention : 'Workspace policy';
  const createdBy = typeof metadata.createdBy === 'string' ? metadata.createdBy : 'ApprovLine';
  const classificationVersion =
    typeof metadata.classificationVersion === 'string' ? metadata.classificationVersion : 'Current classifier';

  return (
    <div className="min-h-screen bg-[#030813] px-3 py-3 text-slate-100 sm:px-4 lg:px-5">
      <div className="mx-auto max-w-[1720px]">
        <div className="mb-3 flex min-h-12 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Link href="/evidence" className="transition hover:text-white">
              Unified Evidence
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-200">{initialData.id}</span>
          </div>

          <div className="order-3 flex min-w-full flex-1 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 shadow-[0_0_0_1px_rgba(37,99,235,0.08)] lg:order-none lg:mx-auto lg:min-w-0 lg:max-w-xl">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search approvals, people, decisions, tickets..."
              className="min-w-0 flex-1 bg-transparent px-3 text-xs text-slate-200 outline-none placeholder:text-slate-500"
              aria-label="Search unified evidence"
            />
            <span className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-slate-500">K</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.08] px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
              Live Capture
            </span>
            <button
              type="button"
              onClick={() => setToast('Notifications are routed through workspace alerts.')}
              className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.08]"
              aria-label="Notifications"
            >
              <Activity className="h-4 w-4" />
              {newEvidenceCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white">{newEvidenceCount}</span>
              ) : null}
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-sm font-bold text-white">D</div>
              <div className="text-right">
                <p className="text-xs font-bold text-white">Dali Narasimha</p>
                <p className="text-[9px] font-bold uppercase tracking-wide text-violet-300">Super admin</p>
              </div>
            </div>
          </div>
        </div>

        {newEvidenceCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setNewEvidenceCount(0);
              void refreshTimeline();
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/[0.09] px-4 py-2 text-xs font-bold text-blue-200 transition hover:bg-blue-500/[0.14]"
          >
            <Sparkles className="h-4 w-4" />
            New evidence detected. Refresh timeline.
          </button>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-2xl border border-blue-300/15 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.20),transparent_42%),linear-gradient(145deg,rgba(9,18,34,0.98),rgba(3,8,19,0.98))] shadow-[0_18px_80px_rgba(0,0,0,0.35)]">
              <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-300 shadow-[0_0_32px_rgba(52,211,153,0.16)]">
                    <ShieldCheck className="h-10 w-10" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.10] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                        {initialData.confidence >= 90 ? 'High confidence' : 'Evidence confidence'}
                      </span>
                      <span className="text-xs text-slate-500">ID: {initialData.id}</span>
                      <button
                        type="button"
                        onClick={() => void copyText(initialData.id, 'Decision ID')}
                        className="grid h-6 w-6 place-items-center rounded-md border border-white/10 text-slate-400 transition hover:text-white"
                        aria-label="Copy decision ID"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <h1 className="mt-2 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {initialData.subject}
                    </h1>
                    <p className="mt-1 text-sm font-medium text-slate-400">
                      {initialData.decision ?? 'Unified decision record'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 rounded-2xl border border-white/[0.08] bg-black/15 p-4">
                  <Metric label="Sources" value={String(providers.length || initialData.sourceCount)} accent="text-blue-300" />
                  <Metric label="Mentions" value={String(events.length || initialData.evidenceCount)} accent="text-blue-300" />
                  <div className="min-w-[116px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Confidence Score</p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-2xl font-black text-emerald-300">{initialData.confidence}%</span>
                      <div className="h-10 w-10 rounded-full border-[6px] border-emerald-400 border-l-emerald-400/20" />
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">AI confidence</p>
                  </div>
                </div>
              </div>

              <div className="grid border-t border-white/[0.08] bg-[#061323]/70 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                {[
                  ['Status', titleCase(status), 'text-emerald-300'],
                  ['Amount', amountText(initialData.amount, initialData.currency), 'text-white'],
                  ['Decision Type', titleCase(initialData.primaryApproval?.approvalType ?? initialData.category ?? 'Approval'), 'text-white'],
                  ['Approver', primaryApprover, 'text-white'],
                  ['Department', initialData.department ?? 'Unassigned', 'text-white'],
                  ['First Seen', dateTime(initialData.firstSeenAt), 'text-white'],
                  ['Last Updated', dateTime(initialData.lastSeenAt), 'text-white'],
                ].map(([label, value, tone]) => (
                  <div key={label} className="min-w-0 border-b border-r border-white/[0.07] px-4 py-3 last:border-r-0 lg:border-b-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className={`mt-1 break-words text-sm font-bold leading-5 ${tone}`} title={value}>{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-blue-300/15 bg-[#071321]/95 shadow-[0_18px_80px_rgba(0,0,0,0.26)]">
              <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.08] px-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`shrink-0 border-b-2 px-4 py-4 text-xs font-bold transition ${
                      activeTab === tab.id
                        ? 'border-blue-400 text-white'
                        : 'border-transparent text-slate-500 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'timeline' ? (
                <div className="p-4">
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-base font-black text-white">
                        Complete Timeline of All Mentions <span className="font-medium text-slate-500">(Chronological)</span>
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">Every source mention is immutable, searchable, and expandable.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={providerFilter}
                        onChange={(event) => setProviderFilter(event.target.value)}
                        className="h-10 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-semibold text-slate-200 outline-none"
                        aria-label="Filter by source"
                      >
                        <option value="all">All sources</option>
                        {providers.map((provider) => (
                          <option key={provider.providerKey} value={provider.providerKey}>{providerInfo(provider.providerKey).label}</option>
                        ))}
                      </select>
                      <select
                        value={groupBy}
                        onChange={(event) => setGroupBy(event.target.value as 'none' | 'source' | 'day')}
                        className="h-10 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-semibold text-slate-200 outline-none"
                        aria-label="Group evidence"
                      >
                        <option value="none">Group by: None</option>
                        <option value="source">Group by: Source</option>
                        <option value="day">Group by: Day</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void refreshTimeline()}
                        disabled={refreshing}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Refresh
                      </button>
                    </div>
                  </div>

                  {loadError ? (
                    <div className="mb-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4">
                      <p className="text-sm font-bold text-amber-200">Evidence timeline is temporarily delayed</p>
                      <p className="mt-1 text-xs leading-5 text-amber-100/70">{loadError}</p>
                      <button
                        type="button"
                        onClick={() => void refreshTimeline()}
                        className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        Retry timeline
                      </button>
                    </div>
                  ) : null}

                  <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#03101e]">
                    {filteredEvents.length === 0 ? (
                      <EmptyPanel
                        title="No evidence matched"
                        text="Adjust filters or search terms. The underlying record stays intact and auditable."
                      />
                    ) : (
                      groupedEvents.map((group) => (
                        <div key={group.key}>
                          {groupBy !== 'none' ? (
                            <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {group.label}
                            </div>
                          ) : null}
                          {group.events.map((event) => {
                            const membership = eventMembership(event, initialData.members);
                            const info = providerInfo(event.providerKey);
                            const statusLabel = eventStatus(event, membership);
                            const expanded = expandedId === event.id;
                            const sourceUrl = eventSourceUrl(event);
                            return (
                              <article key={event.id} className="border-b border-white/[0.07] last:border-b-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(expanded ? null : event.id)}
                                  className="grid w-full grid-cols-[92px_minmax(150px,220px)_minmax(0,1fr)] items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035] lg:grid-cols-[104px_minmax(180px,230px)_minmax(0,1fr)_170px_210px]"
                                >
                                  <div className="flex items-start gap-3">
                                    <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info.color }} />
                                    <div>
                                      <p className="text-xs font-bold text-blue-300">{timeOnly(event.occurredAt)}</p>
                                      <p className="text-[11px] text-slate-500">{dateOnly(event.occurredAt)}</p>
                                    </div>
                                  </div>
                                  <div className="flex min-w-0 items-center gap-3">
                                    <ProviderMark providerKey={event.providerKey} />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold text-white">{info.label}</p>
                                      <p className="truncate text-[11px] text-slate-500">{event.threadId ?? event.objectType}</p>
                                    </div>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-200">{event.content ?? event.objectId ?? 'Evidence captured without body text.'}</p>
                                    <p className="mt-1 truncate text-[11px] text-slate-500">{event.objectId ?? event.providerEventType}</p>
                                  </div>
                                  <div className="hidden min-w-0 items-center gap-2 lg:flex">
                                    <UserRound className="h-4 w-4 shrink-0 text-slate-600" />
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-bold text-slate-200">{event.actorName ?? 'Unknown actor'}</p>
                                      <p className="truncate text-[10px] text-slate-500">{event.actorEmail ?? event.actorId ?? 'Source actor'}</p>
                                    </div>
                                  </div>
                                  <div className="hidden items-center justify-end gap-2 lg:flex">
                                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone(statusLabel)}`}>
                                      {titleCase(statusLabel)}
                                    </span>
                                    <span className="rounded-full border border-blue-400/15 bg-blue-500/[0.12] px-2.5 py-1 text-[10px] font-bold text-blue-300">
                                      {Math.round(event.confidence)}%
                                    </span>
                                    {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                                  </div>
                                </button>

                                {expanded ? (
                                  <div className="grid gap-3 border-t border-white/[0.07] bg-[#020a15] px-4 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
                                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Original evidence</p>
                                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{event.content ?? 'No body text was stored for this source event.'}</p>
                                      <div className="mt-4 flex flex-wrap gap-2">
                                        {sourceUrl ? (
                                          <a
                                            href={sourceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/[0.10] px-3 py-2 text-xs font-bold text-blue-200"
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                            Open source
                                          </a>
                                        ) : (
                                          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-500">
                                            <LockKeyhole className="h-4 w-4" />
                                            Source link unavailable
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => void copyText(event.evidenceHash, 'Evidence hash')}
                                          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300"
                                        >
                                          <Fingerprint className="h-4 w-4" />
                                          Copy hash
                                        </button>
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <FlagshipMetadata label="Actor" value={[event.actorName, event.actorEmail].filter(Boolean).join(' · ') || event.actorId || 'Not captured'} />
                                      <FlagshipMetadata label="Provider event" value={event.providerEventType} />
                                      <FlagshipMetadata label="Correlation ID" value={event.correlationId} />
                                      <FlagshipMetadata label="Evidence hash" value={event.evidenceHash} />
                                      <FlagshipMetadata label="Matching reasons" value={(membership?.matchingReasons ?? event.correlationKeys ?? []).join(', ') || 'No reasons recorded'} />
                                      {eventExtraFields(event).map(([label, value]) => (
                                        <FlagshipMetadata key={label} label={label} value={value} />
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  <div ref={sentinelRef} className="mt-4 flex justify-center">
                    {page.hasMore ? (
                      <button
                        type="button"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-60"
                      >
                        {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                        Load more evidence
                      </button>
                    ) : (
                      <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-slate-500">
                        Complete evidence window loaded
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <FlagshipTabPanel
                  tab={activeTab}
                  initialData={initialData}
                  events={events}
                  providers={providers}
                  attachments={attachments}
                  related={related}
                  participants={participants}
                  confidenceReasons={confidenceReasons}
                  onProviderOpen={setProviderDrawer}
                />
              )}
            </section>

            <footer className="grid overflow-hidden rounded-2xl border border-blue-300/15 bg-[#071321]/95 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {[
                { icon: AlertTriangle, label: 'Decision Impact', value: initialData.primaryApproval?.businessImpact ?? 'Not assessed', helper: initialData.riskLevel === 'high' ? 'Review required' : 'Financial impact', color: 'text-rose-300' },
                { icon: ShieldCheck, label: 'Policy Check', value: policyStatus, helper: 'Policy analysis attached', color: 'text-emerald-300' },
                { icon: Activity, label: 'Risk Level', value: titleCase(initialData.riskLevel ?? 'low'), helper: 'Evidence-based risk', color: 'text-emerald-300' },
                { icon: Archive, label: 'Retention', value: retention, helper: 'Workspace retention', color: 'text-amber-300' },
                { icon: LockKeyhole, label: 'Evidence Locked', value: 'Yes', helper: 'Tamper-proof', color: 'text-emerald-300' },
                { icon: UserRound, label: 'Created By', value: createdBy, helper: dateTime(initialData.createdAt), color: 'text-slate-200' },
                { icon: Fingerprint, label: 'AI Model Version', value: classificationVersion, helper: 'Classification version', color: 'text-violet-300' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="min-w-0 border-b border-r border-white/[0.07] p-4 last:border-r-0 lg:border-b-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className={`mt-2 flex items-center gap-2 truncate text-sm font-black ${item.color}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.value}</span>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500">{item.helper}</p>
                  </div>
                );
              })}
            </footer>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <FlagshipSideCard title="AI Summary" action="View AI Reasoning" onAction={() => setActiveTab('analysis')}>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Powered by Playbook AI</span>
                <span>{initialData.confidence}% confidence</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                The system observed {events.length} mentions across {providers.length || initialData.sourceCount} tools and clustered them into one unified approval decision.
              </p>
              <div className="mt-4 space-y-2">
                {(confidenceReasons.length ? confidenceReasons : [
                  `Same decision: ${initialData.subject}`,
                  `Same approver: ${primaryApprover}`,
                  `Same context: ${initialData.department ?? 'workspace decision'}`,
                ]).slice(0, 5).map((reason) => (
                  <div key={reason} className="flex gap-2 text-xs leading-5 text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </FlagshipSideCard>

            <FlagshipSideCard
              title={`Source Platforms (${providers.length || initialData.sourceCount})`}
              action={providerFilter !== 'all' ? 'Clear filter' : undefined}
              onAction={providerFilter !== 'all' ? () => setProviderFilter('all') : undefined}
            >
              <div className="grid grid-cols-4 gap-2">
                {providers.length > 0 ? providers.slice(0, 12).map((provider) => (
                  <div key={provider.providerKey} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        setProviderFilter(provider.providerKey === providerFilter ? 'all' : provider.providerKey);
                        setActiveTab('timeline');
                      }}
                      title={`Filter timeline to ${providerInfo(provider.providerKey).label}`}
                      className={`w-full rounded-xl border p-2 text-center transition ${
                        providerFilter === provider.providerKey
                          ? 'border-blue-400/50 bg-blue-500/[0.14]'
                          : 'border-white/[0.08] bg-white/[0.035] hover:border-blue-300/30 hover:bg-blue-500/[0.08]'
                      }`}
                    >
                      <span className="relative inline-flex">
                        <ProviderMark providerKey={provider.providerKey} />
                        <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full border border-[#071321] bg-slate-700 px-1 text-[9px] font-black text-slate-100">
                          {provider.eventCount}
                        </span>
                      </span>
                      <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{providerInfo(provider.providerKey).label}</p>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setProviderDrawer(provider); }}
                      title="View connection health"
                      className="absolute -left-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full border border-white/20 bg-[#0a1728] text-[9px] font-black text-slate-400 group-hover:grid hover:text-blue-300"
                    >
                      i
                    </button>
                  </div>
                )) : (
                  <div className="col-span-4 rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">No source platforms reported yet.</div>
                )}
              </div>
            </FlagshipSideCard>

            <FlagshipSideCard title={`Supporting Evidence (${attachments.length})`} action="View all" onAction={() => setActiveTab('supporting')}>
              <div className="space-y-2">
                {attachments.length > 0 ? attachments.slice(0, 4).map((attachment) => (
                  <FlagshipAttachmentRow key={attachment.id} attachment={attachment} />
                )) : (
                  <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">No supporting documents are linked yet.</p>
                )}
                {attachments.length > 4 ? <p className="text-center text-xs font-semibold text-slate-500">+{attachments.length - 4} more files</p> : null}
              </div>
            </FlagshipSideCard>

            <FlagshipSideCard title={`Related Records (${related.length})`} action="View all" onAction={() => setActiveTab('related')}>
              <div className="space-y-2">
                {related.length > 0 ? related.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                    <ProviderMark providerKey={item.providerKey} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-200">{item.label}</p>
                      <p className="truncate text-[11px] text-slate-500">{titleCase(item.type)} - {providerInfo(item.providerKey).label}</p>
                    </div>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">No related records have been confirmed.</p>
                )}
              </div>
            </FlagshipSideCard>
          </aside>
        </div>

        <div className="fixed right-4 top-16 z-40 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={exportRecord} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-bold text-slate-200 shadow-xl transition hover:bg-white/[0.08]">
            <ArrowDownToLine className="h-4 w-4" /> Export
          </button>
          <button type="button" onClick={() => void copyText(window.location.href, 'Share link')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-bold text-slate-200 shadow-xl transition hover:bg-white/[0.08]">
            <Share2 className="h-4 w-4" /> Share
          </button>
          <Link href={`/audit-logs?evidence=${encodeURIComponent(initialData.id)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-[#0a1728] px-3 text-xs font-bold text-slate-200 shadow-xl transition hover:bg-white/[0.08]">
            <History className="h-4 w-4" /> Audit Log
          </Link>
          <div className="relative">
            <button type="button" onClick={() => setActionsOpen((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white shadow-xl transition hover:bg-blue-500">
              Actions <ChevronDown className="h-4 w-4" />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/10 bg-[#081525] p-2 shadow-2xl">
                <button type="button" onClick={() => void copyText(initialData.id, 'Decision ID')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/[0.06]">Copy decision ID</button>
                <button type="button" onClick={() => void copyText(evidenceHash, 'Evidence hash')} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/[0.06]">Copy evidence hash</button>
                <button type="button" onClick={() => void refreshTimeline()} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-white/[0.06]">Refresh timeline</button>
              </div>
            ) : null}
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#081525] px-4 py-2 text-xs font-bold text-slate-100 shadow-2xl">
            {toast}
          </div>
        ) : null}

        {providerDrawer ? (
          <FlagshipProviderDrawer provider={providerDrawer} onClose={() => setProviderDrawer(null)} />
        ) : null}
      </div>
    </div>
  );
}

function FlagshipMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xs leading-5 text-slate-300">{value}</p>
    </div>
  );
}

function FlagshipSideCard({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-blue-300/15 bg-[#071321]/95 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.26)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white">{title}</h2>
        {action ? (
          <button type="button" onClick={onAction} className="text-xs font-bold text-blue-300 transition hover:text-blue-200">
            {action} →
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FlagshipAttachmentRow({ attachment }: { attachment: AttachmentItem }) {
  const url = safeUrl(attachment.url);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-blue-300/15 bg-blue-500/[0.12] text-blue-300">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-slate-200">{attachment.name}</p>
        <p className="truncate text-[11px] text-slate-500">{providerInfo(attachment.providerKey).label} - {attachment.type ?? 'Evidence file'}</p>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white" aria-label={`Open ${attachment.name}`}>
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : (
        <LockKeyhole className="h-4 w-4 text-slate-600" />
      )}
    </div>
  );
}

function FlagshipTabPanel({
  tab,
  initialData,
  events,
  providers,
  attachments,
  related,
  participants,
  confidenceReasons,
  onProviderOpen,
}: {
  tab: TimelineTab;
  initialData: UnifiedEvidenceData;
  events: EvidenceEvent[];
  providers: EvidenceProvider[];
  attachments: AttachmentItem[];
  related: RelatedItem[];
  participants: Array<{ name: string; email?: string | null; role: string; events: number }>;
  confidenceReasons: string[];
  onProviderOpen: (provider: EvidenceProvider) => void;
}) {
  if (tab === 'analysis') {
    const riskRadarNode = renderRiskRadar(initialData.complianceEvaluation);
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <section className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4 lg:col-span-2">
          <h2 className="text-lg font-black text-white">Risk Radar</h2>
          <p className="mt-1 text-xs text-slate-500">
            {initialData.complianceEvaluation
              ? `Derived from the latest playbook compliance evaluation${initialData.complianceEvaluation.triggeredRule ? ` (${initialData.complianceEvaluation.triggeredRule})` : ''}.`
              : 'No playbook compliance evaluation has run for this record yet.'}
          </p>
          <div className="mt-4">
            {riskRadarNode ?? <RiskRadarEmptyState />}
          </div>
        </section>
        <section className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4">
          <h2 className="text-lg font-black text-white">AI Correlation Reasoning</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            ApprovLine clustered this decision from source evidence, matching actor, subject, department, references, and time proximity. Reasoning is derived from captured evidence only.
          </p>
          <div className="mt-4 space-y-2">
            {(confidenceReasons.length ? confidenceReasons : ['No explicit matching reasons were stored for this record.']).map((reason) => (
              <div key={reason} className="flex gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {reason}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4">
          <h2 className="text-lg font-black text-white">Confidence Breakdown</h2>
          {[
            ['Overall confidence', `${initialData.confidence}%`],
            ['Sources analyzed', String(providers.length || initialData.sourceCount)],
            ['Evidence mentions', String(events.length || initialData.evidenceCount)],
            ['Risk level', titleCase(initialData.riskLevel ?? 'Not assessed')],
            ['Verification status', titleCase(initialData.verificationStatus)],
          ].map(([label, value]) => (
            <div key={label} className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
              <span className="text-xs font-semibold text-slate-500">{label}</span>
              <span className="text-sm font-black text-slate-100">{value}</span>
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (tab === 'details') {
    return (
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Decision title', initialData.subject],
          ['Decision summary', initialData.decision ?? 'No decision summary recorded'],
          ['Outcome', titleCase(initialData.outcome ?? 'Captured')],
          ['Category', titleCase(initialData.category ?? 'Uncategorized')],
          ['Department', initialData.department ?? 'Unassigned'],
          ['Approver', initialData.approverName ?? initialData.approverEmail ?? 'Unknown'],
          ['Amount', amountText(initialData.amount, initialData.currency)],
          ['First captured', dateTime(initialData.firstSeenAt)],
          ['Last updated', dateTime(initialData.lastSeenAt)],
        ].map(([label, value]) => (
          <FlagshipMetadata key={label} label={label} value={value} />
        ))}
      </div>
    );
  }

  if (tab === 'participants') {
    return (
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {participants.length > 0 ? participants.map((person) => (
          <div key={`${person.name}-${person.email ?? person.role}`} className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-500/15 text-sm font-black text-blue-200">
                {person.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{person.name}</p>
                <p className="truncate text-xs text-slate-500">{person.email ?? person.role}</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-400">{person.events} evidence events</p>
          </div>
        )) : <EmptyPanel title="No participants captured" text="Participants will appear when source events include actor metadata." />}
      </div>
    );
  }

  if (tab === 'supporting') {
    return (
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {attachments.length > 0 ? attachments.map((attachment) => <FlagshipAttachmentRow key={attachment.id} attachment={attachment} />) : (
          <EmptyPanel title="No supporting evidence attached" text="Documents, transcripts, screenshots, contracts, and source files will appear here once linked." />
        )}
      </div>
    );
  }

  if (tab === 'related') {
    return (
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {related.length > 0 ? related.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4">
            <div className="flex items-center gap-3">
              <ProviderMark providerKey={item.providerKey} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{item.label}</p>
                <p className="truncate text-xs text-slate-500">{titleCase(item.type)} - {providerInfo(item.providerKey).label}</p>
              </div>
            </div>
          </div>
        )) : <EmptyPanel title="No related records confirmed" text="Contracts, tickets, PRs, invoices, and Memory Graph relationships will appear here when linked." />}
      </div>
    );
  }

  if (tab === 'audit') {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4">
          <h2 className="text-lg font-black text-white">Immutable Audit Trail</h2>
          <div className="mt-4 space-y-3">
            {[
              ['Record created', dateTime(initialData.createdAt), 'Unified evidence record initialized.'],
              ['Evidence locked', dateTime(initialData.updatedAt), `Hash: ${events[0]?.evidenceHash ?? initialData.id}`],
              ['Correlation version', dateTime(initialData.updatedAt), 'Current production correlation engine.'],
            ].map(([title, time, detail]) => (
              <div key={title} className="flex gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
                <CircleDot className="mt-1 h-4 w-4 shrink-0 text-blue-300" />
                <div>
                  <p className="text-sm font-bold text-white">{title}</p>
                  <p className="text-xs text-slate-500">{time}</p>
                  <p className="mt-1 text-xs text-slate-400">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <button key={provider.providerKey} type="button" onClick={() => onProviderOpen(provider)} className="rounded-xl border border-white/[0.08] bg-[#03101e] p-4 text-left transition hover:border-blue-300/30">
            <div className="flex items-center gap-3">
              <ProviderMark providerKey={provider.providerKey} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{providerInfo(provider.providerKey).label}</p>
                <p className="truncate text-xs text-slate-500">{titleCase(provider.connection?.status ?? 'Evidence received')}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-400">{provider.eventCount} events. Latest: {dateTime(provider.latestEventAt)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function FlagshipProviderDrawer({ provider, onClose }: { provider: EvidenceProvider; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#06101f] p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProviderMark providerKey={provider.providerKey} size="lg" />
            <div>
              <h2 className="text-lg font-black text-white">{providerInfo(provider.providerKey).label}</h2>
              <p className="text-xs text-slate-500">Connector diagnostics</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 grid gap-3">
          {[
            ['Connection', titleCase(provider.connection?.status ?? 'Evidence received')],
            ['Health', titleCase(provider.connection?.health?.status ?? 'Not reported')],
            ['Events in record', String(provider.eventCount)],
            ['Latest event', dateTime(provider.latestEventAt)],
            ['Latest sync', dateTime(provider.connection?.lastSyncAt)],
            ['Latency', provider.connection?.health?.latencyMs != null ? `${provider.connection.health.latencyMs}ms` : 'Not reported'],
            ['Consecutive failures', String(provider.connection?.health?.consecutiveFailures ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
              <span className="text-xs font-semibold text-slate-500">{label}</span>
              <span className="text-right text-xs font-black text-slate-200">{value}</span>
            </div>
          ))}
        </div>
        {provider.connection?.health?.lastErrorMessage ? (
          <div className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-300">Latest connector error</p>
            <p className="mt-2 text-xs leading-5 text-rose-200/70">{provider.connection.health.lastErrorMessage}</p>
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

/**
 * Extra detail rows for the expanded timeline card, sourced entirely from
 * whatever real data an event actually carries - participants/attachments/
 * links/metadata are all provider-supplied and unstructured (CanonicalEvidenceEvent
 * has no guaranteed per-platform schema), so this only ever surfaces fields
 * that are genuinely present rather than assuming every event has a
 * transcript, a participant list, or reaction data.
 */
function eventExtraFields(event: EvidenceEvent): Array<[string, string]> {
  const fields: Array<[string, string]> = [];

  const participants = arrayValue(event.participants)
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = recordValue(item);
      return [record.name, record.email].filter(Boolean).join(' ').trim();
    })
    .filter(Boolean);
  if (participants.length > 0) {
    fields.push(['Participants', participants.slice(0, 8).join(', ')]);
  }

  const attachmentNames = arrayValue(event.attachments)
    .map((item) => String(recordValue(item).name ?? recordValue(item).filename ?? recordValue(item).title ?? '').trim())
    .filter(Boolean);
  if (attachmentNames.length > 0) {
    fields.push(['Attachments', attachmentNames.slice(0, 6).join(', ')]);
  }

  const links = arrayValue(event.links)
    .map((item) => (typeof item === 'string' ? item : String(recordValue(item).url ?? recordValue(item).href ?? '')))
    .filter(Boolean);
  if (links.length > 1) {
    // The first usable link already powers the "Open source" button above -
    // only surface this when there's more than one, so it isn't redundant.
    fields.push(['Additional links', `${links.length - 1} more`]);
  }

  const metadata = recordValue(event.metadata);
  const alreadyShown = new Set(['channel', 'threadId', 'thread_id']);
  for (const [key, value] of Object.entries(metadata)) {
    if (fields.length >= 10) break;
    if (alreadyShown.has(key) || value == null || typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    fields.push([titleCase(key), text]);
  }

  return fields;
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
  accent?: boolean | string;
}) {
  const accentClass = typeof accent === 'string' ? accent : accent ? 'text-emerald-300' : 'text-slate-100';
  return (
    <div className="min-w-[88px] border-l border-white/[0.08] px-4 first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${accentClass}`}>
        {value}
      </p>
    </div>
  );
}

type RiskDimension = { label: string; score: number };

function severityToScore(severity: string): number {
  const value = severity.toLowerCase();
  if (value === 'critical') return 100;
  if (value === 'high') return 75;
  if (value === 'medium') return 45;
  return 15;
}

/**
 * Every dimension here is derived from a real ApprovalComplianceEvaluation
 * field (services/playbooks.ts's evaluateApprovalCompliance) - nothing is
 * invented. Returns null when there's no evaluation to derive from (records
 * with no linked ApprovalRecord, or one that hasn't been evaluated yet) so
 * the caller can show an honest empty state instead of a zeroed chart that
 * would misleadingly read as "no risk."
 */
function riskDimensionsFromEvaluation(evaluation: ComplianceEvaluation | null | undefined): RiskDimension[] | null {
  if (!evaluation) return null;
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  return [
    { label: 'Compliance Risk', score: clamp(100 - evaluation.score) },
    { label: 'Authorization Risk', score: clamp(evaluation.missingApprovers.length * 30) },
    { label: 'Process Risk', score: clamp((evaluation.missingDepartments.length + evaluation.missingEscalationSteps.length) * 20) },
    { label: 'Documentation Risk', score: clamp(evaluation.missingEvidence.length * 25) },
    { label: 'Financial Risk', score: severityToScore(evaluation.severity) },
  ];
}

function RiskRadarChart({ dimensions }: { dimensions: RiskDimension[] }) {
  const size = 240;
  const center = size / 2;
  const radius = center - 46;
  const angleStep = (Math.PI * 2) / dimensions.length;
  const startAngle = -Math.PI / 2;

  const pointFor = (index: number, ratio: number) => {
    const angle = startAngle + angleStep * index;
    return { x: center + radius * ratio * Math.cos(angle), y: center + radius * ratio * Math.sin(angle) };
  };

  const overallScore = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length);
  const color = overallScore >= 67 ? '#ef4444' : overallScore >= 34 ? '#f59e0b' : '#10b981';
  const tone = overallScore >= 67 ? 'text-rose-300' : overallScore >= 34 ? 'text-amber-300' : 'text-emerald-300';

  const dataPoints = dimensions.map((dimension, index) => pointFor(index, dimension.score / 100));
  const dataPath = `${dataPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-60 w-60 shrink-0">
        {[0.25, 0.5, 0.75, 1].map((level) => {
          const ringPoints = dimensions.map((_, index) => pointFor(index, level));
          const ringPath = `${ringPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
          return <path key={level} d={ringPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
        })}
        {dimensions.map((_, index) => {
          const point = pointFor(index, 1);
          return <line key={index} x1={center} y1={center} x2={point.x} y2={point.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
        })}
        <path d={dataPath} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {dataPoints.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={3.5} fill={color} />
        ))}
        {dimensions.map((dimension, index) => {
          const labelPoint = pointFor(index, 1.26);
          return (
            <text
              key={dimension.label}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94a3b8"
              style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}
            >
              {dimension.label.replace(' Risk', '')}
            </text>
          );
        })}
      </svg>
      <div className="w-full space-y-2">
        <p className={`text-sm font-black ${tone}`}>Overall risk score: {overallScore} / 100</p>
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2">
            <span className="text-xs font-semibold text-slate-400">{dimension.label}</span>
            <span className="text-xs font-black text-slate-200">{dimension.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskRadarEmptyState() {
  const size = 200;
  const center = size / 2;
  const radius = center - 30;
  const sides = 5;
  const angleStep = (Math.PI * 2) / sides;
  const startAngle = -Math.PI / 2;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + angleStep * index;
    return `${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 opacity-40" aria-hidden="true">
        <polygon points={points} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="4 4" />
      </svg>
      <div>
        <h3 className="text-sm font-bold text-slate-200">Risk analysis not yet available for this record</h3>
        <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
          Upload playbooks and run Evaluate Approvals to score this decision&apos;s compliance and risk profile.
        </p>
      </div>
    </div>
  );
}

/**
 * Isolates risk-dimension derivation and chart rendering behind a plain
 * try/catch (both are hook-free pure functions, safe to call directly
 * rather than via JSX) so a bad evaluation shape or a chart-math edge case
 * degrades to the empty state instead of taking the whole AI Analysis tab
 * down - logged so it's debuggable rather than silently swallowed.
 */
function renderRiskRadar(evaluation: ComplianceEvaluation | null | undefined): ReactNode {
  try {
    const dimensions = riskDimensionsFromEvaluation(evaluation);
    if (!dimensions) return null;
    return RiskRadarChart({ dimensions });
  } catch (error) {
    console.error('[evidence] risk radar rendering failed', error);
    return null;
  }
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

export function LegacyUnifiedEvidenceExperience({ initialData }: { initialData: UnifiedEvidenceData }) {
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
          ].map(([label, value]) => (
            <div key={label} className="bg-[#06101f] p-4">
              <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{label}</dt>
              <dd className="mt-2 break-words text-sm font-semibold text-slate-200">{value}</dd>
            </div>
          ))}
          <div className="bg-[#06101f] p-4">
            <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Primary approval</dt>
            <dd className="mt-2 break-words text-sm font-semibold">
              {initialData.primaryApproval ? (
                <PendingLink href={`/approvals/${initialData.primaryApproval.id}`} pendingText="Opening approval..." className="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200">
                  {initialData.primaryApproval.id}
                </PendingLink>
              ) : (
                <span className="text-slate-200">Not linked</span>
              )}
            </dd>
          </div>
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
                    <PendingLink href={`/approvals/${initialData.primaryApproval.id}`} pendingText="Opening approval..." className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/[0.05]"><ClipboardCheck className="h-3.5 w-3.5" /> View full approval</PendingLink>
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
