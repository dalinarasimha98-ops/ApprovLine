import crypto from 'crypto';
import type { Integration, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { enqueueIncomingMessage, type IncomingMessageJob } from '@/services/queue/approvalQueue';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';
import { decryptJson, encryptJson } from '@/utils/encryption';

export const SERVICENOW_READ_ONLY_SCOPES = ['useraccount', 'openid', 'profile', 'email'].join(' ');

type ServiceNowStatePayload = {
  organizationId: string;
  userId: string;
  instanceUrl: string;
  createdAt: number;
};

type ServiceNowTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type StoredServiceNowTokens = {
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

type ServiceNowReference =
  | string
  | {
      display_value?: string;
      value?: string;
      link?: string;
    };

type ServiceNowRecord = {
  sys_id?: string;
  number?: string;
  short_description?: string;
  description?: string;
  approval?: string;
  state?: string;
  approver?: ServiceNowReference;
  assigned_to?: ServiceNowReference;
  assignment_group?: ServiceNowReference;
  opened_by?: ServiceNowReference;
  requested_for?: ServiceNowReference;
  requested_by?: ServiceNowReference;
  request?: ServiceNowReference;
  cat_item?: ServiceNowReference;
  comments?: string;
  comments_and_work_notes?: string;
  work_notes?: string;
  sys_created_on?: string;
  sys_updated_on?: string;
  opened_at?: string;
  start_date?: string;
  end_date?: string;
  type?: string;
  risk?: string;
  priority?: string;
  impact?: string;
  urgency?: string;
};

type ServiceNowTableResponse = {
  result?: ServiceNowRecord[];
};

type ServiceNowSyncTable = {
  table: string;
  label: string;
  query: string;
  fields: string[];
};

export interface ServiceNowSyncResult {
  queued: number;
  processedImmediately: number;
  recordsProcessed: number;
  tablesProcessed: number;
  tableErrors: Array<{ table: string; reason: string }>;
}

const serviceNowTables: ServiceNowSyncTable[] = [
  {
    table: 'sysapproval_approver',
    label: 'Approval Records',
    query: 'sys_updated_on>=javascript:gs.daysAgoStart(30)^ORDERBYDESCsys_updated_on',
    fields: ['sys_id', 'number', 'approval', 'state', 'approver', 'sysapproval', 'comments', 'comments_and_work_notes', 'sys_created_on', 'sys_updated_on'],
  },
  {
    table: 'change_request',
    label: 'Change Requests',
    query: 'sys_updated_on>=javascript:gs.daysAgoStart(30)^ORDERBYDESCsys_updated_on',
    fields: ['sys_id', 'number', 'short_description', 'description', 'state', 'approval', 'assignment_group', 'assigned_to', 'opened_by', 'comments', 'comments_and_work_notes', 'risk', 'impact', 'urgency', 'sys_created_on', 'sys_updated_on'],
  },
  {
    table: 'sc_req_item',
    label: 'Catalog Requests',
    query: 'sys_updated_on>=javascript:gs.daysAgoStart(30)^ORDERBYDESCsys_updated_on',
    fields: ['sys_id', 'number', 'short_description', 'description', 'state', 'approval', 'request', 'cat_item', 'assignment_group', 'assigned_to', 'requested_for', 'comments', 'comments_and_work_notes', 'sys_created_on', 'sys_updated_on'],
  },
  {
    table: 'sc_request',
    label: 'Service Requests',
    query: 'sys_updated_on>=javascript:gs.daysAgoStart(30)^ORDERBYDESCsys_updated_on',
    fields: ['sys_id', 'number', 'short_description', 'description', 'state', 'approval', 'requested_for', 'requested_by', 'comments', 'comments_and_work_notes', 'sys_created_on', 'sys_updated_on'],
  },
];

function stateSecret() {
  return env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY ?? 'approvline-dev-servicenow-state-secret';
}

function metadataObject(metadata: Prisma.JsonValue | null | undefined) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

export function normalizeServiceNowInstanceUrl(input?: string | null) {
  const raw = input?.trim().replace(/\/+$/, '');
  if (!raw) throw new Error('missing_servicenow_instance');
  const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  if (url.protocol !== 'https:') throw new Error('ServiceNow instance URL must use https');
  return url.origin;
}

export function signServiceNowState(payload: {
  organizationId: string;
  userId: string;
  instanceUrl: string;
  createdAt?: number;
}) {
  const body = Buffer.from(JSON.stringify({ ...payload, createdAt: payload.createdAt ?? Date.now() })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyServiceNowState(state: string): ServiceNowStatePayload | null {
  const [body, signature] = state.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(actual, expectedBuffer)) return null;

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ServiceNowStatePayload;
  if (Date.now() - payload.createdAt > 10 * 60_000) return null;
  return payload;
}

export function serviceNowRedirectUri(requestUrl: string) {
  const base = env.APP_URL ?? new URL(requestUrl).origin;
  return new URL('/api/integrations/servicenow/callback', base).toString();
}

export function buildServiceNowInstallUrl(input: { requestUrl: string; state: string; instanceUrl: string }) {
  if (!env.SERVICENOW_CLIENT_ID) {
    throw new Error('SERVICENOW_CLIENT_ID is not configured');
  }

  const url = new URL('/oauth_auth.do', input.instanceUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.SERVICENOW_CLIENT_ID);
  url.searchParams.set('redirect_uri', serviceNowRedirectUri(input.requestUrl));
  url.searchParams.set('state', input.state);
  url.searchParams.set('scope', SERVICENOW_READ_ONLY_SCOPES);
  return url;
}

async function tokenRequest(instanceUrl: string, body: URLSearchParams) {
  const response = await fetch(new URL('/oauth_token.do', instanceUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? 'ServiceNow OAuth token request failed');
  }
  return payload as ServiceNowTokenPayload;
}

export async function exchangeServiceNowOAuthCode(input: { code: string; requestUrl: string; instanceUrl: string }) {
  if (!env.SERVICENOW_CLIENT_ID || !env.SERVICENOW_CLIENT_SECRET) {
    throw new Error('ServiceNow OAuth client credentials are not configured');
  }

  return tokenRequest(input.instanceUrl, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.SERVICENOW_CLIENT_ID,
    client_secret: env.SERVICENOW_CLIENT_SECRET,
    code: input.code,
    redirect_uri: serviceNowRedirectUri(input.requestUrl),
  }));
}

export function storedServiceNowTokens(tokens: ServiceNowTokenPayload): StoredServiceNowTokens {
  if (!tokens.access_token) throw new Error('ServiceNow did not return an access token');
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };
}

