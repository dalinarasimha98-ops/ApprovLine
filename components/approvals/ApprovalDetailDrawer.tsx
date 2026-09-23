'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { DetailDrawer } from '@/components/dashboard/DetailDrawer';
import { PendingLink } from '@/components/system/PendingLink';

export type ApprovalDetail = {
  approval: {
    id: string;
    subject: string;
    status: string;
    approvalType: string;
    confidence: number;
    riskLevel: string | null;
    department: string | null;
    category: string | null;
    approverName: string | null;
    approverEmail: string | null;
    reasoning: string;
    conditions: string | null;
    businessImpact: string | null;
    evidenceSnippet: string | null;
    sourcePlatform: string | null;
    sourceUrl: string | null;
    sourcePagePath: string;
    approvalTimestamp: string;
    createdAt: string;
  };
  messageSource: {
    provider: string;
    channel: string | null;
    sender: string | null;
    senderEmail: string | null;
    receivedAt: string | null;
  } | null;
  manual: {
    kind: 'VERBAL' | 'MANUAL';
    approverRole: string;
    communicationChannel: string;
    location: string | null;
    businessContext: string;
    verificationStatus: string;
    confidenceLevel: number;
    secondPersonRequired: boolean;
    secondVerifiedAt: string | null;
    secondVerificationNote: string | null;
    recorder: { name: string | null; email: string } | null;
    secondVerifier: { name: string | null; email: string } | null;
    evidenceCount: number;
    versionCount: number;
    confirmationCount: number;
  } | null;
  unifiedEvidenceId: string | null;
  activity: Array<{ id: string; action: string | null; createdAt: string }>;
  related: {
    investigations: Array<{ id: string; title: string; status: string | null }>;
    memoryEntityId: string | null;
    complianceEvaluationCount: number;
  };
  canManage: boolean;
  fullPageUrl: string;
};

type TabKey = 'overview' | 'evidence' | 'activity' | 'related';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'activity', label: 'Activity' },
  { key: 'related', label: 'Related' },
];

function riskClass(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (risk === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function statusClass(status: string) {
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'PENDING_REVIEW') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function priorityLabel(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'High';
  if (risk === 'medium') return 'Medium';
  return 'Low';
}

function dateText(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm font-semibold text-slate-500">
      {children}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="grid gap-3 p-5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export type ApprovalDetailDrawerProps = {
  approvalId: string | null;
  onClose: () => void;
};

export function ApprovalDetailDrawer({ approvalId, onClose }: ApprovalDetailDrawerProps) {
  const [data, setData] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const requestIdRef = useRef(0);

  const load = useCallback((id: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setReference(null);
    fetch(`/api/approvals/${id}/detail`)
      .then(async (response) => {
        if (requestIdRef.current !== requestId) return;
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setError((payload && typeof payload.error === 'string' ? payload.error : null) ?? 'This approval could not be loaded.');
          setReference(payload?.reference ?? null);
          setData(null);
          return;
        }
        setData(payload as ApprovalDetail);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setError('This approval could not be loaded. Check your connection and retry.');
        setData(null);
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!approvalId) {
      setData(null);
      setError(null);
      setActiveTab('overview');
      return;
    }
    setActiveTab('overview');
    load(approvalId);
  }, [approvalId, load]);

  const titleId = 'approval-detail-drawer-title';

  return (
    <DetailDrawer open={approvalId !== null} onClose={onClose} titleId={titleId} size="lg" className="bg-slate-50">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="mb-2 text-xs font-bold text-slate-500 hover:text-slate-700"
          >
            ← Back to Approvals
          </button>
          {data ? (
            <>
              <h2 id={titleId} className="truncate text-lg font-black leading-snug text-slate-950">
                {data.approval.subject}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(data.approval.status)}`}>
                  {data.approval.status.replaceAll('_', ' ')}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${riskClass(data.approval.riskLevel)}`}>
                  {priorityLabel(data.approval.riskLevel)} priority
                </span>
                {data.approval.sourcePlatform ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold capitalize text-blue-700">
                    {data.approval.sourcePlatform}
                  </span>
                ) : null}
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  #{data.approval.id.slice(-8)}
                </span>
              </div>
            </>
          ) : (
            <h2 id={titleId} className="text-lg font-black text-slate-950">
              {loading ? 'Loading approval…' : 'Approval detail'}
            </h2>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close approval detail"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <DrawerSkeleton />
      ) : error ? (
        <div className="p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">Approval couldn&apos;t be loaded</h3>
            <p className="mt-1 text-sm text-amber-800">{error}</p>
            {reference ? <p className="mt-2 text-xs font-semibold text-amber-700">Reference: {reference}</p> : null}
            <button
              type="button"
              onClick={() => approvalId && load(approvalId)}
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-500"
            >
              Retry
            </button>
          </div>
        </div>
      ) : data ? (
        <ApprovalDetailDrawerBody data={data} activeTab={activeTab} onTabChange={setActiveTab} />
      ) : null}
    </DetailDrawer>
  );
}

