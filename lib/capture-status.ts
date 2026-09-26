import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
import { withTimeout } from '@/lib/performance';

/**
 * Grounds the dashboard shell's "Live Capture" badge in real state instead
 * of the hardcoded, unconditional green pulse it used to render regardless
 * of whether any connector had ever captured anything. Per
 * docs/qa/PRODUCTION_CERTIFICATION_EVIDENCE.md, no connector has been
 * certified against a real provider account, so a badge that always says
 * "Live Capture" is currently claiming something this app cannot back -
 * this makes the badge tell the truth about whatever state a given
 * organization is actually in, including "nothing connected" and "connected,
 * but nothing recent," rather than only ever showing one green state.
 *
 * "Connected" is read from both integration systems that currently coexist
 * (see CLAUDE.md's "Two coexisting patterns" note under Integrations) -
 * the legacy OAuth `Integration` model every per-provider connector still
 * writes, and the newer `EvidenceProviderConnection` the canonical
 * pipeline (services/evidence/pipeline.ts's upsertConnection()) creates
 * lazily on that provider's first captured event. A provider can be
 * OAuth-connected with zero events ever captured, in which case only
 * `Integration` has a row - checking just one of the two would wrongly
 * report "no sources connected" for a genuinely connected-but-silent org.
 *
 * "Recent" is read from `EvidenceProviderHealth.lastEventAt`, which
 * `recordProviderHealth()` updates on every real capture through the
 * canonical pipeline - the same pipeline every connector's queued job
 * (services/ingestion/processIncomingMessage.ts) already runs through
 * unconditionally. Demo/seed data written directly to
 * ApprovalRecord/UnifiedEvidenceRecord (scripts/seed-demo-approvals.ts)
 * does not go through that pipeline and so does not populate this table -
 * a demo organization correctly shows "No sources connected" rather than a
 * fabricated "Live capture," since none of its data actually arrived
 * through a live capture path.
 */
export type CaptureStatus =
  | { state: 'live'; label: string }
  | { state: 'connected-stale'; label: string }
  | { state: 'connected-none'; label: string }
  | { state: 'none'; label: string };

const LIVE_WINDOW_MS = 15 * 60 * 1000;
const CAPTURE_STATUS_REVALIDATE_SECONDS = 30;

function formatAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

async function fetchCaptureStatusFresh(organizationId: string): Promise<CaptureStatus> {
  const [legacyConnected, newConnected, latestHealth] = await withTimeout(
    'capture status',
    Promise.all([
      prisma.integration.count({ where: { organizationId, status: 'CONNECTED' } }),
      prisma.evidenceProviderConnection.count({
        where: { organizationId, status: { in: ['CONNECTED', 'SYNCING', 'DEGRADED'] } },
      }),
      prisma.evidenceProviderHealth.findFirst({
        where: { organizationId, lastEventAt: { not: null } },
        orderBy: { lastEventAt: 'desc' },
        select: { lastEventAt: true },
      }),
    ]),
    3000,
  );

  if (legacyConnected === 0 && newConnected === 0) {
    return { state: 'none', label: 'No sources connected' };
  }
  if (!latestHealth?.lastEventAt) {
    // "Capture pending" (not "no events yet") - this only means the
    // canonical capture pipeline (EvidenceProviderHealth) has never
    // recorded an event from a connected integration. An org can
    // genuinely have real historical approvals, audit activity, and open
    // action items while this is true (e.g. every approval so far was
    // captured before its integrations were connected, or entered
    // manually) - the old "no events yet" wording read as contradicting a
    // dashboard that visibly has real data, when it only ever described
    // this one pipeline. Kept close in length/shape to the other three
    // states' labels (all "Connected/Live · ...", none longer than this)
    // since this renders in a fixed-height, non-wrapping header pill.
    return { state: 'connected-none', label: 'Connected · capture pending' };
  }

  const ageMs = Date.now() - latestHealth.lastEventAt.getTime();
  if (ageMs <= LIVE_WINDOW_MS) {
    return { state: 'live', label: 'Live capture' };
  }
  return { state: 'connected-stale', label: `Connected · last event ${formatAge(ageMs)} ago` };
}

function getCachedCaptureStatusFetcher(organizationId: string) {
  return unstable_cache(
    () => fetchCaptureStatusFresh(organizationId),
    ['capture-status', organizationId],
    { revalidate: CAPTURE_STATUS_REVALIDATE_SECONDS },
  );
}

/** Degrades to "No sources connected" on any failure, rather than throwing
 *  and taking the whole dashboard shell down over a status badge. */
export const getCaptureStatus = cache(async (organizationId: string): Promise<CaptureStatus> => {
  try {
    return await getCachedCaptureStatusFetcher(organizationId)();
  } catch {
    return { state: 'none', label: 'No sources connected' };
  }
});
