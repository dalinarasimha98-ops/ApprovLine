/**
 * Founder Demo Generator (/founder/demo-generator) — pure, client-safe
 * types, constants, and display helpers. No DB/framework dependency
 * (matches lib/founder-audit-logs.ts's and lib/founder-security.ts's
 * convention), so the client component can import this directly without
 * pulling in Prisma or server-only code.
 *
 * ARCHITECTURE — see services/founderDemoGenerator.ts's header for the
 * full audit. This module is the single source of truth for:
 *   - the real industry/company-size inputs generateFounderDemoWorkspace()
 *     already accepted before this task (moved here, not duplicated, so
 *     services/founderDemoGenerator.ts imports them from here);
 *   - the 6 real data modules this page exposes, each backed by an
 *     existing-or-honestly-extended generation capability (documented per
 *     module below — never a module with no real generation behind it);
 *   - the 4 scenario presets, each just a named default selection over
 *     those same real modules (no scenario unlocks anything a module
 *     toggle couldn't already do on its own);
 *   - the estimated-data helper, which only ever states a real, derivable
 *     quantity (or "Calculated during generation" when no honest number
 *     can be known before generation actually runs) — never a fabricated
 *     count.
 */

export const demoIndustries = [
  'SaaS',
  'Financial Services',
  'Pharma',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Logistics',
] as const;

export const demoCompanySizes = ['100 Employees', '500 Employees', '1000 Employees', 'Enterprise'] as const;

export type DemoIndustry = (typeof demoIndustries)[number];
export type DemoCompanySize = (typeof demoCompanySizes)[number];

export function approvalVolume(size: DemoCompanySize): number {
  if (size === '100 Employees') return 100;
  if (size === '500 Employees') return 220;
  if (size === '1000 Employees') return 340;
  return 500;
}

export function vendorVolume(size: DemoCompanySize): number {
  if (size === '100 Employees') return 20;
  if (size === '500 Employees') return 32;
  if (size === '1000 Employees') return 42;
  return 50;
}

export function seatsForCompanySize(size: DemoCompanySize): number {
  return size === 'Enterprise' ? 500 : Number.parseInt(size, 10);
}

// ─── Data modules ───────────────────────────────────────────────────────
//
// Each module maps to a real, already-existing (or, where noted, newly
// but honestly extended) seeding function in services/founderDemoGenerator.ts.
// A module is never shown here unless that function actually exists and
// actually creates the records its description promises.
//
//   approvals    -> seedBulkApprovals(): real MessageSource + ApprovalRecord
//                   + AuditLog + Event rows (pre-existing).
//   compliance   -> seedContractsAndGraph()'s POLICY/RISK memory-graph
//                   entities and relationships (pre-existing).
//   integrations -> createOrUpdateIntegration() + CustomerIntegrationStatus
//                   upserts (pre-existing).
//   analytics    -> seedInvestigations() + seedCopilotHistory(): real
//                   InvestigationCase and PlaybookQuery rows (pre-existing).
//   users        -> seedFounderManagedUsers(): real FounderManagedUser rows
//                   (NEW — this model already existed for customer-side
//                   managed users; the demo generator did not yet create
//                   any, so this module was added rather than faked).
//   support      -> seedSupportNotes(): real CustomerNote rows (NEW, same
//                   reasoning as users). Labeled "Support Notes" rather
//                   than the more generic "Support Tickets" phrasing,
//                   because this codebase has no ticket/case model at
//                   all — CustomerNote (already surfaced elsewhere in the
//                   Founder Console as "Support & Notes") is the real,
//                   honest capability this module can promise.
export type DemoModuleKey = 'approvals' | 'compliance' | 'integrations' | 'analytics' | 'users' | 'support';

