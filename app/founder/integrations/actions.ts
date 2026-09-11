'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getFounderAccess, logFounderAction } from '@/services/founder';
import { PROVIDER_LIFECYCLE_OPTIONS, REQUEST_STATUS_OPTIONS, isGrantableLifecycle } from '@/lib/founder-integrations';
import type { MarketplaceProviderStatus, IntegrationRequestStatus } from '@prisma/client';

/**
 * Founder server actions for the Integration Catalog (MarketplaceProvider /
 * TenantProviderAccess / IntegrationRequest). Every action:
 *   - re-derives Founder identity and read-only state server-side via
 *     getFounderAccess() — never trusts a client-supplied actor identity;
 *   - validates every id/slug against the database before mutating;
 *   - writes a FounderAuditLog entry (via the single canonical
 *     logFounderAction helper) recording the previous and new state.
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
 * updateProviderStatus — change the lifecycle status of a marketplace
 * provider. Founder-only, audited with before/after state.
 */
export async function updateProviderStatus(
  providerSlug: string,
  newStatus: MarketplaceProviderStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await requireFounderWrite();
    if (!providerSlug) return { ok: false, error: 'A provider is required.' };
    if (!PROVIDER_LIFECYCLE_OPTIONS.includes(newStatus as (typeof PROVIDER_LIFECYCLE_OPTIONS)[number])) {
      return { ok: false, error: 'Invalid lifecycle status.' };
    }

    const provider = await prisma.marketplaceProvider.findUnique({ where: { slug: providerSlug } });
    if (!provider) return { ok: false, error: 'Provider not found.' };

    const previousStatus = provider.status;
    await prisma.marketplaceProvider.update({
      where: { slug: providerSlug },
      data: { status: newStatus },
    });

    await logFounderAction({
      access,
      action: 'integration.provider.status_changed',
      targetType: 'MarketplaceProvider',
      targetId: provider.slug,
      metadata: {
        providerSlug: provider.slug,
        displayName: provider.displayName,
        previousStatus,
        newStatus,
      },
    });

    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] updateProviderStatus failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * updateRequestStatus — update an IntegrationRequest's status from the
 * founder queue. Founder-only, audited with before/after state.
 */
export async function updateRequestStatus(
  requestId: string,
  newStatus: IntegrationRequestStatus,
  founderNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await requireFounderWrite();
    if (!requestId) return { ok: false, error: 'A request is required.' };
    if (!REQUEST_STATUS_OPTIONS.includes(newStatus as (typeof REQUEST_STATUS_OPTIONS)[number])) {
      return { ok: false, error: 'Invalid request status.' };
    }

    const request = await prisma.integrationRequest.findUnique({
      where: { id: requestId },
      include: { organization: { select: { id: true, name: true } } },
    });
    if (!request) return { ok: false, error: 'Integration request not found.' };

    const previousStatus = request.status;
    await prisma.integrationRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        ...(founderNotes !== undefined ? { founderNotes } : {}),
      },
    });

    const customerAccountId = await customerAccountIdForOrganization(request.organization.id);
    await logFounderAction({
      access,
      customerAccountId,
      action: 'integration.request.status_changed',
      targetType: 'IntegrationRequest',
      targetId: requestId,
      metadata: {
        providerSlug: request.providerSlug,
        providerName: request.providerName,
        companyName: request.organization.name,
        previousStatus,
        newStatus,
      },
    });

    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] updateRequestStatus failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * enableProviderForTenant — create/refresh a TenantProviderAccess row
 * granting a customer availability to a provider. This makes the provider
 * available to the customer; it does NOT connect the customer's external
 * account or touch any credential.
 *
 * SECURITY: the actor identity is always the authenticated Founder from
 * getFounderAccess() — this action never accepts an actor email (or any
 * other identity claim) from the caller, so a client can never attribute a
 * grant to a different Founder.
 */
export async function enableProviderForTenant(
  providerSlug: string,
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await requireFounderWrite();
    if (!providerSlug || !organizationId) return { ok: false, error: 'A provider and customer are required.' };

    const [organization, provider] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
      prisma.marketplaceProvider.findUnique({ where: { slug: providerSlug } }),
    ]);
    if (!organization) return { ok: false, error: 'Customer organization not found.' };
    if (!provider) return { ok: false, error: 'Provider not found.' };
    if (!isGrantableLifecycle(provider.status)) {
      return { ok: false, error: `Cannot grant access to a provider in ${provider.status.replace('_', ' ')} status.` };
    }

    const actorEmail = access.email;
    await prisma.tenantProviderAccess.upsert({
      where: { organizationId_providerSlug: { organizationId, providerSlug } },
      create: { organizationId, providerSlug, enabledBy: actorEmail },
      update: { enabledAt: new Date(), enabledBy: actorEmail },
    });

    const customerAccountId = await customerAccountIdForOrganization(organizationId);
    await logFounderAction({
      access,
      customerAccountId,
      action: 'integration.customer_access.enabled',
      targetType: 'TenantProviderAccess',
      targetId: providerSlug,
      metadata: { providerSlug, displayName: provider.displayName, organizationId, providerStatus: provider.status },
    });

    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] enableProviderForTenant failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * disableProviderForTenant — remove a TenantProviderAccess row. Revoking
 * availability is always permitted regardless of the provider's current
 * lifecycle state (only granting is lifecycle-gated). Does not disconnect
 * any existing customer Integration/OAuth connection.
 */
export async function disableProviderForTenant(
  providerSlug: string,
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const access = await requireFounderWrite();
    if (!providerSlug || !organizationId) return { ok: false, error: 'A provider and customer are required.' };

    const [organization, provider] = await Promise.all([
      prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }),
      prisma.marketplaceProvider.findUnique({ where: { slug: providerSlug }, select: { slug: true, displayName: true } }),
    ]);
    if (!organization) return { ok: false, error: 'Customer organization not found.' };
    if (!provider) return { ok: false, error: 'Provider not found.' };

    await prisma.tenantProviderAccess.deleteMany({
      where: { organizationId, providerSlug },
    });

    const customerAccountId = await customerAccountIdForOrganization(organizationId);
    await logFounderAction({
      access,
      customerAccountId,
      action: 'integration.customer_access.disabled',
      targetType: 'TenantProviderAccess',
      targetId: providerSlug,
      metadata: { providerSlug, displayName: provider.displayName, organizationId },
    });

    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] disableProviderForTenant failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
