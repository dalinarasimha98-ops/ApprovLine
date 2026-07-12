import type { ApprovalStatus, ApprovalType, IntegrationProvider, MemoryEntity, MemoryEntityType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createDemoDataForOrganization } from '@/lib/demo-data';
import type { FounderAccess } from '@/services/founder';
import { logFounderAction } from '@/services/founder';
import { addMemoryTimelineEvent, linkMemoryEntities, upsertMemoryEntity } from '@/services/memory';

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

export type DemoWorkspaceSummary = {
  organizationId: string;
  customerAccountId: string;
  workspaceName: string;
  industry: DemoIndustry;
  companySize: DemoCompanySize;
  stats: {
    approvals: number;
    vendors: number;
    contracts: number;
    investigations: number;
    playbooks: number;
    integrations: number;
    memoryEntities: number;
    memoryRelationships: number;
    copilotQuestions: number;
    healthScore: number;
  };
};

const demoRunId = 'founder-demo-generator-v1';

const industryProfiles: Record<DemoIndustry, { company: string; domain: string; vendors: string[]; projects: string[] }> = {
  SaaS: {
    company: 'Northstar Cloud',
    domain: 'northstar-cloud.demo',
    vendors: ['Cloud Services Ltd', 'Enterprise Software Inc', 'ObservabilityWorks', 'ContractFlow AI', 'SecureAuth Labs'],
    projects: ['Project Phoenix', 'Enterprise SSO Rollout', 'Q3 Usage-Based Billing', 'EU Data Residency'],
  },
  'Financial Services': {
    company: 'Cedar Ridge Capital',
    domain: 'cedarridge.demo',
    vendors: ['LedgerCore Systems', 'RiskLens Advisory', 'Cloud Services Ltd', 'KYC Automation Group', 'Enterprise Software Inc'],
    projects: ['Project Ledger', 'Trading Controls Refresh', 'Vendor Risk Remediation', 'Audit Readiness 2026'],
  },
  Pharma: {
    company: 'HelixNova Therapeutics',
    domain: 'helixnova.demo',
    vendors: ['Clinical Data Partners', 'Lab Systems Global', 'Vendor Alpha', 'SecureAuth Labs', 'Regulatory Insights Co'],
    projects: ['Project Atlas', 'Trial Data Platform', 'GxP Validation Sprint', 'Regulatory Submission Prep'],
  },
  Healthcare: {
    company: 'Evergreen Health Network',
    domain: 'evergreen-health.demo',
    vendors: ['Patient Portal Systems', 'Cloud Services Ltd', 'ClaimsOps Software', 'Vendor Beta', 'SecureAuth Labs'],
    projects: ['Project CarePath', 'HIPAA Controls Refresh', 'Claims Automation', 'Provider Portal Launch'],
  },
  Manufacturing: {
    company: 'Ironvale Manufacturing',
    domain: 'ironvale.demo',
    vendors: ['Supply Chain Systems Inc', 'FactoryOps Robotics', 'Vendor Alpha', 'Logistics Data Co', 'Enterprise Software Inc'],
    projects: ['Project Forge', 'ERP Renewal', 'Supplier Quality Program', 'Plant Security Upgrade'],
  },
  Retail: {
    company: 'BrightMarket Retail',
    domain: 'brightmarket.demo',
    vendors: ['POS Cloud Group', 'Fulfillment Analytics Ltd', 'Vendor Beta', 'LoyaltyWorks', 'Cloud Services Ltd'],
    projects: ['Project Cartwheel', 'Holiday Fulfillment', 'Loyalty Platform Renewal', 'Store Analytics Rollout'],
  },
  Logistics: {
    company: 'VectorTrail Logistics',
    domain: 'vectortrail.demo',
    vendors: ['FleetOps Software', 'Warehouse Robotics Co', 'Vendor Alpha', 'RouteIQ Systems', 'Cloud Services Ltd'],
    projects: ['Project Horizon', 'Fleet Compliance Refresh', 'Warehouse Automation', 'Route Optimization'],
  },
};

