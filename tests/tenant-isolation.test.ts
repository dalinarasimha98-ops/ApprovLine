import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  assertMemoryRelationshipTenant,
  assertTenantAccess,
  tenantCacheKey,
  TenantIsolationError,
  tenantScopedWhere,
  validateTenantJobPayload,
  type TenantIsolationContext,
} from '../lib/tenant-isolation';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const tenantA: TenantIsolationContext = {
  authenticatedUserId: 'user-a',
  organizationId: 'org-a',
  workspaceId: 'workspace-a',
  platformRole: 'ADMIN',
  customerRole: 'ADMIN',
  permissions: ['workspace:admin'],
};

const tenantB: TenantIsolationContext = {
  authenticatedUserId: 'user-b',
  organizationId: 'org-b',
  workspaceId: 'workspace-b',
  platformRole: 'ADMIN',
  customerRole: 'ADMIN',
  permissions: ['workspace:admin'],
};

assert.deepEqual(tenantScopedWhere(tenantA, { status: 'OPEN' }), { status: 'OPEN', organizationId: 'org-a' });
assert.equal(assertTenantAccess(tenantA, { id: 'approval-a', organizationId: 'org-a' }).id, 'approval-a');
assert.throws(() => assertTenantAccess(tenantA, { id: 'approval-b', organizationId: 'org-b' }), TenantIsolationError);
assert.throws(() => assertTenantAccess(tenantA, null), TenantIsolationError);

assert.equal(assertMemoryRelationshipTenant({
  organizationId: 'org-a',
  fromEntity: { id: 'vendor-a', organizationId: 'org-a' },
  toEntity: { id: 'contract-a', organizationId: 'org-a' },
}), true);
assert.throws(() => assertMemoryRelationshipTenant({
  organizationId: 'org-a',
  fromEntity: { id: 'vendor-a', organizationId: 'org-a' },
  toEntity: { id: 'contract-b', organizationId: 'org-b' },
}), TenantIsolationError);

assert.equal(tenantCacheKey(tenantA, 'dashboard'), 'org:org-a:workspace:workspace-a:dashboard');
assert.notEqual(tenantCacheKey(tenantA, 'dashboard'), tenantCacheKey(tenantB, 'dashboard'));
assert.equal(validateTenantJobPayload({ organizationId: 'org-a', workspaceId: 'workspace-a' }).organizationId, 'org-a');
assert.throws(() => validateTenantJobPayload({ organizationId: 'org-a' }), TenantIsolationError);

const auth = read('lib/auth.ts');
assert.match(auth, /resolveTenantContext/);
assert.match(auth, /authenticatedUserId/);
assert.match(auth, /organizationId/);
assert.match(auth, /workspaceId/);
assert.match(auth, /permissionsForRole/);

const isolationHelper = read('lib/tenant-isolation.ts');
assert.match(isolationHelper, /TenantIsolationContext/);
assert.match(isolationHelper, /tenantScopedWhere/);
assert.match(isolationHelper, /logTenantIsolationEvent/);

const memory = read('services/memory.ts');
assert.match(memory, /assertMemoryRelationshipTenant/);
assert.match(memory, /memoryEntity\.findMany/);
assert.match(memory, /security\.cross_tenant_memory_relationship_rejected/);

const founderService = read('services/founder.ts');
assert.match(founderService, /buildFounderTenantIsolationReport/);
assert.match(founderService, /tenant_isolation/);

// The Governance sidebar's "Security" item now points at /founder/security
// (the Security & Governance control center) rather than directly at this
// isolation report — the isolation report remains real, unmodified, and
// reachable from Founder Settings instead.
const founderSettings = read('app/founder/settings/page.tsx');
assert.match(founderSettings, /\/founder\/security\/isolation/);

assert.equal(existsSync(`${root}/app/founder/security/isolation/page.tsx`), true);
const isolationPage = read('app/founder/security/isolation/page.tsx');
assert.match(isolationPage, /Tenant Isolation Center/);
assert.match(isolationPage, /API Coverage/);

const scopedServices = [
  'services/analytics.ts',
  'services/copilot/copilot.ts',
  'services/gateway/universalGateway.ts',
  'services/integrations/gmail.ts',
  'services/integrations/jira.ts',
  'services/integrations/outlook.ts',
  'services/integrations/servicenow.ts',
  'services/integrations/slack.ts',
  'services/integrations/teams.ts',
  'services/integrations/zoom.ts',
  'services/investigations.ts',
  'services/memory.ts',
  'services/playbooks.ts',
];

for (const service of scopedServices) {
  const source = read(service);
  assert.match(source, /organizationId/, `${service} should preserve organization-scoped access`);
}

// EvidenceThread/EvidenceEntry (the Approvals History thread-capture layer -
// see prisma/migrations/20260924091653_evidence_thread_capture) covered
// here BEFORE any capture service exists to write to them, per the
// explicit rule that these tables must never go a single day without
// tenant-isolation coverage. Schema-level only (organizationId present on
// both, no unscoped-by-design unique constraint) since there is no service
// code yet to exercise with a live query - that lands in Stage 2, at which
// point its service file joins scopedServices above like every other one.
const schema = read('prisma/schema.prisma');
const evidenceThreadBlock = schema.slice(schema.indexOf('model EvidenceThread {'), schema.indexOf('model EvidenceEntry {'));
const evidenceEntryBlock = schema.slice(schema.indexOf('model EvidenceEntry {'), schema.indexOf('model EvidenceProviderConnection {'));
assert.match(evidenceThreadBlock, /organizationId\s+String/, 'EvidenceThread must carry organizationId');
assert.match(evidenceEntryBlock, /organizationId\s+String/, 'EvidenceEntry must carry organizationId (a join is a query too)');
// The idempotent-recapture unique constraint must include organizationId -
// without it, two tenants racing to capture the same externalThreadId on
// the same provider (a real possibility: two orgs on the same Slack
// Enterprise Grid org, or a Jira Cloud instance shared across tenants)
// would collide with each other's rows instead of their own.
assert.match(evidenceThreadBlock, /@@unique\(\[organizationId, provider, externalThreadId, version\]\)/);
assert.match(evidenceEntryBlock, /organization\s+Organization\s+@relation\(fields: \[organizationId\], references: \[id\], onDelete: Cascade\)/);

console.log('Validated Tenant A/B isolation helpers, Memory Graph IDOR rejection, founder verification page, tenant-scoped service coverage, and EvidenceThread/EvidenceEntry schema-level tenant scoping ahead of any capture service.');
