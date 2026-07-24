import type { EvidenceProviderManifest } from '@/types/evidence';

const readableCapabilities = ['AUTHENTICATE', 'SUBSCRIBE', 'FETCH', 'NORMALIZE', 'HEALTH_CHECK', 'DISCONNECT'] as const;

function provider(
  key: string,
  displayName: string,
  category: EvidenceProviderManifest['category'],
  authenticationType: EvidenceProviderManifest['authenticationType'] = 'OAUTH2',
): EvidenceProviderManifest {
  return {
    key,
    displayName,
    category,
    authenticationType,
    capabilities: [...readableCapabilities],
    readOnly: true,
    version: '1.0',
  };
}

export const evidenceProviderCatalog: EvidenceProviderManifest[] = [
  provider('slack', 'Slack', 'COMMUNICATION'),
  provider('gmail', 'Gmail', 'COMMUNICATION'),
  provider('microsoft_teams', 'Microsoft Teams', 'COMMUNICATION'),
  provider('outlook', 'Outlook / Exchange', 'COMMUNICATION'),
  provider('zoom', 'Zoom', 'COMMUNICATION'),
  provider('google_chat', 'Google Chat', 'COMMUNICATION'),
  provider('jira', 'Jira', 'BUSINESS_SYSTEM'),
  provider('servicenow', 'ServiceNow', 'BUSINESS_SYSTEM'),
  provider('salesforce', 'Salesforce', 'BUSINESS_SYSTEM'),
  provider('sap', 'SAP', 'BUSINESS_SYSTEM'),
  provider('oracle', 'Oracle', 'BUSINESS_SYSTEM'),
  provider('coupa', 'Coupa', 'BUSINESS_SYSTEM'),
  provider('workday', 'Workday', 'BUSINESS_SYSTEM'),
  provider('hubspot', 'HubSpot', 'BUSINESS_SYSTEM'),
  provider('ironclad', 'Ironclad', 'BUSINESS_SYSTEM'),
  provider('github', 'GitHub', 'BUSINESS_SYSTEM'),
  provider('asana', 'Asana', 'BUSINESS_SYSTEM'),
  provider('monday', 'Monday.com', 'BUSINESS_SYSTEM'),
  provider('api', 'Universal API', 'CUSTOM', 'API_KEY'),
  provider('webhook', 'Universal Webhook', 'CUSTOM', 'WEBHOOK_SECRET'),
  provider('csv', 'CSV Import', 'IMPORT', 'NONE'),
  provider('email_capture', 'Email Capture', 'IMPORT', 'NONE'),
  provider('sdk', 'Provider SDK', 'CUSTOM', 'CUSTOM'),
  provider('custom', 'Custom System', 'CUSTOM', 'CUSTOM'),
];

export function getEvidenceProviderManifest(providerKey: string) {
  const normalized = providerKey.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  return evidenceProviderCatalog.find((entry) => entry.key === normalized) ??
    provider(normalized || 'custom', providerKey.trim() || 'Custom System', 'CUSTOM', 'CUSTOM');
}
