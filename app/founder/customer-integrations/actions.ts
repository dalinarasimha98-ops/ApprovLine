'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getFounderAccess, logFounderAction } from '@/services/founder';
import { isSyncableProviderSlug, buildCustomerIntegrationDetail, type CustomerIntegrationDetail } from '@/services/founder-customer-integrations';
import { syncGmailIntegration } from '@/services/integrations/gmail';
import { syncOutlookIntegration } from '@/services/integrations/outlook';
import { syncJiraIntegration } from '@/services/integrations/jira';
import { syncTeamsIntegration } from '@/services/integrations/teams';
import { syncZoomIntegration } from '@/services/integrations/zoom';
import { syncServiceNowIntegration } from '@/services/integrations/servicenow';
import type { Integration, IntegrationProvider } from '@prisma/client';

/**
 * Founder server actions for the Customer Integrations operational
 * console. Every action re-derives Founder identity and read-only state
 * server-side, validates every id against the database, and audits via
 * the one canonical logFounderAction helper — never a client-supplied
 * actor identity, never a second access/audit mechanism.
 *
 * Customer access enable/disable reuse the exact existing, already-hardened
 * enableProviderForTenant/disableProviderForTenant from Integration
 * Catalog's actions.ts — imported directly by app/founder/customer-integrations/page.tsx
 * rather than duplicated or re-exported here (a 'use server' file may only
 * export async functions, not re-export bindings).
 */

async function requireFounderWrite() {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) {
    throw new Error('Unauthorized: founder write access required');
  }
  return access;
}

async function customerAccountIdForOrganization(organizationId: string): Promise<string | null> {
  const customer = await prisma.customerAccount.findUnique({ where: { organizationId }, select: { id: true } });
  return customer?.id ?? null;
}

/**
 * getCustomerIntegrationDetail — fetches the drawer's per-row detail
 * on demand (never preloaded for every row up front, which would not
 * scale past a handful of customers). Any authenticated Founder — including
 * read-only — may view; only requireFounderWrite()-gated actions may mutate.
 */
export async function getCustomerIntegrationDetail(organizationId: string, providerSlug: string): Promise<{ ok: true; data: CustomerIntegrationDetail } | { ok: false; error: string }> {
  const access = await getFounderAccess();
  if (!access.ok) return { ok: false, error: 'Not authorized.' };
  if (!organizationId || !providerSlug) return { ok: false, error: 'A customer and provider are required.' };
  const result = await buildCustomerIntegrationDetail(organizationId, providerSlug);
  if (!result.data) return { ok: false, error: result.safeError ?? 'Integration detail not found.' };
  return { ok: true, data: result.data };
}

// Real, already-existing per-provider sync functions (services/integrations/*.ts)
// — the exact same functions the customer-facing /api/integrations/*/sync
// routes call. Slack is deliberately absent: it has no polling sync route
// (webhook/event-driven only), so Founder-triggered sync is not offered
// for it rather than faked.
const SYNC_FUNCTIONS: Partial<Record<IntegrationProvider, (integration: Integration) => Promise<unknown>>> = {
  GMAIL: syncGmailIntegration,
  OUTLOOK: syncOutlookIntegration,
  JIRA: syncJiraIntegration,
  MICROSOFT_TEAMS: syncTeamsIntegration,
  ZOOM: syncZoomIntegration,
  SERVICENOW: syncServiceNowIntegration,
};

const SLUG_FOR_PROVIDER: Record<IntegrationProvider, string | undefined> = {
  SLACK: 'slack',
  GMAIL: 'gmail',
  OUTLOOK: 'outlook',
  MICROSOFT_TEAMS: 'microsoft_teams',
  JIRA: 'jira',
  SERVICENOW: 'servicenow',
  ZOOM: 'zoom',
  CUSTOM: undefined,
};

/**
 * triggerIntegrationSync — runs the customer's real, existing per-provider
 * sync function on their behalf. This is not a decorative retry button: it
 * calls the exact same function the customer-facing sync route calls,
 * which itself updates Integration.status/metadata and logs Event rows —
 * this action only adds Founder authorization and an audit trail on top.
 */
export async function triggerIntegrationSync(integrationId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await requireFounderWrite();
    if (!integrationId) return { ok: false, error: 'An integration is required.' };

    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration) return { ok: false, error: 'Integration not found.' };

    const slug = SLUG_FOR_PROVIDER[integration.provider];
    if (!slug || !isSyncableProviderSlug(slug)) {
      return { ok: false, error: 'Founder-triggered sync is not supported for this provider.' };
    }
    if (integration.status === 'SYNCING') {
      return { ok: false, error: 'A sync is already in progress for this integration.' };
    }

    const syncFn = SYNC_FUNCTIONS[integration.provider];
    if (!syncFn) return { ok: false, error: 'Founder-triggered sync is not supported for this provider.' };

    const previousStatus = integration.status;
    await prisma.integration.update({ where: { id: integration.id }, data: { status: 'SYNCING' } });
    let syncError: string | null = null;
    try {
      await syncFn(integration);
    } catch (error) {
      // The underlying sync function already writes the failure status/
      // metadata/Event row itself (see services/integrations/*.ts) — this
      // is only captured so the audit entry records an accurate outcome.
      syncError = error instanceof Error ? error.message : 'Sync failed';
    }

    const customerAccountId = await customerAccountIdForOrganization(integration.organizationId);
    await logFounderAction({
      access,
      customerAccountId,
      action: 'integration.sync.triggered',
      targetType: 'Integration',
      targetId: integration.id,
      metadata: { providerSlug: slug, previousStatus, error: syncError },
    });

    revalidatePath('/founder/customer-integrations');
    return syncError ? { ok: false, error: syncError } : { ok: true };
  } catch (error) {
    console.error('[founder-customer-integrations] triggerIntegrationSync failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
