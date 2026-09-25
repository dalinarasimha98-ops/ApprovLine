import { Mail, MessageSquare, Ticket, Video, Wrench, CheckCircle2 } from 'lucide-react';

type ProviderStyle = {
  label: string;
  badge: string;
  avatar: string;
  Icon: typeof Mail;
};

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  slack: { label: 'Slack', badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200', avatar: 'bg-fuchsia-500', Icon: MessageSquare },
  gmail: { label: 'Gmail', badge: 'bg-al-danger/10 text-al-danger border-al-danger/30', avatar: 'bg-al-danger', Icon: Mail },
  outlook: { label: 'Outlook', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200', avatar: 'bg-cyan-500', Icon: Mail },
  microsoft_teams: { label: 'Microsoft Teams', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', avatar: 'bg-indigo-500', Icon: MessageSquare },
  jira: { label: 'Jira', badge: 'bg-al-info/10 text-al-info border-al-info/30', avatar: 'bg-al-info/100', Icon: Ticket },
  servicenow: { label: 'ServiceNow', badge: 'bg-al-success/10 text-al-success border-al-success/30', avatar: 'bg-al-success', Icon: Wrench },
  zoom: { label: 'Zoom', badge: 'bg-sky-50 text-sky-700 border-sky-200', avatar: 'bg-sky-500', Icon: Video },
  sap: { label: 'SAP', badge: 'bg-al-warning/10 text-al-warning border-al-warning/30', avatar: 'bg-al-warning', Icon: Wrench },
};

function providerStyle(platform?: string | null): ProviderStyle {
  const key = platform?.trim().toLowerCase() ?? '';
  return PROVIDER_STYLES[key] ?? { label: platform || 'Source', badge: 'bg-al-surface-elevated text-al-text-secondary border-al-border', avatar: 'bg-al-text-muted', Icon: MessageSquare };
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

/**
 * Renders the one real captured message/event for an approval as a
 * platform-styled message card - sender, timestamp, and the actual
 * captured content - instead of a raw JSON dump. Deliberately does not
 * simulate a multi-message thread: this codebase captures one event per
 * approval, not a full back-and-forth conversation, and inventing
 * additional messages to look like a fuller thread would misrepresent
 * what was actually captured in a product whose core value is an
 * auditable evidence trail.
 */
export function EvidenceMessageCard({
  platform,
  senderName,
  senderEmail,
  timestamp,
  content,
}: {
  platform?: string | null;
  senderName: string;
  senderEmail?: string | null;
  timestamp: string;
  content: string | null;
}) {
  const style = providerStyle(platform);
  const Icon = style.Icon;

  return (
    <div className="rounded-2xl border border-al-success/30 bg-al-success/10/60 p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white ${style.avatar}`}>
          {initials(senderName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-al-text">{senderName}</p>
            <span className="text-xs font-semibold text-al-text-muted">{timestamp}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-al-success/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-al-success">
              <CheckCircle2 className="h-3 w-3" /> Approval captured
            </span>
          </div>
          <p className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${style.badge}`}>
            <Icon className="h-3 w-3" /> {style.label}
            {senderEmail ? <span className="font-semibold normal-case text-al-text-muted">· {senderEmail}</span> : null}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-al-text-secondary">
            {content || 'No message content was retained for this evidence event.'}
          </p>
        </div>
      </div>
    </div>
  );
}
