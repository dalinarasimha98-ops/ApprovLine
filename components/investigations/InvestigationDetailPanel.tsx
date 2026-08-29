'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle, Clock, ExternalLink, FileText, Link2, MessageSquare, ShieldAlert, User, X } from 'lucide-react';
import type { InvestigationStatus } from './InvestigationCenter';

type UserRef = { id: string; name: string | null; email: string };

type ApprovalDetail = {
  id: string;
  subject: string;
  approverName: string | null;
  department: string | null;
  riskLevel: string | null;
  status: string;
  confidence: number;
  occurredAt: string | null;
  sourcePlatform: string | null;
  messageSource?: { channel?: string | null; receivedAt?: string | null } | null;
  complianceEvaluations?: Array<{
    id: string;
    status: string;
    score: number;
    explanation: string;
    triggeredRule: string | null;
    missingApprovers: string[];
    missingEvidence: string[];
    rule?: { id: string; title: string } | null;
  }>;
  unifiedEvidenceMembers?: Array<{
    unifiedRecord?: { id: string; title?: string | null; recordType?: string | null } | null;
  }>;
  auditLogs?: Array<{ id: string; action: string; createdAt: string; metadata?: unknown }>;
};

type Note = {
  id: string;
  body: string;
  createdAt: string;
  authorUser: UserRef | null;
};

type TimelineEvent = {
  at: string;
  type: string;
  title: string;
  body: string;
};

type AiSummary = {
  whatHappened: string;
  whoApproved: string;
  whyRisky: string;
  policyApplies: string[];
  evidenceExists: string[];
  evidenceMissing: string[];
  riskScore: number;
  riskLevel: string;
};

type PolicyCheck = {
  policy: string;
  status: string;
  finding: string;
};

type DetailData = {
  investigation: {
    id: string;
    title: string;
    status: InvestigationStatus;
    type: string | null;
    department: string | null;
    riskLevel: string | null;
    summary: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
    assignedTo: UserRef | null;
    createdBy: UserRef | null;
    approvals: Array<{ id: string; approvalRecord: ApprovalDetail }>;
    notes: Note[];
  };
  aiSummary: AiSummary;
  policyChecks: PolicyCheck[];
  timeline: TimelineEvent[];
  riskScore: number;
  complianceEvaluations: ApprovalDetail['complianceEvaluations'];
  approvals: ApprovalDetail[];
};

type Props = {
  investigationId: string;
  onClose: () => void;
  onStatusChanged?: (id: string, status: InvestigationStatus) => void;
  users: UserRef[];
};

// ─── Style helpers ────────────────────────────────────────────────────────────

function riskBadge(risk?: string | null) {
  if (risk === 'critical' || risk === 'high') return 'bg-red-500/15 text-red-400 border border-red-500/25';
  if (risk === 'medium') return 'bg-amber-500/15 text-amber-400 border border-amber-500/25';
  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
}

function statusBadge(status: InvestigationStatus) {
  switch (status) {
    case 'IN_PROGRESS': return 'bg-blue-500/15 text-blue-400 border border-blue-500/25';
    case 'ESCALATED': return 'bg-orange-500/15 text-orange-400 border border-orange-500/25';
    case 'RESOLVED': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    case 'CLOSED': return 'bg-slate-500/15 text-slate-400 border border-slate-500/25';
    default: return 'bg-violet-500/15 text-violet-400 border border-violet-500/25';
  }
}

