import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { decryptJson, encryptJson } from '@/utils/encryption';

export const JIRA_READ_ONLY_SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'offline_access',
].join(' ');

type JiraStatePayload = {
  organizationId: string;
  userId: string;
  createdAt: number;
};

type JiraTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type StoredJiraTokens = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
};

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
};

export type JiraAccessibleResource = {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
};

type JiraUser = {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
};

type JiraStatus = {
  name?: string;
  statusCategory?: {
    name?: string;
  };
};

type JiraCommentBody =
  | string
  | {
      content?: JiraCommentBody[];
      text?: string;
      type?: string;
    };

export type JiraComment = {
  id: string;
  body?: JiraCommentBody;
  author?: JiraUser;
  created?: string;
  updated?: string;
};

export type JiraIssue = {
  id: string;
  key: string;
  self?: string;
  fields?: {
    summary?: string;
    project?: {
      key?: string;
      name?: string;
    };
    status?: JiraStatus;
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    created?: string;
    updated?: string;
    comment?: {
      comments?: JiraComment[];
    };
  };
  changelog?: {
    histories?: Array<{
      id?: string;
      created?: string;
      author?: JiraUser;
      items?: Array<{
        field?: string;
        fromString?: string;
        toString?: string;
      }>;
    }>;
  };
};

export interface JiraSyncResult {
  queued: number;
  processedImmediately: number;
  issuesProcessed: number;
  commentsProcessed: number;
  transitionsProcessed: number;
}

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-jira-state-secret';
}

export function signJiraState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyJiraState(state: string): JiraStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JiraStatePayload;
    if (!Number.isFinite(payload.createdAt) || Date.now() - payload.createdAt > 10 * 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function jiraRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/jira/callback', base).toString();
}

export function buildJiraInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.JIRA_CLIENT_ID) {
    throw new Error('JIRA_CLIENT_ID is not configured');
  }

  const url = new URL('https://auth.atlassian.com/authorize');
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', env.JIRA_CLIENT_ID);
  url.searchParams.set('scope', JIRA_READ_ONLY_SCOPES);
  url.searchParams.set('redirect_uri', jiraRedirectUri(input.requestUrl));
  url.searchParams.set('state', input.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent');
  return url;
}

export async function exchangeJiraOAuthCode(input: { code: string; requestUrl: string }) {
  if (!env.JIRA_CLIENT_ID || !env.JIRA_CLIENT_SECRET) {
    throw new Error('Jira OAuth client credentials are not configured');
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      code: input.code,
      redirect_uri: jiraRedirectUri(input.requestUrl),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Jira OAuth exchange failed');
  }
  return payload as JiraTokenPayload;
}

export function storedJiraTokens(tokens: JiraTokenPayload): StoredJiraTokens {
  if (!tokens.access_token) throw new Error('Jira did not return an access token');
  if (!tokens.refresh_token) throw new Error('Jira did not return a refresh token. Reconnect and approve offline access.');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredJiraTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('Jira tokens are missing');
  }
  return decryptJson<StoredJiraTokens>(encrypted);
}

export async function refreshJiraAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (!tokens.refresh_token) {
    throw new Error('Jira refresh token is missing; reconnect Jira');
  }
  if (tokens.expires_at && tokens.expires_at - 60_000 > Date.now()) {
    return tokens.access_token;
  }
  if (!env.JIRA_CLIENT_ID || !env.JIRA_CLIENT_SECRET) {
    throw new Error('Jira OAuth client credentials are not configured');
  }

  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to refresh Jira token');
  }

  const updatedTokens: StoredJiraTokens = {
    ...tokens,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : tokens.expires_at,
    scope: payload.scope ?? tokens.scope,
    token_type: payload.token_type ?? tokens.token_type,
  };
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      encryptedTokens: encryptJson(updatedTokens),
      metadata: {
        ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
        lastTokenRefreshAt: new Date().toISOString(),
      },
    },
  });
  return updatedTokens.access_token;
}

export async function fetchJiraAccessibleResources(accessToken: string) {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to fetch Jira sites');
  }
  return payload as JiraAccessibleResource[];
}

async function jiraFetch<T>(accessToken: string, cloudId: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.errorMessages?.join(', ') ?? payload.message ?? payload.error_description ?? payload.error ?? 'Jira API request failed');
  }
  return payload as T;
}

