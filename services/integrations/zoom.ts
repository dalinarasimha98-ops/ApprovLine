import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { decryptJson, encryptJson } from '@/utils/encryption';

export const ZOOM_READ_ONLY_SCOPES = [
  'user:read',
  'meeting:read',
  'recording:read',
  'report:read',
].join(' ');

type ZoomStatePayload = {
  organizationId: string;
  userId: string;
  createdAt: number;
};

type ZoomTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type StoredZoomTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
  token_type?: string;
};

type EncryptedPayload = {
  iv: string;
  tag: string;
  data: string;
};

type ZoomUser = {
  id?: string;
  account_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  type?: number;
};

type ZoomMeeting = {
  id?: number | string;
  uuid?: string;
  topic?: string;
  start_time?: string;
  timezone?: string;
  host_id?: string;
  host_email?: string;
  duration?: number;
  join_url?: string;
};

type ZoomRecordingFile = {
  id?: string;
  meeting_id?: string;
  recording_start?: string;
  recording_end?: string;
  file_type?: string;
  file_extension?: string;
  download_url?: string;
  play_url?: string;
  status?: string;
};

type ZoomRecordingMeeting = ZoomMeeting & {
  recording_files?: ZoomRecordingFile[];
  share_url?: string;
};

type ZoomParticipant = {
  id?: string;
  user_id?: string;
  name?: string;
  user_email?: string;
  join_time?: string;
  leave_time?: string;
};

type ZoomMeetingsResponse = {
  meetings?: ZoomMeeting[];
};

type ZoomRecordingsResponse = {
  meetings?: ZoomRecordingMeeting[];
};

type ZoomParticipantsResponse = {
  participants?: ZoomParticipant[];
};

type ZoomSummaryResponse = {
  summary_overview?: string;
  summary_details?: Array<{ label?: string; summary?: string }>;
  next_steps?: string;
};

export interface ZoomSyncResult {
  queued: number;
  processedImmediately: number;
  meetingsProcessed: number;
  transcriptsProcessed: number;
  summariesProcessed: number;
  recordingFilesProcessed: number;
  partialErrors: string[];
}

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-zoom-state-secret';
}

function metadataObject(metadata: Prisma.JsonValue | null | undefined) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

export function signZoomState(payload: { organizationId: string; userId: string; createdAt?: number }) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyZoomState(state: string): ZoomStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ZoomStatePayload;
    if (!Number.isFinite(payload.createdAt) || Date.now() - payload.createdAt > 10 * 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function zoomRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/zoom/callback', base).toString();
}

export function buildZoomInstallUrl(input: { requestUrl: string; state: string }) {
  if (!env.ZOOM_CLIENT_ID) {
    throw new Error('ZOOM_CLIENT_ID is not configured');
  }

  const url = new URL('https://zoom.us/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.ZOOM_CLIENT_ID);
  url.searchParams.set('redirect_uri', zoomRedirectUri(input.requestUrl));
  url.searchParams.set('state', input.state);
  return url;
}

function zoomBasicAuth() {
  if (!env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new Error('Zoom OAuth client credentials are not configured');
  }
  return Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString('base64');
}

async function zoomTokenRequest(params: URLSearchParams) {
  const response = await fetch(`https://zoom.us/oauth/token?${params.toString()}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${zoomBasicAuth()}`,
      accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.reason ?? payload.error_description ?? payload.error ?? 'Zoom OAuth token request failed');
  }
  return payload as ZoomTokenPayload;
}

export async function exchangeZoomOAuthCode(input: { code: string; requestUrl: string }) {
  return zoomTokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: zoomRedirectUri(input.requestUrl),
  }));
}

export function storedZoomTokens(tokens: ZoomTokenPayload): StoredZoomTokens {
  if (!tokens.access_token) throw new Error('Zoom did not return an access token');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredZoomTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('Zoom tokens are missing');
  }
  return decryptJson<StoredZoomTokens>(encrypted);
}

