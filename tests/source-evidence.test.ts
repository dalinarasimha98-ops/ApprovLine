/**
 * Source evidence parser certification suite.
 *
 * Covers every provider format the parser must handle:
 *  - Generation 1: old queue-envelope { payload: {...}, queue: {...} }
 *  - Generation 2: connector-native keys (sourcePlatform, prefixed fields)
 *  - Generation 3: canonical keys (providerType, canonical field names)
 *  - Synthetic fallback (null rawPayload)
 *  - ManualApprovalDetail synthetic payloads
 *  - Edge cases: null/undefined/empty/garbage
 */

import { parseSourcePayload, constructSyntheticPayload } from '../lib/source-payload';
import type {
  SlackPayload,
  EmailPayload,
  TeamsPayload,
  JiraPayload,
  GitPayload,
  GenericPayload,
  NormalizedPayload,
} from '../lib/source-payload';

// ── helpers ──────────────────────────────────────────────────────────────────

type NarrowPayload<T extends string> =
  T extends 'slack' ? SlackPayload :
  T extends 'gmail' | 'outlook' ? EmailPayload :
  T extends 'microsoft_teams' | 'google_chat' ? TeamsPayload :
  T extends 'jira' | 'servicenow' | 'asana' | 'monday' ? JiraPayload :
  T extends 'github' | 'gitlab' | 'azure_devops' ? GitPayload :
  GenericPayload;

function assertType<T extends NormalizedPayload['providerType']>(
  result: NormalizedPayload,
  expected: T,
): asserts result is NarrowPayload<T> {
  if (result.providerType !== expected) {
    throw new Error(`Expected providerType '${expected}', got '${result.providerType}'`);
  }
}

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${name}`);
    console.error(`    ${msg}`);
    errors.push(`${name}: ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── Slack ─────────────────────────────────────────────────────────────────────

console.log('\nSlack:');

test('Generation 3 (canonical) — messages array', () => {
  const raw = {
    providerType: 'slack',
    workspace: 'WTEAM1',
    channel: 'approvals',
    threadTs: '1700000000.000001',
    messageTs: '1700000001.000002',
    messages: [
      { senderName: 'Alice', senderEmail: 'alice@example.com', timestamp: '2024-01-01T00:00:00Z', content: 'Approved', isApprovalMoment: true },
    ],
  };
  const result = parseSourcePayload(raw, 'slack');
  assertType(result, 'slack');
  assert(result.workspace === 'WTEAM1', `workspace: ${result.workspace}`);
  assert(result.channel === 'approvals', `channel: ${result.channel}`);
  assert(result.messages.length === 1, `messages length: ${result.messages.length}`);
  assert(result.messages[0].senderName === 'Alice', `sender: ${result.messages[0].senderName}`);
  assert(result.messages[0].isApprovalMoment === true, 'isApprovalMoment');
  assert(result.threadTs === '1700000000.000001', 'threadTs');
  assert(result.messageTs === '1700000001.000002', 'messageTs');
});

test('Generation 2 (connector-native) — evidence sub-object', () => {
  const raw = {
    sourcePlatform: 'slack',
    evidence: {
      teamId: 'T_TEAM',
      channel: 'C_CHAN',
      messageTs: '1700000001.000001',
      senderName: 'Bob',
      senderEmail: 'bob@example.com',
    },
    event: {
      text: 'Please approve this request',
      ts: '1700000001.000001',
      thread_ts: '1700000000.000000',
    },
  };
  const result = parseSourcePayload(raw, 'slack');
  assertType(result, 'slack');
  assert(result.workspace === 'T_TEAM', `workspace: ${result.workspace}`);
  assert(result.channel === 'C_CHAN', `channel: ${result.channel}`);
  assert(result.messages.length === 1, `messages length: ${result.messages.length}`);
  assert(result.messages[0].content === 'Please approve this request', 'message content');
  assert(result.threadTs === '1700000000.000000', 'threadTs from event.thread_ts');
});

