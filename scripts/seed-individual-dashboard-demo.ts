#!/usr/bin/env node
/**
 * CLI for the isolated Individual Dashboard demo workspace
 * (lib/individual-dashboard-demo.ts) - lets a developer populate (or tear
 * down) realistic, real-schema data for John Doe without ever touching a
 * real customer Organization.
 *
 * Usage:
 *   node --import tsx scripts/seed-individual-dashboard-demo.ts          # reset + seed (idempotent)
 *   node --import tsx scripts/seed-individual-dashboard-demo.ts --reset  # tear down only
 */
import { seedIndividualDashboardDemo, resetIndividualDashboardDemo, INDIVIDUAL_DASHBOARD_DEMO_USER_EMAIL } from '@/lib/individual-dashboard-demo';

async function main() {
  const resetOnly = process.argv.includes('--reset');

  if (resetOnly) {
    const deleted = await resetIndividualDashboardDemo();
    console.log(deleted ? 'Deleted the individual-dashboard-demo workspace.' : 'No individual-dashboard-demo workspace found - nothing to delete.');
    return;
  }

  const { organizationId, userEmail } = await seedIndividualDashboardDemo();
  console.log(`Seeded individual-dashboard-demo workspace (organizationId=${organizationId}).`);
  console.log(`Demo user: John Doe <${userEmail}> (expected: ${INDIVIDUAL_DASHBOARD_DEMO_USER_EMAIL})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