export async function refreshZoomAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (tokens.expires_at && tokens.expires_at - 60_000 > Date.now()) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    return tokens.access_token;
  }

  const payload = await zoomTokenRequest(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  }));
  const metadata = metadataObject(integration.metadata);
  const updatedTokens: StoredZoomTokens = {
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
        ...metadata,
        lastTokenRefreshAt: new Date().toISOString(),
      },
    },
  });
  return updatedTokens.access_token;
}

async function zoomFetch<T>(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(path, 'https://api.zoom.us/v2');
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? payload.reason ?? payload.error_description ?? payload.error ?? 'Zoom API request failed');
  }
  return payload as T;
}

export async function fetchZoomUser(accessToken: string) {
  return zoomFetch<ZoomUser>(accessToken, '/users/me');
}

function isoDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function meetingLink(meeting: ZoomMeeting | ZoomRecordingMeeting) {
  return meeting.join_url ?? (meeting as ZoomRecordingMeeting).share_url ?? `https://zoom.us/meeting/${encodeURIComponent(String(meeting.id ?? meeting.uuid ?? ''))}`;
}

function participantNames(participants: ZoomParticipant[]) {
  return participants.map((participant) => participant.name ?? participant.user_email).filter(Boolean).join(', ');
}

async function downloadZoomTextFile(accessToken: string, file: ZoomRecordingFile) {
  if (!file.download_url) return '';
  const response = await fetch(file.download_url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'text/plain,text/vtt,*/*',
    },
  });
  if (!response.ok) {
    throw new Error(`Unable to download Zoom transcript ${file.id ?? ''}`.trim());
  }
  const raw = await response.text();
  return raw
    .replace(/^WEBVTT.*$/gim, '')
    .replace(/^\d+$/gm, '')
    .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function summaryText(summary: ZoomSummaryResponse) {
  return [
    summary.summary_overview,
    ...(summary.summary_details ?? []).map((item) => [item.label, item.summary].filter(Boolean).join(': ')),
    summary.next_steps ? `Next steps: ${summary.next_steps}` : '',
  ].filter(Boolean).join('\n');
}

export function zoomTranscriptToJob(input: {
  organizationId: string;
  integrationId: string;
  meeting: ZoomRecordingMeeting | ZoomMeeting;
  host?: ZoomUser;
  participants?: ZoomParticipant[];
  transcriptText: string;
  transcriptId?: string;
  recordingId?: string;
  recordingUrl?: string;
  sourceKind: 'transcript' | 'summary' | 'meeting';
}): IncomingMessageJob {
  const meetingId = String(input.meeting.id ?? input.meeting.uuid ?? 'unknown');
  const topic = input.meeting.topic ?? 'Zoom meeting';
  const fallbackHostName = [input.host?.first_name, input.host?.last_name].filter(Boolean).join(' ');
  const hostName = input.host?.display_name || fallbackHostName || input.meeting.host_id || 'Zoom host';
  const timestamp = input.meeting.start_time ?? (input.meeting as ZoomRecordingMeeting).recording_files?.[0]?.recording_start ?? new Date().toISOString();
  const participants = input.participants ?? [];
  const sourceLink = input.recordingUrl ?? meetingLink(input.meeting);

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'ZOOM',
    externalId: `zoom:${meetingId}:${input.sourceKind}:${input.transcriptId ?? input.recordingId ?? timestamp}`,
    channel: `Zoom / ${topic}`,
    sender: hostName,
    senderEmail: input.host?.email ?? input.meeting.host_email,
    timestamp,
    sourceLink,
    message: [
      `Zoom meeting: ${topic}`,
      `Meeting ID: ${meetingId}`,
      input.recordingId ? `Recording ID: ${input.recordingId}` : '',
      input.transcriptId ? `Transcript ID: ${input.transcriptId}` : '',
      `Host: ${hostName}`,
      input.host?.email ?? input.meeting.host_email ? `Host email: ${input.host?.email ?? input.meeting.host_email}` : '',
      participants.length ? `Participants: ${participantNames(participants)}` : '',
      timestamp ? `Meeting date: ${timestamp}` : '',
      `Transcript / summary: ${input.transcriptText}`,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'zoom',
      zoomAccountId: input.host?.account_id,
      zoomUserId: input.host?.id,
      meetingId,
      meetingUuid: input.meeting.uuid,
      recordingId: input.recordingId,
      transcriptId: input.transcriptId,
      meetingTitle: topic,
      hostName,
      hostEmail: input.host?.email ?? input.meeting.host_email,
      participants,
      timestamp,
      recordingUrl: input.recordingUrl,
      sourceLink,
      sourceKind: input.sourceKind,
      transcriptSnippet: input.transcriptText.slice(0, 2000),
    },
  };
}

