import { NextResponse } from 'next/server';
import { getDashboardTenant } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageManualApprovals, evidenceMatchScore } from '@/services/manual-approvals';

export const dynamic = 'force-dynamic';

function textFrom(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textFrom).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textFrom).join(' ');
  return '';
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getDashboardTenant(5000);
  if (!tenant.organization || !tenant.user) return NextResponse.json({ error: 'Workspace unavailable.' }, { status: tenant.status === 'unauthenticated' ? 401 : 503 });
  if (!canManageManualApprovals(tenant.user.role)) return NextResponse.json({ error: 'Your role cannot correlate evidence.' }, { status: 403 });

  const approval = await prisma.approvalRecord.findFirst({ where: { id, organizationId: tenant.organization.id }, include: { manualDetail: true } });
  if (!approval?.manualDetail) return NextResponse.json({ error: 'Manual approval not found.' }, { status: 404 });
  const center = approval.approvalTimestamp ?? approval.occurredAt;
  const candidates = await prisma.messageSource.findMany({
    where: { organizationId: tenant.organization.id, receivedAt: { gte: new Date(center.getTime() - 30 * 86_400_000), lte: new Date(center.getTime() + 30 * 86_400_000) } },
    orderBy: { receivedAt: 'desc' },
    take: 100,
  });
  const approvalText = [approval.subject, approval.approverName, approval.approverEmail, approval.department, approval.category, approval.conditions, approval.businessImpact, approval.manualDetail.relatedEntityType, approval.manualDetail.relatedEntityId].filter(Boolean).join(' ');
  const threshold = Math.max(0, Math.min(100, Number(process.env.MANUAL_EVIDENCE_SUGGESTION_THRESHOLD ?? 55)));
  const suggestions = candidates.map((source) => {
    const evidenceText = [source.sender, source.senderEmail, source.channel, source.externalId, source.threadId, textFrom(source.rawPayload)].filter(Boolean).join(' ');
    return { source, ...evidenceMatchScore({ approvalText, evidenceText, approvalTimestamp: center, evidenceTimestamp: source.receivedAt }) };
  }).filter((item) => item.score >= threshold).sort((a, b) => b.score - a.score).slice(0, 12);

  await prisma.$transaction(async (tx) => {
    for (const suggestion of suggestions) {
      await tx.approvalEvidenceAssociation.upsert({
        where: { approvalRecordId_messageSourceId: { approvalRecordId: approval.id, messageSourceId: suggestion.source.id } },
        update: { confidence: suggestion.score, matchingReasons: suggestion.reasons, immutableSnapshot: { provider: suggestion.source.provider, externalId: suggestion.source.externalId, threadId: suggestion.source.threadId, channel: suggestion.source.channel, sender: suggestion.source.sender, senderEmail: suggestion.source.senderEmail, receivedAt: suggestion.source.receivedAt.toISOString(), rawPayload: suggestion.source.rawPayload ?? null } },
        create: { organizationId: tenant.organization!.id, approvalRecordId: approval.id, messageSourceId: suggestion.source.id, origin: 'AI_SUGGESTION', status: 'SUGGESTED', confidence: suggestion.score, matchingReasons: suggestion.reasons, sourceTimestamp: suggestion.source.receivedAt, immutableSnapshot: { provider: suggestion.source.provider, externalId: suggestion.source.externalId, threadId: suggestion.source.threadId, channel: suggestion.source.channel, sender: suggestion.source.sender, senderEmail: suggestion.source.senderEmail, receivedAt: suggestion.source.receivedAt.toISOString(), rawPayload: suggestion.source.rawPayload ?? null } },
      });
    }
    await tx.auditLog.create({ data: { organizationId: tenant.organization!.id, actorUserId: tenant.user!.id, approvalRecordId: approval.id, action: 'MANUAL_EVIDENCE_SEARCHED', metadata: { candidatesChecked: candidates.length, suggestionsFound: suggestions.length, threshold } } });
  }, { timeout: 15_000 });
  return NextResponse.json({ suggestions: suggestions.map(({ source, score, reasons }) => ({ messageSourceId: source.id, provider: source.provider, sender: source.sender, channel: source.channel, receivedAt: source.receivedAt, score, reasons })), autoMerged: false });
}