const departments = ['Finance', 'Legal', 'Procurement', 'Security', 'Engineering', 'HR', 'Compliance'];
const categories = ['Finance', 'Legal', 'Procurement', 'Security', 'Engineering', 'HR', 'Compliance'];
const providers: IntegrationProvider[] = ['SLACK', 'GMAIL', 'OUTLOOK', 'MICROSOFT_TEAMS', 'JIRA', 'SERVICENOW', 'ZOOM'];
const statusCycle: ApprovalStatus[] = ['APPROVED', 'APPROVED', 'PENDING_REVIEW', 'REJECTED', 'APPROVED'];
const typeCycle: ApprovalType[] = ['EXPLICIT', 'CONDITIONAL', 'IMPLICIT', 'REJECTION', 'ESCALATION'];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function approvalVolume(size: DemoCompanySize) {
  if (size === '100 Employees') return 100;
  if (size === '500 Employees') return 220;
  if (size === '1000 Employees') return 340;
  return 500;
}

function vendorVolume(size: DemoCompanySize) {
  if (size === '100 Employees') return 20;
  if (size === '500 Employees') return 32;
  if (size === '1000 Employees') return 42;
  return 50;
}

function amountFor(index: number, size: DemoCompanySize) {
  const base = size === 'Enterprise' ? 45000 : size === '1000 Employees' ? 30000 : size === '500 Employees' ? 18000 : 8000;
  return base + (index % 17) * 6500;
}

function json(value: Prisma.InputJsonValue) {
  return value;
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function sourcePlatform(provider: IntegrationProvider) {
  return provider === 'MICROSOFT_TEAMS' ? 'Teams' : provider === 'SERVICENOW' ? 'ServiceNow' : provider[0] + provider.slice(1).toLowerCase();
}

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/postgresql:\/\/[^ ]+/g, '[database-url-redacted]').slice(0, 260);
}

function isWritableFounder(access: FounderAccess): access is Extract<FounderAccess, { ok: true }> {
  return access.ok && !access.readOnly && (access.role === 'SUPER_ADMIN' || access.role === 'FOUNDER_ADMIN');
}

async function createOrUpdateIntegration(organizationId: string, provider: IntegrationProvider, industry: DemoIndustry) {
  const existing = await prisma.integration.findFirst({
    where: { organizationId, provider, externalAccount: `${industry} Demo ${sourcePlatform(provider)}` },
  });
  const data = {
    status: 'CONNECTED' as const,
    scopes: ['read-only', 'metadata:read', 'messages:read'],
    metadata: json({
      demo: true,
      founderDemo: true,
      demoRunId,
      health: 'healthy',
      lastSync: new Date().toISOString(),
      approvalsFound: 12 + providers.indexOf(provider) * 3,
    }),
  };

  if (existing) {
    return prisma.integration.update({ where: { id: existing.id }, data });
  }
  return prisma.integration.create({
    data: {
      organizationId,
      provider,
      externalAccount: `${industry} Demo ${sourcePlatform(provider)}`,
      ...data,
    },
  });
}