async function enqueueOrProcess(job: IncomingMessageJob) {
  const queuedMessage = await enqueueIncomingMessage(job);
  if (queuedMessage.queued) return 'queued' as const;
  await processIncomingMessage(job, { auditAction: 'integration.zoom.transcript_processed_without_queue' });
  return 'processed' as const;
}

async function safeParticipants(accessToken: string, meetingId: string, partialErrors: string[]) {
  try {
    const response = await zoomFetch<ZoomParticipantsResponse>(accessToken, `/past_meetings/${encodeURIComponent(meetingId)}/participants`, {
      page_size: '100',
    });
    return response.participants ?? [];
  } catch (error) {
    partialErrors.push(error instanceof Error ? error.message : 'Unable to fetch Zoom participants');
    return [];
  }
}

async function safeSummary(accessToken: string, meetingId: string, partialErrors: string[]) {
  try {
    return await zoomFetch<ZoomSummaryResponse>(accessToken, `/meetings/${encodeURIComponent(meetingId)}/meeting_summary`);
  } catch (error) {
    partialErrors.push(error instanceof Error ? error.message : 'Unable to fetch Zoom meeting summary');
    return null;
  }
}

export async function syncZoomIntegration(integration: Integration, input?: { daysBack?: number; maxMeetings?: number }) {
  const accessToken = await refreshZoomAccessToken(integration);
  const metadata = metadataObject(integration.metadata);
  const user = await fetchZoomUser(accessToken);
  const daysBack = input?.daysBack ?? 14;
  const maxMeetings = input?.maxMeetings ?? 20;
  const partialErrors: string[] = [];

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'zoom.sync.started',
      payload: { daysBack, maxMeetings } as Prisma.InputJsonValue,
    },
  });

  let recordings: ZoomRecordingMeeting[] = [];
  try {
    const response = await zoomFetch<ZoomRecordingsResponse>(accessToken, '/users/me/recordings', {
      from: isoDateDaysAgo(daysBack),
      to: todayIsoDate(),
      page_size: String(maxMeetings),
    });
    recordings = response.meetings ?? [];
  } catch (error) {
    partialErrors.push(error instanceof Error ? error.message : 'Unable to fetch Zoom recordings');
  }

  let meetings: ZoomMeeting[] = [];
  try {
    const response = await zoomFetch<ZoomMeetingsResponse>(accessToken, '/users/me/meetings', {
      type: 'previous_meetings',
      page_size: String(maxMeetings),
    });
    meetings = response.meetings ?? [];
  } catch (error) {
    partialErrors.push(error instanceof Error ? error.message : 'Unable to fetch previous Zoom meetings');
  }

  const meetingById = new Map<string, ZoomRecordingMeeting | ZoomMeeting>();
  for (const meeting of [...recordings, ...meetings]) {
    const key = String(meeting.id ?? meeting.uuid ?? crypto.randomUUID());
    if (!meetingById.has(key)) meetingById.set(key, meeting);
  }

  let queued = 0;
  let processedImmediately = 0;
  let meetingsProcessed = 0;
  let transcriptsProcessed = 0;
  let summariesProcessed = 0;
  let recordingFilesProcessed = 0;

  for (const meeting of [...meetingById.values()].slice(0, maxMeetings)) {
    meetingsProcessed += 1;
    const meetingId = String(meeting.id ?? meeting.uuid ?? '');
    const participants = meetingId ? await safeParticipants(accessToken, meetingId, partialErrors) : [];
    const recordingFiles = (meeting as ZoomRecordingMeeting).recording_files ?? [];
    const transcriptFiles = recordingFiles.filter((file) => ['TRANSCRIPT', 'CC'].includes(String(file.file_type ?? '').toUpperCase()) || ['VTT', 'TXT'].includes(String(file.file_extension ?? '').toUpperCase()));

    for (const transcript of transcriptFiles) {
      try {
        recordingFilesProcessed += 1;
        const transcriptText = await downloadZoomTextFile(accessToken, transcript);
        if (!transcriptText) continue;
        transcriptsProcessed += 1;
        const result = await enqueueOrProcess(zoomTranscriptToJob({
          organizationId: integration.organizationId,
          integrationId: integration.id,
          meeting,
          host: user,
          participants,
          transcriptText,
          transcriptId: transcript.id,
          recordingId: transcript.meeting_id,
          recordingUrl: transcript.play_url ?? (meeting as ZoomRecordingMeeting).share_url,
          sourceKind: 'transcript',
        }));
        if (result === 'queued') queued += 1;
        else processedImmediately += 1;
      } catch (error) {
        partialErrors.push(error instanceof Error ? error.message : 'Zoom transcript processing failed');
      }
    }

    if (!transcriptFiles.length && meetingId) {
      const summary = await safeSummary(accessToken, meetingId, partialErrors);
      const text = summary ? summaryText(summary) : '';
      if (text) {
        summariesProcessed += 1;
        const result = await enqueueOrProcess(zoomTranscriptToJob({
          organizationId: integration.organizationId,
          integrationId: integration.id,
          meeting,
          host: user,
          participants,
          transcriptText: text,
          sourceKind: 'summary',
        }));
        if (result === 'queued') queued += 1;
        else processedImmediately += 1;
      }
    }
  }

  const previousProcessed = typeof metadata.totalZoomTranscriptsProcessed === 'number' ? metadata.totalZoomTranscriptsProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: partialErrors.length && transcriptsProcessed + summariesProcessed === 0 ? 'ERROR' : 'CONNECTED',
      metadata: {
        ...metadata,
        accountId: user.account_id ?? metadata.accountId,
        userId: user.id ?? metadata.userId,
        userEmail: user.email ?? metadata.userEmail,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: partialErrors.length ? 'partial' : 'ok',
        lastZoomPartialErrors: partialErrors.slice(0, 6),
        totalZoomTranscriptsProcessed: previousProcessed + transcriptsProcessed + summariesProcessed,
        lastZoomMeetingsProcessed: meetingsProcessed,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: partialErrors.length ? 'zoom.sync.partial' : 'zoom.sync.completed',
      payload: { queued, processedImmediately, meetingsProcessed, transcriptsProcessed, summariesProcessed, recordingFilesProcessed, partialErrors } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, processedImmediately, meetingsProcessed, transcriptsProcessed, summariesProcessed, recordingFilesProcessed, partialErrors } satisfies ZoomSyncResult;
}

export async function syncAllZoomIntegrations(input?: { daysBack?: number; maxMeetings?: number }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'ZOOM', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncZoomIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Zoom sync failed';
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: reason.toLowerCase().includes('invalid_grant') ? 'NEEDS_REAUTH' : 'ERROR',
          metadata: {
            ...metadataObject(integration.metadata),
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
          type: 'zoom.sync.error',
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