function readEncryptedTokens(integration: Pick<Integration, 'encryptedTokens'>): StoredServiceNowTokens {
  const encrypted = integration.encryptedTokens as EncryptedPayload | null;
  if (!encrypted?.iv || !encrypted.tag || !encrypted.data) {
    throw new Error('ServiceNow tokens are missing');
  }
  return decryptJson<StoredServiceNowTokens>(encrypted);
}

export async function refreshServiceNowAccessToken(integration: Pick<Integration, 'id' | 'encryptedTokens' | 'metadata'>) {
  const tokens = readEncryptedTokens(integration);
  if (tokens.expires_at && tokens.expires_at - 60_000 > Date.now()) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    return tokens.access_token;
  }
  if (!env.SERVICENOW_CLIENT_ID || !env.SERVICENOW_CLIENT_SECRET) {
    throw new Error('ServiceNow OAuth client credentials are not configured');
  }

  const metadata = metadataObject(integration.metadata);
  const instanceUrl = typeof metadata.instanceUrl === 'string' ? metadata.instanceUrl : env.SERVICENOW_INSTANCE_URL;
  const normalizedInstanceUrl = normalizeServiceNowInstanceUrl(instanceUrl);
  const payload = await tokenRequest(normalizedInstanceUrl, new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.SERVICENOW_CLIENT_ID,
    client_secret: env.SERVICENOW_CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
  }));

  const updatedTokens: StoredServiceNowTokens = {
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

async function serviceNowFetch<T>(accessToken: string, instanceUrl: string, path: string, params?: Record<string, string>) {
  const url = new URL(path, instanceUrl);
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
    throw new Error(payload.error?.message ?? payload.error_description ?? payload.error ?? 'ServiceNow API request failed');
  }
  return payload as T;
}

