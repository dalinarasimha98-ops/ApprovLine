'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getFounderAccess } from '@/services/founder';
import type { MarketplaceProviderStatus, IntegrationRequestStatus } from '@prisma/client';

/**
 * Founder server actions for Integration Marketplace management.
 *
 * All actions require founder auth and a non-read-only session.
 */

async function requireFounderWrite() {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) {
    throw new Error('Unauthorized: founder write access required');
  }
  return access;
}

/**
 * updateProviderStatus — change the lifecycle status of a marketplace provider.
 * Founder-only. Revalidates the integrations path.
 */
export async function updateProviderStatus(
  providerSlug: string,
  newStatus: MarketplaceProviderStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireFounderWrite();
    await prisma.marketplaceProvider.update({
      where: { slug: providerSlug },
      data: { status: newStatus },
    });
    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] updateProviderStatus failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * updateRequestStatus — update an IntegrationRequest's status from the founder queue.
 */
export async function updateRequestStatus(
  requestId: string,
  newStatus: IntegrationRequestStatus,
  founderNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireFounderWrite();
    await prisma.integrationRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        ...(founderNotes !== undefined ? { founderNotes } : {}),
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
 * enableProviderForTenant — create a TenantProviderAccess row granting explicit
 * access to a provider for a specific organization.
 *
 * @param providerSlug  The MarketplaceProvider slug
 * @param organizationId  The Organization.id (ApprovLine internal ID)
 * @param enabledByEmail  Email of the founder actor (for audit trail)
 */
export async function enableProviderForTenant(
  providerSlug: string,
  organizationId: string,
  enabledByEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireFounderWrite();
    await prisma.tenantProviderAccess.upsert({
      where: { organizationId_providerSlug: { organizationId, providerSlug } },
      create: { organizationId, providerSlug, enabledBy: enabledByEmail },
      update: { enabledAt: new Date(), enabledBy: enabledByEmail },
    });
    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] enableProviderForTenant failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * disableProviderForTenant — remove a TenantProviderAccess row.
 */
export async function disableProviderForTenant(
  providerSlug: string,
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireFounderWrite();
    await prisma.tenantProviderAccess.deleteMany({
      where: { organizationId, providerSlug },
    });
    revalidatePath('/founder/integrations');
    return { ok: true };
  } catch (error) {
    console.error('[founder-actions] disableProviderForTenant failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * updateProviderStatusFromForm — FormData wrapper for updateProviderStatus,
 * usable as a form action.
 */
export async function updateProviderStatusFromForm(formData: FormData): Promise<void> {
  const slug = formData.get('slug') as string;
  const status = formData.get('status') as MarketplaceProviderStatus;
  if (!slug || !status) return;
  await updateProviderStatus(slug, status);
}

/**
 * updateRequestStatusFromForm — FormData wrapper for updateRequestStatus,
 * usable as a form action.
 */
export async function updateRequestStatusFromForm(formData: FormData): Promise<void> {
  const requestId = formData.get('requestId') as string;
  const status = formData.get('status') as IntegrationRequestStatus;
  const notes = (formData.get('notes') as string) || undefined;
  if (!requestId || !status) return;
  await updateRequestStatus(requestId, status, notes);
}
