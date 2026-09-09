import {
  checkFounderDomainAvailability,
  founderFeatures,
  founderIntegrationCatalog,
  founderInviteLink,
  founderManagedUserRoles,
  FounderProvisioningError,
  getFounderAccess,
  provisionFounderCustomer,
} from '@/services/founder';
import { ProvisionWizard, type ProvisionActionState } from '@/components/founder/ProvisionWizard';

export const dynamic = 'force-dynamic';

function safeProvisionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 220);
}

async function checkDomainAction(domain: string) {
  'use server';
  try {
    return await checkFounderDomainAvailability(domain);
  } catch {
    // Advisory check only — a failure here never blocks the wizard; the
    // authoritative duplicate check runs again inside provisionAction.
    return { available: true };
  }
}

async function provisionAction(_prevState: ProvisionActionState, formData: FormData): Promise<ProvisionActionState> {
  'use server';
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder] provision access check failed', error);
    return null;
  });
  if (!access) return { error: 'Founder access could not be verified. Open readiness, confirm your super admin allowlist, then try again.', errorCode: 'UNKNOWN' };
  if (!access.ok) return { error: 'Founder access is required to provision customers.', errorCode: 'UNKNOWN' };
  if (access.readOnly) return { error: 'Support admins cannot provision customer accounts.', errorCode: 'UNKNOWN' };

  try {
    const customer = await provisionFounderCustomer(access, formData);
    return {
      ok: true,
      customerId: customer.id,
      companyName: customer.companyName,
      adminEmail: customer.primaryAdminEmail,
      adminInviteLink: founderInviteLink(customer.primaryAdminEmail),
    };
  } catch (error) {
    console.error('[founder] customer provisioning failed', error);
    if (error instanceof FounderProvisioningError) {
      return { error: error.message, errorCode: error.code };
    }
    return { error: `Customer provisioning could not complete. Safe diagnostic: ${safeProvisionError(error)}`, errorCode: 'UNKNOWN' };
  }
}

export default async function FounderProvisionPage() {
  const access = await getFounderAccess().catch((error) => {
    console.error('[founder] provision page access check failed', error);
    return { ok: false as const, reason: 'forbidden' as const, email: null, safeError: safeProvisionError(error) };
  });
  const readOnly = !access.ok || access.readOnly;
  const accessSafeError = 'safeError' in access ? access.safeError : undefined;

  return (
    <ProvisionWizard
      readOnly={readOnly}
      accessSafeError={accessSafeError}
      features={founderFeatures.map((f) => ({ key: f.key, label: f.label, category: f.category, description: f.description }))}
      integrations={founderIntegrationCatalog.map((i) => ({ key: i.key, label: i.label, category: i.category }))}
      adminRoles={founderManagedUserRoles.map((r) => ({ key: r.key, label: r.label }))}
      checkDomainAction={checkDomainAction}
      provisionAction={provisionAction}
    />
  );
}
