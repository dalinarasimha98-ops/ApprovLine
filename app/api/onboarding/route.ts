import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { DASHBOARD_TENANT_CACHE_TAG, getCurrentTenant } from '@/lib/auth';
import { buildOnboardingState, saveOnboardingPatch, type OnboardingPatch } from '@/services/onboarding';

export const dynamic = 'force-dynamic';

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET() {
  const tenant = await getCurrentTenant();
  if (tenant.user.role !== 'ADMIN') return forbidden('Only organization admins can manage onboarding.');
  try {
    const state = await buildOnboardingState(tenant.organization.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error('[onboarding-api] GET failed', error);
    return NextResponse.json({ error: 'Onboarding status is temporarily unavailable. Retry in a moment.' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const tenant = await getCurrentTenant();
  if (tenant.user.role !== 'ADMIN') return forbidden('Only organization admins can manage onboarding.');
  const patch = (await request.json()) as OnboardingPatch;
  try {
    const state = await saveOnboardingPatch({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      patch,
    });
    if (patch.complete) {
      // The cached getDashboardTenant() result (up to 5 minutes stale) must
      // never keep telling a just-onboarded user their workspace still needs
      // onboarding, so bust it the moment completion is recorded.
      revalidateTag(DASHBOARD_TENANT_CACHE_TAG);
    }
    return NextResponse.json(state);
  } catch (error) {
    console.error('[onboarding-api] PATCH failed', error);
    return NextResponse.json({ error: 'Could not save onboarding progress. Retry in a moment.' }, { status: 503 });
  }
}