test('Generation 1 (queue envelope) — unwraps payload wrapper', () => {
  const raw = {
    payload: {
      sourcePlatform: 'slack',
      threadMessages: [
        { senderName: 'Carol', timestamp: '2024-01-01T00:00:00Z', content: 'Approved by Carol', isApprovalMoment: true },
      ],
      channelName: 'purchasing',
    },
    queue: { jobType: 'incoming_message', traceId: 'trace-001', metadata: {} },
  };
  const result = parseSourcePayload(raw, 'slack');
  assertType(result, 'slack');
  assert(result.messages.length === 1, `messages length: ${result.messages.length}`);
  assert(result.messages[0].senderName === 'Carol', `sender: ${result.messages[0].senderName}`);
});

test('platform arg dispatches when no providerType key exists', () => {
  const raw = { text: 'hello', ts: '111' };
  const result = parseSourcePayload(raw, 'slack');
  assertType(result, 'slack');
});

// ── Gmail ─────────────────────────────────────────────────────────────────────

console.log('\nGmail:');

test('Generation 3 (canonical) — messages array', () => {
  const raw = {
    providerType: 'gmail',
    subject: 'Purchase Order Approval',
    threadId: 'thread_abc123',
    messages: [
      { from: 'Alice', fromEmail: 'alice@example.com', to: ['bob@example.com'], timestamp: '2024-01-01T00:00:00Z', subject: 'Purchase Order Approval', body: 'Please approve PO #1234', isApprovalMoment: true },
    ],
  };
  const result = parseSourcePayload(raw, 'gmail');
  assertType(result, 'gmail');
  assert(result.subject === 'Purchase Order Approval', `subject: ${result.subject}`);
  assert(result.threadId === 'thread_abc123', `threadId: ${result.threadId}`);
  assert(result.messages.length === 1, `messages length: ${result.messages.length}`);
  assert(result.messages[0].from === 'Alice', `from: ${result.messages[0].from}`);
  assert(result.messages[0].body === 'Please approve PO #1234', 'body');
});

test('Generation 2 (connector-native) — gmailThreadId + flat fields', () => {
  const raw = {
    sourcePlatform: 'gmail',
    gmailMessageId: 'msg_001',
    gmailThreadId: 'thread_legacy',
    subject: 'Invoice Approval',
    senderName: 'Dave',
    senderEmail: 'dave@example.com',
    recipients: { to: 'manager@example.com', cc: null },
    snippet: 'Please approve the invoice for...',
    timestamp: '2024-02-01T10:00:00Z',
  };
  const result = parseSourcePayload(raw, 'gmail');
  assertType(result, 'gmail');
  assert(result.threadId === 'thread_legacy', `threadId: ${result.threadId}`);
  assert(result.messages.length === 1, `messages: ${result.messages.length}`);
  assert(result.messages[0].from === 'Dave', `from: ${result.messages[0].from}`);
  assert(result.messages[0].body === 'Please approve the invoice for...', 'body from snippet');
});

test('Generation 1 (queue envelope) — unwraps gmail payload', () => {
  const raw = {
    payload: {
      sourcePlatform: 'gmail',
      gmailThreadId: 'thread_enveloped',
      subject: 'Enveloped Gmail',
      senderName: 'Eve',
      senderEmail: 'eve@example.com',
      snippet: 'Enveloped body text',
      timestamp: '2024-03-01T00:00:00Z',
    },
    queue: { jobType: 'incoming_message', traceId: 'trace-002', metadata: {} },
  };
  const result = parseSourcePayload(raw, 'gmail');
  assertType(result, 'gmail');
  assert(result.threadId === 'thread_enveloped', `threadId: ${result.threadId}`);
  assert(result.messages[0].from === 'Eve', `from: ${result.messages[0].from}`);
});

// ── Outlook ───────────────────────────────────────────────────────────────────

console.log('\nOutlook:');

