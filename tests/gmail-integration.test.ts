import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.APP_URL = 'https://app.approvline.com';
process.env.ENCRYPTION_KEY = 'f4c73124c11a3f8a129979f56a6bca9c9703ea4985f3b74ba467ea9a19c53291';

const {
  GMAIL_READ_ONLY_SCOPES,
  buildGmailInstallUrl,
  gmailMessageLink,
  gmailMessageToJob,
  parseEmailAddress,
  signGmailState,
  storedGmailTokens,
  verifyGmailState,
} = await import('@/services/integrations/gmail');
const { decryptJson, encryptJson } = await import('@/utils/encryption');

function base64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

const state = signGmailState({ organizationId: 'org_123', userId: 'user_123', createdAt: Date.now() });
const verifiedState = verifyGmailState(state);
assert.equal(verifiedState?.organizationId, 'org_123');
assert.equal(verifiedState?.userId, 'user_123');
assert.equal(verifyGmailState(`${state}tampered`), null);
assert.equal(verifyGmailState('not-a-valid-state.short'), null);

const installUrl = buildGmailInstallUrl({ requestUrl: 'https://app.approvline.com/dashboard/settings/integrations', state });
assert.equal(installUrl.hostname, 'accounts.google.com');
assert.equal(installUrl.pathname, '/o/oauth2/v2/auth');
assert.equal(installUrl.searchParams.get('client_id'), 'google-client-id.apps.googleusercontent.com');
assert.equal(installUrl.searchParams.get('redirect_uri'), 'https://app.approvline.com/api/integrations/gmail/callback');
assert.equal(installUrl.searchParams.get('scope'), GMAIL_READ_ONLY_SCOPES);
assert.equal(installUrl.searchParams.get('access_type'), 'offline');
assert.equal(installUrl.searchParams.get('prompt'), 'consent');
assert.equal(installUrl.searchParams.get('state'), state);
assert.ok(GMAIL_READ_ONLY_SCOPES.includes('gmail.readonly'));
assert.ok(!GMAIL_READ_ONLY_SCOPES.includes('gmail.modify'));
assert.ok(!GMAIL_READ_ONLY_SCOPES.includes('gmail.send'));

assert.deepEqual(parseEmailAddress('"Priya Sharma" <priya@company.com>'), {
  name: 'Priya Sharma',
  email: 'priya@company.com',
});
assert.equal(
  gmailMessageLink('approvals@company.com', 'thread_123'),
  'https://mail.google.com/mail/u/approvals%40company.com/#inbox/thread_123',
);

const job = gmailMessageToJob({
  organizationId: 'org_123',
  integrationId: 'int_gmail',
  accountEmail: 'approvals@company.com',
  message: {
    id: 'msg_123',
    threadId: 'thread_123',
    internalDate: '1782554400000',
    snippet: 'Approved. Please proceed.',
    payload: {
      headers: [
        { name: 'Subject', value: 'Vendor payment approval' },
        { name: 'From', value: '"Priya Sharma" <priya@company.com>' },
        { name: 'To', value: 'finance@company.com' },
        { name: 'Cc', value: 'legal@company.com' },
      ],
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: base64Url('Approved. Please proceed with the vendor payment after Procurement confirms the PO.') },
        },
      ],
    },
  },
});

assert.equal(job.organizationId, 'org_123');
assert.equal(job.integrationId, 'int_gmail');
assert.equal(job.provider, 'GMAIL');
assert.equal(job.externalId, 'msg_123');
assert.equal(job.channel, 'Vendor payment approval');
assert.equal(job.sender, 'Priya Sharma');
assert.equal(job.senderEmail, 'priya@company.com');
assert.equal(job.timestamp, '2026-06-27T10:00:00.000Z');
assert.equal(job.sourceLink, 'https://mail.google.com/mail/u/approvals%40company.com/#inbox/thread_123');
assert.ok(job.message.includes('Subject: Vendor payment approval'));
assert.ok(job.message.includes('Approved. Please proceed with the vendor payment'));
assert.deepEqual((job.rawPayload as { recipients: { to: string; cc: string } }).recipients, {
  to: 'finance@company.com',
  cc: 'legal@company.com',
});

const storedTokens = storedGmailTokens({
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  scope: GMAIL_READ_ONLY_SCOPES,
  token_type: 'Bearer',
});
assert.equal(storedTokens.access_token, 'access-token');
assert.equal(storedTokens.refresh_token, 'refresh-token');
assert.ok(storedTokens.expires_at && storedTokens.expires_at > Date.now());

const encrypted = encryptJson(storedTokens);
const decrypted = decryptJson<typeof storedTokens>(encrypted);
assert.equal(decrypted.access_token, storedTokens.access_token);
assert.equal(decrypted.refresh_token, storedTokens.refresh_token);

console.log('Validated Gmail OAuth scopes, state, token encryption, evidence extraction, and ingestion mapping.');