function adfToText(value?: JiraCommentBody): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const ownText = typeof value.text === 'string' ? value.text : '';
  const childText = value.content?.map(adfToText).filter(Boolean).join(' ') ?? '';
  return [ownText, childText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function jiraIssueLink(siteUrl: string | undefined, issueKey: string) {
  return siteUrl ? `${siteUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}` : `https://jira.example.com/browse/${encodeURIComponent(issueKey)}`;
}

export function jiraCommentToJob(input: {
  organizationId: string;
  integrationId: string;
  cloudId: string;
  siteUrl?: string;
  siteName?: string;
  issue: JiraIssue;
  comment: JiraComment;
}): IncomingMessageJob {
  const fields = input.issue.fields ?? {};
  const project = fields.project?.name ?? fields.project?.key ?? 'Unknown Jira project';
  const issueTitle = fields.summary ?? input.issue.key;
  const actor = input.comment.author?.displayName ?? 'Unknown Jira user';
  const commentBody = adfToText(input.comment.body);
  const timestamp = input.comment.updated ?? input.comment.created ?? fields.updated;
  const sourceLink = jiraIssueLink(input.siteUrl, input.issue.key);

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'JIRA',
    externalId: `${input.issue.key}:comment:${input.comment.id}`,
    channel: `${project} / ${input.issue.key}`,
    sender: actor,
    senderEmail: input.comment.author?.emailAddress,
    timestamp,
    sourceLink,
    message: [
      `Jira issue: ${input.issue.key} - ${issueTitle}`,
      `Project: ${project}`,
      `Status: ${fields.status?.name ?? 'Unknown'}`,
      `Actor: ${actor}`,
      timestamp ? `Timestamp: ${timestamp}` : '',
      `Comment: ${commentBody}`,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'jira',
      jiraCloudId: input.cloudId,
      jiraSiteName: input.siteName,
      jiraIssueId: input.issue.id,
      jiraIssueKey: input.issue.key,
      jiraProject: project,
      jiraIssueTitle: issueTitle,
      jiraStatus: fields.status?.name,
      jiraCommentId: input.comment.id,
      actorName: actor,
      actorAccountId: input.comment.author?.accountId,
      actorEmail: input.comment.author?.emailAddress,
      timestamp,
      sourceLink,
      comment: commentBody,
    },
  };
}

export function jiraTransitionToJob(input: {
  organizationId: string;
  integrationId: string;
  cloudId: string;
  siteUrl?: string;
  siteName?: string;
  issue: JiraIssue;
  history: NonNullable<NonNullable<JiraIssue['changelog']>['histories']>[number];
  transition: { fromString?: string; toString?: string };
}): IncomingMessageJob {
  const fields = input.issue.fields ?? {};
  const project = fields.project?.name ?? fields.project?.key ?? 'Unknown Jira project';
  const issueTitle = fields.summary ?? input.issue.key;
  const actor = input.history.author?.displayName ?? 'Unknown Jira user';
  const timestamp = input.history.created ?? fields.updated;
  const sourceLink = jiraIssueLink(input.siteUrl, input.issue.key);
  const transitionText = `Status changed from ${input.transition.fromString ?? 'unknown'} to ${input.transition.toString ?? 'unknown'}`;

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'JIRA',
    externalId: `${input.issue.key}:transition:${input.history.id ?? timestamp ?? transitionText}`,
    channel: `${project} / ${input.issue.key}`,
    sender: actor,
    senderEmail: input.history.author?.emailAddress,
    timestamp,
    sourceLink,
    message: [
      `Jira issue: ${input.issue.key} - ${issueTitle}`,
      `Project: ${project}`,
      `Actor: ${actor}`,
      timestamp ? `Timestamp: ${timestamp}` : '',
      transitionText,
      `Current status: ${fields.status?.name ?? 'Unknown'}`,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'jira',
      jiraCloudId: input.cloudId,
      jiraSiteName: input.siteName,
      jiraIssueId: input.issue.id,
      jiraIssueKey: input.issue.key,
      jiraProject: project,
      jiraIssueTitle: issueTitle,
      jiraStatus: fields.status?.name,
      actorName: actor,
      actorAccountId: input.history.author?.accountId,
      actorEmail: input.history.author?.emailAddress,
      timestamp,
      sourceLink,
      transition: input.transition,
    },
  };
}