export const DEMO_MODULES: { key: DemoModuleKey; title: string; description: string }[] = [
  { key: 'approvals', title: 'Approvals & Evidence', description: 'Sample approvals, emails, chats' },
  { key: 'compliance', title: 'Compliance & Policies', description: 'Policy violations and alerts' },
  { key: 'integrations', title: 'Integrations', description: 'Connected tools (Slack, Gmail, etc.)' },
  { key: 'analytics', title: 'Analytics & Reports', description: 'Dashboard data and insights' },
  { key: 'users', title: 'Users & Teams', description: 'Sample users and departments' },
  { key: 'support', title: 'Support Notes', description: 'Sample support notes' },
];

export const DEMO_MODULE_KEYS: DemoModuleKey[] = DEMO_MODULES.map((m) => m.key);

export function isDemoModuleKey(value: unknown): value is DemoModuleKey {
  return typeof value === 'string' && (DEMO_MODULE_KEYS as string[]).includes(value);
}

// ─── Scenarios ──────────────────────────────────────────────────────────
//
// A scenario is only a named default selection over the real modules
// above — never a separately-generated concept. Selecting "Custom Demo"
// starts from no modules pre-selected so the Founder chooses explicitly.
export type DemoScenarioKey = 'enterprise-sales' | 'compliance-audit' | 'security-governance' | 'custom';

export const DEMO_SCENARIOS: {
  key: DemoScenarioKey;
  title: string;
  description: string;
  modules: DemoModuleKey[];
  recommended?: boolean;
}[] = [
  {
    key: 'enterprise-sales',
    title: 'Enterprise Sales Demo',
    description: 'Full platform showcase with multi-department approvals, integrations, and analytics.',
    modules: ['approvals', 'compliance', 'integrations', 'analytics', 'users', 'support'],
    recommended: true,
  },
  {
    key: 'compliance-audit',
    title: 'Compliance & Audit Demo',
    description: 'Focus on audit trails, policy violations, and compliance reporting.',
    modules: ['approvals', 'compliance', 'analytics'],
  },
  {
    key: 'security-governance',
    title: 'Security & Governance Demo',
    description: 'Showcase security controls, access management, and governance workflows.',
    modules: ['integrations', 'compliance', 'users'],
  },
  {
    key: 'custom',
    title: 'Custom Demo',
    description: 'Choose specific modules and create a tailored demo environment.',
    modules: [],
  },
];

export function isDemoScenarioKey(value: unknown): value is DemoScenarioKey {
  return typeof value === 'string' && DEMO_SCENARIOS.some((s) => s.key === value);
}

export function modulesForScenario(scenario: DemoScenarioKey): DemoModuleKey[] {
  return DEMO_SCENARIOS.find((s) => s.key === scenario)?.modules ?? [];
}

// ─── Estimated data (preview) ───────────────────────────────────────────
//
// Never a fabricated total. approvals/vendors are the only modules with a
// real, deterministic count known before generation runs (approvalVolume/
// vendorVolume, the same functions the generator itself uses) — every
// other module's real count depends on data seeded during generation
// (e.g. compliance risk entities derived from actual high-risk approvals
// found), so it is honestly described as calculated during generation
// rather than guessed at up front.
export function estimatedDataLines(modules: DemoModuleKey[], companySize: DemoCompanySize): string[] {
  const lines: string[] = [];
  if (modules.includes('approvals')) {
    lines.push(`~${approvalVolume(companySize)} approvals and evidence records`);
  }
  if (modules.includes('integrations')) {
    lines.push('7 simulated integrations (Slack, Gmail, Outlook, Teams, Jira, ServiceNow, Zoom)');
  }
  if (modules.includes('compliance') || modules.includes('analytics') || modules.includes('users') || modules.includes('support')) {
    const parts: string[] = [];
    if (modules.includes('compliance')) parts.push('policy and risk records');
    if (modules.includes('analytics')) parts.push('investigations and Copilot history');
    if (modules.includes('users')) parts.push('sample users');
    if (modules.includes('support')) parts.push('support notes');
    lines.push(`${parts.join(', ')} — calculated during generation`);
  }
  if (lines.length === 0) return ['Select at least one module to see an estimate.'];
  return lines;
}

export { fmtDateTime, fmtRelativeTime, actorDisplayName } from './founder-audit-logs';
