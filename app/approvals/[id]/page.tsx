import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { ApprovalActions } from '@/components/approvals/ApprovalActions';
import { CopyEvidenceLinkButton } from '@/components/approvals/CopyEvidenceLinkButton';
import { EvidenceMessageCard } from '@/components/approvals/EvidenceMessageCard';
import { EvidenceThread, parseThreadPayload, type EvidenceThreadPayload } from '@/components/approvals/EvidenceThread';
import { ManualApprovalPanel } from '@/components/approvals/ManualApprovalPanel';
import { ApprovalDetailWorkspace, isTabKey, type TabKey } from '@/components/approvals/ApprovalDetailWorkspace';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PendingLink } from '@/components/system/PendingLink';
import { getDashboardTenant } from '@/lib/auth';
import { getSafeEvidenceUrl } from '@/lib/evidence-links';
import { reportApprovalFailure } from '@/lib/approval-observability';
import { canManageManualApprovals } from '@/services/manual-approvals';
import {
  getApprovalAuditTrail,
  getApprovalClassifierResults,
  getApprovalComplianceEvaluations,
  getApprovalCore,
  getApprovalManualBundle,
  getApprovalRelatedRecords,
  getContextApprovals,
  type ApprovalCore,
  type ContextApproval,
} from '@/services/approvalDetail';
import { getUnifiedEvidenceIdForApproval } from '@/services/evidence/records';

export const dynamic = 'force-dynamic';

// ── Utilities ──────────────────────────────────────────────────────────────

function evidenceExcerpt(value: unknown): string {
  const preferredKeys = ['text', 'message', 'content', 'body', 'snippet', 'subject', 'description', 'title'];
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(evidenceExcerpt).filter(Boolean).join(' ').trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const candidate = evidenceExcerpt(record[key]);
    if (candidate) return candidate;
  }
  return '';
}

function dateText(value: Date | null | undefined) {
  return value ? value.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
}

function riskBadge(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
  if (risk === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
}

function statusBadge(status: string) {
  if (status === 'APPROVED') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (status === 'REJECTED') return 'border-rose-500/30 bg-rose-500/10 text-rose-400';
  if (status === 'PENDING_REVIEW') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  return 'border-[#1E2D4A] bg-[#0E1830] text-[#A8BAD8]';
}

function statusDot(status: string) {
  if (status === 'APPROVED') return 'bg-emerald-400';
  if (status === 'REJECTED') return 'bg-rose-400';
  if (status === 'PENDING_REVIEW') return 'bg-amber-400';
  return 'bg-[#3D5070]';
}

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Error states ───────────────────────────────────────────────────────────

function ApprovalLoadError({ id, correlationId }: { id: string; correlationId: string }) {
  return (
    <DashboardShell>
      <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Temporarily unavailable</p>
        <h2 className="mt-2 text-2xl font-bold text-[#E8EEFF]">We could not load this approval</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#A8BAD8]">
          The approval exists in your workspace, but its evidence lookup did not complete in time. Retry without losing your place.
        </p>
        <p className="mt-3 text-xs font-semibold text-[#6B7FA8]">Reference: {correlationId}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PendingLink href={`/approvals/${id}`} pendingText="Retrying..." className="inline-flex h-10 items-center rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500">
            Retry approval
          </PendingLink>
          <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="inline-flex h-10 items-center rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-5 text-sm font-bold text-[#A8BAD8] hover:bg-[#0a1524]">
            Back to approvals
          </PendingLink>
        </div>
      </section>
    </DashboardShell>
  );
}

function SectionError({ approvalId, title, message, correlationId }: { approvalId: string; title: string; message: string; correlationId: string }) {
  return (
    <div className="m-6 rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-400">{title}</p>
      <p className="mt-2 text-sm text-amber-300">{message}</p>
      <p className="mt-2 text-xs text-amber-500/80">Ref: {correlationId}</p>
      <PendingLink href={`/approvals/${approvalId}`} pendingText="Retrying..." className="mt-4 inline-flex h-8 items-center rounded-lg border border-amber-500/20 px-4 text-xs font-bold text-amber-400 hover:bg-amber-500/10">
        Retry
      </PendingLink>
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────

function ContextListSkeleton() {
  return (
    <div className="grid gap-1 px-2">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-[#0E1830]" />
      ))}
    </div>
  );
}

function TabSkeleton() {
  return (
    <div className="grid gap-4 p-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-[#0E1830]" />
      ))}
    </div>
  );
}

