import { prisma } from '@/lib/prisma';
import { createDemoDataForOrganization } from '@/lib/demo-data';

async function main() {
  const slug = process.env.DEMO_ORGANIZATION_SLUG;
  const organization = slug
    ? await prisma.organization.findUnique({ where: { slug } })
    : await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });

  if (!organization) {
    throw new Error('No organization found. Complete onboarding first, or set DEMO_ORGANIZATION_SLUG to an existing organization slug.');
  }

  const result = await createDemoDataForOrganization(organization.id);
  console.info(`Created ${result.approvalCount} demo approval records for ${organization.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