function statusLabel(status: InvestigationStatus) {
  switch (status) {
    case 'IN_PROGRESS': return 'In Progress';
    case 'ESCALATED': return 'Escalated';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return 'Open';
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function policyStatusClass(status: string) {
  if (status === 'Non-compliant') return 'text-red-400';
  if (status === 'Partially compliant') return 'text-amber-400';
  return 'text-emerald-400';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'evidence' | 'timeline' | 'ai_analysis' | 'activity';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'ai_analysis', label: 'AI Analysis' },
  { id: 'activity', label: 'Activity' },
];

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, users, onStatusChanged }: { data: DetailData; users: UserRef[]; onStatusChanged?: (id: string, status: InvestigationStatus) => void }) {
  const { investigation, aiSummary, riskScore } = data;
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState<Note[]>(investigation.notes);
  const [localStatus, setLocalStatus] = useState<InvestigationStatus>(investigation.status);
  const [localAssignee, setLocalAssignee] = useState(investigation.assignedTo?.id ?? '');
  const [actionMsg, setActionMsg] = useState('');

  const linkedApprovals = investigation.approvals.map((a) => a.approvalRecord);

  function changeStatus(newStatus: InvestigationStatus) {
    startTransition(async () => {
      const res = await fetch(`/api/investigations/${investigation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLocalStatus(newStatus);
        onStatusChanged?.(investigation.id, newStatus);
        setActionMsg(`Status updated to ${statusLabel(newStatus)}.`);
        setTimeout(() => setActionMsg(''), 3000);
      }
    });
  }

  function assignTo(userId: string) {
    startTransition(async () => {
      await fetch(`/api/investigations/${investigation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assignedToUserId: userId || null }),
      });
      setLocalAssignee(userId);
    });
  }

  function addNote(e: React.FormEvent) {
    e.preventDefault();
    const text = noteText.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await fetch(`/api/investigations/${investigation.id}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        const data = await res.json() as { note: Note };
        setNotes((prev) => [data.note, ...prev]);
        setNoteText('');
      }
    });
  }

  // Risk indicators from AI summary
  const riskIndicators = [
    ...aiSummary.evidenceMissing.map((text) => ({ text, icon: 'alert' as const })),
    ...(riskScore >= 65 ? [{ text: `Risk score ${riskScore}/100 — significantly above threshold`, icon: 'shield' as const }] : []),
    ...(linkedApprovals.some((a) => a.status === 'PENDING_REVIEW') ? [{ text: 'Approval pending review — decision not yet finalized', icon: 'clock' as const }] : []),
    ...(linkedApprovals.some((a) => !a.messageSource) ? [{ text: 'No supporting source message attached', icon: 'alert' as const }] : []),
    ...(linkedApprovals.some((a) => (a.confidence ?? 100) < 80) ? [{ text: 'Low classifier confidence — manual verification required', icon: 'alert' as const }] : []),
  ].slice(0, 6);

  return (
    <div className="grid gap-4 p-4">
      {actionMsg && <p className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-400">{actionMsg}</p>}

      {/* Description */}
      <div>
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-1">Description</p>
        <p className="text-sm text-[#C4CEDF] leading-relaxed">{investigation.summary ?? aiSummary.whatHappened}</p>
      </div>

      {/* Key Details */}
      <div>
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Key Details</p>
        <div className="rounded-lg border border-[#1E2D4A] bg-[#0A1628] divide-y divide-[#1E2D4A]">
          {[
            ['Investigation ID', `#${investigation.id.slice(-8).toUpperCase()}`],
            ['Risk Score', `${riskScore}/100`],
            ['Category', investigation.department ?? investigation.type ?? '—'],
            ['Detected By', 'AI Anomaly Detector'],
            ...(linkedApprovals[0] ? [
              ['Approval ID', `APP-${linkedApprovals[0].id.slice(-8).toUpperCase()}`],
              ['Approver', linkedApprovals[0].approverName ?? '—'],
            ] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center px-3 py-2 gap-4">
              <span className="text-xs text-[#6B7FA8] shrink-0">{label}</span>
              <span className={`text-xs font-semibold text-right truncate max-w-[180px] ${label === 'Risk Score' && riskScore >= 65 ? 'text-red-400' : 'text-[#E8EEFF]'}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Indicators */}
      {riskIndicators.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Risk Indicators</p>
          <div className="grid gap-1.5">
            {riskIndicators.map((indicator, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-[#C4CEDF]">
                {indicator.icon === 'shield' ? <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" /> :
                  indicator.icon === 'clock' ? <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /> :
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                <span>{indicator.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked Approvals */}
      {linkedApprovals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Linked Approvals ({linkedApprovals.length})</p>
          <div className="rounded-lg border border-[#1E2D4A] overflow-hidden divide-y divide-[#1E2D4A]">
            {linkedApprovals.slice(0, 3).map((approval) => (
              <div key={approval.id} className="flex items-center justify-between px-3 py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#E8EEFF] truncate">APP-{approval.id.slice(-8).toUpperCase()}</p>
                  <p className="text-xs text-[#6B7FA8] truncate">{approval.subject}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">

                  <a
                    href={`/approvals/${approval.id}`}
                    className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CheckCircle className="w-3 h-3" /> {approval.status.replace(/_/g, ' ')}
                  </a>
                </div>
              </div>
            ))}
            {linkedApprovals.length > 3 && (
              <a href={`/investigations/${investigation.id}`} className="block px-3 py-2 text-xs text-violet-400 hover:text-violet-300 text-center">
                View all {linkedApprovals.length} approvals →
              </a>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div>
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Actions</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => changeStatus('IN_PROGRESS')}
            disabled={isPending || localStatus === 'IN_PROGRESS'}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 transition disabled:opacity-40"
          >
            Mark In Progress
          </button>
          <button
            type="button"
            onClick={() => changeStatus('ESCALATED')}
            disabled={isPending || localStatus === 'ESCALATED'}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/25 hover:bg-orange-500/25 transition disabled:opacity-40"
          >
            Escalate
          </button>
          <button
            type="button"
            onClick={() => changeStatus('RESOLVED')}
            disabled={isPending || localStatus === 'RESOLVED'}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition disabled:opacity-40"
          >
            Resolve
          </button>
          <button
            type="button"
            onClick={() => changeStatus('CLOSED')}
            disabled={isPending || localStatus === 'CLOSED'}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-500/15 text-slate-400 border border-slate-500/25 hover:bg-slate-500/25 transition disabled:opacity-40"
          >
            Close
          </button>
          <a
            href={`/api/export/investigations/${investigation.id}/report`}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/25 hover:bg-violet-500/25 transition flex items-center gap-1"
          >
            <FileText className="w-3 h-3" /> Export PDF
          </a>
          <a
            href={`/investigations/${investigation.id}`}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-[#0E1830] text-[#6B7FA8] border border-[#1E2D4A] hover:text-[#E8EEFF] transition flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Full View
          </a>
        </div>
      </div>

      {/* Assign */}
      {users.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-1">Assign</p>
          <select
            value={localAssignee}
            onChange={(e) => assignTo(e.target.value)}
            disabled={isPending}
            className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-2 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition"
          >
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
          </select>
        </div>
      )}

      {/* Notes */}
      <div>
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Notes</p>
        <form onSubmit={addNote} className="flex gap-2 mb-3">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 h-9 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm text-[#E8EEFF] placeholder-[#6B7FA8] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition"
          />
          <button type="submit" disabled={isPending || !noteText.trim()} className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white transition disabled:opacity-40">
            Add
          </button>
        </form>
        {notes.length === 0 ? (
          <p className="text-xs text-[#6B7FA8] text-center py-3">No notes yet.</p>
        ) : (
          <div className="grid gap-2 max-h-48 overflow-y-auto">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg bg-[#0A1628] border border-[#1E2D4A] p-3">
                <p className="text-xs text-[#C4CEDF] leading-relaxed">{note.body}</p>
                <p className="mt-1.5 text-xs text-[#6B7FA8]">
                  {note.authorUser?.name ?? note.authorUser?.email ?? 'Reviewer'} · {formatDateTime(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Evidence tab ─────────────────────────────────────────────────────────────

function EvidenceTab({ data }: { data: DetailData }) {
  const { approvals } = data;

  if (approvals.length === 0) return (
    <div className="p-4 text-sm text-[#6B7FA8] text-center py-8">No evidence linked to this investigation.</div>
  );

  return (
    <div className="grid gap-4 p-4">
      {approvals.map((approval) => (
        <div key={approval.id} className="rounded-lg border border-[#1E2D4A] bg-[#0A1628] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E2D4A] flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-violet-400">{approval.sourcePlatform ?? 'Unknown Source'}</p>
              <p className="font-bold text-[#E8EEFF] text-sm mt-0.5">{approval.subject}</p>
            </div>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${riskBadge(approval.riskLevel)}`}>
              {approval.riskLevel ? approval.riskLevel.charAt(0).toUpperCase() + approval.riskLevel.slice(1) : 'Low'}
            </span>
          </div>
          <div className="px-4 py-3 grid gap-2 text-xs text-[#6B7FA8]">
            {approval.messageSource?.channel && (
              <div className="flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /><span>Source: {approval.messageSource.channel}</span></div>
            )}
            {approval.approverName && (
              <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /><span>Approver: {approval.approverName}</span></div>
            )}
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[#E8EEFF]">{approval.confidence}% confidence · {approval.status.replace(/_/g, ' ')}</span>
            </div>
            {approval.occurredAt && (
              <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /><span>{formatDateTime(approval.occurredAt)}</span></div>
            )}
          </div>
          {(approval.unifiedEvidenceMembers ?? []).length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-1.5">Unified Evidence</p>
              {(approval.unifiedEvidenceMembers ?? []).map((m, i) => m.unifiedRecord && (
                <a key={i} href={`/evidence/${m.unifiedRecord.id}`} className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300">
                  <Link2 className="w-3 h-3" /> {m.unifiedRecord.title ?? `Evidence ${m.unifiedRecord.id.slice(-6)}`}
                </a>
              ))}
            </div>
          )}
          <div className="px-4 pb-3">
            <a href={`/approvals/${approval.id}/source`} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> View Original Source
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

function TimelineTab({ data }: { data: DetailData }) {
  const { timeline } = data;

  if (timeline.length === 0) return (
    <div className="p-4 text-sm text-[#6B7FA8] text-center py-8">No timeline events recorded yet.</div>
  );

  const typeIcon = (type: string) => {
    if (type.includes('message') || type.includes('Source')) return <MessageSquare className="w-3.5 h-3.5" />;
    if (type.includes('Audit')) return <FileText className="w-3.5 h-3.5" />;
    if (type.includes('decision') || type.includes('Approval')) return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    return <Clock className="w-3.5 h-3.5" />;
  };

  return (
    <div className="p-4">
      <div className="relative">
        <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[#1E2D4A]" />
        <div className="grid gap-3">
          {timeline.map((event, i) => (
            <div key={i} className="flex gap-3 relative">
              <div className="w-9 h-9 rounded-full border border-[#1E2D4A] bg-[#0A1628] flex items-center justify-center text-[#6B7FA8] shrink-0 z-10">
                {typeIcon(event.type)}
              </div>
              <div className="rounded-lg border border-[#1E2D4A] bg-[#0A1628] p-3 flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-violet-400">{event.type}</p>
                  <p className="text-xs text-[#6B7FA8] whitespace-nowrap shrink-0">{formatDateTime(event.at)}</p>
                </div>
                <p className="text-sm font-bold text-[#E8EEFF] mt-0.5">{event.title}</p>
                <p className="text-xs text-[#6B7FA8] mt-1 leading-relaxed">{event.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI Analysis tab ──────────────────────────────────────────────────────────

function AIAnalysisTab({ data }: { data: DetailData }) {
  const { aiSummary, policyChecks, complianceEvaluations, riskScore } = data;

  function policyBg(status: string) {
    if (status === 'Non-compliant') return 'border-red-500/20 bg-red-500/5';
    if (status === 'Partially compliant') return 'border-amber-500/20 bg-amber-500/5';
    return 'border-emerald-500/20 bg-emerald-500/5';
  }

  return (
    <div className="grid gap-4 p-4">
      <div className="rounded-lg border border-[#1E2D4A] bg-[#0A1628] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">AI Risk Assessment</p>
          <span className={`text-sm font-black ${riskScore >= 65 ? 'text-red-400' : riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>{riskScore}/100</span>
        </div>
        <div className="h-2 rounded-full bg-[#1E2D4A] overflow-hidden mb-3">
          <div
            className={`h-full rounded-full ${riskScore >= 65 ? 'bg-red-500' : riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${riskScore}%` }}
          />
        </div>
        <p className="text-xs text-[#6B7FA8] italic">AI-generated analysis — verify against source evidence before action.</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Summary</p>
        <div className="grid gap-2 text-sm text-[#C4CEDF] leading-relaxed">
          <p><span className="font-bold text-[#E8EEFF]">What happened:</span> {aiSummary.whatHappened}</p>
          <p><span className="font-bold text-[#E8EEFF]">Who approved:</span> {aiSummary.whoApproved}</p>
          <p><span className="font-bold text-[#E8EEFF]">Why risky:</span> {aiSummary.whyRisky}</p>
        </div>
      </div>

      {aiSummary.policyApplies.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Applicable Policies</p>
          <div className="flex flex-wrap gap-2">
            {aiSummary.policyApplies.map((policy) => (
              <span key={policy} className="rounded-md px-2 py-1 text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">{policy}</span>
            ))}
          </div>
        </div>
      )}

      {complianceEvaluations && complianceEvaluations.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Playbook Compliance</p>
          <div className="grid gap-2">
            {complianceEvaluations.map((ev) => ev && (
              <div key={ev.id} className={`rounded-lg border p-3 ${policyBg(ev.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#E8EEFF]">{ev.triggeredRule ?? ev.rule?.title ?? 'Playbook rule'}</p>
                  <span className={`text-xs font-bold ${policyStatusClass(ev.status)}`}>{ev.status} · {ev.score}</span>
                </div>
                <p className="text-xs text-[#C4CEDF] mt-1">{ev.explanation}</p>
                {ev.missingEvidence.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ev.missingEvidence.map((item) => <span key={item} className="rounded px-1.5 py-0.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">Need {item}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : policyChecks.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-2">Policy Checks</p>
          <div className="grid gap-2">
            {policyChecks.map((check) => (
              <div key={check.policy} className={`rounded-lg border p-3 ${policyBg(check.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-[#E8EEFF]">{check.policy}</p>
                  <span className={`text-xs font-bold ${policyStatusClass(check.status)}`}>{check.status}</span>
                </div>
                <p className="text-xs text-[#C4CEDF] mt-1">{check.finding}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(aiSummary.evidenceExists.length > 0 || aiSummary.evidenceMissing.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {aiSummary.evidenceExists.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs font-bold text-emerald-400 mb-1">Evidence Present</p>
              <ul className="grid gap-1">
                {aiSummary.evidenceExists.map((item) => <li key={item} className="text-xs text-emerald-300">✓ {item}</li>)}
              </ul>
            </div>
          )}
          {aiSummary.evidenceMissing.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-bold text-amber-400 mb-1">Evidence Missing</p>
              <ul className="grid gap-1">
                {aiSummary.evidenceMissing.map((item) => <li key={item} className="text-xs text-amber-300">⚠ {item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────────

function ActivityTab({ data }: { data: DetailData }) {
  const auditLogs = data.approvals.flatMap((a) => a.auditLogs ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (auditLogs.length === 0) return (
    <div className="p-4 text-sm text-[#6B7FA8] text-center py-8">No audit activity recorded for linked approvals.</div>
  );

  return (
    <div className="p-4 grid gap-2">
      {auditLogs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 rounded-lg border border-[#1E2D4A] bg-[#0A1628] px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-violet-500/15 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#E8EEFF]">{log.action.replace(/_/g, ' ')}</p>
            <p className="text-xs text-[#6B7FA8]">{formatDateTime(log.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function InvestigationDetailPanel({ investigationId, onClose, onStatusChanged, users }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevIdRef.current === investigationId) return;
    prevIdRef.current = investigationId;
    setLoading(true);
    setError('');
    setActiveTab('overview');

    fetch(`/api/investigations/${investigationId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Access denied.' : r.status === 404 ? 'Investigation not found.' : 'Failed to load investigation.');
        return r.json() as Promise<DetailData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Failed to load.'); setLoading(false); });
  }, [investigationId]);

  const inv = data?.investigation;
  const evidenceCount = data?.approvals.flatMap((a) => a.unifiedEvidenceMembers ?? []).length ?? 0;

  return (
    <div className="w-full xl:w-[420px] rounded-xl border border-[#1E2D4A] bg-[#07111f] overflow-hidden flex flex-col h-full xl:max-h-[calc(100vh-120px)] xl:sticky xl:top-4">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1E2D4A] shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {inv ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${riskBadge(inv.riskLevel)}`}>
                    {inv.riskLevel ? inv.riskLevel.charAt(0).toUpperCase() + inv.riskLevel.slice(1) + ' Risk' : 'Low Risk'}
                  </span>
                  <span className="text-xs text-[#6B7FA8]">#{inv.id.slice(-8).toUpperCase()}</span>
                </div>
                <h3 className="mt-1.5 text-base font-black text-[#E8EEFF] leading-tight">{inv.title}</h3>
                <p className="mt-0.5 text-xs text-[#6B7FA8]">{inv.department ?? inv.type ?? 'Investigation'}</p>
              </>
            ) : loading ? (
              <div className="h-4 w-40 rounded bg-[#1E2D4A] animate-pulse" />
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-[#6B7FA8] hover:text-[#E8EEFF] hover:bg-[#1E2D4A] transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {inv && (
          <div className="mt-2 flex items-center gap-3 text-xs text-[#6B7FA8]">
            <span className={`rounded-md px-2 py-0.5 font-semibold ${statusBadge(inv.status)}`}>{statusLabel(inv.status)}</span>
            {inv.assignedTo && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {inv.assignedTo.name ?? inv.assignedTo.email}
              </span>
            )}
          </div>
        )}
        {inv && (
          <div className="mt-1 flex gap-3 text-xs text-[#6B7FA8]">
            <span>Created {formatDateTime(inv.createdAt)}</span>
            <span>·</span>
            <span>Updated {formatDateTime(inv.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1E2D4A] shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition border-b-2 ${activeTab === tab.id ? 'border-violet-500 text-violet-400' : 'border-transparent text-[#6B7FA8] hover:text-[#E8EEFF]'}`}
          >
            {tab.label}
            {tab.id === 'evidence' && evidenceCount > 0 && (
              <span className="ml-1 rounded-full bg-[#1E2D4A] px-1.5 py-0.5 text-[10px]">{evidenceCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="p-4 grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-[#1E2D4A] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : data ? (
          <>
            {activeTab === 'overview' && <OverviewTab data={data} users={users} onStatusChanged={onStatusChanged} />}
            {activeTab === 'evidence' && <EvidenceTab data={data} />}
            {activeTab === 'timeline' && <TimelineTab data={data} />}
            {activeTab === 'ai_analysis' && <AIAnalysisTab data={data} />}
            {activeTab === 'activity' && <ActivityTab data={data} />}
          </>
        ) : null}
      </div>
    </div>
  );
}
