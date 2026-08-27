'use client';

import { useState } from 'react';
import { ExternalLink, ChevronLeft, CheckCircle2, AlertCircle, Clock, Paperclip, Link2, Users, GitBranch, MessageSquare, FileText, Shield, X } from 'lucide-react';
import { PendingLink } from '@/components/system/PendingLink';
import type { NormalizedPayload, SlackPayload, EmailPayload, TeamsPayload, JiraPayload, GitPayload, GenericPayload, Reaction } from '@/lib/source-payload';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export type EvidenceDetailData = {
  evidenceId: string | null;
  unifiedEvidenceId: string | null;
  approvalRecordId: string;
  decisionType: string | null;
  decisionTitle: string;
  amount: string | null;
  approverName: string | null;
  approverEmail: string | null;
  status: string;
  riskLevel: string | null;
  riskScore: number;
  capturedAt: string;
  source: string | null;
  channel: string | null;
  workspace: string | null;
  threadTs: string | null;
  messageTs: string | null;
  issueUrl: string | null;
  prUrl: string | null;
  confidenceScore: number;
  aiClassification: string | null;
  aiReasoning: string | null;
  rawPayload: unknown;
};

export type SourceEvidenceViewerProps = {
  approvalId: string;
  approvalSubject: string;
  sourcePlatform: string | null;
  externalUrl: string | null;
  payload: NormalizedPayload;
  detail: EvidenceDetailData;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AVATAR_COLORS = ['bg-violet-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 'bg-blue-600', 'bg-cyan-600'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}
function fmtTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function fmtDateTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type ProviderInfo = { displayName: string; short: string; iconBg: string; iconText: string; location: string };
const PROVIDER_MAP: Record<string, ProviderInfo> = {
  slack:           { displayName: 'Slack',           short: 'S',  iconBg: 'bg-[#4A154B]', iconText: 'text-white', location: 'Channel' },
  gmail:           { displayName: 'Gmail',           short: 'G',  iconBg: 'bg-rose-600',  iconText: 'text-white', location: 'Thread' },
  outlook:         { displayName: 'Outlook',         short: 'O',  iconBg: 'bg-blue-600',  iconText: 'text-white', location: 'Folder' },
  microsoft_teams: { displayName: 'Microsoft Teams', short: 'T',  iconBg: 'bg-indigo-600',iconText: 'text-white', location: 'Channel' },
  google_chat:     { displayName: 'Google Chat',     short: 'C',  iconBg: 'bg-emerald-600',iconText: 'text-white',location: 'Space' },
  jira:            { displayName: 'Jira',            short: 'J',  iconBg: 'bg-[#0052CC]', iconText: 'text-white', location: 'Project' },
  servicenow:      { displayName: 'ServiceNow',      short: 'SN', iconBg: 'bg-emerald-700',iconText: 'text-white',location: 'Module' },
  asana:           { displayName: 'Asana',           short: 'A',  iconBg: 'bg-rose-700',  iconText: 'text-white', location: 'Project' },
  monday:          { displayName: 'Monday.com',      short: 'M',  iconBg: 'bg-red-600',   iconText: 'text-white', location: 'Board' },
  github:          { displayName: 'GitHub',          short: 'GH', iconBg: 'bg-[#24292e]', iconText: 'text-white', location: 'Repository' },
  gitlab:          { displayName: 'GitLab',          short: 'GL', iconBg: 'bg-orange-600',iconText: 'text-white', location: 'Repository' },
  azure_devops:    { displayName: 'Azure DevOps',    short: 'AZ', iconBg: 'bg-sky-700',   iconText: 'text-white', location: 'Repository' },
};
function providerInfo(platform: string | null): ProviderInfo {
  return PROVIDER_MAP[platform?.toLowerCase() ?? ''] ?? { displayName: platform ?? 'Source', short: platform?.slice(0,2)?.toUpperCase() ?? '?', iconBg: 'bg-slate-600', iconText: 'text-white', location: 'Source' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ProviderIcon({ platform, size = 8 }: { platform: string | null; size?: number }) {
  const info = providerInfo(platform);
  return (
    <div className={`grid h-${size} w-${size} shrink-0 place-items-center rounded-lg text-xs font-black ${info.iconBg} ${info.iconText}`}>
      {info.short}
    </div>
  );
}

function Avatar({ name, size = 8 }: { name: string; size?: number }) {
  return (
    <div className={`grid h-${size} w-${size} shrink-0 place-items-center rounded-full text-xs font-black text-white ${avatarColor(name)}`}>
      {initials(name)}
    </div>
  );
}

function AIBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-300">
      <Shield className="h-2.5 w-2.5" /> AI Identified Approval
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls = s === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400' : s === 'REJECTED' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400';
  const dot = s === 'APPROVED' ? 'bg-emerald-400' : s === 'REJECTED' ? 'bg-rose-400' : 'bg-amber-400';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function RiskBadge({ level, score }: { level: string | null; score: number }) {
  const l = level?.toLowerCase() ?? 'low';
  const cls = l === 'high' ? 'bg-rose-500 text-white' : l === 'medium' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white';
  const label = l === 'high' ? 'High' : l === 'medium' ? 'Medium' : 'Low';
  return (
    <div className="flex items-center gap-2">
      <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black tabular-nums ${cls}`}>{score}</span>
      <span className={`text-xs font-bold ${l === 'high' ? 'text-rose-400' : l === 'medium' ? 'text-amber-400' : 'text-emerald-400'}`}>({label})</span>
    </div>
  );
}

function Reactions({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {reactions.map((r) => (
        <span key={r.emoji} className="inline-flex items-center gap-1 rounded-full border border-[#1E2D4A] bg-[#0a1524] px-2 py-0.5 text-xs font-semibold text-[#6B7FA8]">
          {r.emoji} {r.count}
        </span>
      ))}
    </div>
  );
}

function NotCaptured({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#1E2D4A] p-4 text-center">
      <p className="text-xs font-semibold text-[#3D5070]">Captured context available</p>
      <p className="mt-1 text-xs text-[#3D5070]">{label} was not included in the captured payload for this event.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left nav helpers
// ---------------------------------------------------------------------------
type NavItem = { id: string; label: string; count?: number; icon?: React.ComponentType<{ className?: string }> };

function buildNavSections(payload: NormalizedPayload): { title: string; items: NavItem[] }[] {
  const pt = payload.providerType;

  if (pt === 'slack') {
    const p = payload as SlackPayload;
    const items: NavItem[] = [
      { id: 'thread', label: 'Thread View', icon: MessageSquare },
      { id: 'channel-info', label: 'Channel Info', icon: Shield },
      { id: 'participants', label: 'Participants', count: p.participants?.length, icon: Users },
      { id: 'attachments', label: 'Attachments', count: p.attachments?.length, icon: Paperclip },
      { id: 'reactions', label: 'Reactions', count: p.messages?.reduce((s, m) => s + (m.reactions?.reduce((rs, r) => rs + r.count, 0) ?? 0), 0) || undefined, icon: Shield },
      { id: 'links', label: 'Links', count: p.links?.length, icon: Link2 },
      { id: 'timeline', label: 'Event Timeline', icon: Clock },
    ];
    return [{ title: 'Source Context', items }];
  }

  if (pt === 'gmail' || pt === 'outlook') {
    const p = payload as EmailPayload;
    return [{ title: 'Source Context', items: [
      { id: 'thread', label: 'Email Thread', icon: MessageSquare },
      { id: 'participants', label: 'Participants', count: p.participants?.length, icon: Users },
      { id: 'attachments', label: 'Attachments', count: p.attachments?.length, icon: Paperclip },
    ]}];
  }

  if (pt === 'microsoft_teams' || pt === 'google_chat') {
    const p = payload as TeamsPayload;
    return [{ title: 'Source Context', items: [
      { id: 'thread', label: 'Conversation', icon: MessageSquare },
      { id: 'participants', label: 'Participants', count: p.participants?.length, icon: Users },
    ]}];
  }

  if (['jira', 'servicenow', 'asana', 'monday'].includes(pt)) {
    const p = payload as JiraPayload;
    return [{ title: 'Source Context', items: [
      { id: 'issue', label: 'Issue Overview', icon: FileText },
      { id: 'activity', label: 'Activity / Comments', count: p.comments?.length, icon: MessageSquare },
      { id: 'approvals', label: 'Approvals', count: p.approvals?.length, icon: CheckCircle2 },
      { id: 'attachments', label: 'Attachments', count: p.attachments?.length, icon: Paperclip },
      { id: 'linked-issues', label: 'Linked Issues', count: p.linkedIssues?.length, icon: Link2 },
      { id: 'participants', label: 'Participants', count: p.participants?.length, icon: Users },
    ]}];
  }

  if (['github', 'gitlab', 'azure_devops'].includes(pt)) {
    const p = payload as GitPayload;
    return [{ title: 'Source Context', items: [
      { id: 'overview', label: 'Pull Request Overview', icon: GitBranch },
      { id: 'reviews', label: 'Review Comments', count: p.reviews?.length, icon: MessageSquare },
      { id: 'approvals', label: 'Approvals', count: p.reviews?.filter((r) => r.state === 'APPROVED').length, icon: CheckCircle2 },
      { id: 'checks', label: 'Checks / CI', count: p.checksTotal, icon: Shield },
      { id: 'conversation', label: 'Conversation', count: p.comments?.length, icon: MessageSquare },
      { id: 'linked', label: 'Linked Issues', count: p.linkedIssues?.length, icon: Link2 },
    ]}];
  }

  return [{ title: 'Source Context', items: [{ id: 'content', label: 'Content', icon: FileText }] }];
}

function defaultSection(payload: NormalizedPayload): string {
  const pt = payload.providerType;
  if (pt === 'slack' || pt === 'gmail' || pt === 'outlook' || pt === 'microsoft_teams' || pt === 'google_chat') return 'thread';
  if (['jira', 'servicenow', 'asana', 'monday'].includes(pt)) return 'issue';
  if (['github', 'gitlab', 'azure_devops'].includes(pt)) return 'overview';
  return 'content';
}

// ---------------------------------------------------------------------------
// Center views
// ---------------------------------------------------------------------------
function SlackCenter({ payload, section }: { payload: SlackPayload; section: string }) {
  const channel = payload.channel ?? 'channel';

  if (section === 'channel-info') {
    return (
      <div className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Channel Information</h3>
        {[
          ['Channel', `#${channel}`],
          ['Workspace', payload.workspace ?? 'Not captured'],
          ['Members', payload.memberCount?.toString() ?? 'Not captured'],
          ['Type', 'Not captured'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#3D5070]">{l}</p>
            <p className="mt-1 text-sm font-semibold text-[#E8EEFF]">{v}</p>
          </div>
        ))}
      </div>
    );
  }

  if (section === 'participants') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Participants ({payload.participants?.length ?? 0})</h3>
        {payload.participants?.length ? payload.participants.map((p, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <Avatar name={p.name} size={8} />
            <div><p className="text-sm font-semibold text-[#E8EEFF]">{p.name}</p>{p.email && <p className="text-xs text-[#3D5070]">{p.email}</p>}</div>
            {p.role && <span className="ml-auto rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-400">{p.role}</span>}
          </div>
        )) : <NotCaptured label="Participant details" />}
      </div>
    );
  }

  if (section === 'attachments') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Attachments ({payload.attachments?.length ?? 0})</h3>
        {payload.attachments?.length ? payload.attachments.map((a, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <Paperclip className="h-4 w-4 text-[#6B7FA8]" />
            <div className="flex-1"><p className="text-sm font-semibold text-[#E8EEFF]">{a.name}</p>{a.size && <p className="text-xs text-[#3D5070]">{a.size}</p>}</div>
          </div>
        )) : <NotCaptured label="Attachment details" />}
      </div>
    );
  }

  if (section === 'links') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Links ({payload.links?.length ?? 0})</h3>
        {payload.links?.length ? payload.links.map((l, i) => (
          <div key={i} className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <p className="text-xs font-semibold text-violet-400 truncate">{l.text ?? l.url}</p>
            {l.text && <p className="text-[10px] text-[#3D5070] truncate mt-0.5">{l.url}</p>}
          </div>
        )) : <NotCaptured label="Link details" />}
      </div>
    );
  }

  if (section === 'timeline') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Event Timeline</h3>
        {payload.messages.length ? (
          <div className="relative pl-4">
            <span className="absolute left-1.5 top-0 bottom-0 w-px bg-[#1E2D4A]" />
            {payload.messages.map((m, i) => (
              <div key={i} className="relative mb-4 pl-4">
                <span className={`absolute -left-[3px] top-1.5 h-2 w-2 rounded-full border-2 border-[#0E1830] ${m.isApprovalMoment ? 'bg-violet-500' : 'bg-[#1E2D4A]'}`} />
                <p className="text-xs text-[#3D5070]">{fmtTime(m.timestamp)}</p>
                <p className="text-sm font-semibold text-[#A8BAD8]">{m.senderName}</p>
                <p className="text-xs text-[#6B7FA8] line-clamp-2">{m.content}</p>
              </div>
            ))}
          </div>
        ) : <NotCaptured label="Timeline events" />}
      </div>
    );
  }

  // Default: thread view
  let lastDay: string | null = null;
  const approvalCount = payload.messages.filter((m) => m.isApprovalMoment).length;
  const reactionCount = payload.messages.reduce((s, m) => s + (m.reactions?.reduce((rs, r) => rs + r.count, 0) ?? 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Channel header */}
      <div className="flex items-center gap-3 border-b border-[#1E2D4A] bg-[#0a1524] px-5 py-3 shrink-0">
        <span className="font-bold text-[#E8EEFF]">#{channel}</span>
        <span className="text-[#3D5070]">·</span>
        <span className="text-xs text-[#6B7FA8]">{payload.memberCount ? `${payload.memberCount} members` : ''}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full border border-[#1E2D4A] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#6B7FA8]">Thread</span>
        </div>
      </div>

      {/* Info banner */}
      <div className="shrink-0 border-b border-violet-500/20 bg-violet-500/5 px-5 py-2.5">
        <p className="text-xs font-semibold text-violet-300">ApprovLine captured the full thread for context. The approval moment is highlighted below.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-1">
        {payload.messages.length === 0 ? (
          <NotCaptured label="Message thread content" />
        ) : payload.messages.map((message, i) => {
          const label = fmtDate(message.timestamp);
          const showDiv = label !== null && label !== lastDay;
          if (label) lastDay = label;
          return (
            <div key={i}>
              {showDiv && (
                <div className="flex items-center gap-3 my-4 text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">
                  <span className="h-px flex-1 bg-[#1E2D4A]" />{label}<span className="h-px flex-1 bg-[#1E2D4A]" />
                </div>
              )}
              <div className={`flex items-start gap-3 rounded-xl p-3 transition ${message.isApprovalMoment ? 'border border-violet-500/30 bg-violet-500/5' : 'hover:bg-[#0a1524]'}`}>
                <Avatar name={message.senderName} size={8} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#E8EEFF] text-sm">{message.senderName}</span>
                    {message.senderRole && <span className="rounded bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] text-[#6B7FA8]">{message.senderRole}</span>}
                    <span className="text-xs text-[#3D5070]">{fmtTime(message.timestamp)}</span>
                    {message.isApprovalMoment && <AIBadge />}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{message.content}</p>
                  {message.reactions?.length ? <Reactions reactions={message.reactions} /> : null}
                  {message.replyCount ? (
                    <p className="mt-1.5 text-xs font-semibold text-violet-400 cursor-pointer hover:underline">
                      {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                      {message.lastReplyTs ? ` · Last reply ${fmtTime(message.lastReplyTs)}` : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input bar (decorative, shows channel context) */}
      <div className="shrink-0 border-t border-[#1E2D4A] bg-[#0a1524] px-5 py-3">
        <div className="rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-4 py-2.5 text-xs text-[#3D5070]">Message #{channel}</div>
      </div>

      {/* Summary footer */}
      <div className="shrink-0 border-t border-[#1E2D4A] px-5 py-3">
        <p className="text-xs font-semibold text-[#6B7FA8]">Complete Context Summary</p>
        <p className="mt-1 text-[10px] text-[#3D5070]">This evidence was captured with {payload.messages.length} messages{approvalCount ? `, ${approvalCount} AI-identified approval${approvalCount > 1 ? 's' : ''}` : ''}{reactionCount ? `, ${reactionCount} reactions` : ''}{payload.links?.length ? `, ${payload.links.length} links` : ''}.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          {[
            ['Messages', payload.messages.length],
            ['Participants', payload.participants?.length ?? '—'],
            ['Attachments', payload.attachments?.length ?? '—'],
            ['Reactions', reactionCount || '—'],
            ['Links', payload.links?.length ?? '—'],
          ].map(([l, v]) => (
            <div key={String(l)} className="text-center">
              <p className="text-xs font-black tabular-nums text-[#E8EEFF]">{v}</p>
              <p className="text-[10px] text-[#3D5070]">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function JiraCenter({ payload, section }: { payload: JiraPayload; section: string }) {
  if (section === 'activity') {
    return (
      <div className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Activity / Comments ({payload.comments?.length ?? 0})</h3>
        {payload.comments?.length ? payload.comments.map((c, i) => (
          <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 ${c.isApprovalMoment ? 'border-violet-500/30 bg-violet-500/5' : 'border-[#1E2D4A] bg-[#0a1524]'}`}>
            <Avatar name={c.author} size={8} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[#E8EEFF] text-sm">{c.author}</span>
                {c.authorRole && <span className="rounded bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] text-[#6B7FA8]">{c.authorRole}</span>}
                <span className="text-xs text-[#3D5070]">{fmtDateTime(c.timestamp)}</span>
                {c.isApprovalMoment && <AIBadge />}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{c.body}</p>
              {c.reactions?.length ? <Reactions reactions={c.reactions} /> : null}
            </div>
          </div>
        )) : <NotCaptured label="Comments and activity" />}
      </div>
    );
  }

  if (section === 'approvals') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Approvals ({payload.approvals?.length ?? 0})</h3>
        {payload.approvals?.length ? payload.approvals.map((a, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <Avatar name={a.approver} />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#E8EEFF]">{a.approver}</p>
              {a.approverRole && <p className="text-xs text-[#6B7FA8]">{a.approverRole}</p>}
            </div>
            <StatusBadge status={a.status} />
          </div>
        )) : <NotCaptured label="Approval actions" />}
      </div>
    );
  }

  if (section === 'linked-issues') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Linked Issues ({payload.linkedIssues?.length ?? 0})</h3>
        {payload.linkedIssues?.length ? payload.linkedIssues.map((li, i) => (
          <div key={i} className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <p className="text-xs font-bold text-violet-400">{li.key}</p>
            <p className="text-sm text-[#E8EEFF]">{li.title}</p>
            {li.type && <p className="text-xs text-[#3D5070]">{li.type}</p>}
          </div>
        )) : <NotCaptured label="Linked issues" />}
      </div>
    );
  }

  if (section === 'participants') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Participants ({payload.participants?.length ?? 0})</h3>
        {payload.participants?.length ? payload.participants.map((p, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <Avatar name={p.name} />
            <div><p className="text-sm font-bold text-[#E8EEFF]">{p.name}</p>{p.email && <p className="text-xs text-[#3D5070]">{p.email}</p>}</div>
            {p.role && <span className="ml-auto rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-400">{p.role}</span>}
          </div>
        )) : <NotCaptured label="Participant details" />}
      </div>
    );
  }

  // Default: issue overview
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {payload.issueKey && <span className="text-sm font-black text-violet-400">{payload.issueKey}</span>}
          <h3 className="text-sm font-bold text-[#E8EEFF] flex-1">{payload.issueTitle ?? 'Jira Issue'}</h3>
          {payload.status && <StatusBadge status={payload.status} />}
        </div>
        {payload.reporter && <p className="mt-2 text-xs text-[#6B7FA8]">Reported by {payload.reporter}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Project', payload.project],
          ['Issue Type', payload.issueType],
          ['Priority', payload.priority],
          ['Status', payload.status],
          ['Resolution', payload.resolution],
          ['Assignee', payload.assignee],
        ].filter(([, v]) => v).map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">{l}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#E8EEFF]">{v}</p>
          </div>
        ))}
      </div>
      {payload.issueUrl && (
        <a href={payload.issueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:underline">
          <ExternalLink className="h-3 w-3" /> View in {payload.providerType}
        </a>
      )}
    </div>
  );
}

function GitCenter({ payload, section }: { payload: GitPayload; section: string }) {
  if (section === 'reviews' || section === 'approvals') {
    const items = section === 'approvals'
      ? (payload.reviews ?? []).filter((r) => r.state === 'APPROVED')
      : (payload.reviews ?? []);
    return (
      <div className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#E8EEFF]">{section === 'approvals' ? 'Approvals' : 'Review Comments'} ({items.length})</h3>
        {items.length ? items.map((r, i) => (
          <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 ${r.isApprovalMoment || r.state === 'APPROVED' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-[#1E2D4A] bg-[#0a1524]'}`}>
            <Avatar name={r.reviewer} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[#E8EEFF] text-sm">{r.reviewer}</span>
                {r.reviewerRole && <span className="rounded bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] text-[#6B7FA8]">{r.reviewerRole}</span>}
                <span className="text-xs text-[#3D5070]">{fmtDateTime(r.timestamp)}</span>
                {r.state === 'APPROVED' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400"><CheckCircle2 className="h-2.5 w-2.5" /> Approved</span>}
                {r.state === 'CHANGES_REQUESTED' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400"><AlertCircle className="h-2.5 w-2.5" /> Changes requested</span>}
                {r.isApprovalMoment && <AIBadge />}
              </div>
              {r.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{r.body}</p>}
            </div>
          </div>
        )) : <NotCaptured label="Review data" />}
      </div>
    );
  }

  if (section === 'checks') {
    return (
      <div className="p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#E8EEFF]">CI Checks</h3>
        {payload.checksTotal ? (
          <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`h-5 w-5 ${payload.checksPassed === payload.checksTotal ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <p className="text-sm font-bold text-[#E8EEFF]">{payload.checksPassed}/{payload.checksTotal} checks passed</p>
                <p className="text-xs text-[#3D5070]">Captured at event time</p>
              </div>
            </div>
          </div>
        ) : <NotCaptured label="CI check details" />}
      </div>
    );
  }

  if (section === 'conversation') {
    return (
      <div className="p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#E8EEFF]">Conversation ({payload.comments?.length ?? 0})</h3>
        {payload.comments?.length ? payload.comments.map((c, i) => (
          <div key={i} className={`flex items-start gap-3 rounded-xl border p-4 ${c.isApprovalMoment ? 'border-violet-500/30 bg-violet-500/5' : 'border-[#1E2D4A] bg-[#0a1524]'}`}>
            <Avatar name={c.author} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[#E8EEFF] text-sm">{c.author}</span>
                {c.authorRole && <span className="rounded bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] text-[#6B7FA8]">{c.authorRole}</span>}
                <span className="text-xs text-[#3D5070]">{fmtDateTime(c.timestamp)}</span>
                {c.isApprovalMoment && <AIBadge />}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{c.body}</p>
            </div>
          </div>
        )) : <NotCaptured label="Conversation history" />}
      </div>
    );
  }

  // Default: PR overview
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {payload.prNumber && <span className="text-sm font-black text-violet-400">#{payload.prNumber}</span>}
          <h3 className="text-sm font-bold text-[#E8EEFF] flex-1">{payload.prTitle ?? 'Pull Request'}</h3>
          {payload.prStatus && <StatusBadge status={payload.prStatus} />}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ['Author', payload.author],
          ['Repository', payload.repository],
          ['Branch', payload.headBranch ? `${payload.headBranch} → ${payload.baseBranch ?? 'main'}` : payload.baseBranch],
          ['Created', payload.createdAt ? fmtDateTime(payload.createdAt) : null],
          ['Merged', payload.mergedAt ? fmtDateTime(payload.mergedAt) : null],
          ['Files Changed', payload.filesChanged?.toString()],
          ['Commits', payload.commits?.toString()],
          ['CI', payload.checksTotal ? `${payload.checksPassed ?? 0}/${payload.checksTotal} passed` : null],
        ].filter(([, v]) => v).map(([l, v]) => (
          <div key={String(l)} className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">{l}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#E8EEFF]">{v}</p>
          </div>
        ))}
      </div>
      {payload.description && <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-4"><p className="text-sm leading-6 text-[#A8BAD8] whitespace-pre-wrap">{payload.description}</p></div>}
    </div>
  );
}

function EmailCenter({ payload }: { payload: EmailPayload }) {
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
        <p className="text-xs text-[#3D5070]">Subject</p>
        <p className="font-bold text-[#E8EEFF]">{payload.subject || 'No subject'}</p>
      </div>
      {payload.messages.length === 0 ? <NotCaptured label="Email thread content" /> : payload.messages.map((m, i) => (
        <div key={i} className={`rounded-xl border p-4 ${m.isApprovalMoment ? 'border-violet-500/30 bg-violet-500/5' : 'border-[#1E2D4A] bg-[#0a1524]'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <Avatar name={m.from} />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-[#E8EEFF] text-sm">{m.from}</span>
                {m.fromEmail && <span className="text-xs text-[#3D5070]">&lt;{m.fromEmail}&gt;</span>}
                <span className="text-xs text-[#3D5070]">{fmtDateTime(m.timestamp)}</span>
                {m.isApprovalMoment && <AIBadge />}
              </div>
              {m.to && <p className="text-xs text-[#6B7FA8]">To: {m.to.join(', ')}</p>}
              {m.cc && <p className="text-xs text-[#6B7FA8]">CC: {m.cc.join(', ')}</p>}
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

function GenericCenter({ payload }: { payload: GenericPayload }) {
  return (
    <div className="p-5 space-y-4">
      {payload.title && <h3 className="text-sm font-bold text-[#E8EEFF]">{payload.title}</h3>}
      {payload.content && <p className="whitespace-pre-wrap text-sm leading-6 text-[#A8BAD8]">{payload.content}</p>}
      {payload.records?.map((r, i) => (
        <div key={i} className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">{r.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-[#E8EEFF]">{r.value}</p>
        </div>
      ))}
      {!payload.content && !payload.records?.length && !payload.title && (
        <NotCaptured label="Source content" />
      )}
    </div>
  );
}

function CenterView({ payload, section }: { payload: NormalizedPayload; section: string }) {
  switch (payload.providerType) {
    case 'slack': return <SlackCenter payload={payload} section={section} />;
    case 'gmail': case 'outlook': return <EmailCenter payload={payload} />;
    case 'microsoft_teams': case 'google_chat': return <SlackCenter payload={{ ...payload as TeamsPayload, messages: (payload as TeamsPayload).messages } as unknown as SlackPayload} section={section} />;
    case 'jira': case 'servicenow': case 'asana': case 'monday': return <JiraCenter payload={payload} section={section} />;
    case 'github': case 'gitlab': case 'azure_devops': return <GitCenter payload={payload} section={section} />;
    default: return <GenericCenter payload={payload as GenericPayload} />;
  }
}

// ---------------------------------------------------------------------------
// Right panel
// ---------------------------------------------------------------------------
type RightTab = 'overview' | 'ai' | 'raw';

function RightPanel({ detail, approvalId, tab, setTab }: { detail: EvidenceDetailData; approvalId: string; tab: RightTab; setTab: (t: RightTab) => void }) {
  const tabs: { id: RightTab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'ai', label: 'AI Analysis' }, { id: 'raw', label: 'Raw Data' }];

  return (
    <div className="flex flex-col h-full overflow-y-auto border-l border-[#1E2D4A] bg-[#0E1830]">
      <div className="shrink-0 border-b border-[#1E2D4A] px-4 py-3">
        <p className="text-sm font-bold text-[#E8EEFF]">Evidence Details</p>
        <div className="mt-2 flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition ${tab === t.id ? 'bg-violet-600 text-white' : 'text-[#6B7FA8] hover:text-[#E8EEFF]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          {[
            ['Evidence ID', detail.evidenceId ?? '—'],
            ['Unified Evidence ID', detail.unifiedEvidenceId ?? '—'],
            ['Decision Type', detail.decisionType ?? '—'],
            ['Decision Title', detail.decisionTitle],
            ...(detail.amount ? [['Amount', detail.amount]] : []),
            ['Approver', detail.approverName ?? '—'],
            ['Captured At', detail.capturedAt],
            ['Source', detail.source ?? '—'],
            ...(detail.channel ? [['Channel', detail.channel]] : []),
            ...(detail.workspace ? [['Workspace', detail.workspace]] : []),
            ...(detail.threadTs ? [['Thread TS', detail.threadTs]] : []),
            ...(detail.messageTs ? [['Message TS', detail.messageTs]] : []),
            ...(detail.issueUrl ? [['Issue URL', detail.issueUrl]] : []),
            ...(detail.prUrl ? [['PR URL', detail.prUrl]] : []),
          ].map(([l, v]) => (
            <div key={String(l)} className="flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">{l}</p>
              <p className="text-xs font-semibold text-[#A8BAD8] break-all">{v}</p>
            </div>
          ))}

          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">Approver</p>
            <div className="flex items-center gap-2">
              {detail.approverName && <Avatar name={detail.approverName} size={6} />}
              <p className="text-xs font-semibold text-[#A8BAD8]">{detail.approverName ?? '—'}</p>
            </div>
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">Status</p>
            <StatusBadge status={detail.status} />
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">Risk Score</p>
            <RiskBadge level={detail.riskLevel} score={detail.riskScore} />
          </div>

          {/* AI Classification */}
          <div className="mt-2 rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-3 space-y-2">
            <p className="text-xs font-bold text-[#E8EEFF] flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-violet-400" /> AI Classification</p>
            <div className="flex justify-between items-center">
              <p className="text-[10px] text-[#3D5070]">Confidence</p>
              <p className={`text-sm font-black tabular-nums ${detail.confidenceScore >= 90 ? 'text-emerald-400' : detail.confidenceScore >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{detail.confidenceScore}%</p>
            </div>
            {detail.aiClassification && (
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-[#3D5070]">Classification</p>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{detail.aiClassification}</span>
              </div>
            )}
            {detail.aiReasoning && <p className="text-[10px] leading-4 text-[#6B7FA8]">{detail.aiReasoning}</p>}
            <PendingLink href={`/approvals/${approvalId}`} pendingText="Opening..." className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-400 hover:underline">
              View full analysis <ExternalLink className="h-2.5 w-2.5" />
            </PendingLink>
          </div>

          {/* Related records */}
          <div className="mt-2 rounded-xl border border-[#1E2D4A] bg-[#0a1524] p-3 space-y-2">
            <p className="text-xs font-bold text-[#E8EEFF]">Related Records</p>
            {detail.unifiedEvidenceId && (
              <PendingLink href={`/evidence`} pendingText="Opening..." className="flex items-center justify-between hover:bg-[#0E1830] rounded p-1 -mx-1">
                <span className="text-[10px] text-[#6B7FA8]">Unified Evidence Record</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-400">{detail.unifiedEvidenceId} <ExternalLink className="h-2.5 w-2.5" /></span>
              </PendingLink>
            )}
            <PendingLink href={`/approvals/${approvalId}`} pendingText="Opening..." className="flex items-center justify-between hover:bg-[#0E1830] rounded p-1 -mx-1">
              <span className="text-[10px] text-[#6B7FA8]">Approval Record</span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-violet-400">{detail.approvalRecordId.slice(-8).toUpperCase()} <ExternalLink className="h-2.5 w-2.5" /></span>
            </PendingLink>
            {detail.evidenceId && (
              <div className="flex items-center justify-between p-1 -mx-1">
                <span className="text-[10px] text-[#6B7FA8]">Raw Evidence</span>
                <span className="text-[10px] font-semibold text-[#A8BAD8]">{detail.evidenceId}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="text-center">
            <p className={`text-3xl font-black tabular-nums ${detail.confidenceScore >= 90 ? 'text-emerald-400' : detail.confidenceScore >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>{detail.confidenceScore}%</p>
            <p className="text-xs text-[#6B7FA8]">Confidence Score</p>
          </div>
          {detail.aiClassification && (
            <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">Classification</p>
              <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">{detail.aiClassification}</span>
            </div>
          )}
          {detail.aiReasoning && (
            <div className="rounded-lg border border-[#1E2D4A] bg-[#0a1524] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#3D5070]">Reasoning</p>
              <p className="mt-1 text-xs leading-5 text-[#A8BAD8]">{detail.aiReasoning}</p>
            </div>
          )}
          <PendingLink href={`/approvals/${approvalId}`} pendingText="Opening..." className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:underline">
            View full analysis <ExternalLink className="h-3 w-3" />
          </PendingLink>
        </div>
      )}

      {tab === 'raw' && (
        <div className="flex-1 p-4 overflow-y-auto">
          {detail.rawPayload ? (
            <pre className="overflow-x-auto rounded-xl bg-[#0a1524] p-4 text-[10px] leading-4 text-[#6B7FA8] border border-[#1E2D4A]">
              {JSON.stringify(detail.rawPayload, null, 2)}
            </pre>
          ) : (
            <NotCaptured label="Raw payload" />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SourceEvidenceViewer({ approvalId, approvalSubject, sourcePlatform, externalUrl, payload, detail }: SourceEvidenceViewerProps) {
  const [section, setSection] = useState(() => defaultSection(payload));
  const [rightTab, setRightTab] = useState<RightTab>('overview');

  const info = providerInfo(sourcePlatform);
  const navSections = buildNavSections(payload);
  const highlightCount = payload.providerType === 'slack' ? (payload as SlackPayload).messages.filter((m) => m.isApprovalMoment).length : 0;

  return (
    <div className="flex h-[calc(100svh-5rem)] flex-col overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#0E1830]">
      {/* Header */}
      <div className="shrink-0 border-b border-[#1E2D4A] bg-[#0a1524]">
        {/* Top row */}
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <ProviderIcon platform={sourcePlatform} size={9} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-[#E8EEFF]">Original Source (Open Source)</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Verified
                </span>
              </div>
              <p className="text-xs text-[#6B7FA8] truncate">View the original conversation and full context from {info.displayName}.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-4 text-xs text-[#6B7FA8]">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#3D5070]">Captured on</p>
                <p className="font-semibold text-[#A8BAD8]">{detail.capturedAt}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[#3D5070]">Source</p>
                <p className="font-semibold text-[#A8BAD8]">{info.displayName}</p>
              </div>
              {detail.channel && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#3D5070]">{info.location}</p>
                  <p className="font-semibold text-[#A8BAD8]">{detail.channel}</p>
                </div>
              )}
            </div>

            {externalUrl && (
              <a href={externalUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500">
                Open in {info.displayName} <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <PendingLink href={`/approvals/${approvalId}`} pendingText="Going back..." className="grid h-8 w-8 place-items-center rounded-lg border border-[#1E2D4A] text-[#6B7FA8] hover:text-[#E8EEFF]">
              <X className="h-4 w-4" />
            </PendingLink>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 px-5 pb-2 text-[11px] text-[#3D5070]">
          <PendingLink href="/dashboard/approvals" pendingText="Opening..." className="hover:text-violet-400">Approvals</PendingLink>
          <ChevronLeft className="h-3 w-3 rotate-180" />
          <PendingLink href={`/approvals/${approvalId}`} pendingText="Opening..." className="hover:text-violet-400 truncate max-w-[200px]">{approvalSubject}</PendingLink>
          <ChevronLeft className="h-3 w-3 rotate-180" />
          <span className="text-[#6B7FA8]">Open Source</span>
        </div>
      </div>

      {/* Body: three columns */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left nav */}
        <div className="w-56 shrink-0 overflow-y-auto border-r border-[#1E2D4A] bg-[#0a1524]">
          {navSections.map((sec) => (
            <div key={sec.title} className="pt-4">
              <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#3D5070]">{sec.title}</p>
              {sec.items.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button key={item.id} onClick={() => setSection(item.id)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition ${active ? 'border-l-2 border-violet-500 bg-violet-500/10 font-bold text-violet-400' : 'font-semibold text-[#6B7FA8] hover:bg-[#0E1830] hover:text-[#E8EEFF]'}`}>
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="rounded-full bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] tabular-nums text-[#6B7FA8]">{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Evidence highlight (Slack only) */}
          {payload.providerType === 'slack' && (
            <div className="pt-4">
              <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#3D5070]">Evidence Highlight</p>
              {[
                { id: 'thread', label: 'Captured Evidence', color: 'bg-emerald-400' },
                { id: 'timeline', label: 'Related Context', color: 'bg-blue-400' },
                { id: 'thread', label: 'AI Identified Approval', color: 'bg-violet-400', count: highlightCount },
              ].map((item, i) => (
                <button key={i} onClick={() => setSection(item.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-semibold text-[#6B7FA8] hover:bg-[#0E1830] hover:text-[#E8EEFF]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${item.color}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="rounded-full bg-[#1E2D4A] px-1.5 py-0.5 text-[10px] tabular-nums text-[#6B7FA8]">{item.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div className="pb-4 pt-4">
            <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#3D5070]">Navigation</p>
            <PendingLink href={`/approvals/${approvalId}`} pendingText="Opening..." className="flex w-full items-center gap-2 px-4 py-2 text-xs font-semibold text-[#6B7FA8] hover:bg-[#0E1830] hover:text-[#E8EEFF]">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to Approval
            </PendingLink>
          </div>
        </div>

        {/* Center content */}
        <div className="flex-1 min-w-0 overflow-hidden bg-[#0E1830]">
          <CenterView payload={payload} section={section} />
        </div>

        {/* Right panel */}
        <div className="w-72 shrink-0">
          <RightPanel detail={detail} approvalId={approvalId} tab={rightTab} setTab={setRightTab} />
        </div>
      </div>
    </div>
  );
}
