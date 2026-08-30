/**
 * Integration Marketplace Provider Registry Seed
 *
 * Seeds the MarketplaceProvider table with known integration providers.
 * Run via: npx tsx prisma/seeds/integration-providers.ts
 * Or call seedIntegrationProviders() from prisma/seed.ts
 *
 * Providers marked isNative: true have working OAuth / webhook connectors.
 * Providers marked isNative: false require custom connector work per provider.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type ProviderSeed = {
  slug: string;
  displayName: string;
  category: string;
  description: string;
  websiteUrl?: string;
  status: 'DRAFT' | 'BETA' | 'AVAILABLE' | 'DEPRECATED' | 'COMING_SOON';
  isNative: boolean;
  sortOrder: number;
  capabilities?: object;
};

const providers: ProviderSeed[] = [
  // ── Native / Fully Implemented ──────────────────────────────────────────────
  {
    slug: 'slack',
    displayName: 'Slack',
    category: 'Communication',
    description: 'Track decisions made in Slack channels, DMs and huddles. Captures approval evidence from real-time conversations.',
    websiteUrl: 'https://slack.com',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 10,
    capabilities: { oauth: true, webhook: true, evidenceTypes: ['message', 'approval', 'decision'] },
  },
  {
    slug: 'gmail',
    displayName: 'Gmail',
    category: 'Email',
    description: 'Capture decisions from email threads and approval chains in Gmail.',
    websiteUrl: 'https://gmail.com',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 20,
    capabilities: { oauth: true, evidenceTypes: ['email', 'approval', 'decision'] },
  },
  {
    slug: 'outlook',
    displayName: 'Outlook / Exchange',
    category: 'Email',
    description: 'Sync decision emails from Microsoft Outlook and Exchange, including shared mailboxes.',
    websiteUrl: 'https://outlook.microsoft.com',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 30,
    capabilities: { oauth: true, evidenceTypes: ['email', 'approval', 'decision'] },
  },
  {
    slug: 'microsoft_teams',
    displayName: 'Microsoft Teams',
    category: 'Communication',
    description: 'Capture decisions from Teams meetings, channels, chats and adaptive card approvals.',
    websiteUrl: 'https://teams.microsoft.com',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 40,
    capabilities: { oauth: true, webhook: true, evidenceTypes: ['message', 'meeting', 'approval'] },
  },
  {
    slug: 'zoom',
    displayName: 'Zoom',
    category: 'Meetings',
    description: 'Automatically extract decisions from Zoom meeting transcripts and recordings.',
    websiteUrl: 'https://zoom.us',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 50,
    capabilities: { oauth: true, webhook: true, evidenceTypes: ['transcript', 'meeting', 'decision'] },
  },
  {
    slug: 'jira',
    displayName: 'Jira',
    category: 'Engineering',
    description: 'Track ticket-based decisions, approvals, scope changes and change request workflows.',
    websiteUrl: 'https://www.atlassian.com/software/jira',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 60,
    capabilities: { oauth: true, webhook: true, evidenceTypes: ['ticket', 'approval', 'change'] },
  },
  {
    slug: 'servicenow',
    displayName: 'ServiceNow',
    category: 'ITSM',
    description: 'Capture change, CAB, procurement, access request, and workflow approvals from ServiceNow.',
    websiteUrl: 'https://www.servicenow.com',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 70,
    capabilities: { oauth: true, webhook: true, evidenceTypes: ['change', 'incident', 'approval', 'procurement'] },
  },

  // ── Beta / Partial ──────────────────────────────────────────────────────────
  {
    slug: 'github',
    displayName: 'GitHub',
    category: 'Engineering',
    description: 'Capture PR reviews, code approvals, release authorizations and security sign-offs.',
    websiteUrl: 'https://github.com',
    status: 'BETA',
    isNative: false,
    sortOrder: 80,
    capabilities: { webhook: true, evidenceTypes: ['pr_review', 'release', 'deployment'] },
  },
  {
    slug: 'gitlab',
    displayName: 'GitLab',
    category: 'Engineering',
    description: 'Track merge request approvals, pipeline approvals and deployment authorizations.',
    websiteUrl: 'https://gitlab.com',
    status: 'BETA',
    isNative: false,
    sortOrder: 90,
    capabilities: { webhook: true, evidenceTypes: ['mr_approval', 'deployment', 'pipeline'] },
  },

  // ── Coming Soon ─────────────────────────────────────────────────────────────
  {
    slug: 'salesforce',
    displayName: 'Salesforce',
    category: 'CRM',
    description: 'Capture opportunity approvals, quote sign-offs, contract approvals and deal desk decisions.',
    websiteUrl: 'https://salesforce.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 100,
    capabilities: { api: true, evidenceTypes: ['quote', 'contract', 'opportunity'] },
  },
  {
    slug: 'hubspot',
    displayName: 'HubSpot',
    category: 'CRM',
    description: 'Track deal approvals, quote sign-offs and customer agreement evidence from HubSpot.',
    websiteUrl: 'https://hubspot.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 110,
    capabilities: { api: true, evidenceTypes: ['deal', 'quote', 'contract'] },
  },
  {
    slug: 'sap',
    displayName: 'SAP',
    category: 'ERP',
    description: 'Ingest purchase order approvals, goods receipt sign-offs and financial authorizations from SAP.',
    websiteUrl: 'https://www.sap.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 120,
    capabilities: { api: true, evidenceTypes: ['purchase_order', 'financial', 'goods_receipt'] },
  },
  {
    slug: 'oracle',
    displayName: 'Oracle',
    category: 'ERP',
    description: 'Connect Oracle ERP Cloud or E-Business Suite to capture financial workflow approvals.',
    websiteUrl: 'https://oracle.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 130,
    capabilities: { api: true, evidenceTypes: ['financial', 'procurement', 'approval'] },
  },
  {
    slug: 'workday',
    displayName: 'Workday',
    category: 'HR',
    description: 'Capture HR workflow approvals, headcount decisions and compensation approval evidence.',
    websiteUrl: 'https://workday.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 140,
    capabilities: { api: true, evidenceTypes: ['hr_approval', 'headcount', 'compensation'] },
  },
  {
    slug: 'coupa',
    displayName: 'Coupa',
    category: 'Procurement',
    description: 'Capture purchase requisition, contract and supplier approval evidence from Coupa.',
    websiteUrl: 'https://coupa.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 150,
    capabilities: { api: true, evidenceTypes: ['requisition', 'contract', 'supplier'] },
  },
  {
    slug: 'ironclad',
    displayName: 'Ironclad',
    category: 'Legal',
    description: 'Capture contract approval workflows, legal sign-offs and counterparty agreement evidence.',
    websiteUrl: 'https://ironcladapp.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 160,
    capabilities: { webhook: true, evidenceTypes: ['contract', 'legal', 'signature'] },
  },
  {
    slug: 'docusign',
    displayName: 'DocuSign',
    category: 'Legal',
    description: 'Capture electronic signature completion events as auditable approval evidence.',
    websiteUrl: 'https://docusign.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 170,
    capabilities: { webhook: true, evidenceTypes: ['signature', 'envelope', 'contract'] },
  },
  {
    slug: 'asana',
    displayName: 'Asana',
    category: 'Engineering',
    description: 'Capture task sign-offs, project decisions and milestone approvals from Asana.',
    websiteUrl: 'https://asana.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 180,
    capabilities: { api: true, evidenceTypes: ['task', 'project', 'approval'] },
  },
  {
    slug: 'monday',
    displayName: 'Monday.com',
    category: 'Engineering',
    description: 'Pull decisions and approvals from Monday.com boards, items and automation workflows.',
    websiteUrl: 'https://monday.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 190,
    capabilities: { webhook: true, evidenceTypes: ['item', 'board', 'approval'] },
  },
  {
    slug: 'notion',
    displayName: 'Notion',
    category: 'Engineering',
    description: 'Sync decisions documented in Notion pages, databases and approval workflows.',
    websiteUrl: 'https://notion.so',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 200,
    capabilities: { api: true, evidenceTypes: ['page', 'database', 'decision'] },
  },
  {
    slug: 'confluence',
    displayName: 'Confluence',
    category: 'Engineering',
    description: 'Extract approval evidence from Confluence page reviews and decision documents.',
    websiteUrl: 'https://www.atlassian.com/software/confluence',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 210,
    capabilities: { webhook: true, evidenceTypes: ['page', 'decision', 'review'] },
  },
  {
    slug: 'azure_devops',
    displayName: 'Azure DevOps',
    category: 'Engineering',
    description: 'Capture work item approvals, pull request sign-offs and pipeline deployment gates.',
    websiteUrl: 'https://azure.microsoft.com/en-us/products/devops',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 220,
    capabilities: { webhook: true, evidenceTypes: ['pr_review', 'deployment', 'work_item'] },
  },
  {
    slug: 'google_chat',
    displayName: 'Google Chat',
    category: 'Communication',
    description: 'Track approval conversations and decisions in Google Chat spaces and DMs.',
    websiteUrl: 'https://chat.google.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 230,
    capabilities: { webhook: true, evidenceTypes: ['message', 'decision'] },
  },
  {
    slug: 'whatsapp',
    displayName: 'WhatsApp Business',
    category: 'Communication',
    description: 'Log business decisions shared via WhatsApp Business using the Cloud API.',
    websiteUrl: 'https://business.whatsapp.com',
    status: 'COMING_SOON',
    isNative: false,
    sortOrder: 240,
    capabilities: { webhook: true, evidenceTypes: ['message', 'decision'] },
  },

  // ── Generic / Universal connectors (always available) ─────────────────────
  {
    slug: 'webhook',
    displayName: 'Generic Webhook',
    category: 'Other',
    description: 'Send approval evidence from any system via HTTPS webhook. Signed payloads, idempotency and retry built-in.',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 900,
    capabilities: { webhook: true, evidenceTypes: ['generic'] },
  },
  {
    slug: 'api',
    displayName: 'REST API',
    category: 'Other',
    description: 'Submit approval records programmatically via the ApprovLine REST API with API key auth.',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 910,
    capabilities: { api: true, evidenceTypes: ['generic'] },
  },
  {
    slug: 'csv',
    displayName: 'CSV Import',
    category: 'Other',
    description: 'Bulk-import historical approval records from spreadsheet exports.',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 920,
    capabilities: { import: true, evidenceTypes: ['generic'] },
  },
  {
    slug: 'email_capture',
    displayName: 'Email Forwarding',
    category: 'Email',
    description: 'Forward approval emails to your tenant inbox (approvals+{slug}@approvline.ai) for automatic capture.',
    status: 'AVAILABLE',
    isNative: true,
    sortOrder: 930,
    capabilities: { email: true, evidenceTypes: ['email', 'approval'] },
  },
];

export async function seedIntegrationProviders() {
  console.log('[seed] Seeding integration marketplace providers...');
  let created = 0;
  let updated = 0;

  for (const provider of providers) {
    const existing = await prisma.marketplaceProvider.findUnique({ where: { slug: provider.slug } });
    if (existing) {
      await prisma.marketplaceProvider.update({
        where: { slug: provider.slug },
        data: {
          displayName: provider.displayName,
          category: provider.category,
          description: provider.description,
          websiteUrl: provider.websiteUrl ?? null,
          status: provider.status,
          isNative: provider.isNative,
          sortOrder: provider.sortOrder,
          capabilities: provider.capabilities !== undefined ? (provider.capabilities as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      updated += 1;
    } else {
      await prisma.marketplaceProvider.create({
        data: {
          slug: provider.slug,
          displayName: provider.displayName,
          category: provider.category,
          description: provider.description,
          websiteUrl: provider.websiteUrl ?? null,
          status: provider.status,
          isNative: provider.isNative,
          sortOrder: provider.sortOrder,
          capabilities: provider.capabilities !== undefined ? (provider.capabilities as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      created += 1;
    }
  }

  console.log(`[seed] Integration providers: ${created} created, ${updated} updated`);
}

// Allow direct execution: npx tsx prisma/seeds/integration-providers.ts
if (require.main === module) {
  seedIntegrationProviders()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
