import crypto from 'crypto';
import { env } from '@/config/env';

export const SLACK_READ_ONLY_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'team:read',
  'users:read',
  'users:read.email',
].join(',');

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-state-secret';
}

export function signSlackState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifySlackState(state: string) {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    organizationId: string;
    userId: string;
    createdAt: number;
  };
  if (Date.now() - payload.createdAt > 10 * 60_000) return null;
  return payload;
}

export function slackRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/slack/callback', base).toString();
}

export function buildSlackInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.SLACK_CLIENT_ID) {
    throw new Error('SLACK_CLIENT_ID is not configured');
  }

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_READ_ONLY_SCOPES);
  url.searchParams.set('redirect_uri', slackRedirectUri(input.requestUrl));
  url.searchParams.set('state', input.state);
  return url;
}

export async function exchangeSlackOAuthCode(input: { code: string; requestUrl: string }) {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new Error('Slack OAuth client credentials are not configured');
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code: input.code,
      redirect_uri: slackRedirectUri(input.requestUrl),
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? 'Slack OAuth exchange failed');
  }

  return payload as {
    access_token: string;
    scope?: string;
    bot_user_id?: string;
    team?: { id?: string; name?: string };
    authed_user?: { id?: string };
    enterprise?: { id?: string; name?: string };
  };
}

export function verifySlackSignature(input: {
  signingSecret?: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  now?: number;
}) {
  if (!input.signingSecret || !input.timestamp || !input.signature) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 60 * 5) return false;

  const base = `v0:${input.timestamp}:${input.rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', input.signingSecret).update(base).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(input.signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function slackMessageLink(teamId: string | undefined, channel: string | undefined, ts: string | undefined) {
  if (!teamId || !channel || !ts) return undefined;
  return `https://app.slack.com/client/${teamId}/${channel}/p${ts.replace('.', '')}`;
}
