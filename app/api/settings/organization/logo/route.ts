import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import sharp from 'sharp';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { revalidateTag } from 'next/cache';
import { settingsCacheTag } from '@/services/settings';

export const dynamic = 'force-dynamic';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
// Only real raster formats sharp can safely decode/re-encode. SVG is
// deliberately excluded even though early UI copy mentioned it - SVG can
// carry embedded scripts/XXE payloads, which is exactly the "arbitrary
// unsafe data" this endpoint must never accept.
const ALLOWED_OUTPUT = 'png' as const;

/**
 * POST /api/settings/organization/logo
 *
 * The declared multipart Content-Type is never trusted on its own - the
 * uploaded bytes are decoded and RE-ENCODED through sharp, which both
 * proves the payload is a genuine image (sharp throws on anything else,
 * including a renamed executable or a polyglot file) and strips any
 * non-image data a malicious file might smuggle alongside valid image
 * bytes. Only the re-encoded PNG buffer - never the original upload - is
 * written to storage.
 */
export async function POST(req: NextRequest) {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Organization unavailable' }, { status: 403 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Logo storage is not configured for this environment yet.' }, { status: 503 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'Logo must be a real image under 2MB.' }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let outputBuffer: Buffer;
  let width: number;
  let height: number;
  try {
    const image = sharp(inputBuffer, { failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 16 || metadata.height < 16) {
      throw new Error('Image too small or dimensions unreadable.');
    }
    // Re-encode - never trust or store the original bytes.
    outputBuffer = await image
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    width = metadata.width;
    height = metadata.height;
  } catch {
    return NextResponse.json({ error: 'File is not a valid image. Supported: PNG, JPG, WebP.' }, { status: 400 });
  }

  const organizationId = tenant.organization.id;
  const pathname = `org-logos/${organizationId}/${Date.now()}.${ALLOWED_OUTPUT}`;

  let blobUrl: string;
  try {
    const result = await put(pathname, outputBuffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
    });
    blobUrl = result.url;
  } catch (error) {
    console.error('[settings] logo upload failed', error);
    return NextResponse.json({ error: 'Could not upload the logo right now. Please try again.' }, { status: 502 });
  }

  const previous = await prisma.organization.findUnique({ where: { id: organizationId }, select: { logoUrl: true } });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { logoUrl: blobUrl, logoUpdatedAt: new Date() },
  });

  if (previous?.logoUrl) {
    await del(previous.logoUrl).catch(() => null);
  }

  await writeAuditLog({
    organizationId,
    actorUserId: tenant.user.id,
    action: 'BRANDING_UPDATED',
    metadata: { field: 'logo', width, height, sizeBytes: outputBuffer.length },
  });

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({ ok: true, logoUrl: blobUrl });
}

export async function DELETE() {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Organization unavailable' }, { status: 403 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const organizationId = tenant.organization.id;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { logoUrl: true } });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { logoUrl: null, logoUpdatedAt: null },
  });

  if (org?.logoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(org.logoUrl).catch(() => null);
  }

  await writeAuditLog({
    organizationId,
    actorUserId: tenant.user.id,
    action: 'BRANDING_UPDATED',
    metadata: { field: 'logo', removed: true },
  });

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({ ok: true });
}