async function seedBulkApprovals(input: {
  organizationId: string;
  integrations: Awaited<ReturnType<typeof createOrUpdateIntegration>>[];
  industry: DemoIndustry;
  companySize: DemoCompanySize;
  vendorNames: string[];
  projects: string[];
}) {
  const approvalCount = approvalVolume(input.companySize);
  const sourceRows: Prisma.MessageSourceCreateManyInput[] = [];
  const approvalRows: Prisma.ApprovalRecordCreateManyInput[] = [];
  const now = Date.now();

  for (let index = 0; index < approvalCount; index += 1) {
    const provider = providers[index % providers.length];
    const integration = input.integrations.find((item) => item.provider === provider);
    const department = departments[index % departments.length];
    const category = categories[index % categories.length];
    const vendor = input.vendorNames[index % input.vendorNames.length];
    const project = input.projects[index % input.projects.length];
    const status = statusCycle[index % statusCycle.length];
    const approvalType = typeCycle[index % typeCycle.length];
    const amount = amountFor(index, input.companySize);
    const occurredAt = new Date(now - (index + 1) * 6 * 60 * 60 * 1000);
    const riskLevel = amount > 120000 || status === 'PENDING_REVIEW' ? 'High' : amount > 50000 ? 'Medium' : 'Low';
    const externalId = `founder-demo-${slug(input.industry)}-${index.toString().padStart(4, '0')}`;

    sourceRows.push({
      organizationId: input.organizationId,
      integrationId: integration?.id,
      provider,
      externalId,
      channel: provider === 'SLACK' ? '#approvals' : provider === 'MICROSOFT_TEAMS' ? 'Finance Approvals' : `${department} workflow`,
      sender: ['Sarah Johnson', 'Priya Sharma', 'James Okafor', 'Maya Chen', 'Daniel Kim'][index % 5],
      senderEmail: `approver${index % 12}@${industryProfiles[input.industry].domain}`,
      receivedAt: occurredAt,
      rawPayload: json({ demo: true, founderDemo: true, vendor, project, amount, sourcePlatform: sourcePlatform(provider) }),
    });

    approvalRows.push({
      organizationId: input.organizationId,
      approverName: ['Sarah Johnson', 'Priya Sharma', 'James Okafor', 'Maya Chen', 'Daniel Kim'][index % 5],
      approverEmail: `approver${index % 12}@${industryProfiles[input.industry].domain}`,
      subject: `${vendor} ${department} ${amount > 100000 ? 'contract' : 'approval'} for ${project}`,
      department,
      category,
      approvalType,
      status,
      confidence: Math.max(78, 98 - (index % 17)),
      riskLevel,
      businessImpact: `$${amount.toLocaleString()} decision linked to ${project}`,
      reasoning:
        status === 'REJECTED'
          ? `Demo rejection from ${sourcePlatform(provider)} for ${vendor}; retained as audit evidence.`
          : `Demo ${approvalType.toLowerCase()} approval detected from ${sourcePlatform(provider)} with approver, timestamp, and evidence.`,
      conditions: approvalType === 'CONDITIONAL' ? 'Requires Finance and Legal evidence before execution.' : null,
      sourcePlatform: sourcePlatform(provider),
      sourceLink: `https://demo.approvline.com/founder-demo/${slug(input.industry)}/${externalId}`,
      evidenceSnippet: `${department} ${status === 'REJECTED' ? 'did not approve' : 'approved'} ${vendor} for ${project}. Amount: $${amount.toLocaleString()}.`,
      approvalTimestamp: occurredAt,
      occurredAt,
    });
  }

  await prisma.messageSource.createMany({ data: sourceRows, skipDuplicates: true });
  await prisma.approvalRecord.createMany({ data: approvalRows });

  await prisma.auditLog.createMany({
    data: approvalRows.slice(0, 80).map((item) => ({
      organizationId: input.organizationId,
      action: 'founder_demo.approval.generated',
      metadata: json({
        demo: true,
        founderDemo: true,
        subject: item.subject,
        sourcePlatform: item.sourcePlatform,
        riskLevel: item.riskLevel,
      }),
      createdAt: item.occurredAt,
    })),
  });

  await prisma.event.createMany({
    data: providers.map((provider) => ({
      organizationId: input.organizationId,
      integrationId: input.integrations.find((item) => item.provider === provider)?.id,
      type: 'founder_demo.integration.activity',
      payload: json({ demo: true, founderDemo: true, provider, processed: Math.round(approvalCount / providers.length) }),
      processedAt: new Date(),
    })),
  });

  return approvalCount;
}

