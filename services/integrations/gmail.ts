import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { decryptJson, encryptJson } from '@/utils/encryption';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';

export const GMAIL_READ_ONLY_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

type GmailStatePayload = {
  organizationId: string;
  userId: string;
  createdAt: number;
};

type GmailTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type StoredGmailTokens = {
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

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart & {
    headers?: GmailHeader[];
  };
};

export type GmailThread = {
  id: string;
  messages?: GmailMessage[];
};

export type GmailProfile = {
  sub?: string;
  id?: string;
  email?: string;
  name?: string;
  hd?: string;
  picture?: string;
};

export interface GmailSyncResult {
  queued: number;
  threadsProcessed: number;
  approvalsBeforeQueue: number;
}

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-gmail-state-secret';
}

function base64UrlDecode(value: string) {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

export function signGmailState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyGmailState(state: string): GmailStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GmailStatePayload;
    if (!Number.isFinite(payload.createdAt) || Date.now() - payload.createdAt > 10 * 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function gmailRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/gmail/callback', base).toString();
}

export function buildGmailInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', gmailRedirectUri(input.requestUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GMAIL_READ_ONLY_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', input.state);
  return url;
}

export async function exchangeGmailOAuthCode(input: { code: string; requestUrl: string }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth client credentials are not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: gmailRedirectUri(input.requestUrl),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Google OAuth exchange failed');
  }
  return payload as GmailTokenPayload;
}

export async function fetchGmailProfile(accessToken: string): Promise<GmailProfile> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to fetch Google profile');
  }
  return payload as GmailProfile;
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredGmailTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('Gmail tokens are missing');
  }
  return decryptJson<StoredGmailTokens>(encrypted);
}

export async function refreshGmailAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (!tokens.refresh_token) {
    throw new Error('Gmail refresh token is missing; reconnect Gmail');
  }

  if (tokens.expires_at && tokens.expires_at - 60_000 > Date.now()) {
    return tokens.access_token;
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth client credentials are not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to refresh Gmail token');
  }

  const updatedTokens: StoredGmailTokens = {
    ...tokens,
    access_token: payload.access_token,
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

export function storedGmailTokens(tokens: GmailTokenPayload): StoredGmailTokens {
  if (!tokens.access_token) throw new Error('Google did not return an access token');
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Reconnect and approve offline access.');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

function headerValue(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function parseEmailAddress(value: string) {
  const match = value.match(/^(?:"?([^"<]*)"?\s)?<?([^<>\s]+@[^<>\s]+)>?$/);
  if (!match) return { name: value, email: value };
  return {
    name: match[1]?.trim() || match[2],
    email: match[2].trim().toLowerCase(),
  };
}

function safeIsoDate(value?: string | number) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function collectBodyText(part?: GmailMessagePart): string {
  if (!part) return '';
  const current = part.mimeType?.startsWith('text/') && part.body?.data ? base64UrlDecode(part.body.data) : '';
  const nested = part.parts?.map(collectBodyText).filter(Boolean).join('\n') ?? '';
  return [current, nested].filter(Boolean).join('\n');
}

export function gmailMessageLink(accountEmail: string | undefined, threadId: string) {
  const user = accountEmail ? encodeURIComponent(accountEmail) : '0';
  return `https://mail.google.com/mail/u/${user}/#inbox/${threadId}`;
}

export function gmailMessageToJob(input: {
  organizationId: string;
  integrationId: string;
  accountEmail?: string;
  message: GmailMessage;
}): IncomingMessageJob {
  const subject = headerValue(input.message, 'Subject');
  const from = parseEmailAddress(headerValue(input.message, 'From'));
  const to = headerValue(input.message, 'To');
  const cc = headerValue(input.message, 'Cc');
  const dateHeader = headerValue(input.message, 'Date');
  const body = collectBodyText(input.message.payload) || input.message.snippet || '';
  const timestamp = input.message.internalDate
    ? safeIsoDate(Number(input.message.internalDate))
    : safeIsoDate(dateHeader);
  const sourceLink = gmailMessageLink(input.accountEmail, input.message.threadId);

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'GMAIL',
    externalId: input.message.id,
    channel: subject,
    sender: from.name,
    senderEmail: from.email,
    timestamp,
    sourceLink,
    message: [`Subject: ${subject}`, `From: ${from.name} <${from.email}>`, to ? `To: ${to}` : '', cc ? `Cc: ${cc}` : '', body]
      .filter(Boolean)
      .join('\n'),
    rawPayload: {
      sourcePlatform: 'gmail',
      gmailMessageId: input.message.id,
      gmailThreadId: input.message.threadId,
      subject,
      senderName: from.name,
      senderEmail: from.email,
      recipients: { to, cc },
      timestamp,
      sourceLink,
      snippet: input.message.snippet,
    },
  };
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.error_description ?? payload.error ?? 'Gmail API request failed');
  }
  return payload as T;
}

export async function syncGmailIntegration(integration: Integration, input?: { maxThreads?: number; query?: string }) {
  const accessToken = await refreshGmailAccessToken(integration);
  const metadata = integration.metadata && typeof integration.metadata === 'object' && !Array.isArray(integration.metadata) ? integration.metadata : {};
  const accountEmail = typeof metadata.accountEmail === 'string' ? metadata.accountEmail : integration.externalAccount ?? undefined;
  const maxThreads = input?.maxThreads ?? 25;
  const query = input?.query ?? 'newer_than:7d';

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'gmail.sync.started',
      payload: { maxThreads, query } as Prisma.InputJsonValue,
    },
  });

  const list = await gmailFetch<{ threads?: Array<{ id: string }> }>(
    accessToken,
    `users/me/threads?${new URLSearchParams({ maxResults: String(maxThreads), q: query }).toString()}`,
  );

  let queued = 0;
  let threadsProcessed = 0;
  for (const item of list.threads ?? []) {
    const thread = await gmailFetch<GmailThread>(
      accessToken,
      `users/me/threads/${item.id}?${new URLSearchParams({ format: 'full' }).toString()}`,
    );
    threadsProcessed += 1;
    for (const message of thread.messages ?? []) {
      const queuedMessage = await enqueueIncomingMessage(gmailMessageToJob({
        organizationId: integration.organizationId,
        integrationId: integration.id,
        accountEmail,
        message,
      }));
      if (queuedMessage.queued) queued += 1;
    }
  }

  const previousProcessed = typeof metadata.totalEmailsProcessed === 'number' ? metadata.totalEmailsProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: 'CONNECTED',
      metadata: {
        ...metadata,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        totalEmailsProcessed: previousProcessed + queued,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'gmail.sync.completed',
      payload: { queued, threadsProcessed, query } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, threadsProcessed, approvalsBeforeQueue: 0 } satisfies GmailSyncResult;
}

export async function syncAllGmailIntegrations(input?: { maxThreads?: number; query?: string }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'GMAIL', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncGmailIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Gmail sync failed';
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
          type: 'gmail.sync.error',
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
