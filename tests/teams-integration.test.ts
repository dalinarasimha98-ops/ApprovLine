import assert from 'node:assert/strict';

process.env.MICROSOFT_CLIENT_ID = 'microsoft-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-client-secret';
process.env.MICROSOFT_TENANT_ID = 'tenant-guid-123';
process.env.APP_URL = 'https://app.approvline.com';
process.env.ENCRYPTION_KEY = 'f4c73124c11a3f8a129979f56a6bca9c9703ea4985f3b74ba467ea9a19c53291';

const {
  TEAMS_READ_ONLY_SCOPES,
  buildTeamsInstallUrl,
  signTeamsState,
  storedTeamsTokens,
  teamsMessageLink,
  teamsMessageToJob,
  teamsRedirectUri,
  verifyTeamsState,
} = await import('@/services/integrations/teams');
const { decryptJson, encryptJson } = await import('@/utils/encryption');

const state = signTeamsState({ organizationId: 'org_123', userId: 'user_123', createdAt: Date.now() });
const verifiedState = verifyTeamsState(state);
assert.equal(verifiedState?.organizationId, 'org_123');
assert.equal(verifiedState?.userId, 'user_123');
assert.equal(verifyTeamsState(`${state}tampered`), null);
assert.equal(verifyTeamsState('not-a-valid-state.short'), null);

const installUrl = buildTeamsInstallUrl({ requestUrl: 'https://app.approvline.com/dashboard/settings/integrations', state });
assert.equal(installUrl.hostname, 'login.microsoftonline.com');
assert.equal(installUrl.pathname, '/tenant-guid-123/oauth2/v2.0/authorize');
assert.equal(installUrl.searchParams.get('client_id'), 'microsoft-client-id');
assert.equal(installUrl.searchParams.get('redirect_uri'), 'https://app.approvline.com/api/integrations/teams/callback');
assert.equal(installUrl.searchParams.get('scope'), TEAMS_READ_ONLY_SCOPES);
assert.equal(installUrl.searchParams.get('response_type'), 'code');
assert.equal(installUrl.searchParams.get('state'), state);
assert.equal(teamsRedirectUri('https://preview.vercel.app/foo'), 'https://app.approvline.com/api/integrations/teams/callback');
assert.ok(TEAMS_READ_ONLY_SCOPES.includes('ChannelMessage.Read.All'));
assert.ok(!TEAMS_READ_ONLY_SCOPES.includes('ChannelMessage.Send'));
assert.ok(!TEAMS_READ_ONLY_SCOPES.includes('Teamwork.Migrate.All'));

const sourceLink = teamsMessageLink('team_123', 'channel_123', {
  id: 'message_123',
});
assert.equal(sourceLink, 'https://teams.microsoft.com/l/message/channel_123/message_123?groupId=team_123');

const job = teamsMessageToJob({
  organizationId: 'org_123',
  integrationId: 'int_teams',
  tenantId: 'tenant_123',
  team: { id: 'team_123', displayName: 'Finance Leadership' },
  channel: { id: 'channel_123', displayName: 'Budget Approvals' },
  message: {
    id: 'message_123',
    createdDateTime: '2026-06-27T10:00:00.000Z',
    body: { contentType: 'html', content: '<p>Approved. Please move forward with the vendor payment after Legal confirms the MSA.</p>' },
    from: { user: { id: 'user_teams_123', displayName: 'Priya Sharma' } },
  },
});

assert.equal(job.organizationId, 'org_123');
assert.equal(job.integrationId, 'int_teams');
assert.equal(job.provider, 'MICROSOFT_TEAMS');
assert.equal(job.externalId, 'message_123');
assert.equal(job.channel, 'Finance Leadership / Budget Approvals');
assert.equal(job.sender, 'Priya Sharma');
assert.equal(job.timestamp, '2026-06-27T10:00:00.000Z');
assert.ok(job.message.includes('Microsoft Teams team: Finance Leadership'));
assert.ok(job.message.includes('Approved. Please move forward with the vendor payment'));
assert.equal((job.rawPayload as { microsoftTenantId: string }).microsoftTenantId, 'tenant_123');
assert.equal((job.rawPayload as { microsoftTeamId: string }).microsoftTeamId, 'team_123');
assert.equal((job.rawPayload as { microsoftChannelId: string }).microsoftChannelId, 'channel_123');

const storedTokens = storedTeamsTokens({
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  scope: TEAMS_READ_ONLY_SCOPES,
  token_type: 'Bearer',
});
assert.equal(storedTokens.access_token, 'access-token');
assert.equal(storedTokens.refresh_token, 'refresh-token');
assert.ok(storedTokens.expires_at && storedTokens.expires_at > Date.now());

const encrypted = encryptJson(storedTokens);
const decrypted = decryptJson<typeof storedTokens>(encrypted);
assert.equal(decrypted.access_token, storedTokens.access_token);
assert.equal(decrypted.refresh_token, storedTokens.refresh_token);

console.log('Validated Teams OAuth scopes, state, token encryption, evidence extraction, and ingestion mapping.');