async function enqueueOrProcess(job: IncomingMessageJob) {
  const queuedMessage = await enqueueIncomingMessage(job);
  if (queuedMessage.queued) return 'queued' as const;
  await processIncomingMessage(job, { auditAction: 'integration.jira.message_processed_without_queue' });
  return 'processed' as const;
}

export async function syncJiraIntegration(integration: Integration, input?: { maxIssues?: number; jql?: string }) {
  const accessToken = await refreshJiraAccessToken(integration);
  const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
  const cloudId = typeof metadata.cloudId === 'string' ? metadata.cloudId : undefined;
  const siteUrl = typeof metadata.siteUrl === 'string' ? metadata.siteUrl : undefined;
  const siteName = typeof metadata.siteName === 'string' ? metadata.siteName : integration.externalAccount ?? undefined;
  if (!cloudId) throw new Error('Jira cloud ID is missing; reconnect Jira');

  const maxIssues = input?.maxIssues ?? 25;
  const jql = input?.jql ?? 'updated >= -14d ORDER BY updated DESC';
  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'jira.sync.started',
      payload: { maxIssues, jql } as Prisma.InputJsonValue,
    },
  });

  const search = await jiraFetch<{ issues?: JiraIssue[] }>(
    accessToken,
    cloudId,
    `/rest/api/3/search?${new URLSearchParams({
      jql,
      maxResults: String(maxIssues),
      fields: 'summary,project,status,assignee,reporter,created,updated,comment',
      expand: 'changelog',
    }).toString()}`,
  );

  let queued = 0;
  let processedImmediately = 0;
  let issuesProcessed = 0;
  let commentsProcessed = 0;
  let transitionsProcessed = 0;

  for (const issue of search.issues ?? []) {
    issuesProcessed += 1;
    for (const comment of issue.fields?.comment?.comments ?? []) {
      commentsProcessed += 1;
      const result = await enqueueOrProcess(jiraCommentToJob({
        organizationId: integration.organizationId,
        integrationId: integration.id,
        cloudId,
        siteUrl,
        siteName,
        issue,
        comment,
      }));
      if (result === 'queued') queued += 1;
      else processedImmediately += 1;
    }

    for (const history of issue.changelog?.histories ?? []) {
      for (const item of history.items ?? []) {
        if (item.field?.toLowerCase() !== 'status') continue;
        transitionsProcessed += 1;
        const result = await enqueueOrProcess(jiraTransitionToJob({
          organizationId: integration.organizationId,
          integrationId: integration.id,
          cloudId,
          siteUrl,
          siteName,
          issue,
          history,
          transition: { fromString: item.fromString, toString: item.toString },
        }));
        if (result === 'queued') queued += 1;
        else processedImmediately += 1;
      }
    }
  }

  const previousProcessed = typeof metadata.totalJiraEventsProcessed === 'number' ? metadata.totalJiraEventsProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'CONNECTED',
      metadata: {
        ...metadata,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        totalJiraEventsProcessed: previousProcessed + commentsProcessed + transitionsProcessed,
        lastIssuesProcessed: issuesProcessed,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'jira.sync.completed',
      payload: { queued, processedImmediately, issuesProcessed, commentsProcessed, transitionsProcessed } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, processedImmediately, issuesProcessed, commentsProcessed, transitionsProcessed } satisfies JiraSyncResult;
}

export async function syncAllJiraIntegrations(input?: { maxIssues?: number; jql?: string }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'JIRA', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncJiraIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Jira sync failed';
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
          metadata: {
            ...(integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {}),
            lastSyncStatus: 'error',
            lastError: reason,
            lastErrorAt: new Date().toISOString(),
          },
        },
      }).catch(() => null);
      await prisma.event.create({
        data: {
          organizationId: integration.organizationId,
          integrationId: integration.id,
          type: 'jira.sync.error',
          payload: { reason } as Prisma.InputJsonValue,
          failedAt: new Date(),
          failureReason: reason,
        },
      }).catch(() => null);
      results.push({ integrationId: integration.id, error: reason });
    }
  }
  return results;
}
