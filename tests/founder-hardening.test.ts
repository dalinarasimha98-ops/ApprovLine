import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const schema = read('prisma/schema.prisma');
assert.match(schema, /model FounderManagedUser/);
assert.match(schema, /enum FounderManagedUserRole/);
assert.match(schema, /enum FounderManagedUserStatus/);
assert.match(schema, /pinned\s+Boolean\s+@default\(false\)/);

const founderService = read('services/founder.ts');
assert.match(founderService, /founderManagedUserRoles/);
assert.match(founderService, /inviteFounderCustomerUser/);
assert.match(founderService, /updateFounderCustomerUser/);
assert.match(founderService, /updateCustomerAccountDetails/);
assert.match(founderService, /updateCustomerSeats/);
assert.match(founderService, /exportFounderAuditLogs/);
assert.match(founderService, /buildFounderOperationsCenter/);
assert.match(founderService, /buildFounderReadinessReport/);
assert.match(founderService, /Seat limit reached/);
assert.match(founderService, /CUSTOMER_ACCOUNT_UPDATED/);
assert.match(founderService, /changedFields/);
assert.match(founderService, /explicitEnvRole/);
assert.match(founderService, /dbAdmin\?\.active && !explicitEnvRole/);

const customerProfilePage = read('app/founder/customers/[id]/page.tsx');
assert.match(customerProfilePage, /CustomerAccountDetailsCard/);
assert.match(customerProfilePage, /saveAccountDetails/);
assert.match(customerProfilePage, /canEditAccountDetails/);
assert.match(customerProfilePage, /Customer account details updated\./);

const founderLayout = read('app/founder/layout.tsx');
assert.match(founderLayout, /FounderSystemError/);
assert.match(founderLayout, /access check failed/);

const provisionPage = read('app/founder/provision/page.tsx');
assert.match(provisionPage, /provision_failed/);
assert.match(provisionPage, /Customer provisioning could not complete/);

const accountDetailsCard = read('components/founder/CustomerAccountDetailsCard.tsx');
assert.match(accountDetailsCard, /Edit Account Details/);
assert.match(accountDetailsCard, /Account details are read-only for your current founder role/);
assert.match(accountDetailsCard, /Save Changes/);
assert.match(accountDetailsCard, /Cancel/);
assert.match(accountDetailsCard, /Saving\.\.\./);
assert.match(accountDetailsCard, /You have unsaved changes\. Discard changes\?/);

const usersPage = read('app/founder/customers/[id]/users/page.tsx');
assert.match(usersPage, /Customer User Lifecycle/);
assert.match(usersPage, /Generate invite/);
assert.match(usersPage, /Change role/);
assert.match(usersPage, /Resend invite/);

const auditExportRoute = read('app/api/founder/audit/export/route.ts');
assert.match(auditExportRoute, /founder_access_required/);
assert.match(auditExportRoute, /content-disposition/);

const operationsPage = read('app/founder/operations/page.tsx');
assert.match(operationsPage, /Production workflow monitor/);

const readinessPage = read('app/founder/readiness/page.tsx');
assert.match(readinessPage, /Founder Control Center v2/);
assert.match(readinessPage, /Overall Score/);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.scripts['test:founder'], 'tsx tests/founder-hardening.test.ts');

console.log('Validated Founder Control Center v2 hardening routes, schema, services, audit export, and test script.');
