import { CheckCircle2, ExternalLink, Info } from 'lucide-react';
import { CopyEvidenceLinkButton } from '@/components/approvals/CopyEvidenceLinkButton';

export type ThreadMessage = {
  senderName: string;
  senderEmail?: string;
  timestamp: string;
  content: string;
  isApprovalMoment?: boolean;
  reactions?: Array<{ emoji: string; count: number }>;
};

export type EvidenceThreadPayload = {
  channelName?: string;
  threadMessages: ThreadMessage[];
};

/** Narrow an unknown JSON value (Prisma stores rawPayload as JsonValue) down
 *  to a well-formed thread payload, or null if the shape isn't present /
 *  doesn't match - callers fall back to the single-message card in that
 *  case rather than rendering something malformed. */
export function parseThreadPayload(rawPayload: unknown): EvidenceThreadPayload | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const value = rawPayload as Record<string, unknown>;
  const messages = value.threadMessages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const parsed: ThreadMessage[] = [];
  for (const entry of messages) {
    if (!entry || typeof entry !== 'object') continue;
    const message = entry as Record<string, unknown>;
    if (typeof message.senderName !== 'string' || typeof message.timestamp !== 'string' || typeof message.content !== 'string') continue;
    parsed.push({
      senderName: message.senderName,
      senderEmail: typeof message.senderEmail === 'string' ? message.senderEmail : undefined,
      timestamp: message.timestamp,
      content: message.content,
      isApprovalMoment: message.isApprovalMoment === true,
      reactions: Array.isArray(message.reactions)
        ? (message.reactions as unknown[])
            .filter((reaction): reaction is { emoji: string; count: number } =>
              Boolean(reaction) && typeof reaction === 'object' && typeof (reaction as Record<string, unknown>).emoji === 'string' && typeof (reaction as Record<string, unknown>).count === 'number',
            )
        : undefined,
    });
  }
  if (parsed.length === 0) return null;
  return { channelName: typeof value.channelName === 'string' ? value.channelName : undefined, threadMessages: parsed };
}

const AVATAR_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500', 'bg-cyan-500'];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Renders the complete captured thread (multiple messages, not just the
 * one that triggered the approval) when thread context was actually
 * captured - see parseThreadPayload(). Falls back to the single-message
 * EvidenceMessageCard wherever this isn't present, which is most real
 * records today: live thread capture requires each provider's ingestion
 * webhook to fetch full thread context (Slack conversations.replies,
 * Gmail thread API, etc.), which is separate work not done yet.
 */
export function EvidenceThread({
  payload,
  platform,
  participantCount,
  sourceUrl,
  evidenceLinkPath,
}: {
  payload: EvidenceThreadPayload;
  platform?: string | null;
  participantCount: number;
  sourceUrl?: string | null;
  evidenceLinkPath: string;
}) {
  const { channelName, threadMessages } = payload;
  let lastDay: string | null = null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-black text-slate-950">{channelName ?? 'Captured thread'}</h2>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
            {platform ?? 'Source'} · read-only view
          </span>
        </div>
        <p className="text-xs font-bold text-slate-500">{threadMessages.length} messages · {participantCount} participants</p>
      </div>

      <div className="border-b border-blue-100 bg-blue-50 px-5 py-3">
        <p className="flex items-start gap-2 text-sm font-semibold text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          ApprovLine captured the full thread for context. The approval moment is highlighted below.
        </p>
      </div>

      <div className="grid gap-4 p-5">
        {threadMessages.map((message, index) => {
          const label = dayLabel(message.timestamp);
          const showDivider = label !== null && label !== lastDay;
          if (label) lastDay = label;
          return (
            <div key={`${message.senderName}-${message.timestamp}-${index}`}>
              {showDivider ? (
                <div className="my-2 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  {label}
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              ) : null}
              <div className={`flex items-start gap-3 rounded-2xl p-4 ${message.isApprovalMoment ? 'border border-emerald-200 bg-emerald-50' : ''}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black text-white ${avatarColor(message.senderName)}`}>
                  {initials(message.senderName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{message.senderName}</p>
                    <span className="text-xs font-semibold text-slate-400">{timeLabel(message.timestamp)}</span>
                    {message.isApprovalMoment ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Approval captured
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.content}</p>
                  {message.reactions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.reactions.map((reaction) => (
                        <span key={reaction.emoji} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-600">
                          {reaction.emoji} {reaction.count}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 p-5">
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2155d9] px-4 text-sm font-bold text-white">
            <ExternalLink className="h-4 w-4" /> Open in {platform ?? 'source'}
          </a>
        ) : null}
        <CopyEvidenceLinkButton path={evidenceLinkPath} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" />
      </div>
    </div>
  );
}