test('Generation 3 (canonical) — messages array', () => {
  const raw = {
    providerType: 'outlook',
    subject: 'Contract Approval',
    threadId: 'outlook_conv_001',
    messages: [
      { from: 'Frank', fromEmail: 'frank@example.com', timestamp: '2024-01-01T00:00:00Z', subject: 'Contract Approval', body: 'Please sign off on this contract', isApprovalMoment: true },
    ],
  };
  const result = parseSourcePayload(raw, 'outlook');
  assertType(result, 'outlook');
  assert(result.providerType === 'outlook', 'providerType');
  assert(result.threadId === 'outlook_conv_001', `threadId: ${result.threadId}`);
  assert(result.messages[0].body === 'Please sign off on this contract', 'body');
});

test('Generation 2 (connector-native) — outlookConversationId + bodyPreview', () => {
  const raw = {
    sourcePlatform: 'outlook',
    outlookConversationId: 'conv_legacy',
    subject: 'Budget Approval',
    senderName: 'Grace',
    senderEmail: 'grace@example.com',
    recipients: { to: 'cfo@example.com' },
    bodyPreview: 'Budget review request...',
    timestamp: '2024-02-15T09:00:00Z',
  };
  const result = parseSourcePayload(raw, 'outlook');
  assertType(result, 'outlook');
  assert(result.threadId === 'conv_legacy', `threadId: ${result.threadId}`);
  assert(result.messages[0].body === 'Budget review request...', 'body from bodyPreview');
});

// ── Microsoft Teams ───────────────────────────────────────────────────────────

console.log('\nMicrosoft Teams:');

test('Generation 3 (canonical) — messages array', () => {
  const raw = {
    providerType: 'microsoft_teams',
    team: 'Finance Team',
    channel: 'approvals',
    messages: [
      { senderName: 'Henry', timestamp: '2024-01-01T00:00:00Z', content: 'Approval needed for Q4 budget', isApprovalMoment: true },
    ],
  };
  const result = parseSourcePayload(raw, 'microsoft_teams');
  assertType(result, 'microsoft_teams');
  assert(result.team === 'Finance Team', `team: ${result.team}`);
  assert(result.channel === 'approvals', `channel: ${result.channel}`);
  assert(result.messages[0].senderName === 'Henry', `sender: ${result.messages[0].senderName}`);
});

test('Generation 2 (connector-native) — microsoftTeamName / microsoftChannelName', () => {
  const raw = {
    sourcePlatform: 'teams',
    microsoftTeamName: 'Legal Dept',
    microsoftChannelName: 'contracts',
    senderName: 'Iris',
    body: 'Please review and approve the NDA',
    timestamp: '2024-02-01T08:00:00Z',
  };
  const result = parseSourcePayload(raw, 'microsoft_teams');
  assertType(result, 'microsoft_teams');
  assert(result.team === 'Legal Dept', `team: ${result.team}`);
  assert(result.channel === 'contracts', `channel: ${result.channel}`);
  assert(result.messages[0].content === 'Please review and approve the NDA', 'content');
});

test('platform=teams (short) also dispatches correctly', () => {
  const raw = { sourcePlatform: 'teams', microsoftTeamName: 'T', microsoftChannelName: 'C', senderName: 'Jack', body: 'ok' };
  const result = parseSourcePayload(raw, 'teams');
  assertType(result, 'microsoft_teams');
});

// ── Jira ──────────────────────────────────────────────────────────────────────

console.log('\nJira:');