/**
 * Pure, presentational half of the drawer - everything rendered once detail
 * data has actually loaded. Split out from ApprovalDetailDrawer (which owns
 * fetch/loading/error state) specifically so it can be exercised directly by
 * a real, executed render test (tests/approval-detail-drawer-render.test.ts)
 * with hand-built fixtures for every "optional relation absent" case (no
 * evidence, no source URL, no manual detail, no activity, no related
 * records) - renderToStaticMarkup never runs effects, so the stateful
 * fetch-driven component above can only ever be tested in its pre-fetch
 * (loading) state. This is the same reasoning ManualApprovalPanel's own
 * regression test (tests/approval-detail-render.test.ts) is built on.
 */
export function ApprovalDetailDrawerBody({
  data,
  activeTab,
  onTabChange,
}: {
  data: ApprovalDetail;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <>
      {/* Tabs */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4" role="tablist" aria-label="Approval sections">
        {TABS.map(({ key, label }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`drawer-tabpanel-${key}`}
                  id={`drawer-tab-${key}`}
                  onClick={() => onTabChange(key)}
                  className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-bold ${
                    isActive ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === 'overview' ? (
              <div id="drawer-tabpanel-overview" role="tabpanel" aria-labelledby="drawer-tab-overview" className="grid gap-5 p-5">
                <section>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Approval Information</h3>
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <LabelValue label="Description" value={data.approval.reasoning} />
                    <LabelValue label="Type" value={data.approval.approvalType.replaceAll('_', ' ')} />
                    <LabelValue label="Status" value={data.approval.status.replaceAll('_', ' ')} />
                    <LabelValue label="Priority" value={priorityLabel(data.approval.riskLevel)} />
                    <LabelValue label="Category" value={data.approval.category ?? 'Unassigned'} />
                    <LabelValue label="Department" value={data.approval.department ?? 'Unassigned'} />
                    <LabelValue label="Requested" value={dateText(data.approval.approvalTimestamp)} />
                    <LabelValue label="Confidence" value={`${data.approval.confidence}%`} />
                  </dl>
                  {data.approval.conditions ? (
                    <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="font-bold text-slate-900">Conditions: </span>
                      {data.approval.conditions}
                    </p>
                  ) : null}
                  {data.approval.businessImpact ? (
                    <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="font-bold text-slate-900">Business impact: </span>
                      {data.approval.businessImpact}
                    </p>
                  ) : null}
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Requester</h3>
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <LabelValue label="Name" value={data.approval.approverName ?? 'Not recorded'} />
                    <LabelValue label="Email" value={data.approval.approverEmail ?? 'Not recorded'} />
                  </dl>
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Requested For / Approver</h3>
                  {data.manual ? (
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <LabelValue label="Role" value={data.manual.approverRole} />
                      <LabelValue
                        label="Recorder"
                        value={data.manual.recorder?.name ?? data.manual.recorder?.email ?? 'Unknown recorder'}
                      />
                    </dl>
                  ) : (
                    <EmptyNote>Not assigned</EmptyNote>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Source Information</h3>
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <LabelValue label="Provider" value={data.messageSource?.provider ?? data.approval.sourcePlatform ?? 'Unknown'} />
                    <LabelValue label="Channel" value={data.messageSource?.channel ?? 'Not recorded'} />
                    <LabelValue label="Sender" value={data.messageSource?.sender ?? data.approval.approverName ?? 'Unknown'} />
                    <LabelValue label="Source date" value={dateText(data.messageSource?.receivedAt ?? data.approval.approvalTimestamp)} />
                  </dl>
                  {data.approval.sourceUrl ? (
                    <a
                      href={data.approval.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-500"
                    >
                      Open source <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <PendingLink
                      href={data.approval.sourcePagePath}
                      pendingText="Opening…"
                      className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      View captured source <ExternalLink className="h-3.5 w-3.5" />
                    </PendingLink>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === 'evidence' ? (
              <div id="drawer-tabpanel-evidence" role="tabpanel" aria-labelledby="drawer-tab-evidence" className="grid gap-4 p-5">
                {data.unifiedEvidenceId ? (
                  <PendingLink
                    href={`/evidence/${data.unifiedEvidenceId}`}
                    pendingText="Opening…"
                    className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-700 hover:bg-violet-100"
                  >
                    View correlated Unified Evidence record
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </PendingLink>
                ) : null}
                {data.approval.evidenceSnippet ? (
                  <blockquote className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                    &ldquo;{data.approval.evidenceSnippet}&rdquo;
                  </blockquote>
                ) : (
                  <EmptyNote>Evidence not available yet.</EmptyNote>
                )}
                {data.manual ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                    <p className="font-bold text-slate-900">Manual approval evidence</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {data.manual.evidenceCount} linked source{data.manual.evidenceCount === 1 ? '' : 's'} ·{' '}
                      {data.manual.versionCount} version{data.manual.versionCount === 1 ? '' : 's'} ·{' '}
                      {data.manual.confirmationCount} confirmation{data.manual.confirmationCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'activity' ? (
              <div id="drawer-tabpanel-activity" role="tabpanel" aria-labelledby="drawer-tab-activity" className="p-5">
                {data.activity.length === 0 ? (
                  <EmptyNote>No activity recorded yet.</EmptyNote>
                ) : (
                  <ol className="grid gap-2">
                    {data.activity.map((event) => (
                      <li key={event.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{event.action?.replaceAll('_', ' ') ?? 'Event'}</p>
                          <time className="text-xs text-slate-500">{dateText(event.createdAt)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            {activeTab === 'related' ? (
              <div id="drawer-tabpanel-related" role="tabpanel" aria-labelledby="drawer-tab-related" className="grid gap-4 p-5">
                {data.related.investigations.length > 0 ? (
                  <div>
                    <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Investigations</h3>
                    <div className="grid gap-2">
                      {data.related.investigations.map((investigation) => (
                        <PendingLink
                          key={investigation.id}
                          href={`/investigations/${investigation.id}`}
                          pendingText="Opening…"
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                        >
                          {investigation.title}
                          <span className="text-xs font-semibold text-slate-500">{investigation.status?.replaceAll('_', ' ')}</span>
                        </PendingLink>
                      ))}
                    </div>
                  </div>
                ) : null}
                {data.related.memoryEntityId ? (
                  <PendingLink
                    href={`/memory/${data.related.memoryEntityId}`}
                    pendingText="Opening…"
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    View related Memory Graph entity
                  </PendingLink>
                ) : null}
                {data.related.investigations.length === 0 && !data.related.memoryEntityId ? (
                  <EmptyNote>No related items.</EmptyNote>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4">
            <PendingLink
              href={data.fullPageUrl}
              pendingText="Opening full approval…"
              className="flex h-10 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500"
            >
              Open full approval details
            </PendingLink>
          </div>
    </>
  );
}