function refName(value?: ServiceNowReference) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.display_value ?? value.value;
}

function serviceNowRecordLink(instanceUrl: string, table: string, sysId?: string) {
  if (!sysId) return instanceUrl;
  return `${instanceUrl}/nav_to.do?uri=${encodeURIComponent(`${table}.do?sys_id=${sysId}`)}`;
}

function recordTitle(record: ServiceNowRecord) {
  return record.short_description ?? record.description?.split('\n')[0] ?? record.number ?? 'ServiceNow approval record';
}

function recordTimestamp(record: ServiceNowRecord) {
  return record.sys_updated_on ?? record.opened_at ?? record.sys_created_on;
}

function recordActor(record: ServiceNowRecord) {
  return refName(record.approver) ?? refName(record.assigned_to) ?? refName(record.requested_by) ?? refName(record.opened_by) ?? 'ServiceNow';
}

export function serviceNowRecordToJob(input: {
  organizationId: string;
  integrationId: string;
  instanceUrl: string;
  table: ServiceNowSyncTable;
  record: ServiceNowRecord;
}): IncomingMessageJob {
  const recordNumber = input.record.number ?? input.record.sys_id ?? 'unknown';
  const title = recordTitle(input.record);
  const actor = recordActor(input.record);
  const timestamp = recordTimestamp(input.record);
  const sourceLink = serviceNowRecordLink(input.instanceUrl, input.table.table, input.record.sys_id);
  const catalogItem = refName(input.record.cat_item);
  const assignmentGroup = refName(input.record.assignment_group);
  const comments = input.record.comments_and_work_notes ?? input.record.comments ?? input.record.work_notes;

  return {
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    provider: 'SERVICENOW',
    externalId: `${input.table.table}:${input.record.sys_id ?? recordNumber}:${timestamp ?? 'latest'}`,
    channel: `${input.table.label} / ${recordNumber}`,
    sender: actor,
    timestamp,
    sourceLink,
    message: [
      `ServiceNow ${input.table.label}: ${recordNumber} - ${title}`,
      input.table.table === 'change_request' ? `Change Request ID: ${recordNumber}` : `Request ID: ${recordNumber}`,
      catalogItem ? `Catalog Item: ${catalogItem}` : '',
      assignmentGroup ? `Assignment Group: ${assignmentGroup}` : '',
      `Approver: ${refName(input.record.approver) ?? actor}`,
      `State: ${input.record.state ?? 'Unknown'}`,
      `Approval: ${input.record.approval ?? 'Unknown'}`,
      input.record.risk ? `Risk: ${input.record.risk}` : '',
      input.record.impact ? `Impact: ${input.record.impact}` : '',
      timestamp ? `Timestamp: ${timestamp}` : '',
      comments ? `Comments: ${comments}` : '',
      input.record.description ? `Description: ${input.record.description}` : '',
    ].filter(Boolean).join('\n'),
    rawPayload: {
      sourcePlatform: 'servicenow',
      serviceNowInstanceUrl: input.instanceUrl,
      serviceNowTable: input.table.table,
      serviceNowTableLabel: input.table.label,
      requestId: recordNumber,
      changeRequestId: input.table.table === 'change_request' ? recordNumber : undefined,
      catalogItem,
      approver: refName(input.record.approver) ?? actor,
      assignmentGroup,
      state: input.record.state,
      approval: input.record.approval,
      timestamp,
      sourceLink,
      record: input.record,
    },
  };
}

