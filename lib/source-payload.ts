// Types and parsing for normalized source payloads from all supported providers.
// Every provider's rawPayload (from messageSource or CanonicalEvidenceEvent) is
// parsed into one of these shapes so the SourceEvidenceViewer can render
// provider-appropriate UI without knowing the raw payload structure.

export type Participant = { name: string; email?: string; role?: string };
export type SourceAttachment = { name: string; size?: string; type?: string; url?: string };
export type SourceLink = { text?: string; url: string };
export type Reaction = { emoji: string; count: number };

// ---- Slack ----------------------------------------------------------------
export type SlackMessage = {
  senderName: string;
  senderEmail?: string;
  senderRole?: string;
  timestamp: string;
  content: string;
  isApprovalMoment?: boolean;
  reactions?: Reaction[];
  replyCount?: number;
  lastReplyTs?: string;
};
export type SlackPayload = {
  providerType: 'slack';
  workspace?: string;
  channel?: string;
  memberCount?: number;
  messages: SlackMessage[];
  participants?: Participant[];
  attachments?: SourceAttachment[];
  links?: SourceLink[];
  threadTs?: string;
  messageTs?: string;
};

// ---- Email (Gmail / Outlook) ----------------------------------------------
export type EmailMessage = {
  from: string;
  fromEmail?: string;
  to?: string[];
  cc?: string[];
  timestamp: string;
  subject?: string;
  body: string;
  isApprovalMoment?: boolean;
  attachments?: SourceAttachment[];
};
export type EmailPayload = {
  providerType: 'gmail' | 'outlook';
  subject: string;
  messages: EmailMessage[];
  participants?: Participant[];
  attachments?: SourceAttachment[];
  threadId?: string;
};

// ---- Teams / Google Chat --------------------------------------------------
export type TeamsMessage = {
  senderName: string;
  senderEmail?: string;
  senderRole?: string;
  timestamp: string;
  content: string;
  isApprovalMoment?: boolean;
  reactions?: Reaction[];
};
export type TeamsPayload = {
  providerType: 'microsoft_teams' | 'google_chat';
  team?: string;
  channel?: string;
  messages: TeamsMessage[];
  participants?: Participant[];
};

// ---- Jira / ServiceNow / Asana / Monday ----------------------------------
export type JiraComment = {
  author: string;
  authorEmail?: string;
  authorRole?: string;
  timestamp: string;
  body: string;
  isApprovalMoment?: boolean;
  reactions?: Reaction[];
};
export type JiraApproval = { approver: string; approverRole?: string; status: string; timestamp?: string };
export type LinkedIssue = { key: string; title: string; type?: string; url?: string };
export type JiraPayload = {
  providerType: 'jira' | 'servicenow' | 'asana' | 'monday';
  issueKey?: string;
  issueTitle?: string;
  project?: string;
  issueType?: string;
  priority?: string;
  status?: string;
  resolution?: string;
  assignee?: string;
  reporter?: string;
  comments?: JiraComment[];
  approvals?: JiraApproval[];
  attachments?: SourceAttachment[];
  linkedIssues?: LinkedIssue[];
  participants?: Participant[];
  changeHistoryCount?: number;
  issueUrl?: string;
};

// ---- Git (GitHub / GitLab / Azure DevOps) ---------------------------------
export type GitReview = {
  reviewer: string;
  reviewerEmail?: string;
  reviewerRole?: string;
  timestamp: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  body?: string;
  isApprovalMoment?: boolean;
};
export type GitComment = { author: string; authorRole?: string; timestamp: string; body: string; isApprovalMoment?: boolean };
export type GitPayload = {
  providerType: 'github' | 'gitlab' | 'azure_devops';
  prNumber?: number;
  prTitle?: string;
  prUrl?: string;
  repository?: string;
  author?: string;
  authorEmail?: string;
  baseBranch?: string;
  headBranch?: string;
  createdAt?: string;
  mergedAt?: string;
  prStatus?: string;
  description?: string;
  reviews?: GitReview[];
  comments?: GitComment[];
  filesChanged?: number;
  commits?: number;
  checksPassed?: number;
  checksTotal?: number;
  linkedIssues?: string[];
  deployments?: string[];
};

