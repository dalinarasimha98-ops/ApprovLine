import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireEvidenceAccess } from '@/services/evidence/api-access';
import {
  checkEvidenceProviderHealth,
  disconnectEvidenceProvider,
  syncEvidenceProvider,
} from '@/services/evidence/provider-orchestrator';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  action: z.enum(['SYNC', 'HEALTH']),
  cursor: z.string().trim().min(1).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ providerKey: string }> },
) {
  const access = await requireEvidenceAccess('manage');
  if (!access.ok) return access.response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose SYNC or HEALTH.' }, { status: 422 });
  }
  const { providerKey } = await context.params;
  try {
    const result = parsed.data.action === 'SYNC'
      ? await syncEvidenceProvider({
        organizationId: access.organization.id,
        providerKey,
        cursor: parsed.data.cursor,
      })
      : await checkEvidenceProviderHealth(access.organization.id, providerKey);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider operation failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ providerKey: string }> },
) {
  const access = await requireEvidenceAccess('manage');
  if (!access.ok) return access.response;
  const { providerKey } = await context.params;
  try {
    await disconnectEvidenceProvider(access.organization.id, providerKey);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider disconnect failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
