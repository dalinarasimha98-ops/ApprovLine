import { NextRequest, NextResponse } from 'next/server';
import { enqueueIncomingMessage } from '@/services/queue/approvalQueue';
import { resolveIntegrationTenant } from '@/services/integrations/resolveTenant';
import { processIncomingMessage } from '@/services/ingestion/processIncomingMessage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const payload = await request.json();

  if (payload.event === 'endpoint.url_validation') {
    return NextResponse.json({ plainToken: payload.payload?.plainToken });
  }

  const accountId = payload.payload?.account_id;
  const integration = await resolveIntegrationTenant('ZOOM', accountId);
  const object = payload.payload?.object ?? {};
  const meetingId = object.id ?? object.uuid ?? object.meeting_id ?? payload.event_ts;
  const topic = object.topic ?? object.meeting_topic ?? 'Zoom meeting';
  const timestamp = object.start_time ?? object.recording_start ?? object.event_ts ?? new Date().toISOString();
  const sourceLink = object.share_url ?? object.play_url ?? object.join_url;
  const transcript = object.transcript ?? object.summary ?? object.summary_overview ?? object.plain_text ?? JSON.stringify(payload);

  const job = {
    organizationId: integration.organizationId,
    integrationId: integration.id,
    provider: 'ZOOM',
    externalId: `zoom-webhook:${meetingId}:${payload.event_ts ?? Date.now()}`,
    channel: `Zoom / ${topic}`,
    sender: object.host_email ?? object.host_id,
    senderEmail: object.host_email,
    timestamp,
    sourceLink,
    message: [
      `Zoom webhook event: ${payload.event}`,
      `Meeting: ${topic}`,
      `Meeting ID: ${meetingId}`,
      object.recording_id ? `Recording ID: ${object.recording_id}` : '',
      `Transcript / summary: ${transcript}`,
    ].filter(Boolean).join('\n'),
    rawPayload: {
      ...payload,
      sourcePlatform: 'zoom',
      meetingId,
      meetingTitle: topic,
      sourceLink,
      transcriptSnippet: typeof transcript === 'string' ? transcript.slice(0, 2000) : undefined,
    },
  } as const;

  const queued = await enqueueIncomingMessage(job);
  if (!queued.queued) {
    await processIncomingMessage(job, { auditAction: 'integration.zoom.webhook_processed_without_queue' });
  }

  return NextResponse.json(queued.queued ? { ok: true, queued: true } : { ok: true, queued: false, warning: queued.reason }, {
    status: queued.queued ? 200 : 202,
  });
}
