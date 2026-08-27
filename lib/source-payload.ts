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
 *
 * Handles three payload generations:
 *  1. Old queue-envelope format: { payload: {...connectorFields}, queue: {...} }
 *     Written by processIncomingMessage before the envelope-wrapping fix.
 *  2. Connector-native format: top-level connectorFields with sourcePlatform key.
 *     Written by individual connectors before the canonical-field-name fix.
 *  3. Canonical format: top-level providerType key + canonical field names.
 *     Written by connectors after the fix; this is the target going forward.
 *
 * Falls back to GenericPayload so the viewer never crashes on unknown shapes.
 */
export function parseSourcePayload(rawPayload: unknown, platform?: string | null): NormalizedPayload {
  const p = platform?.trim().toLowerCase() ?? '';
  if (!isObj(rawPayload)) return { providerType: 'generic' };

  // Unwrap old processIncomingMessage queue envelope: { payload: {...}, queue: {...} }
  // Detection: top-level has no providerType/sourcePlatform but has a non-empty `payload` object.
  let raw: Record<string, unknown> = rawPayload;
  if (!str(raw.providerType) && !str(raw.sourcePlatform) && isObj(raw.payload) && Object.keys(raw.payload).length > 0) {
    raw = raw.payload as Record<string, unknown>;
  }

  // Resolve the provider discriminator from either canonical key or legacy connector key.
  const declared = str(raw.providerType) ?? str(raw.sourcePlatform);

  // ── Slack ──────────────────────────────────────────────────────────────────
  if (declared === 'slack' || p === 'slack') {
    // evidence sub-object written by the Slack webhook route (old connector format)
    const evidence = isObj(raw.evidence) ? (raw.evidence as Record<string, unknown>) : {};
    // event sub-object is the full Slack event payload spread at the top level
    const event = isObj(raw.event) ? (raw.event as Record<string, unknown>) : {};

    const workspace = str(raw.workspace) ?? str(evidence.teamId) ?? str(raw.team_id);
    const channel = str(raw.channel) ?? str(raw.channelName) ?? str(evidence.channel) ?? str(event.channel) ?? str(event.channel_id);
    const threadTs = str(raw.threadTs) ?? str(raw.thread_ts) ?? str(event.thread_ts);
    const messageTs = str(raw.messageTs) ?? str(evidence.messageTs) ?? str(raw.ts) ?? str(event.ts);

    let messages: SlackMessage[];
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      messages = parseSlackMessages(raw.messages);
    } else if (Array.isArray(raw.threadMessages) && raw.threadMessages.length > 0) {
      messages = (raw.threadMessages as unknown[]).filter(isObj).map((m) => ({
        senderName: String(m.senderName ?? 'Unknown'),
        senderEmail: str(m.senderEmail),
        timestamp: String(m.timestamp ?? ''),
        content: String(m.content ?? ''),
        isApprovalMoment: m.isApprovalMoment === true,
        reactions: parseReactions(m.reactions),
        replyCount: num(m.replyCount),
      }));
    } else {
      // Single Slack event: build one approval-moment message from flat fields
      const senderName = str(raw.senderName) ?? str(evidence.senderName) ?? str(event.user) ?? str(raw.user) ?? 'Unknown';
      const senderEmail = str(raw.senderEmail) ?? str(evidence.senderEmail);
      const text = str(event.text) ?? str(raw.text) ?? str(raw.body) ?? str(raw.content) ?? '';
      const ts = messageTs ?? str(raw.timestamp) ?? '';
      messages = [{ senderName, senderEmail, timestamp: ts, content: text, isApprovalMoment: true, reactions: parseReactions(event.reactions ?? raw.reactions) }];
    }

    return {
      providerType: 'slack',
      workspace,
      channel,
      memberCount: num(raw.memberCount),
      messages,
      participants: parseParticipants(raw.participants),
      attachments: parseAttachments(raw.attachments),
      links: parseLinks(raw.links),
      threadTs,
      messageTs,
    };
  }

  // ── Gmail / Outlook ────────────────────────────────────────────────────────
  if (declared === 'gmail' || p === 'gmail' || declared === 'outlook' || p === 'outlook') {
    const isOutlook = declared === 'outlook' || p === 'outlook';
    const pt: EmailPayload['providerType'] = isOutlook ? 'outlook' : 'gmail';

    // Resolve threadId from either canonical key or connector-specific keys
    const threadId = str(raw.threadId)
      ?? str(raw.gmailThreadId)
      ?? str(raw.outlookConversationId);

    let messages: EmailMessage[];
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      messages = parseEmailMessages(raw.messages);
    } else {
      // Build one message from flat connector fields
      const from = str(raw.senderName) ?? str(raw.from) ?? 'Unknown';
      const fromEmail = str(raw.senderEmail) ?? str(raw.fromEmail);
      const recipients = isObj(raw.recipients) ? (raw.recipients as Record<string, unknown>) : {};
      const toStr = str(recipients.to) ?? str(raw.to);
      const ccStr = str(recipients.cc) ?? str(raw.cc);
      const body = str(raw.body) ?? str(raw.bodyPreview) ?? str(raw.snippet) ?? str(raw.content) ?? '';
      messages = [{
        from,
        fromEmail,
        to: toStr ? [toStr] : undefined,
        cc: ccStr ? [ccStr] : undefined,
        timestamp: str(raw.timestamp) ?? '',
        subject: str(raw.subject),
        body,
        isApprovalMoment: true,
        attachments: parseAttachments(raw.attachments),
      }];
    }

    return {
      providerType: pt,
      subject: str(raw.subject) ?? '',
      messages,
      participants: parseParticipants(raw.participants),
      attachments: parseAttachments(raw.attachments),
      threadId,
    };
  }

  // ── Microsoft Teams / Google Chat ──────────────────────────────────────────
  if (declared === 'microsoft_teams' || p === 'microsoft_teams' || p === 'teams' || declared === 'google_chat' || p === 'google_chat') {
    const pt: TeamsPayload['providerType'] = (p === 'google_chat' || declared === 'google_chat') ? 'google_chat' : 'microsoft_teams';

    // Resolve team/channel from canonical or old connector-prefixed keys
    const team = str(raw.team) ?? str(raw.microsoftTeamName);
    const channel = str(raw.channel) ?? str(raw.microsoftChannelName);

    let messages: TeamsMessage[];
    if (Array.isArray(raw.messages) && raw.messages.length > 0) {
      messages = parseSlackMessages(raw.messages) as TeamsMessage[];
    } else {
      // Build one message from flat connector fields
      const senderName = str(raw.senderName) ?? 'Unknown';
      const senderEmail = str(raw.senderEmail);
      const body = str(raw.body) ?? str(raw.content) ?? '';
      messages = [{ senderName, senderEmail, timestamp: str(raw.timestamp) ?? '', content: body, isApprovalMoment: true }];
    }

    return { providerType: pt, team, channel, messages, participants: parseParticipants(raw.participants) };
  }

  // ── Jira / ServiceNow / Asana / Monday ────────────────────────────────────
  if (['jira', 'servicenow', 'asana', 'monday'].includes(declared ?? '') || ['jira', 'servicenow', 'asana', 'monday'].includes(p)) {
    const pt = (declared ?? p) as JiraPayload['providerType'];

    // Resolve from canonical names or old Jira-prefixed connector keys
    const issueKey = str(raw.issueKey) ?? str(raw.jiraIssueKey) ?? str(raw.requestId) ?? str(raw.changeRequestId);
    const issueTitle = str(raw.issueTitle) ?? str(raw.jiraIssueTitle);
    const project = str(raw.project) ?? str(raw.jiraProject);
    const status = str(raw.status) ?? str(raw.jiraStatus) ?? str(raw.state);
    const assignee = str(raw.assignee) ?? str(raw.approver) ?? str(raw.assignmentGroup);
    const reporter = str(raw.reporter) ?? str(raw.actorName);
    const issueUrl = str(raw.issueUrl) ?? str(raw.sourceLink);

    // ServiceNow wraps the raw record as record.* — pick nested fields
    const snRecord = isObj(raw.record) ? (raw.record as Record<string, unknown>) : {};
    const resolvedIssueTitle = issueTitle ?? str(snRecord.short_description);

    // Comments: structured array, single comment string (Jira comment event),
    // status transition (Jira transition event), or ServiceNow nested comments.
    let comments: JiraComment[] | undefined;
    if (Array.isArray(raw.comments)) {
      comments = parseJiraComments(raw.comments);
    } else if (str(raw.comment)) {
      comments = [{ author: reporter ?? 'Unknown', authorEmail: str(raw.actorEmail), timestamp: str(raw.timestamp) ?? '', body: str(raw.comment)!, isApprovalMoment: true }];
    } else if (isObj(raw.transition)) {
      const t = raw.transition as Record<string, unknown>;
      const body = `Status changed from ${str(t.fromString) ?? 'unknown'} to ${str(t.toString) ?? 'unknown'}`;
      comments = [{ author: reporter ?? 'Unknown', authorEmail: str(raw.actorEmail), timestamp: str(raw.timestamp) ?? '', body, isApprovalMoment: true }];
    } else if (str(snRecord.comments)) {
      comments = [{ author: assignee ?? 'Unknown', timestamp: str(raw.timestamp) ?? '', body: str(snRecord.comments)!, isApprovalMoment: true }];
    }

    // Approvals: structured array, or single flat approver from ServiceNow connector
    let approvals: JiraApproval[] | undefined;
    if (Array.isArray(raw.approvals)) {
      approvals = raw.approvals.filter(isObj).map((a) => ({
        approver: String(a.approver ?? a.name ?? 'Unknown'),
        approverRole: str(a.approverRole ?? a.role),
        status: String(a.status ?? 'Unknown'),
        timestamp: str(a.timestamp),
      }));
    } else if (str(raw.approver)) {
      approvals = [{ approver: str(raw.approver)!, status: str(raw.approval) ?? str(raw.state) ?? 'Unknown', timestamp: str(raw.timestamp) }];
    }

    return {
      providerType: pt,
      issueKey,
      issueTitle: resolvedIssueTitle,
      project,
      issueType: str(raw.issueType),
      priority: str(raw.priority),
      status,
      resolution: str(raw.resolution),
      assignee,
      reporter,
      comments,
      approvals,
      attachments: parseAttachments(raw.attachments),
      linkedIssues: parseLinkedIssues(raw.linkedIssues),
      participants: parseParticipants(raw.participants),
      changeHistoryCount: num(raw.changeHistoryCount),
      issueUrl,
    };
  }

  // ── Git platforms (GitHub / GitLab / Azure DevOps) ─────────────────────────
  if (['github', 'gitlab', 'azure_devops'].includes(declared ?? '') || ['github', 'gitlab', 'azure_devops'].includes(p)) {
    const pt = (declared ?? p) as GitPayload['providerType'];
    return {
      providerType: pt,
      prNumber: num(raw.prNumber),
      prTitle: str(raw.prTitle),
      prUrl: str(raw.prUrl) ?? str(raw.sourceLink),
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

  // ── Zoom (meeting transcript / recording) ──────────────────────────────────
  // Zoom meetings don't fit the chat-thread or ticket model, so they are
  // surfaced as a GenericPayload with the transcript as the primary content.
  if (declared === 'zoom' || p === 'zoom') {
    const participantCount = Array.isArray(raw.participants) ? raw.participants.length : 0;
    const records: NonNullable<GenericPayload['records']> = [];
    if (str(raw.hostName)) records.push({ label: 'Host', value: str(raw.hostEmail) ? `${str(raw.hostName)} <${str(raw.hostEmail)}>` : str(raw.hostName)! });
    if (str(raw.meetingId)) records.push({ label: 'Meeting ID', value: str(raw.meetingId)! });
    if (str(raw.sourceKind)) records.push({ label: 'Source Type', value: str(raw.sourceKind)!.replace(/_/g, ' ') });
    if (participantCount > 0) records.push({ label: 'Participants', value: `${participantCount} attendees` });
    if (str(raw.timestamp)) records.push({ label: 'Meeting Date', value: str(raw.timestamp)! });
    return { providerType: 'generic', title: str(raw.meetingTitle) ?? 'Zoom Meeting', content: str(raw.transcriptSnippet) ?? undefined, records: records.length > 0 ? records : undefined };
  }

  // ── Legacy threadMessages (unrecognised provider using old format) ──────────
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

/** Build a synthetic payload from ApprovalRecord fields when no raw provider
 *  payload was captured.  Surfaces the evidence snippet, reasoning, approver,
 *  and manual approval detail as structured records so the viewer always shows
 *  meaningful content instead of empty placeholders. */
export function constructSyntheticPayload(opts: {
  subject: string;
  evidenceSnippet?: string | null;
  reasoning?: string | null;
  approverName?: string | null;
  approverEmail?: string | null;
  platform?: string | null;
  channel?: string | null;
  status?: string | null;
  riskLevel?: string | null;
  conditions?: string | null;
  manualDetail?: {
    kind: string;
    approverRole: string;
    communicationChannel: string;
    businessContext: string;
    supportingNotes?: string | null;
    verificationStatus: string;
    location?: string | null;
  } | null;
}): GenericPayload {
  const records: NonNullable<GenericPayload['records']> = [];

  if (opts.approverName) {
    records.push({ label: 'Approver', value: opts.approverEmail ? `${opts.approverName} <${opts.approverEmail}>` : opts.approverName });
  }
  if (opts.platform) records.push({ label: 'Source Platform', value: opts.platform });
  if (opts.channel) records.push({ label: 'Channel', value: opts.channel });
  if (opts.status) records.push({ label: 'Status', value: opts.status.replace(/_/g, ' ') });
  if (opts.riskLevel) records.push({ label: 'Risk Level', value: opts.riskLevel });
  if (opts.conditions) records.push({ label: 'Conditions', value: opts.conditions });

  if (opts.manualDetail) {
    const md = opts.manualDetail;
    records.push({ label: 'Approval Kind', value: md.kind.replace(/_/g, ' ') });
    records.push({ label: 'Approver Role', value: md.approverRole });
    records.push({ label: 'Communication Channel', value: md.communicationChannel });
    if (md.location) records.push({ label: 'Location', value: md.location });
    records.push({ label: 'Verification Status', value: md.verificationStatus.replace(/_/g, ' ') });
    if (md.businessContext) records.push({ label: 'Business Context', value: md.businessContext });
    if (md.supportingNotes) records.push({ label: 'Supporting Notes', value: md.supportingNotes });
  }

  const content = opts.evidenceSnippet ?? opts.reasoning ?? undefined;
  return {
    providerType: 'generic',
    title: opts.subject,
    content,
    records: records.length > 0 ? records : undefined,
  };
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