async function seedContractsAndGraph(input: {
  organizationId: string;
  industry: DemoIndustry;
  companySize: DemoCompanySize;
  vendorNames: string[];
  projects: string[];
}) {
  const entities: MemoryEntity[] = [];
  const relationships: Array<Awaited<ReturnType<typeof linkMemoryEntities>>> = [];
  const vendorCount = input.vendorNames.length;
  const contractCount = Math.max(20, Math.min(60, vendorCount + 12));
  const riskTitles = ['Missing Legal Approval', 'High Value Vendor Renewal', 'Conditional Security Exception', 'Evidence Gap', 'Policy Threshold Breach'];
  const policyNames = ['Procurement Policy', 'Finance Approval Policy', 'Security Review Policy', 'Vendor Risk Policy', 'Legal Review Policy'];

  const upsert = async (type: MemoryEntityType, title: string, extra: Partial<Parameters<typeof upsertMemoryEntity>[0]> = {}) => {
    const entity = await upsertMemoryEntity({
      organizationId: input.organizationId,
      type,
      title,
      subtitle: extra.subtitle ?? null,
      summary: extra.summary ?? `Founder demo ${type.toLowerCase()} for ${input.industry}.`,
      externalId: extra.externalId ?? `founder-demo:${slug(input.industry)}:${type}:${slug(title)}`,
      sourceSystem: extra.sourceSystem ?? 'Founder Demo',
      riskScore: extra.riskScore ?? 20,
      metadata: json({ demo: true, founderDemo: true, demoRunId, industry: input.industry, ...(extra.metadata as object | undefined) }),
      seenAt: extra.seenAt ?? new Date(),
    });
    entities.push(entity);
    return entity;
  };

  const vendorEntities = await Promise.all(
    input.vendorNames.map((vendor, index) =>
      upsert('VENDOR', vendor, {
        subtitle: `${input.industry} vendor`,
        riskScore: index % 5 === 0 ? 84 : 30 + (index % 4) * 10,
      }),
    ),
  );
  const policyEntities = await Promise.all(policyNames.map((policy) => upsert('POLICY', policy, { riskScore: 12 })));
  const projectEntities = await Promise.all(input.projects.map((project) => upsert('PROJECT', project, { riskScore: 28 })));
  const riskEntities = await Promise.all(riskTitles.map((risk, index) => upsert('RISK', risk, { riskScore: 62 + index * 7 })));

  for (let index = 0; index < contractCount; index += 1) {
    const vendor = vendorEntities[index % vendorEntities.length];
    const project = projectEntities[index % projectEntities.length];
    const policy = policyEntities[index % policyEntities.length];
    const risk = riskEntities[index % riskEntities.length];
    const value = amountFor(index + 7, input.companySize) * 2;
    const contract = await upsert('CONTRACT', `${vendor.title} ${index % 3 === 0 ? 'MSA' : index % 3 === 1 ? 'SOW' : 'Renewal'}`, {
      subtitle: `$${value.toLocaleString()} contract`,
      riskScore: value > 200000 ? 78 : 42,
      metadata: { value, project: project.title },
    });
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: vendor.id, toEntityId: contract.id, relationshipType: 'VENDOR_HAS_CONTRACT', sourceSystem: 'Founder Demo' }));
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: contract.id, toEntityId: policy.id, relationshipType: 'GOVERNED_BY', sourceSystem: 'Founder Demo' }));
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: project.id, toEntityId: contract.id, relationshipType: 'PROJECT_REFERENCES_CONTRACT', sourceSystem: 'Founder Demo' }));
    if (index % 4 === 0) {
      relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: contract.id, toEntityId: risk.id, relationshipType: 'CREATES_RISK', confidence: 86, sourceSystem: 'Founder Demo' }));
    }
    await addMemoryTimelineEvent({
      organizationId: input.organizationId,
      entityId: contract.id,
      title: 'Contract reviewed',
      description: `${contract.title} was reviewed against ${policy.title}.`,
      eventType: 'founder_demo.contract_reviewed',
      sourceSystem: 'Founder Demo',
      occurredAt: dateDaysAgo(index + 2),
      sourceLink: `https://demo.approvline.com/contracts/${contract.externalId}`,
      metadata: json({ demo: true, founderDemo: true, value }),
    });
  }

  const highRiskApprovals = await prisma.approvalRecord.findMany({
    where: { organizationId: input.organizationId, sourceLink: { contains: '/founder-demo/' }, riskLevel: { in: ['High', 'Critical'] } },
    take: 30,
  });

  for (const [index, approval] of highRiskApprovals.entries()) {
    const approvalEntity = await upsert('APPROVAL', approval.subject, {
      subtitle: approval.sourcePlatform,
      externalId: `founder-demo:${slug(input.industry)}:approval:${approval.id}`,
      riskScore: approval.riskLevel === 'High' ? 82 : 55,
      metadata: { approvalRecordId: approval.id },
    });
    const approver = await upsert('APPROVER', approval.approverName ?? 'Unknown Approver', {
      subtitle: approval.approverEmail,
      externalId: `founder-demo:${slug(input.industry)}:approver:${slug(approval.approverEmail ?? approval.approverName ?? 'unknown')}`,
    });
    const department = await upsert('DEPARTMENT', approval.department ?? 'Operations', {
      externalId: `founder-demo:${slug(input.industry)}:department:${slug(approval.department ?? 'operations')}`,
    });
    const policy = policyEntities[index % policyEntities.length];
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: approvalEntity.id, toEntityId: approver.id, relationshipType: 'APPROVED_BY', sourceSystem: approval.sourcePlatform ?? 'Founder Demo' }));
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: approvalEntity.id, toEntityId: department.id, relationshipType: 'OWNED_BY_DEPARTMENT', sourceSystem: approval.sourcePlatform ?? 'Founder Demo' }));
    relationships.push(await linkMemoryEntities({ organizationId: input.organizationId, fromEntityId: approvalEntity.id, toEntityId: policy.id, relationshipType: 'GOVERNED_BY', sourceSystem: 'Playbook AI' }));
  }

  await prisma.memoryGraphEvent.createMany({
    data: entities.slice(0, 80).map((entity) => ({
      organizationId: input.organizationId,
      entityId: entity.id,
      action: 'founder_demo.entity_generated',
      sourceSystem: 'Founder Demo',
      payload: json({ demo: true, founderDemo: true, entityType: entity.type, summary: `${entity.title} added to the founder demo memory graph.` }),
    })),
  });

  return {
    entities: entities.length,
    relationships: relationships.filter(Boolean).length,
    vendors: vendorCount,
    contracts: contractCount,
  };
}