test('Generation 3 (canonical) — comment event', () => {
  const raw = {
    providerType: 'jira',
    issueKey: 'PROJ-123',
    project: 'Procurement',
    issueTitle: 'Vendor Approval',
    status: 'In Review',
    assignee: 'Kate',
    reporter: 'Liam',
    issueUrl: 'https://jira.example.com/browse/PROJ-123',
    comments: [
      { author: 'Liam', authorEmail: 'liam@example.com', timestamp: '2024-01-10T12:00:00Z', body: 'Approved. Proceeding with vendor.', isApprovalMoment: true },
    ],
  };
  const result = parseSourcePayload(raw, 'jira');
  assertType(result, 'jira');
  assert(result.issueKey === 'PROJ-123', `issueKey: ${result.issueKey}`);
  assert(result.project === 'Procurement', `project: ${result.project}`);
  assert(result.assignee === 'Kate', `assignee: ${result.assignee}`);
  assert((result.comments?.length ?? 0) === 1, `comments: ${result.comments?.length}`);
  assert(result.comments![0].isApprovalMoment === true, 'isApprovalMoment');
  assert(result.issueUrl === 'https://jira.example.com/browse/PROJ-123', 'issueUrl');
});

test('Generation 2 (connector-native) — jiraIssueKey + single comment string', () => {
  const raw = {
    sourcePlatform: 'jira',
    jiraIssueKey: 'OPS-999',
    jiraProject: 'Operations',
    jiraIssueTitle: 'Change Request',
    jiraStatus: 'Approved',
    actorName: 'Maya',
    actorEmail: 'maya@example.com',
    timestamp: '2024-02-01T14:00:00Z',
    comment: 'Change approved by security team',
  };
  const result = parseSourcePayload(raw, 'jira');
  assertType(result, 'jira');
  assert(result.issueKey === 'OPS-999', `issueKey: ${result.issueKey}`);
  assert(result.status === 'Approved', `status: ${result.status}`);
  assert((result.comments?.length ?? 0) === 1, `comments: ${result.comments?.length}`);
  assert(result.comments![0].body === 'Change approved by security team', 'comment body');
});

test('Generation 2 (connector-native) — transition event', () => {
  const raw = {
    sourcePlatform: 'jira',
    jiraIssueKey: 'HR-55',
    jiraProject: 'HR',
    jiraStatus: 'Done',
    actorName: 'Noah',
    actorEmail: 'noah@example.com',
    timestamp: '2024-02-20T10:00:00Z',
    transition: { fromString: 'In Progress', toString: 'Approved' },
  };
  const result = parseSourcePayload(raw, 'jira');
  assertType(result, 'jira');
  assert(result.comments![0].body.includes('In Progress'), 'transition body contains from');
  assert(result.comments![0].body.includes('Approved'), 'transition body contains to');
});

// ── ServiceNow ────────────────────────────────────────────────────────────────

console.log('\nServiceNow:');

test('Generation 3 (canonical) — issueKey + approvals', () => {
  const raw = {
    providerType: 'servicenow',
    issueKey: 'REQ0012345',
    project: 'Service Requests',
    issueTitle: 'Laptop Purchase',
    status: 'Approved',
    assignee: 'Oliver',
    approvals: [{ approver: 'Oliver', status: 'Approved', timestamp: '2024-03-01T09:00:00Z' }],
    comments: [{ author: 'Oliver', timestamp: '2024-03-01T09:00:00Z', body: 'Approved laptop purchase', isApprovalMoment: true }],
  };
  const result = parseSourcePayload(raw, 'servicenow');
  assertType(result, 'servicenow');
  assert(result.issueKey === 'REQ0012345', `issueKey: ${result.issueKey}`);
  assert((result.approvals?.length ?? 0) === 1, `approvals: ${result.approvals?.length}`);
  assert((result.comments?.length ?? 0) === 1, `comments: ${result.comments?.length}`);
});

test('Generation 2 (connector-native) — requestId + record nested fields', () => {
  const raw = {
    sourcePlatform: 'servicenow',
    requestId: 'RITM0099',
    approver: 'Penny',
    state: 'approved',
    approval: 'approved',
    timestamp: '2024-03-15T08:00:00Z',
    record: {
      short_description: 'Office supplies request',
      comments: 'Approved by department head',
    },
  };
  const result = parseSourcePayload(raw, 'servicenow');
  assertType(result, 'servicenow');
  assert(result.issueKey === 'RITM0099', `issueKey: ${result.issueKey}`);
  assert(result.issueTitle === 'Office supplies request', `issueTitle from record.short_description: ${result.issueTitle}`);
  assert((result.approvals?.length ?? 0) === 1, `approvals: ${result.approvals?.length}`);
  assert((result.comments?.length ?? 0) === 1, `comments from record.comments: ${result.comments?.length}`);
});

