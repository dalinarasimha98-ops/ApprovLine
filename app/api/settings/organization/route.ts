import { NextRequest, NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasAnyRole } from '@/lib/rbac';
import { writeAuditLog } from '@/services/audit';
import { revalidateTag } from 'next/cache';
import { settingsCacheTag } from '@/services/settings';
import { supportedTimezones } from '@/services/userSettings';
import { isDateFormatOption } from '@/lib/dateFormat';
import { isWorkspaceViewValue } from '@/lib/workspaceViews';
import { isValidHexColor, hexToRgb, contrastRatio, AA_NORMAL_TEXT_CONTRAST } from '@/lib/color-contrast';
import { z } from 'zod';

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyDomain: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  companySize: z.string().max(50).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  primaryAdminName: z.string().max(200).optional().nullable(),
  primaryAdminEmail: z.string().max(320).email().optional().nullable().or(z.literal('').transform(() => null)),
  departments: z.array(z.string()).optional(),
  approvalCategories: z.array(z.string()).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color').optional().nullable(),
  defaultTimeZone: z.string().max(100).optional().nullable(),
  defaultDateFormat: z.string().optional().nullable(),
  defaultWorkspaceView: z.string().optional().nullable(),
  defaultRiskLevel: z.enum(RISK_LEVELS).optional().nullable(),
  autoCategorizationEnabled: z.boolean().optional(),
  riskDetectionEnabled: z.boolean().optional(),
  defaultDueDateDays: z.number().int().min(1).max(90).optional().nullable(),
});

const ORG_INFO_FIELDS = ['name', 'companyDomain', 'industry', 'companySize', 'country', 'primaryAdminName', 'primaryAdminEmail', 'departments', 'approvalCategories'] as const;
const BRANDING_FIELDS = ['brandColor'] as const;
const DEFAULT_SETTINGS_FIELDS = ['defaultTimeZone', 'defaultDateFormat', 'defaultWorkspaceView', 'defaultRiskLevel'] as const;
const APPROVAL_POLICY_FIELDS = ['autoCategorizationEnabled', 'riskDetectionEnabled', 'defaultDueDateDays'] as const;

export async function PATCH(req: NextRequest) {
  const tenant = await getDashboardTenant(8000);
  if (tenant.status === 'unauthenticated') return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!tenant.user || !tenant.organization) {
    return NextResponse.json({ error: 'Organization unavailable' }, { status: 403 });
  }
  if (!hasAnyRole(tenant.user.role, ['ADMIN', 'OWNER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });

  const updates = parsed.data;
  const organizationId = tenant.organization.id;

  // Brand color must never render unreadable text - validated against the
  // same real WCAG contrast math the theme system's own tokens are checked
  // with (lib/color-contrast.ts), not just a hex-format regex.
  if (updates.brandColor !== undefined && updates.brandColor !== null) {
    if (!isValidHexColor(updates.brandColor)) {
      return NextResponse.json({ error: 'Brand color must be a valid 6-digit hex value.' }, { status: 400 });
    }
    const rgb = hexToRgb(updates.brandColor)!;
    const ratio = contrastRatio(rgb, [255, 255, 255]);
    if (ratio < AA_NORMAL_TEXT_CONTRAST) {
      return NextResponse.json({
        error: `This color is too light to use with white text (measured ${ratio.toFixed(2)}:1, needs at least ${AA_NORMAL_TEXT_CONTRAST}:1). Choose a darker shade.`,
      }, { status: 400 });
    }
  }

  if (updates.defaultTimeZone !== undefined && updates.defaultTimeZone !== null && !supportedTimezones().includes(updates.defaultTimeZone)) {
    return NextResponse.json({ error: 'Choose a valid time zone.' }, { status: 400 });
  }
  if (updates.defaultDateFormat !== undefined && updates.defaultDateFormat !== null && !isDateFormatOption(updates.defaultDateFormat)) {
    return NextResponse.json({ error: 'Choose a supported date format.' }, { status: 400 });
  }
  if (updates.defaultWorkspaceView !== undefined && updates.defaultWorkspaceView !== null && !isWorkspaceViewValue(updates.defaultWorkspaceView)) {
    return NextResponse.json({ error: 'Choose a supported default workspace view.' }, { status: 400 });
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.companyDomain !== undefined ? { companyDomain: updates.companyDomain } : {}),
      ...(updates.industry !== undefined ? { industry: updates.industry } : {}),
      ...(updates.companySize !== undefined ? { companySize: updates.companySize } : {}),
      ...(updates.country !== undefined ? { country: updates.country } : {}),
      ...(updates.primaryAdminName !== undefined ? { primaryAdminName: updates.primaryAdminName } : {}),
      ...(updates.primaryAdminEmail !== undefined ? { primaryAdminEmail: updates.primaryAdminEmail } : {}),
      ...(updates.departments !== undefined ? { departments: updates.departments } : {}),
      ...(updates.approvalCategories !== undefined ? { approvalCategories: updates.approvalCategories } : {}),
      ...(updates.brandColor !== undefined ? { brandColor: updates.brandColor } : {}),
      ...(updates.defaultTimeZone !== undefined ? { defaultTimeZone: updates.defaultTimeZone } : {}),
      ...(updates.defaultDateFormat !== undefined ? { defaultDateFormat: updates.defaultDateFormat } : {}),
      ...(updates.defaultWorkspaceView !== undefined ? { defaultWorkspaceView: updates.defaultWorkspaceView } : {}),
      ...(updates.defaultRiskLevel !== undefined ? { defaultRiskLevel: updates.defaultRiskLevel } : {}),
      ...(updates.autoCategorizationEnabled !== undefined ? { autoCategorizationEnabled: updates.autoCategorizationEnabled } : {}),
      ...(updates.riskDetectionEnabled !== undefined ? { riskDetectionEnabled: updates.riskDetectionEnabled } : {}),
      ...(updates.defaultDueDateDays !== undefined ? { defaultDueDateDays: updates.defaultDueDateDays } : {}),
    },
  });

  const touchedFields = Object.keys(updates);
  const auditEvents: { action: string; fields: string[] }[] = [];
  const orgInfoTouched = touchedFields.filter((f) => (ORG_INFO_FIELDS as readonly string[]).includes(f));
  const brandingTouched = touchedFields.filter((f) => (BRANDING_FIELDS as readonly string[]).includes(f));
  const defaultsTouched = touchedFields.filter((f) => (DEFAULT_SETTINGS_FIELDS as readonly string[]).includes(f));
  const policyTouched = touchedFields.filter((f) => (APPROVAL_POLICY_FIELDS as readonly string[]).includes(f));
  if (orgInfoTouched.length) auditEvents.push({ action: 'settings.organization_updated', fields: orgInfoTouched });
  if (brandingTouched.length) auditEvents.push({ action: 'BRANDING_UPDATED', fields: brandingTouched });
  if (defaultsTouched.length) auditEvents.push({ action: 'DEFAULT_SETTINGS_UPDATED', fields: defaultsTouched });
  if (policyTouched.length) auditEvents.push({ action: 'APPROVAL_POLICY_UPDATED', fields: policyTouched });

  for (const event of auditEvents) {
    await writeAuditLog({
      organizationId,
      actorUserId: tenant.user.id,
      action: event.action,
      metadata: { updatedFields: event.fields },
    });
  }

  revalidateTag(settingsCacheTag(organizationId));

  return NextResponse.json({ ok: true });
}