async function seedInvestigations(organizationId: string, industry: DemoIndustry) {
  const approvals = await prisma.approvalRecord.findMany({
    where: { organizationId, sourceLink: { contains: '/founder-demo/' }, OR: [{ riskLevel: 'High' }, { status: 'PENDING_REVIEW' }] },
    take: 12,
    orderBy: { occurredAt: 'desc' },
  });
  const cases = [];
  for (const [index, approval] of approvals.entries()) {
    const investigation = await prisma.investigationCase.create({
      data: {
        organizationId,
        title: `${approval.department ?? 'Risk'} review: ${approval.subject}`,
        status: index % 3 === 0 ? 'CLOSED' : 'OPEN',
        department: approval.department,
        riskLevel: approval.riskLevel ?? 'High',
        summary: `Founder demo investigation for ${industry}: evidence, policy references, and missing approvals are linked for review.`,
        dateRangeStart: dateDaysAgo(45),
        dateRangeEnd: new Date(),
        metadata: json({ demo: true, founderDemo: true, demoRunId, source: 'Demo Workspace Generator' }),
        approvals: { create: { approvalRecordId: approval.id } },
        notes: {
          create: {
            organizationId,
            body: 'Demo investigation note: Legal and Finance should confirm evidence completeness before closing.',
          },
        },
      },
    });
    cases.push(investigation);
  }
  return cases.length;
}

async function seedCopilotHistory(organizationId: string, industry: DemoIndustry) {
  const questions = [
    'Who approved Vendor Alpha?',
    'Show high-risk approvals above $50,000.',
    'Which approvals violated procurement policy?',
    'What risks exist for Vendor Beta?',
    `Summarize ${industry} approvals with missing Finance sign-off.`,
  ];
  await prisma.playbookQuery.createMany({
    data: questions.map((question, index) => ({
      organizationId,
      question,
      answer: json({
        demo: true,
        summary: `Demo answer for "${question}" with cited approvals, policies, and evidence.`,
        citations: ['Procurement Policy Section 4.2', 'Finance Approval Matrix', 'Memory Graph relationship evidence'],
      }),
      sourceChunkIds: [`founder-demo-source-${index}`],
      confidence: 91 + (index % 5),
      createdAt: dateDaysAgo(index + 1),
    })),
  });
  return questions.length;
}