// ── Git platforms ─────────────────────────────────────────────────────────────

console.log('\nGit (GitHub / GitLab / Azure DevOps):');

test('GitHub PR payload', () => {
  const raw = {
    providerType: 'github',
    prNumber: 42,
    prTitle: 'Add payment integration',
    prUrl: 'https://github.com/acme/app/pull/42',
    repository: 'acme/app',
    author: 'Quinn',
    authorEmail: 'quinn@example.com',
    baseBranch: 'main',
    headBranch: 'feature/payment',
    prStatus: 'merged',
    filesChanged: 8,
    commits: 3,
    reviews: [{ reviewer: 'Riley', reviewerRole: 'Senior Engineer', state: 'APPROVED', timestamp: '2024-04-01T10:00:00Z', body: 'LGTM' }],
  };
  const result = parseSourcePayload(raw, 'github');
  assertType(result, 'github');
  assert(result.prNumber === 42, `prNumber: ${result.prNumber}`);
  assert(result.prUrl === 'https://github.com/acme/app/pull/42', 'prUrl');
  assert((result.reviews?.length ?? 0) === 1, `reviews: ${result.reviews?.length}`);
  assert(result.reviews![0].state === 'APPROVED', `review state: ${result.reviews![0].state}`);
  assert(result.filesChanged === 8, 'filesChanged');
});

test('GitHub without prUrl falls back to sourceLink', () => {
  const raw = {
    providerType: 'github',
    prTitle: 'Hotfix',
    sourceLink: 'https://github.com/acme/app/pull/99',
  };
  const result = parseSourcePayload(raw);
  assertType(result, 'github');
  assert(result.prUrl === 'https://github.com/acme/app/pull/99', `prUrl fallback: ${result.prUrl}`);
});

test('GitLab dispatches correctly', () => {
  const raw = { providerType: 'gitlab', prTitle: 'MR: Update auth', prNumber: 5 };
  const result = parseSourcePayload(raw);
  assertType(result, 'gitlab');
  assert(result.prTitle === 'MR: Update auth', 'prTitle');
});

test('Azure DevOps dispatches correctly', () => {
  const raw = { providerType: 'azure_devops', prTitle: 'Feature branch', prNumber: 12 };
  const result = parseSourcePayload(raw);
  assertType(result, 'azure_devops');
});

// ── Zoom ──────────────────────────────────────────────────────────────────────

console.log('\nZoom:');

test('Generation 3 (canonical) — Zoom meeting/transcript', () => {
  const raw = {
    providerType: 'zoom',
    meetingTitle: 'Quarterly Budget Review',
    meetingId: '123456789',
    hostName: 'Sam',
    hostEmail: 'sam@example.com',
    participants: [{ name: 'Sam' }, { name: 'Tyler' }],
    timestamp: '2024-05-01T14:00:00Z',
    sourceKind: 'transcript',
    transcriptSnippet: 'Sam: I move to approve the Q3 budget. Tyler: Seconded. Motion approved unanimously.',
  };
  const result = parseSourcePayload(raw, 'zoom');
  assertType(result, 'generic');
  assert(result.title === 'Quarterly Budget Review', `title: ${result.title}`);
  assert(result.content?.includes('Motion approved') ?? false, `content: ${result.content}`);
  assert(result.records?.some((r) => r.label === 'Host') ?? false, 'Host record');
  assert(result.records?.some((r) => r.label === 'Participants') ?? false, 'Participants record');
});

