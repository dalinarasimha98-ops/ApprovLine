import { NextResponse } from 'next/server';
import { getCurrentTenant } from '@/lib/auth';
import { buildOnboardingState, saveOnboardingPatch, type OnboardingPatch } from '@/services/onboarding';

export const dynamic = 'force-dynamic';

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET() {
  const tenant = await getCurrentTenant();
  if (tenant.user.role !== 'ADMIN') return forbidden('Only organization admins can manage onboarding.');
  const state = await buildOnboardingState(tenant.organization.id);
  return NextResponse.json(state);
}

export async function PATCH(request: Request) {
  const tenant = await getCurrentTenant();
  if (tenant.user.role !== 'ADMIN') return forbidden('Only organization admins can manage onboarding.');
  const patch = (await request.json()) as OnboardingPatch;
  const state = await saveOnboardingPatch({
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    patch,
  });
  return NextResponse.json(state);
}