async function seedCustomerSuccess(input: {
  customerAccountId: string;
  organizationId: string;
  access: Extract<FounderAccess, { ok: true }>;
  approvals: number;
  integrations: number;
  companySize: DemoCompanySize;
}) {
  const activeUsers = input.companySize === 'Enterprise' ? 48 : input.companySize === '1000 Employees' ? 32 : input.companySize === '500 Employees' ? 18 : 8;
  await prisma.customerHealth.upsert({
    where: { customerAccountId: input.customerAccountId },
    update: {
      score: 92,
      status: 'HEALTHY',
      activeUsers,
      approvalsProcessed: input.approvals,
      integrationsConnected: input.integrations,
      playbookUsage: 18,
      copilotUsage: 24,
    },
    create: {
      customerAccountId: input.customerAccountId,
      score: 92,
      status: 'HEALTHY',
      activeUsers,
      approvalsProcessed: input.approvals,
      integrationsConnected: input.integrations,
      playbookUsage: 18,
      copilotUsage: 24,
    },
  });

  await prisma.pilotActivityLog.createMany({
    data: [
      { organizationId: input.organizationId, action: 'founder_demo.workspace_generated', entityType: 'Organization', metadata: json({ demo: true, founderDemo: true, actor: input.access.email }) },
      { organizationId: input.organizationId, action: 'founder_demo.integration_activity_simulated', entityType: 'Integration', metadata: json({ demo: true, integrations: input.integrations }) },
      { organizationId: input.organizationId, action: 'founder_demo.executive_report_ready', entityType: 'Analytics', metadata: json({ demo: true, approvals: input.approvals }) },
    ],
  }).catch(() => null);
}

export async function listFounderDemoWorkspaces() {
  const organizations = await prisma.organization.findMany({
    where: { slug: { startsWith: 'founder-demo-' } },
    include: { customerAccount: true },
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });

  return Promise.all(
    organizations.map(async (organization) => {
      const [approvals, investigations, memoryEntities, integrations] = await Promise.all([
        prisma.approvalRecord.count({ where: { organizationId: organization.id } }).catch(() => 0),
        prisma.investigationCase.count({ where: { organizationId: organization.id } }).catch(() => 0),
        prisma.memoryEntity.count({ where: { organizationId: organization.id } }).catch(() => 0),
        prisma.integration.count({ where: { organizationId: organization.id } }).catch(() => 0),
      ]);
      const metadata = (organization.customerAccount?.internalNotes ?? '').match(/industry=([^;]+);size=([^;]+)/);
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        customerAccountId: organization.customerAccount?.id ?? null,
        industry: metadata?.[1] ?? organization.customerAccount?.industry ?? 'Demo',
        companySize: metadata?.[2] ?? 'Generated',
        updatedAt: organization.updatedAt,
        approvals,
        investigations,
        memoryEntities,
        integrations,
      };
    }),
  );
}