// ── Metric tile ────────────────────────────────────────────────────────────

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">{label}</p>
      <p className="mt-2 break-all text-sm font-bold text-[#E8EEFF]">{value}</p>
    </div>
  );
}

// ── Left panel: approval context list ─────────────────────────────────────

async function ApprovalContextList({ organizationId, currentId }: { organizationId: string; currentId: string }) {
  let approvals: ContextApproval[];
  try {
    approvals = await getContextApprovals(organizationId, currentId);
  } catch {
    return <p className="px-3 py-2 text-xs text-[#6B7FA8]">Could not load list</p>;
  }
  if (approvals.length === 0) {
    return <p className="px-3 py-2 text-xs text-[#6B7FA8]">No other approvals yet</p>;
  }
  return (
    <div className="grid gap-0.5">
      {approvals.map((approval) => (
        <PendingLink
          key={approval.id}
          href={`/approvals/${approval.id}`}
          pendingText="Opening..."
          className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[#0E1830] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-[#A8BAD8]">{approval.subject}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(approval.status)}`} aria-hidden="true" />
            <span className="truncate text-[10px] font-medium text-[#6B7FA8]">
              {approval.approverName ?? approval.sourcePlatform ?? 'Unknown'} · {timeAgo(approval.createdAt)}
            </span>
          </div>
        </PendingLink>
      ))}
    </div>
  );
}

// ── Approval header ────────────────────────────────────────────────────────

function ApprovalHeader({ core }: { core: ApprovalCore }) {
  return (
    <div className="shrink-0 border-b border-[#1E2D4A] bg-[#07111f]">
      <div className="px-6 pb-5 pt-5">
        {/* Mobile breadcrumb — left panel handles desktop navigation */}
        <div className="mb-4 flex items-center gap-1.5 xl:hidden">
          <PendingLink href="/dashboard/approvals" pendingText="Opening approvals..." className="text-xs font-semibold text-[#6B7FA8] hover:text-[#A8BAD8]">
            Approvals
          </PendingLink>
          <ChevronRight className="h-3 w-3 text-[#3D5070]" aria-hidden="true" />
          <span className="truncate text-xs font-semibold text-[#A8BAD8]">Approval Detail</span>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">
              {core.sourcePlatform ?? core.messageSource?.provider ?? 'Approval'} · Approval Record
            </p>
            <h2 className="text-xl font-bold leading-snug text-[#E8EEFF] sm:text-2xl">{core.subject}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${riskBadge(core.riskLevel)}`}>
                {core.riskLevel ?? 'low'} risk
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadge(core.status)}`}>
                {core.status.replaceAll('_', ' ')}
              </span>
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-400">
                {core.confidence}% confidence
              </span>
              {core.sourceLink?.includes('demo') || core.sourceLink?.includes('TDEMO') ? (
                <span className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-3 py-1 text-xs font-bold text-[#6B7FA8]">
                  Demo data
                </span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">
            <ApprovalActions approvalId={core.id} subject={core.subject} />
          </div>
        </div>

        {core.status === 'PENDING_REVIEW' ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-300">Analyzing approval...</p>
              <p className="text-xs text-amber-500">Classification is still processing. Refresh for the latest result.</p>
            </div>
            <PendingLink href={`/approvals/${core.id}`} pendingText="Refreshing..." className="shrink-0 rounded-lg border border-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/10">
              Refresh
            </PendingLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Right panel ────────────────────────────────────────────────────────────

function RightPanel({ core }: { core: ApprovalCore }) {
  const confidencePct = Math.min(100, Math.max(0, core.confidence));

  return (
    <>
      <div className="border-b border-[#1E2D4A] px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D5070]">Context</p>
        <p className="mt-0.5 text-sm font-bold text-[#E8EEFF]">Approval Details</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-4 p-5">
          {/* Confidence */}
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">AI Confidence</p>
              <span className="text-lg font-black text-violet-400">{confidencePct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1E2D4A]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all"
                style={{ width: `${confidencePct}%` }}
              />
            </div>
          </div>

          {/* Risk level */}
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">Risk Level</p>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold capitalize ${riskBadge(core.riskLevel)}`}>
              {core.riskLevel ?? 'low'}
            </span>
          </div>

          {/* Source info */}
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">Source</p>
            <dl className="grid gap-2.5">
              {([
                ['Platform', core.sourcePlatform ?? core.messageSource?.provider ?? 'Unknown'],
                ['Channel', core.messageSource?.channel ?? 'Unknown'],
                ['Sender', core.approverName ?? core.messageSource?.sender ?? 'Unknown'],
                ['Received', dateText(core.messageSource?.receivedAt ?? core.occurredAt ?? core.createdAt)],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-[10px] font-semibold text-[#6B7FA8]">{label}</dt>
                  <dd className="truncate text-xs font-semibold text-[#A8BAD8]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Quick links */}
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#6B7FA8]">Quick Links</p>
            <div className="grid gap-2">
              <PendingLink
                href={`/approvals/${core.id}/source`}
                pendingText="Opening source..."
                className="flex items-center justify-between gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-400 transition hover:bg-violet-500/20"
              >
                <span>Open Source</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </PendingLink>
              <PendingLink
                href={`/investigations?approvalId=${core.id}`}
                pendingText="Opening investigations..."
                className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 py-2 text-xs font-bold text-[#A8BAD8] transition hover:bg-[#0a1524]"
              >
                <span>Investigate</span>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </PendingLink>
              <PendingLink
                href={`/copilot?approvalId=${core.id}`}
                pendingText="Opening copilot..."
                className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 py-2 text-xs font-bold text-[#A8BAD8] transition hover:bg-[#0a1524]"
              >
                <span>Ask AI Copilot</span>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </PendingLink>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Unified evidence banner ────────────────────────────────────────────────

async function UnifiedEvidenceLinkBanner({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  let unifiedEvidenceId: string | null;
  try {
    unifiedEvidenceId = await getUnifiedEvidenceIdForApproval(organizationId, approvalId);
  } catch {
    return null;
  }
  if (!unifiedEvidenceId) return null;

  return (
    <PendingLink
      href={`/evidence/${unifiedEvidenceId}`}
      pendingText="Opening unified evidence..."
      className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-blue-500/10 p-5 transition hover:border-violet-500/30"
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Correlated across sources</p>
        <p className="mt-1 text-sm font-bold text-[#E8EEFF]">This decision has a Unified Evidence record</p>
        <p className="mt-0.5 text-xs text-[#A8BAD8]">See every correlated source, mention, and confidence score in one place.</p>
      </div>
      <span className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white">
        View →
      </span>
    </PendingLink>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({
  core,
  organizationId,
  canManage,
  currentUserId,
  currentUserRole,
}: {
  core: ApprovalCore;
  organizationId: string;
  canManage: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  return (
    <div className="grid gap-8 p-6">
      {core.manualDetail ? (
        <Suspense fallback={<TabSkeleton />}>
          <ManualApprovalSection
            organizationId={organizationId}
            core={core}
            canManage={canManage}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
          />
        </Suspense>
      ) : null}

      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Decision Metadata</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <MetricTile label="Approval ID" value={core.id} />
          <MetricTile label="Approver" value={core.approverName ?? 'Unknown'} />
          <MetricTile label="Department" value={core.department ?? 'Unassigned'} />
          <MetricTile label="Source Platform" value={core.sourcePlatform ?? core.messageSource?.provider ?? 'Unknown'} />
          <MetricTile label="Category" value={core.category ?? 'Unassigned'} />
          <MetricTile label="Approval Type" value={core.approvalType.replaceAll('_', ' ')} />
          <MetricTile label="Approval Timestamp" value={dateText(core.approvalTimestamp ?? core.occurredAt)} />
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Message Source</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {([
              ['Provider', core.messageSource?.provider ?? core.sourcePlatform ?? 'Unknown'],
              ['Channel', core.messageSource?.channel ?? 'Not recorded'],
              ['Sender', core.messageSource?.sender ?? core.approverName ?? 'Unknown'],
              ['Sender Email', core.messageSource?.senderEmail ?? core.approverEmail ?? 'Not recorded'],
              ['Received At', dateText(core.messageSource?.receivedAt)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 rounded-lg bg-[#0a1524] px-3 py-2.5">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7FA8]">{label}</dt>
                <dd className="text-sm font-semibold text-[#A8BAD8]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

// ── Tab: Evidence ──────────────────────────────────────────────────────────

function EvidenceTab({
  core,
  threadPayload,
  externalUrl,
  organizationId,
}: {
  core: ApprovalCore;
  threadPayload: EvidenceThreadPayload | null;
  externalUrl: string | null | undefined;
  organizationId: string;
}) {
  return (
    <div className="grid gap-8 p-6">
      <Suspense fallback={null}>
        <UnifiedEvidenceLinkBanner organizationId={organizationId} approvalId={core.id} />
      </Suspense>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">AI Reasoning</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
          <div className="grid gap-4 text-sm leading-relaxed text-[#A8BAD8]">
            <p>
              <span className="font-bold text-[#E8EEFF]">Reasoning: </span>
              {core.reasoning}
            </p>
            {core.conditions ? (
              <p>
                <span className="font-bold text-[#E8EEFF]">Conditions: </span>
                {core.conditions}
              </p>
            ) : null}
            {core.businessImpact ? (
              <p>
                <span className="font-bold text-[#E8EEFF]">Business impact: </span>
                {core.businessImpact}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Source Evidence</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        {threadPayload ? (
          <EvidenceThread
            payload={threadPayload}
            platform={core.sourcePlatform ?? core.messageSource?.provider}
            participantCount={new Set(threadPayload.threadMessages.map((m) => m.senderName)).size}
            sourceUrl={externalUrl}
            evidenceLinkPath={`/approvals/${core.id}/source`}
          />
        ) : core.evidenceSnippet || core.approverName ? (
          <EvidenceMessageCard
            platform={core.sourcePlatform ?? core.messageSource?.provider}
            senderName={core.approverName ?? core.messageSource?.sender ?? 'Unknown approver'}
            senderEmail={core.approverEmail ?? core.messageSource?.senderEmail}
            timestamp={dateText(core.approvalTimestamp ?? core.occurredAt)}
            content={core.evidenceSnippet}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-[#1E2D4A] p-8 text-center">
            <p className="text-sm font-semibold text-[#6B7FA8]">No evidence snippet captured yet</p>
          </div>
        )}
      </section>

      {core.messageSource?.rawPayload ? (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Raw Payload</p>
            <span className="h-px flex-1 bg-[#1E2D4A]" />
          </div>
          <details className="rounded-xl border border-[#1E2D4A] bg-[#07111f]">
            <summary className="cursor-pointer px-5 py-4 text-xs font-bold uppercase tracking-wide text-[#6B7FA8] hover:text-[#A8BAD8]">
              View captured payload
            </summary>
            <pre className="max-h-80 overflow-auto border-t border-[#1E2D4A] p-5 text-xs leading-5 text-[#A8BAD8]">
              {JSON.stringify(core.messageSource.rawPayload, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <PendingLink
          href={`/approvals/${core.id}/source`}
          pendingText="Opening source..."
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500"
        >
          Open Source
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </PendingLink>
        <CopyEvidenceLinkButton
          path={`/approvals/${core.id}/source`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-5 text-sm font-bold text-[#A8BAD8] hover:bg-[#0a1524]"
        />
      </div>
    </div>
  );
}

// ── Tab: Timeline ──────────────────────────────────────────────────────────

async function TimelineTab({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  try {
    const auditLogs = await getApprovalAuditTrail(organizationId, approvalId);
    const sorted = [...auditLogs].sort((a, b) =>
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
    );

    return (
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Timeline</p>
            <span className="h-px w-8 bg-[#1E2D4A]" />
          </div>
          <span className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-2.5 py-1 text-[10px] font-bold text-[#6B7FA8]">
            {sorted.length} events
          </span>
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1E2D4A] p-10 text-center">
            <p className="text-sm font-semibold text-[#6B7FA8]">No timeline events recorded yet</p>
            <p className="mt-1 text-xs text-[#3D5070]">Events appear here as the approval is processed</p>
          </div>
        ) : (
          <div className="relative ml-3">
            <div className="absolute inset-y-0 left-0 w-px bg-[#1E2D4A]" aria-hidden="true" />
            <div className="grid gap-5">
              {sorted.map((event) => (
                <div key={event.id} className="relative pl-7">
                  <div
                    className="absolute -left-[4.5px] top-[6px] h-2.5 w-2.5 rounded-full border-2 border-violet-500/40 bg-[#030b18] ring-2 ring-[#030b18]"
                    aria-hidden="true"
                  />
                  <div className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[#E8EEFF]">{event.action.replaceAll('_', ' ')}</p>
                      <time className="text-xs font-medium text-[#6B7FA8]" dateTime={event.createdAt?.toISOString() ?? ''}>
                        {dateText(event.createdAt)}
                      </time>
                    </div>
                    {event.metadata ? (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#07111f] p-3 text-xs text-[#6B7FA8]">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'timeline_lookup', approvalId, organizationId });
    return <SectionError approvalId={approvalId} title="Timeline unavailable" message="Audit events did not load in time." correlationId={correlationId} />;
  }
}

// ── Tab: AI Analysis ───────────────────────────────────────────────────────

async function AIAnalysisTab({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  let results;
  try {
    results = await getApprovalClassifierResults(organizationId, approvalId);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'classifier_lookup', approvalId, organizationId });
    return <SectionError approvalId={approvalId} title="AI analysis unavailable" message="Classification history did not load in time." correlationId={correlationId} />;
  }

  return (
    <div className="grid gap-8 p-6">
      <div className="flex items-center gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">AI Classification History</p>
        <span className="h-px flex-1 bg-[#1E2D4A]" />
        <span className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-2.5 py-1 text-[10px] font-bold text-[#6B7FA8]">
          {results.length} run{results.length !== 1 ? 's' : ''}
        </span>
      </div>
      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1E2D4A] p-10 text-center">
          <p className="text-sm font-semibold text-[#6B7FA8]">No classifier snapshots attached</p>
          <p className="mt-1 text-xs text-[#3D5070]">AI analysis results appear here after the pipeline processes this approval</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {results.map((result) => (
            <div key={result.id} className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#E8EEFF]">{result.model}</p>
                  <p className="mt-0.5 text-xs text-[#6B7FA8]">
                    Prompt v{result.promptVersion} · {dateText(result.createdAt)}
                  </p>
                </div>
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-sm font-black text-violet-400">
                  {result.confidence}%
                </span>
              </div>
              <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-[#07111f] p-4 text-xs leading-5 text-[#A8BAD8]">
                {JSON.stringify(result.normalizedJson, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Related Records ───────────────────────────────────────────────────

async function RelatedTab({
  organizationId,
  approvalId,
  subject,
}: {
  organizationId: string;
  approvalId: string;
  subject: string;
}) {
  let related: Awaited<ReturnType<typeof getApprovalRelatedRecords>>;
  let evaluations: Awaited<ReturnType<typeof getApprovalComplianceEvaluations>>;
  try {
    [related, evaluations] = await Promise.all([
      getApprovalRelatedRecords(organizationId, approvalId, subject),
      getApprovalComplianceEvaluations(organizationId, approvalId),
    ]);
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'related_records_lookup', approvalId, organizationId });
    return <SectionError approvalId={approvalId} title="Related records unavailable" message="Investigations and compliance data did not load in time." correlationId={correlationId} />;
  }

  const { investigations, memoryEntity } = related;

  return (
    <div className="grid gap-8 p-6">
      {/* Compliance */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Playbook Compliance</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
          <span className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-2.5 py-1 text-[10px] font-bold text-[#6B7FA8]">
            {evaluations.length} evaluation{evaluations.length !== 1 ? 's' : ''}
          </span>
        </div>
        {evaluations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1E2D4A] p-6 text-center">
            <p className="text-sm font-semibold text-[#6B7FA8]">No compliance evaluations yet</p>
            <p className="mt-1 text-xs text-[#3D5070]">Upload playbooks and run Evaluate Approvals to see results here</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {evaluations.map((evaluation) => (
              <div key={evaluation.id} className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold text-[#E8EEFF]">{evaluation.status}</p>
                  <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-black text-violet-400">
                    {evaluation.score}/100
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-[#A8BAD8]">{evaluation.explanation}</p>
                {evaluation.triggeredRule ? (
                  <p className="mt-2 text-xs font-semibold text-[#6B7FA8]">Rule: {evaluation.triggeredRule}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {evaluation.missingApprovers.map((item) => (
                    <span key={item} className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-400">
                      Missing {item}
                    </span>
                  ))}
                  {evaluation.missingEvidence.map((item) => (
                    <span key={item} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400">
                      Need {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Investigations */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Investigations</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        <div className="grid gap-3">
          {investigations.length > 0 ? (
            investigations.map((investigation) => (
              <PendingLink
                key={investigation.id}
                href={`/investigations/${investigation.id}`}
                pendingText="Opening investigation..."
                className="flex items-center justify-between gap-3 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 transition hover:border-violet-500/30 hover:bg-[#0a1524]"
              >
                <div>
                  <p className="text-sm font-bold text-[#E8EEFF]">{investigation.title}</p>
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-[#6B7FA8]">
                    {investigation.status.replaceAll('_', ' ')}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#3D5070]" aria-hidden="true" />
              </PendingLink>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[#1E2D4A] p-6 text-center">
              <p className="text-sm font-semibold text-[#6B7FA8]">No investigations reference this approval yet</p>
            </div>
          )}
        </div>
      </section>

      {/* Memory Graph */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Memory Graph</p>
          <span className="h-px flex-1 bg-[#1E2D4A]" />
        </div>
        <PendingLink
          href={memoryEntity ? `/memory/${memoryEntity.id}` : `/memory?search=${encodeURIComponent(subject)}`}
          pendingText="Opening memory graph..."
          className="flex items-center justify-between gap-3 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4 transition hover:border-violet-500/30 hover:bg-[#0a1524]"
        >
          <p className="text-sm font-bold text-[#A8BAD8]">
            {memoryEntity ? 'View related Memory Graph entity' : 'Search Memory Graph'}
          </p>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#3D5070]" aria-hidden="true" />
        </PendingLink>
      </section>
    </div>
  );
}

// ── Tab: Audit Trail ───────────────────────────────────────────────────────

async function AuditTab({ organizationId, approvalId }: { organizationId: string; approvalId: string }) {
  try {
    const auditLogs = await getApprovalAuditTrail(organizationId, approvalId);

    return (
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Audit Trail</p>
            <span className="h-px w-8 bg-[#1E2D4A]" />
          </div>
          <span className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-2.5 py-1 text-[10px] font-bold text-[#6B7FA8]">
            {auditLogs.length} events
          </span>
        </div>
        <div className="grid gap-2">
          {auditLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#1E2D4A] p-10 text-center">
              <p className="text-sm font-semibold text-[#6B7FA8]">No audit events recorded yet</p>
            </div>
          ) : (
            auditLogs.map((event) => (
              <div key={event.id} className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#E8EEFF]">{event.action.replaceAll('_', ' ')}</p>
                  <time className="text-xs font-medium text-[#6B7FA8]" dateTime={event.createdAt?.toISOString() ?? ''}>
                    {dateText(event.createdAt)}
                  </time>
                </div>
                {event.metadata ? (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-[#07111f] p-3 text-xs text-[#6B7FA8]">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    );
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'audit_trail_lookup', approvalId, organizationId });
    return <SectionError approvalId={approvalId} title="Audit trail unavailable" message="Audit events did not load in time." correlationId={correlationId} />;
  }
}

// ── Manual approval section ────────────────────────────────────────────────

async function ManualApprovalSection({
  organizationId,
  core,
  canManage,
  currentUserId,
  currentUserRole,
}: {
  organizationId: string;
  core: ApprovalCore;
  canManage: boolean;
  currentUserId: string;
  currentUserRole: string;
}) {
  if (!core.manualDetail) return null;

  try {
    const bundle = await getApprovalManualBundle(organizationId, core.id);

    return (
      <ManualApprovalPanel
        approval={{
          id: core.id,
          subject: core.subject,
          status: core.status === 'NOT_A_DECISION' ? 'PENDING_REVIEW' : core.status,
          approvalType: core.approvalType === 'NOT_APPROVAL' ? 'EXPLICIT' : core.approvalType,
          approverName: core.approverName,
          approverEmail: core.approverEmail,
          approvalTimestamp: (core.approvalTimestamp ?? core.occurredAt ?? core.createdAt).toISOString(),
          conditions: core.conditions,
          department: core.department,
          category: core.category,
        }}
        detail={{
          ...core.manualDetail,
          secondVerifiedAt: core.manualDetail.secondVerifiedAt?.toISOString() ?? null,
        }}
        evidence={bundle.evidence.map((item) => ({
          ...item,
          sourceTimestamp: item.sourceTimestamp?.toISOString() ?? new Date(0).toISOString(),
          messageSource: {
            ...item.messageSource,
            receivedAt: item.messageSource.receivedAt?.toISOString() ?? new Date(0).toISOString(),
            excerpt: evidenceExcerpt(item.messageSource.rawPayload).slice(0, 1200) || 'Source evidence is preserved in its original provider record.',
          },
        }))}
        versions={bundle.versions.map((version) => ({
          ...version,
          createdAt: version.createdAt?.toISOString() ?? new Date(0).toISOString(),
        }))}
        confirmations={bundle.confirmations.map((confirmation) => ({
          id: confirmation.id,
          approverEmail: confirmation.approverEmail,
          decision: confirmation.decision,
          createdAt: confirmation.createdAt?.toISOString() ?? new Date(0).toISOString(),
          respondedAt: confirmation.respondedAt?.toISOString() ?? null,
          responseNote: confirmation.responseNote,
          requestedByUser: confirmation.requestedByUser,
        }))}
        canManage={canManage}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
    );
  } catch (error) {
    const correlationId = reportApprovalFailure(error, { action: 'manual_approval_bundle_lookup', approvalId: core.id, organizationId });
    return <SectionError approvalId={core.id} title="Manual approval detail temporarily unavailable" message="Evidence, versions, and confirmations did not load in time." correlationId={correlationId} />;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

type ApprovalDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ApprovalDetailPage({ params, searchParams }: ApprovalDetailPageProps) {
  const { id } = await params;
  console.log('[approval-detail] rendering id:', id);
  const sp = await (searchParams ?? {});

  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') redirect('/sign-in');
  if (tenant.status === 'organization_missing' || tenant.status === 'onboarding_incomplete') redirect('/onboarding');
  if (!tenant.organization) redirect('/dashboard');

  const organizationId = tenant.organization.id;

  let core: ApprovalCore | null;
  try {
    core = await getApprovalCore(organizationId, id);
  } catch (error) {
    console.error('[approval-detail] getApprovalCore failed for id:', id, error instanceof Error ? error.message : error, error instanceof Error ? error.stack : undefined);
    const correlationId = reportApprovalFailure(error, {
      action: 'view_full_approval',
      approvalId: id,
      organizationId,
      userId: tenant.session.userId,
    });
    return <ApprovalLoadError id={id} correlationId={correlationId} />;
  }

  if (!core) {
    reportApprovalFailure(new Error('Approval detail missing'), {
      action: 'view_full_approval',
      approvalId: id,
      organizationId,
      userId: tenant.session.userId,
      reason: 'Approval was deleted or does not belong to this tenant.',
    });
    notFound();
  }

  const rawTab = typeof sp.tab === 'string' ? sp.tab : 'overview';
  const initialTab: TabKey = isTabKey(rawTab) ? rawTab : 'overview';

  const threadPayload = parseThreadPayload(core.messageSource?.rawPayload);
  const externalUrl = getSafeEvidenceUrl(core.sourceLink);

  return (
    <DashboardShell immersive>
      <div
        className="flex overflow-hidden rounded-2xl border border-[#1E2D4A]"
        style={{ minHeight: 'calc(100svh - 5.5rem)' }}
      >
        {/* Left panel: approval navigation context */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-[#1E2D4A] bg-[#07111f] xl:flex">
          <div className="border-b border-[#1E2D4A] px-4 py-3.5">
            <PendingLink
              href="/dashboard/approvals"
              pendingText="Opening approvals..."
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B7FA8] hover:text-[#A8BAD8]"
            >
              ← All Approvals
            </PendingLink>
          </div>
          <div className="px-4 pb-1 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#3D5070]">Recent</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            <Suspense fallback={<ContextListSkeleton />}>
              <ApprovalContextList organizationId={organizationId} currentId={core.id} />
            </Suspense>
          </div>
        </aside>

        {/* Center: tabbed workspace */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#030b18]">
          <ApprovalHeader core={core} />
          <ApprovalDetailWorkspace
            initialTab={initialTab}
            panels={{
              overview: (
                <OverviewTab
                  core={core}
                  organizationId={organizationId}
                  canManage={canManageManualApprovals(tenant.user.role)}
                  currentUserId={tenant.user.id}
                  currentUserRole={tenant.user.role}
                />
              ),
              evidence: (
                <EvidenceTab
                  core={core}
                  threadPayload={threadPayload}
                  externalUrl={externalUrl}
                  organizationId={organizationId}
                />
              ),
              timeline: (
                <Suspense fallback={<TabSkeleton />}>
                  <TimelineTab organizationId={organizationId} approvalId={core.id} />
                </Suspense>
              ),
              aianalysis: (
                <Suspense fallback={<TabSkeleton />}>
                  <AIAnalysisTab organizationId={organizationId} approvalId={core.id} />
                </Suspense>
              ),
              related: (
                <Suspense fallback={<TabSkeleton />}>
                  <RelatedTab organizationId={organizationId} approvalId={core.id} subject={core.subject} />
                </Suspense>
              ),
              audit: (
                <Suspense fallback={<TabSkeleton />}>
                  <AuditTab organizationId={organizationId} approvalId={core.id} />
                </Suspense>
              ),
            }}
          />
        </div>

        {/* Right panel: contextual details */}
        <aside className="hidden w-72 shrink-0 flex-col border-l border-[#1E2D4A] bg-[#07111f] 2xl:flex">
          <RightPanel core={core} />
        </aside>
      </div>
    </DashboardShell>
  );
}
