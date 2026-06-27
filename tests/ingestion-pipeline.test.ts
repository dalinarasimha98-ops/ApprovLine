import assert from 'node:assert/strict';
import { buildSimulationJob, sourcePlatformFromProvider } from '@/services/integrations/simulation';

const organizationId = 'org_test';
const examples = [
  {
    source_platform: 'slack' as const,
    message: 'Approved, move forward with vendor payment.',
    sender_name: 'Priya Sharma',
    sender_email: 'priya@company.com',
    timestamp: '2026-06-27T10:00:00Z',
    expectedProvider: 'SLACK',
  },
  {
    source_platform: 'gmail' as const,
    message: 'Reject the invoice until Procurement verifies the PO.',
    sender_name: 'Sarah Chen',
    sender_email: 'sarah@company.com',
    timestamp: '2026-06-27T10:05:00Z',
    expectedProvider: 'GMAIL',
  },
  {
    source_platform: 'teams' as const,
    message: 'Approved if Legal accepts the revised liability cap.',
    sender_name: 'James Okafor',
    sender_email: 'james@company.com',
    timestamp: '2026-06-27T10:10:00Z',
    expectedProvider: 'MICROSOFT_TEAMS',
  },
  {
    source_platform: 'zoom' as const,
    message: 'Engineering can proceed with the API migration after backup completes.',
    sender_name: 'Maya Singh',
    sender_email: 'maya@company.com',
    timestamp: '2026-06-27T10:15:00Z',
    expectedProvider: 'ZOOM',
  },
];

for (const example of examples) {
  const job = buildSimulationJob(organizationId, example);
  assert.equal(job.organizationId, organizationId);
  assert.equal(job.provider, example.expectedProvider);
  assert.equal(job.message, example.message);
  assert.equal(job.sender, example.sender_name);
  assert.equal(job.senderEmail, example.sender_email);
  assert.equal(job.timestamp, example.timestamp);
  assert.equal(sourcePlatformFromProvider(job.provider), example.source_platform);
  assert.equal(typeof job.externalId, 'string');
  assert.ok(job.externalId?.startsWith(`sim-${example.source_platform}`));
}

console.log(`Validated ${examples.length} connector simulation ingestion mappings.`);
