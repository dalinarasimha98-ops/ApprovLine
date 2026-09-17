/**
 * Founder Demo Generator (/founder/demo-generator) — server-side data
 * composition for the page. Reuses services/founderDemoGenerator.ts (the
 * one real demo-workspace engine, itself layered on lib/demo-data.ts's
 * existing Acme-style seed) as the sole source of generated-workspace
 * data, and FounderAuditLog (via the existing FOUNDER_DEMO_WORKSPACE_
 * GENERATED/DELETED actions, already present in lib/founder-audit-logs.ts's
 * taxonomy before this task) as the sole source of "recent runs" — no
 * second demo-data engine, no second run/history model.
 *
 * ARCHITECTURE AUDIT — this page's underlying capability surface:
 *   - services/founderDemoGenerator.ts: generateFounderDemoWorkspace()
 *     creates one whole new Organization/CustomerAccount per industry+size
 *     profile (delete+recreate on regeneration of the same profile),
 *     never mutates an existing real customer. deleteFounderDemoWorkspace()
 *     hard-deletes that organization (real cascade via Prisma's onDelete:
 *     Cascade relations) after verifying its slug starts with
 *     "founder-demo-" — the one authoritative "is this actually a demo
 *     org" check in this codebase, re-verified server-side on every call,
 *     never trusted from client input.
 *   - Both mutation entry points independently require
 *     isWritableFounder(access) (SUPER_ADMIN/FOUNDER_ADMIN only, checked
 *     inside services/founderDemoGenerator.ts itself, not just at this
 *     page's own server actions) before touching the database.
 *   - "Recent Runs" and "Last generated" both read FounderAuditLog
 *     directly — logFounderAction() only ever runs after a generation
 *     completes without throwing, so every row shown is a real completed
 *     run; there is no fabricated "failed" run in this list, since a
 *     failed generation never reaches that write.
 */
import { prisma } from '@/lib/prisma';
import {
  listFounderDemoWorkspaces,
  type FounderDemoWorkspaceListItem,
} from '@/services/founderDemoGenerator';
import { DEMO_SCENARIOS, isDemoModuleKey, isDemoScenarioKey, type DemoModuleKey, type DemoScenarioKey } from '@/lib/founder-demo-generator';

export type DemoRunRow = {
  id: string;
  createdAt: Date;
  action: string;
  scenarioTitle: string;
  actorEmail: string | null;
  organizationName: string | null;
  customerAccountId: string | null;
};

export type DemoGeneratorPageData =
  | { ok: true; workspaces: FounderDemoWorkspaceListItem[]; recentRuns: DemoRunRow[]; lastGeneratedAt: Date | null }
  | { ok: false; safeError: string };

const RUN_ACTIONS = ['FOUNDER_DEMO_WORKSPACE_GENERATED', 'FOUNDER_DEMO_WORKSPACE_DELETED'] as const;

function runTitle(action: string, metadata: unknown, organizationName: string | null): string {
  if (action === 'FOUNDER_DEMO_WORKSPACE_DELETED') return `Reset — ${organizationName ?? 'Demo workspace'}`;
  const record = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null;
  const scenario = record?.scenario;
  if (isDemoScenarioKey(scenario)) return DEMO_SCENARIOS.find((s) => s.key === scenario)!.title;
  // Legacy rows generated before scenario tracking existed: fall back to a
  // readable industry-based label rather than showing nothing.
  const industry = typeof record?.industry === 'string' ? record.industry : null;
  return industry ? `${industry} Demo` : 'Demo workspace generated';
}

export async function buildDemoGeneratorPageData(): Promise<DemoGeneratorPageData> {
  try {
    const [workspaces, runs] = await Promise.all([
      listFounderDemoWorkspaces(),
      prisma.founderAuditLog.findMany({
        where: { action: { in: [...RUN_ACTIONS] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { customerAccount: { select: { id: true, companyName: true } } },
      }),
    ]);

    const recentRuns: DemoRunRow[] = runs.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      scenarioTitle: runTitle(row.action, row.metadata, row.customerAccount?.companyName ?? null),
      actorEmail: row.actorEmail,
      organizationName: row.customerAccount?.companyName ?? null,
      customerAccountId: row.customerAccount?.id ?? null,
    }));

    const lastGenerated = await prisma.founderAuditLog.findFirst({
      where: { action: 'FOUNDER_DEMO_WORKSPACE_GENERATED' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return { ok: true, workspaces, recentRuns, lastGeneratedAt: lastGenerated?.createdAt ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, safeError: message.replace(/postgresql:\/\/[^\s]+/g, '[database-url-redacted]').slice(0, 220) };
  }
}

export { isDemoModuleKey, isDemoScenarioKey };
export type { DemoModuleKey, DemoScenarioKey };