async function enqueueOrProcess(job: IncomingMessageJob) {
  const queuedMessage = await enqueueIncomingMessage(job);
  if (queuedMessage.queued) return 'queued' as const;
  await processIncomingMessage(job, { auditAction: 'integration.servicenow.message_processed_without_queue' });
  return 'processed' as const;
}

export async function syncServiceNowIntegration(integration: Integration, input?: { maxRecords?: number }) {
  const accessToken = await refreshServiceNowAccessToken(integration);
  const metadata = metadataObject(integration.metadata);
  const instanceUrl = normalizeServiceNowInstanceUrl(typeof metadata.instanceUrl === 'string' ? metadata.instanceUrl : env.SERVICENOW_INSTANCE_URL);
  const maxRecords = input?.maxRecords ?? 25;

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: 'servicenow.sync.started',
      payload: { maxRecords, tables: serviceNowTables.map((table) => table.table) } as Prisma.InputJsonValue,
    },
  });

  let queued = 0;
  let processedImmediately = 0;
  let recordsProcessed = 0;
  let tablesProcessed = 0;
  const tableErrors: Array<{ table: string; reason: string }> = [];

  for (const table of serviceNowTables) {
    try {
      const response = await serviceNowFetch<ServiceNowTableResponse>(
        accessToken,
        instanceUrl,
        `/api/now/table/${encodeURIComponent(table.table)}`,
        {
          sysparm_query: table.query,
          sysparm_display_value: 'all',
          sysparm_limit: String(maxRecords),
          sysparm_fields: table.fields.join(','),
        },
      );
      tablesProcessed += 1;
      for (const record of response.result ?? []) {
        recordsProcessed += 1;
        const result = await enqueueOrProcess(serviceNowRecordToJob({
          organizationId: integration.organizationId,
          integrationId: integration.id,
          instanceUrl,
          table,
          record,
        }));
        if (result === 'queued') queued += 1;
        else processedImmediately += 1;
      }
    } catch (error) {
      tableErrors.push({ table: table.table, reason: error instanceof Error ? error.message : 'ServiceNow table sync failed' });
    }
  }

  const previousProcessed = typeof metadata.totalServiceNowRecordsProcessed === 'number' ? metadata.totalServiceNowRecordsProcessed : 0;
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: tableErrors.length === serviceNowTables.length ? 'ERROR' : 'CONNECTED',
      metadata: {
        ...metadata,
        instanceUrl,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: tableErrors.length ? 'partial' : 'ok',
        lastServiceNowTableErrors: tableErrors,
        totalServiceNowRecordsProcessed: previousProcessed + recordsProcessed,
        lastRecordsProcessed: recordsProcessed,
      },
    },
  });

  await prisma.event.create({
    data: {
      organizationId: integration.organizationId,
      integrationId: integration.id,
      type: tableErrors.length ? 'servicenow.sync.partial' : 'servicenow.sync.completed',
      payload: { queued, processedImmediately, recordsProcessed, tablesProcessed, tableErrors } as Prisma.InputJsonValue,
      processedAt: new Date(),
    },
  });

  return { queued, processedImmediately, recordsProcessed, tablesProcessed, tableErrors } satisfies ServiceNowSyncResult;
}

export async function syncAllServiceNowIntegrations(input?: { maxRecords?: number }) {
  const integrations = await prisma.integration.findMany({
    where: { provider: 'SERVICENOW', status: { in: ['CONNECTED', 'SYNCING'] } },
  });
  const results = [];
  for (const integration of integrations) {
    try {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
      results.push({ integrationId: integration.id, result: await syncServiceNowIntegration(integration, input) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'ServiceNow sync failed';
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
          type: 'servicenow.sync.error',
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
