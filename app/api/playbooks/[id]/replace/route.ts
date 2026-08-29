import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { extractPlaybookText, indexPlaybookDocument } from '@/services/playbooks';
import { writeAuditLog } from '@/services/audit';
import { EntitlementDeniedError, requireEntitlement } from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

const allowedExtensions = new Set(['pdf', 'docx', 'txt', 'md', 'markdown']);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const tenant = await getDashboardTenant(4000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: tenant.error ?? 'Workspace unavailable.' }, { status: 503 });
  if (!hasAnyRole(tenant.user.role, ['OWNER', 'ADMIN'])) {
    return NextResponse.json({ error: 'Your workspace role cannot replace playbooks.' }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.playbookDocument.findFirst({
    where: { id, organizationId: tenant.organization.id },
  });
  if (!existing) return NextResponse.json({ error: 'Playbook not found.' }, { status: 404 });
  if (existing.status === 'ARCHIVED') {
    return NextResponse.json({ error: 'Cannot replace an archived document.' }, { status: 400 });
  }

  try {
    await requireEntitlement(tenant.organization.id, 'playbook_ai');
  } catch (err) {
    if (err instanceof EntitlementDeniedError) {
      return NextResponse.json({ error: err.message, code: 'ENTITLEMENT_REQUIRED' }, { status: 403 });
    }
    throw err;
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a PDF, DOCX, TXT, or Markdown file.' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Playbook file must be 10 MB or smaller.' }, { status: 413 });
    }
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedExtensions.has(extension)) {
      return NextResponse.json({ error: 'Unsupported playbook file type.' }, { status: 400 });
    }

    const content = await extractPlaybookText(file);
    if (content.length < 40) {
      return NextResponse.json({ error: 'Could not extract enough text from this document.' }, { status: 400 });
    }

    const existingMeta = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata as Record<string, unknown> : {};
    const category = (String(form.get('category') ?? '')).trim() || String(existingMeta.category ?? '');

    // Index the new version. If this throws, the old document stays READY.
    const newDocument = await indexPlaybookDocument({
      organizationId: tenant.organization.id,
      ownerUserId: tenant.user.id,
      name: file.name,
      fileType: extension,
      content,
      category: category || undefined,
      replacesId: existing.id,
      versionNumber: existing.versionNumber + 1,
      metadata: {
        category: category || undefined,
        originalSize: file.size,
        contentType: file.type || 'unknown',
      },
    });

    // Only mark old doc SUPERSEDED after new version is successfully READY
    await prisma.playbookDocument.update({
      where: { id: existing.id },
      data: { status: 'SUPERSEDED', archivedAt: new Date() },
    });

    await writeAuditLog({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: 'playbook.document.replaced',
      metadata: {
        previousDocumentId: existing.id,
        previousDocumentName: existing.name,
        previousVersionNumber: existing.versionNumber,
        newDocumentId: newDocument.id,
        newDocumentName: newDocument.name,
        newVersionNumber: newDocument.versionNumber,
      },
    });

    return NextResponse.json({ document: newDocument, previousDocumentId: existing.id });
  } catch (error) {
    console.error('[playbooks] replace failed', error);
    return NextResponse.json(
      { error: 'Document replacement failed. The previous version remains active.' },
      { status: 500 },
    );
  }
}