// ---- Generic fallback -----------------------------------------------------
export type GenericPayload = {
  providerType: 'generic';
  title?: string;
  records?: Array<{ label: string; value: string }>;
  content?: string;
};

export type NormalizedPayload =
  | SlackPayload
  | EmailPayload
  | TeamsPayload
  | JiraPayload
  | GitPayload
  | GenericPayload;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}
function parseReactions(v: unknown): Reaction[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((r) => ({ emoji: String(r.emoji ?? ''), count: Number(r.count ?? 0) }));
}
function parseParticipants(v: unknown): Participant[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((p) => ({ name: String(p.name ?? 'Unknown'), email: str(p.email), role: str(p.role) }));
}
function parseAttachments(v: unknown): SourceAttachment[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((a) => ({ name: String(a.name ?? 'file'), size: str(a.size), type: str(a.type), url: str(a.url) }));
}
function parseLinks(v: unknown): SourceLink[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((l) => ({ text: str(l.text), url: String(l.url ?? l.href ?? '') }));
}
function parseSlackMessages(v: unknown): SlackMessage[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((m) => ({
    senderName: String(m.senderName ?? m.author ?? 'Unknown'),
    senderEmail: str(m.senderEmail),
    senderRole: str(m.senderRole ?? m.role),
    timestamp: String(m.timestamp ?? ''),
    content: String(m.content ?? m.body ?? ''),
    isApprovalMoment: m.isApprovalMoment === true,
    reactions: parseReactions(m.reactions),
    replyCount: num(m.replyCount),
    lastReplyTs: str(m.lastReplyTs),
  }));
}
function parseEmailMessages(v: unknown): EmailMessage[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObj).map((m) => ({
    from: String(m.from ?? m.senderName ?? 'Unknown'),
    fromEmail: str(m.fromEmail ?? m.senderEmail),
    to: Array.isArray(m.to) ? m.to.filter((x): x is string => typeof x === 'string') : undefined,
    cc: Array.isArray(m.cc) ? m.cc.filter((x): x is string => typeof x === 'string') : undefined,
    timestamp: String(m.timestamp ?? ''),
    subject: str(m.subject),
    body: String(m.body ?? m.content ?? ''),
    isApprovalMoment: m.isApprovalMoment === true,
  }));
}
function parseJiraComments(v: unknown): JiraComment[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((c) => ({
    author: String(c.author ?? c.senderName ?? 'Unknown'),
    authorEmail: str(c.authorEmail ?? c.senderEmail),
    authorRole: str(c.authorRole ?? c.role),
    timestamp: String(c.timestamp ?? ''),
    body: String(c.body ?? c.content ?? ''),
    isApprovalMoment: c.isApprovalMoment === true,
    reactions: parseReactions(c.reactions),
  }));
}
function parseLinkedIssues(v: unknown): LinkedIssue[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((i) => ({ key: String(i.key ?? ''), title: String(i.title ?? i.name ?? ''), type: str(i.type), url: str(i.url) }));
}
function parseGitReviews(v: unknown): GitReview[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((r) => ({
    reviewer: String(r.reviewer ?? r.author ?? 'Unknown'),
    reviewerEmail: str(r.reviewerEmail),
    reviewerRole: str(r.reviewerRole ?? r.role),
    timestamp: String(r.timestamp ?? ''),
    state: (['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'].includes(String(r.state)) ? r.state : 'COMMENTED') as GitReview['state'],
    body: str(r.body),
    isApprovalMoment: r.isApprovalMoment === true,
  }));
}
function parseGitComments(v: unknown): GitComment[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).map((c) => ({
    author: String(c.author ?? c.senderName ?? 'Unknown'),
    authorRole: str(c.authorRole ?? c.role),
    timestamp: String(c.timestamp ?? ''),
    body: String(c.body ?? c.content ?? ''),
    isApprovalMoment: c.isApprovalMoment === true,
  }));
}

