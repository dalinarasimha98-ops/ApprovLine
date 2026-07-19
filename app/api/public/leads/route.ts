import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';
import { distributedRateLimit } from '@/lib/rate-limit';
import {
  hashNetworkIdentifier,
  leadDuplicateKey,
  publicLeadSchema,
  sanitizeLeadText,
} from '@/lib/public-leads';

export const dynamic = 'force-dynamic';

async function notifyLead(lead: {
  id: string;
  kind: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  topic: string | null;
  interest: string | null;
}) {
  const endpoint = env.CRM_WEBHOOK_URL ?? env.LEAD_NOTIFICATION_WEBHOOK_URL;
  if (!endpoint) return { status: 'INTERNAL_QUEUE', reference: null };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.LEAD_WEBHOOK_BEARER_TOKEN ? { authorization: `Bearer ${env.LEAD_WEBHOOK_BEARER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        event: 'public.lead.created',
        lead: {
          id: lead.id,
          kind: lead.kind,
          name: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          company: lead.company,
          topic: lead.topic,
          interest: lead.interest,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Lead provider returned ${response.status}`);
    return { status: 'DELIVERED', reference: response.headers.get('x-request-id') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const limit = await distributedRateLimit(`public-lead:${hashNetworkIdentifier(ip)}`, 8, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  const payload = await request.json().catch(() => null);
  const parsed = publicLeadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please review the highlighted fields.', details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.website) {
    return NextResponse.json({ error: 'Submission rejected.' }, { status: 400 });
  }

  const input = parsed.data;
  try {
    const lead = await prisma.publicLeadSubmission.create({
      data: {
        kind: input.kind,
        firstName: sanitizeLeadText(input.firstName)!,
        lastName: sanitizeLeadText(input.lastName)!,
        email: input.email.toLowerCase(),
        company: sanitizeLeadText(input.company)!,
        companySize: sanitizeLeadText(input.companySize),
        industry: sanitizeLeadText(input.industry),
        department: sanitizeLeadText(input.department),
        tools: sanitizeLeadText(input.tools),
        interest: sanitizeLeadText(input.interest),
        topic: sanitizeLeadText(input.topic),
        message: sanitizeLeadText(input.message)!,
        consent: input.consent,
        idempotencyKey: input.idempotencyKey,
        duplicateKey: leadDuplicateKey(input),
        sourcePath: input.sourcePath,
        ipHash: hashNetworkIdentifier(ip),
        userAgent: request.headers.get('user-agent')?.slice(0, 500),
      },
    });

    let delivery = { status: 'INTERNAL_QUEUE', reference: null as string | null };
    try {
      delivery = await notifyLead(lead);
    } catch (error) {
      delivery = { status: 'FAILED', reference: null };
      console.error('[public-lead] Notification failed', { leadId: lead.id, error: error instanceof Error ? error.message : 'Unknown provider failure' });
    }
    await prisma.publicLeadSubmission.update({
      where: { id: lead.id },
      data: { notificationStatus: delivery.status, providerReference: delivery.reference },
    });
    console.info('[public-lead] Submission persisted', { leadId: lead.id, kind: lead.kind, notificationStatus: delivery.status });

    return NextResponse.json(
      { ok: true, leadId: lead.id, deliveryStatus: delivery.status, message: 'Your request was received.' },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ ok: true, duplicate: true, message: 'Your request was already received.' }, { status: 200 });
    }
    console.error('[public-lead] Persistence failed', { error: error instanceof Error ? error.message : 'Unknown database failure' });
    return NextResponse.json({ error: 'We could not save your request. Please try again.' }, { status: 503 });
  }
}