export async function generateFounderDemoWorkspace(access: FounderAccess, industry: DemoIndustry, companySize: DemoCompanySize): Promise<DemoWorkspaceSummary> {
  if (!isWritableFounder(access)) throw new Error('Founder admin access is required to generate demo workspaces.');
  if (!demoIndustries.includes(industry)) throw new Error('Unsupported demo industry.');
  if (!demoCompanySizes.includes(companySize)) throw new Error('Unsupported demo company size.');

  const profile = industryProfiles[industry];
  const industrySlug = slug(industry);
  const sizeSlug = slug(companySize);
  const organizationSlug = `founder-demo-${industrySlug}-${sizeSlug}`;
  const workspaceName = `${profile.company} Demo`;

  const existing = await prisma.organization.findUnique({ where: { slug: organizationSlug }, select: { id: true } });
  if (existing) {
    await deleteFounderDemoWorkspace(access, existing.id);
  }

  const organization = await prisma.organization.create({
    data: {
      name: workspaceName,
      slug: organizationSlug,
      departments,
      approvalCategories: categories,
      onboardedAt: new Date(),
    },
  });

  const seats = companySize === 'Enterprise' ? 500 : Number.parseInt(companySize, 10);
  const customer = await prisma.customerAccount.create({
    data: {
      organizationId: organization.id,
      companyName: workspaceName,
      domain: `${sizeSlug}.${profile.domain}`,
      industry,
      status: 'ACTIVE',
      planTier: companySize === 'Enterprise' ? 'ENTERPRISE' : 'GROWTH',
      primaryAdminName: 'Demo Admin',
      primaryAdminEmail: `admin@${profile.domain}`,
      dataRetentionDays: 1095,
      internalNotes: `founderDemo=true;industry=${industry};size=${companySize};demoRunId=${demoRunId}`,
      workspace: {
        create: {
          organizationId: organization.id,
          workspaceName,
          workspaceSlug: organizationSlug,
          metadata: json({ demo: true, founderDemo: true, industry, companySize }),
        },
      },
      seatAllocation: {
        create: {
          purchasedSeats: seats,
          allocatedSeats: seats,
          usedSeats: Math.min(seats, companySize === 'Enterprise' ? 48 : 18),
        },
      },
    },
  });

  await createDemoDataForOrganization(organization.id);
  const integrations = await Promise.all(providers.map((provider) => createOrUpdateIntegration(organization.id, provider, industry)));
  const vendorNames = Array.from({ length: vendorVolume(companySize) }, (_, index) => profile.vendors[index % profile.vendors.length] + (index >= profile.vendors.length ? ` ${index + 1}` : ''));
  const approvals = await seedBulkApprovals({ organizationId: organization.id, integrations, industry, companySize, vendorNames, projects: profile.projects });
  const graph = await seedContractsAndGraph({ organizationId: organization.id, industry, companySize, vendorNames, projects: profile.projects });
  const investigations = await seedInvestigations(organization.id, industry);
  const copilotQuestions = await seedCopilotHistory(organization.id, industry);
  const playbooks = await prisma.playbookDocument.count({ where: { organizationId: organization.id } }).catch(() => 5);

  for (const integration of integrations) {
    await prisma.customerIntegrationStatus.upsert({
      where: { customerAccountId_provider: { customerAccountId: customer.id, provider: integration.provider } },
      update: {
        accessEnabled: true,
        connectionState: 'CONNECTED',
        lastSyncAt: new Date(),
        eventsProcessed: Math.round(approvals / integrations.length),
        metadata: json({ demo: true, founderDemo: true, provider: integration.provider }),
      },
      create: {
        customerAccountId: customer.id,
        provider: integration.provider,
        accessEnabled: true,
        connectionState: 'CONNECTED',
        lastSyncAt: new Date(),
        eventsProcessed: Math.round(approvals / integrations.length),
        metadata: json({ demo: true, founderDemo: true, provider: integration.provider }),
      },
    });
  }

  await seedCustomerSuccess({ customerAccountId: customer.id, organizationId: organization.id, access, approvals, integrations: integrations.length, companySize });

  await logFounderAction({
    access,
    action: 'FOUNDER_DEMO_WORKSPACE_GENERATED',
    targetType: 'Organization',
    targetId: organization.id,
    customerAccountId: customer.id,
    metadata: json({ industry, companySize, approvals, graph, investigations, copilotQuestions }),
  });

  return {
    organizationId: organization.id,
    customerAccountId: customer.id,
    workspaceName,
    industry,
    companySize,
    stats: {
      approvals,
      vendors: graph.vendors,
      contracts: graph.contracts,
      investigations,
      playbooks,
      integrations: integrations.length,
      memoryEntities: graph.entities,
      memoryRelationships: graph.relationships,
      copilotQuestions,
      healthScore: 92,
    },
  };
}

export async function deleteFounderDemoWorkspace(access: FounderAccess, organizationId: string) {
  if (!isWritableFounder(access)) throw new Error('Founder admin access is required to reset demo workspaces.');
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { customerAccount: true },
  });
  if (!organization) throw new Error('Demo workspace was not found.');
  if (!organization.slug.startsWith('founder-demo-')) {
    throw new Error('Reset blocked: only founder demo workspaces can be deleted.');
  }
  await logFounderAction({
    access,
    action: 'FOUNDER_DEMO_WORKSPACE_DELETED',
    targetType: 'Organization',
    targetId: organizationId,
    customerAccountId: organization.customerAccount?.id ?? null,
    metadata: json({ demo: true, founderDemo: true, workspaceName: organization.name }),
  }).catch((error) => console.warn('[founder-demo] audit after demo delete failed', safeMessage(error)));
  await prisma.organization.delete({ where: { id: organizationId } });
  return { deleted: true };
}