/** Parse a raw DB payload (Prisma JsonValue) into a typed NormalizedPayload.
 *  Handles the legacy threadMessages format, all current providers, and
 *  falls back gracefully to GenericPayload so the viewer never crashes. */
export function parseSourcePayload(rawPayload: unknown, platform?: string | null): NormalizedPayload {
  const p = platform?.trim().toLowerCase() ?? '';
  if (!isObj(rawPayload)) return { providerType: 'generic' };
  const raw = rawPayload;
  const declared = str(raw.providerType);

  // Slack — including legacy threadMessages format
  if (declared === 'slack' || p === 'slack') {
    if (Array.isArray(raw.threadMessages)) {
      return {
        providerType: 'slack',
        channel: str(raw.channelName),
        messages: (raw.threadMessages as unknown[]).filter(isObj).map((m) => ({
          senderName: String(m.senderName ?? 'Unknown'),
          senderEmail: str(m.senderEmail),
          timestamp: String(m.timestamp ?? ''),
          content: String(m.content ?? ''),
          isApprovalMoment: m.isApprovalMoment === true,
          reactions: parseReactions(m.reactions),
          replyCount: num(m.replyCount),
        })),
        participants: parseParticipants(raw.participants),
        attachments: parseAttachments(raw.attachments),
        links: parseLinks(raw.links),
        threadTs: str(raw.threadTs),
        messageTs: str(raw.messageTs),
        workspace: str(raw.workspace),
        memberCount: num(raw.memberCount),
      };
    }
    return {
      providerType: 'slack',
      workspace: str(raw.workspace),
      channel: str(raw.channel) ?? str(raw.channelName),
      memberCount: num(raw.memberCount),
      messages: parseSlackMessages(raw.messages),
      participants: parseParticipants(raw.participants),
      attachments: parseAttachments(raw.attachments),
      links: parseLinks(raw.links),
      threadTs: str(raw.threadTs),
      messageTs: str(raw.messageTs),
    };
  }

  // Email
  if (declared === 'gmail' || p === 'gmail' || declared === 'outlook' || p === 'outlook') {
    return {
      providerType: (declared === 'outlook' || p === 'outlook') ? 'outlook' : 'gmail',
      subject: str(raw.subject) ?? '',
      messages: parseEmailMessages(raw.messages),
      participants: parseParticipants(raw.participants),
      attachments: parseAttachments(raw.attachments),
      threadId: str(raw.threadId),
    };
  }

  // Teams / Google Chat
  if (declared === 'microsoft_teams' || p === 'microsoft_teams' || p === 'teams' || declared === 'google_chat' || p === 'google_chat') {
    const pt: TeamsPayload['providerType'] = (p === 'google_chat' || declared === 'google_chat') ? 'google_chat' : 'microsoft_teams';
    return {
      providerType: pt,
      team: str(raw.team),
      channel: str(raw.channel),
      messages: parseSlackMessages(raw.messages) as TeamsMessage[],
      participants: parseParticipants(raw.participants),
    };
  }

  // Jira / ServiceNow / Asana / Monday
  if (['jira', 'servicenow', 'asana', 'monday'].includes(declared ?? '') || ['jira', 'servicenow', 'asana', 'monday'].includes(p)) {
    const pt = (declared ?? p) as JiraPayload['providerType'];
    return {
      providerType: pt,
      issueKey: str(raw.issueKey),
      issueTitle: str(raw.issueTitle),
      project: str(raw.project),
      issueType: str(raw.issueType),
      priority: str(raw.priority),
      status: str(raw.status),
      resolution: str(raw.resolution),
      assignee: str(raw.assignee),
      reporter: str(raw.reporter),
      comments: parseJiraComments(raw.comments),
      approvals: Array.isArray(raw.approvals) ? raw.approvals.filter(isObj).map((a) => ({
        approver: String(a.approver ?? a.name ?? 'Unknown'),
        approverRole: str(a.approverRole ?? a.role),
        status: String(a.status ?? 'Unknown'),
        timestamp: str(a.timestamp),
      })) : undefined,
      attachments: parseAttachments(raw.attachments),
      linkedIssues: parseLinkedIssues(raw.linkedIssues),
      participants: parseParticipants(raw.participants),
      changeHistoryCount: num(raw.changeHistoryCount),
      issueUrl: str(raw.issueUrl),
    };
  }

  // Git platforms
  if (['github', 'gitlab', 'azure_devops'].includes(declared ?? '') || ['github', 'gitlab', 'azure_devops'].includes(p)) {
    const pt = (declared ?? p) as GitPayload['providerType'];
    return {
      providerType: pt,
      prNumber: num(raw.prNumber),
      prTitle: str(raw.prTitle),
      prUrl: str(raw.prUrl),
      repository: str(raw.repository),
      author: str(raw.author),
      authorEmail: str(raw.authorEmail),
      baseBranch: str(raw.baseBranch),
      headBranch: str(raw.headBranch),
      createdAt: str(raw.createdAt),
      mergedAt: str(raw.mergedAt),
      prStatus: str(raw.prStatus),
      description: str(raw.description),
      reviews: parseGitReviews(raw.reviews),
      comments: parseGitComments(raw.comments),
      filesChanged: num(raw.filesChanged),
      commits: num(raw.commits),
      checksPassed: num(raw.checksPassed),
      checksTotal: num(raw.checksTotal),
      linkedIssues: Array.isArray(raw.linkedIssues) ? raw.linkedIssues.filter((x): x is string => typeof x === 'string') : undefined,
      deployments: Array.isArray(raw.deployments) ? raw.deployments.filter((x): x is string => typeof x === 'string') : undefined,
    };
  }

  // Legacy threadMessages (any unrecognised provider that still uses old format)
  if (Array.isArray(raw.threadMessages)) {
    return {
      providerType: 'slack',
      channel: str(raw.channelName),
      messages: (raw.threadMessages as unknown[]).filter(isObj).map((m) => ({
        senderName: String(m.senderName ?? 'Unknown'),
        timestamp: String(m.timestamp ?? ''),
        content: String(m.content ?? ''),
        isApprovalMoment: m.isApprovalMoment === true,
        reactions: parseReactions(m.reactions),
      })),
    };
  }

  return { providerType: 'generic', content: str(raw.content), title: str(raw.title) };
}

/** Merge extra context from a CanonicalEvidenceEvent (participants, attachments,
 *  links captured at ingest time) onto an already-parsed payload.  Overlays
 *  only fields that are missing from the payload, never overwrites. */
export function mergeEventContext(
  payload: NormalizedPayload,
  event: { participants?: unknown; attachments?: unknown; links?: unknown } | null,
): NormalizedPayload {
  if (!event) return payload;
  if (payload.providerType === 'generic') return payload;

  const extra: Partial<{ participants: Participant[]; attachments: SourceAttachment[]; links: SourceLink[] }> = {};
  const evPart = parseParticipants(event.participants);
  const evAtt = parseAttachments(event.attachments);
  const evLinks = parseLinks(event.links);

  if (evPart?.length) extra.participants = evPart;
  if (evAtt?.length) extra.attachments = evAtt;
  if (evLinks?.length) extra.links = evLinks;

  if ('participants' in payload) {
    return { ...payload, ...Object.fromEntries(Object.entries(extra).filter(([k]) => !(payload as Record<string, unknown>)[k])) };
  }
  return payload;
}