test('Generation 2 (connector-native) — sourcePlatform=zoom', () => {
  const raw = {
    sourcePlatform: 'zoom',
    meetingTitle: 'Weekly Sync',
    transcriptSnippet: 'Approved: travel budget',
    hostName: 'Uma',
    participants: [{}],
  };
  const result = parseSourcePayload(raw, 'zoom');
  assertType(result, 'generic');
  assert(result.title === 'Weekly Sync', 'title');
  assert(result.content?.includes('travel budget') ?? false, 'content');
});

// ── Synthetic fallback ────────────────────────────────────────────────────────

console.log('\nSynthetic fallback:');

test('null rawPayload → generic empty', () => {
  const result = parseSourcePayload(null);
  assertType(result, 'generic');
});

test('constructSyntheticPayload — full fields', () => {
  const result = constructSyntheticPayload({
    subject: 'Software License Approval',
    evidenceSnippet: 'License for 50 seats of Figma',
    reasoning: 'Standard SaaS license renewal within budget',
    approverName: 'Victor',
    approverEmail: 'victor@example.com',
    platform: 'email',
    channel: 'purchasing@example.com',
    status: 'APPROVED',
    riskLevel: 'low',
    conditions: 'Annual renewal only',
    manualDetail: {
      kind: 'VERBAL_APPROVAL',
      approverRole: 'CFO',
      communicationChannel: 'Zoom call',
      businessContext: 'Q4 budget cycle',
      supportingNotes: 'Recorded on 2024-12-01',
      verificationStatus: 'VERIFIED',
      location: 'Remote',
    },
  });
  assert(result.providerType === 'generic', 'providerType');
  assert(result.title === 'Software License Approval', 'title');
  assert(result.content === 'License for 50 seats of Figma', 'content from evidenceSnippet');
  assert(result.records?.some((r) => r.label === 'Approver' && r.value.includes('Victor')) ?? false, 'Approver record');
  assert(result.records?.some((r) => r.label === 'Status') ?? false, 'Status record');
  assert(result.records?.some((r) => r.label === 'Risk Level') ?? false, 'Risk record');
  assert(result.records?.some((r) => r.label === 'Approval Kind') ?? false, 'Kind record');
  assert(result.records?.some((r) => r.label === 'Approver Role' && r.value === 'CFO') ?? false, 'ApproverRole record');
  assert(result.records?.some((r) => r.label === 'Verification Status') ?? false, 'Verification record');
});

test('constructSyntheticPayload — minimal (only subject)', () => {
  const result = constructSyntheticPayload({ subject: 'Minimal approval' });
  assert(result.providerType === 'generic', 'providerType');
  assert(result.title === 'Minimal approval', 'title');
  assert(!result.content, 'no content without evidenceSnippet');
});

test('constructSyntheticPayload — uses reasoning when no evidenceSnippet', () => {
  const result = constructSyntheticPayload({
    subject: 'Budget approval',
    reasoning: 'Approved because within Q3 plan',
  });
  assert(result.content === 'Approved because within Q3 plan', `content: ${result.content}`);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

console.log('\nEdge cases:');

test('empty object → generic', () => {
  const result = parseSourcePayload({});
  assertType(result, 'generic');
});

test('garbage input (string) → generic', () => {
  const result = parseSourcePayload('not an object');
  assertType(result, 'generic');
});

test('demo placeholder payload (demo: true, founderDemo: true) → generic', () => {
  const result = parseSourcePayload({ demo: true, founderDemo: true });
  assertType(result, 'generic');
});

test('queue envelope with unrecognised inner payload → falls through to generic', () => {
  const raw = {
    payload: { randomKey: 'value', anotherKey: 42 },
    queue: { jobType: 'incoming_message', traceId: 'trace-xyz' },
  };
  const result = parseSourcePayload(raw);
  assertType(result, 'generic');
});

test('platform arg alone routes correctly when payload has no discriminator', () => {
  const raw = { workspace: 'W_TEAM', channel: 'general', text: 'Approved' };
  const result = parseSourcePayload(raw, 'slack');
  assertType(result, 'slack');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (errors.length > 0) {
  console.error('\nFailed tests:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
