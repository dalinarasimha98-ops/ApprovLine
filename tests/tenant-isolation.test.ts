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

const founderShell = read('components/founder/FounderShell.tsx');
assert.match(founderShell, /Tenant Isolation/);
assert.match(founderShell, /\/founder\/security\/isolation/);

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

console.log('Validated Tenant A/B isolation helpers, Memory Graph IDOR rejection, founder verification page, and tenant-scoped service coverage.');
