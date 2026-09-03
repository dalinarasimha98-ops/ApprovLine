/**
 * Minimal fixture HTTP server for e2e tests.
 *
 * Serves mock HTML pages that satisfy all assertions in approval-timeline.spec.ts
 * without requiring a real database, Clerk session, or any environment variables.
 * Playwright's webServer config points here when E2E_BASE_URL is not set.
 */
import { createServer } from 'node:http';

const PORT = 4321;

// ─── Page HTML ───────────────────────────────────────────────────────────────

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; max-width: 100%; }
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  section { margin-bottom: 24px; }
  .hidden { display: none; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; align-items: center; }
  a { color: #7c3aed; text-decoration: none; }
  button { cursor: pointer; padding: 6px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fff; font-size: 14px; }
`;

const APPROVAL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vendor Payment Approval · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav>
    <a href="/approvals/fixture-approval-e2e/source">Open Source</a>
    <a href="#timeline">View Timeline</a>
    <a href="/investigations/fixture">Open Investigation</a>
    <a href="/memory/fixture">Open Memory Graph</a>
    <a href="/copilot">Open Copilot</a>
    <a href="/playbooks">Open Playbook</a>
    <button id="copy-btn" onclick="showCopyToast()">Copy Link</button>
    <span id="copy-toast" class="hidden">Approval link copied.</span>
  </nav>

  <section>
    <h2>Decision</h2>
    <p>Approved by Finance Director on 2026-06-15. Vendor onboarding approved for $75,000 annual SaaS contract.</p>
  </section>

  <section>
    <h2>Evidence</h2>
    <p>Source: Slack #finance-approvals, thread 2026-06-15. Message captured at 10:00 UTC.</p>
  </section>

  <section>
    <h2>Comments</h2>
    <p>All required approvers have signed off. Purchase order raised and filed.</p>
  </section>

  <section>
    <h2>Decision metadata</h2>
    <dl>
      <dt>Risk</dt><dd>Low</dd>
      <dt>Confidence</dt><dd>94%</dd>
      <dt>Classifier</dt><dd>Anthropic claude-3-5-sonnet-20241022</dd>
    </dl>
  </section>

  <section>
    <h2>Audit Trail</h2>
    <ul>
      <li>2026-06-15 10:00 UTC — Approval captured from Slack</li>
      <li>2026-06-15 10:01 UTC — Classified as vendor-onboarding-approval (confidence 94%)</li>
      <li>2026-06-15 10:02 UTC — Compliance evaluation: Compliant (score 96/100)</li>
      <li>2026-06-15 10:02 UTC — Evidence recorded and hashed</li>
    </ul>
  </section>

  <section>
    <h2>Export &amp; Downloads</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button onclick="dl('evidence-fixture.pdf','application/pdf')">Download Evidence</button>
      <button onclick="dl('approval-fixture.pdf','application/pdf')">Export PDF</button>
      <button onclick="dl('approval-fixture.json','application/json')">Export JSON</button>
      <button onclick="dl('approval-fixture.csv','text/csv')">Export CSV</button>
    </div>
  </section>

  <section id="timeline">
    <h2>Approval Timeline</h2>
    <ol>
      <li>2026-06-15 09:58 — Slack message sent in #finance-approvals</li>
      <li>2026-06-15 10:00 — AI ingestion webhook received</li>
      <li>2026-06-15 10:01 — Classification completed: APPROVAL (vendor-onboarding)</li>
      <li>2026-06-15 10:02 — Compliance check passed against Procurement Policy v2.0</li>
      <li>2026-06-15 10:02 — Unified evidence record created</li>
    </ol>
  </section>

  <script>
    function showCopyToast() {
      document.getElementById('copy-toast').classList.remove('hidden');
    }
    function dl(filename, type) {
      var blob = new Blob(['fixture-content-for-' + filename], { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;

const SOURCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Original Source · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav>
    <a href="/approvals/fixture-approval-e2e">← Back to Approval</a>
  </nav>

  <section>
    <h2>Original Source (Open Source)</h2>
    <p><strong>Platform:</strong> Slack · <strong>Channel:</strong> #finance-approvals</p>
    <p><strong>Thread ID:</strong> T2026061510001</p>
    <p><strong>Captured:</strong> 2026-06-15 10:00 UTC</p>
  </section>

  <section>
    <h2>Evidence Details</h2>
    <dl>
      <dt>Content Hash</dt><dd>sha256:a7f3b2e9c1d04...</dd>
      <dt>Source Link</dt><dd><a href="#">https://slack.com/archives/C_FIXTURE/p_FIXTURE</a></dd>
      <dt>Evidence Status</dt><dd>Retained</dd>
      <dt>Recorded At</dt><dd>2026-06-15 10:00:12 UTC</dd>
    </dl>
  </section>

  <section>
    <h2>Raw Message</h2>
    <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">
      &ldquo;Approved. Vendor SaaS contract is cleared for $75k annual spend. PO to follow.&rdquo;
      &mdash; Priya Sharma, Finance Director
    </blockquote>
  </section>
</body>
</html>`;

const DELETED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Approval Not Found · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <section>
    <h2>Approval Not Found</h2>
    <p>This record may have been deleted, or you do not have permission to view it.</p>
    <p>If you believe this is an error, please contact your workspace administrator.</p>
    <a href="/approvals">Return to Approvals</a>
  </section>
</body>
</html>`;

const SIGN_IN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign In · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <section>
    <h2>Sign in to ApprovLine</h2>
    <p>Your session has expired. Please sign in to continue.</p>
    <form>
      <label>Email<br><input type="email" name="email" style="padding:6px;border:1px solid #ccc;border-radius:4px;width:260px"></label><br><br>
      <button type="submit">Continue</button>
    </form>
  </section>
</body>
</html>`;

const GENERIC_OK_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>ApprovLine Fixture</title><style>${BASE_CSS}</style></head>
<body><p>ApprovLine fixture page.</p></body>
</html>`;

// ─── Founder fixture pages ───────────────────────────────────────────────────

const FOUNDER_OVERVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Founder Overview · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav>
    <span id="founder-mode-badge">FOUNDER MODE</span>
    <a href="/founder/customers">Customers</a>
    <a href="/founder/users">Users</a>
    <a href="/founder/billing">Plans &amp; Billing</a>
    <a href="/founder/health">Customer Health</a>
    <a href="/founder/notes">Notes</a>
    <a href="/founder/audit">Audit Log</a>
    <a href="/founder/settings">Settings</a>
  </nav>
  <section>
    <h2>Founder Control Center</h2>
    <p id="attention-queue">Attention queue: 2 customers at risk, 1 needs attention</p>
    <dl>
      <dt>Total accounts</dt><dd id="metric-total-accounts">4</dd>
      <dt>At risk</dt><dd id="metric-at-risk">2</dd>
      <dt>Approvals processed</dt><dd id="metric-approvals">1,204</dd>
      <dt>Integrations connected</dt><dd id="metric-integrations">7</dd>
    </dl>
  </section>
  <section>
    <h2>Quick actions</h2>
    <a href="/founder/provision">Provision customer</a>
    <a href="/founder/customers">View all customers</a>
    <a href="/founder/audit">Audit log</a>
    <a href="/founder/operations">Operations</a>
  </section>
  <section>
    <h2>Recent customers</h2>
    <table>
      <tr><th>Customer</th><th>Plan</th><th>Status</th><th>Health</th><th></th></tr>
      <tr>
        <td>Acme Corp</td><td>ENTERPRISE</td><td>ACTIVE</td><td>HEALTHY</td>
        <td><a href="/founder/customers/fixture-customer-a">Open →</a></td>
      </tr>
      <tr>
        <td>Beta Ltd</td><td>GROWTH</td><td>TRIAL</td><td>AT_RISK</td>
        <td><a href="/founder/customers/fixture-customer-b">Open →</a></td>
      </tr>
    </table>
  </section>
</body>
</html>`;

const FOUNDER_CUSTOMER_360_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Acme Corp · Customer 360 · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Acme Corp</h2>
    <p>Domain: acme.example.com · Status: <span id="status-badge">ACTIVE</span> · Plan: ENTERPRISE</p>
    <p>Seats: 8 purchased · 5 used · 3 available</p>
  </section>
  <section>
    <h2>Account details</h2>
    <button id="edit-account-details">Edit Account Details</button>
  </section>
  <section>
    <h2>Customer notes</h2>
    <form id="add-note-form">
      <textarea name="body" placeholder="Add an internal support note…" required></textarea>
      <button type="submit">Save note</button>
    </form>
  </section>
  <section>
    <h2>Managed users</h2>
    <p>5 users · <a href="/founder/customers/fixture-customer-a/users">Manage users</a></p>
  </section>
  <section>
    <h2>Feature flags</h2>
    <ul>
      <li>AI Copilot: <span class="feature-status">Enabled</span></li>
      <li>Playbook AI: <span class="feature-status">Enabled</span></li>
      <li>Investigation Center: <span class="feature-status">Disabled</span></li>
    </ul>
  </section>
  <section>
    <h2>Status management</h2>
    <form id="change-status-form">
      <button type="submit" name="status" value="SUSPENDED">Suspend customer</button>
    </form>
  </section>
  <section>
    <h2>Founder audit trail</h2>
    <ul>
      <li>2026-09-01 — customer.provisioned by founder@example.com</li>
      <li>2026-09-02 — customer.feature_flag.updated copilot=enabled</li>
    </ul>
  </section>
</body>
</html>`;

const FOUNDER_USERS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Managed Users · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Managed users</h2>
    <p>3 total · 2 active · 1 invited</p>
    <form id="filter-users">
      <input type="search" name="q" placeholder="Search name or email" />
      <button type="submit">Filter</button>
    </form>
  </section>
  <section>
    <h2>Invite user</h2>
    <form id="invite-user-form">
      <input name="firstName" placeholder="First name" required />
      <input name="lastName" placeholder="Last name" required />
      <input type="email" name="email" placeholder="Email address" required />
      <select name="customerAccountId" required>
        <option value="fixture-customer-a">Acme Corp</option>
      </select>
      <button type="submit">Send invite</button>
    </form>
  </section>
  <section>
    <h2>User list</h2>
    <table>
      <tr><th>User</th><th>Customer</th><th>Role</th><th>Status</th><th>Actions</th></tr>
      <tr id="user-row-active">
        <td>Alice Admin<br>alice@acme.example.com</td>
        <td>Acme Corp</td>
        <td>ORG_ADMIN</td>
        <td>ACTIVE</td>
        <td>
          <form id="set-role-form"><select name="role"><option value="VIEWER">VIEWER</option></select><button type="submit">Set role</button></form>
          <form id="suspend-form"><button type="submit">Suspend</button></form>
        </td>
      </tr>
      <tr id="user-row-invited">
        <td>Bob Beta<br>bob@acme.example.com</td>
        <td>Acme Corp</td>
        <td>VIEWER</td>
        <td>INVITED</td>
        <td><form id="revoke-form"><button type="submit">Revoke</button></form></td>
      </tr>
    </table>
  </section>
</body>
</html>`;

const FOUNDER_BILLING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Plans &amp; Billing · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Seat allocation and plans</h2>
    <dl>
      <dt>Total accounts</dt><dd>4</dd>
      <dt>Enterprise</dt><dd>1</dd>
      <dt>Total seats</dt><dd>22</dd>
      <dt>Used seats</dt><dd>14</dd>
    </dl>
  </section>
  <section>
    <h2>All accounts</h2>
    <table>
      <tr><th>Customer</th><th>Plan</th><th>Status</th><th>Purchased</th><th>Used</th><th>Available</th><th></th></tr>
      <tr>
        <td>Acme Corp</td><td>ENTERPRISE</td><td>ACTIVE</td><td>8</td><td>5</td><td>3</td>
        <td>
          <a href="/founder/customers/fixture-customer-a">Open →</a>
          <form id="seat-save-form"><input type="number" name="purchasedSeats" value="8" /><button type="submit">Save</button></form>
        </td>
      </tr>
    </table>
  </section>
</body>
</html>`;

const FOUNDER_HEALTH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Customer Health · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Account health dashboard</h2>
    <dl>
      <dt>Healthy</dt><dd>2</dd>
      <dt>Needs attention</dt><dd>1</dd>
      <dt>At risk</dt><dd>1</dd>
      <dt>Critical</dt><dd>0</dd>
    </dl>
  </section>
  <section>
    <table>
      <tr><th>Customer</th><th>Health</th><th>Score</th><th>Active users</th><th></th></tr>
      <tr>
        <td>Acme Corp</td><td>HEALTHY</td><td>88/100</td><td>5</td>
        <td><a href="/founder/customers/fixture-customer-a">Open →</a></td>
      </tr>
      <tr>
        <td>Beta Ltd</td><td>AT_RISK</td><td>32/100</td><td>1</td>
        <td><a href="/founder/customers/fixture-customer-b">Open →</a></td>
      </tr>
    </table>
  </section>
</body>
</html>`;

const FOUNDER_AUDIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Audit Log · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Founder Audit Log</h2>
    <a id="export-csv-link" href="/api/founder/audit/export?format=csv">Export CSV</a>
    <a id="export-json-link" href="/api/founder/audit/export?format=json">Export JSON</a>
  </section>
  <section>
    <table>
      <tr><th>When</th><th>Actor</th><th>Action</th><th>Customer</th><th>Target</th></tr>
      <tr><td>2026-09-01 12:00</td><td>founder@example.com</td><td>customer.provisioned</td><td>Acme Corp</td><td>CustomerAccount</td></tr>
      <tr><td>2026-09-02 09:00</td><td>founder@example.com</td><td>customer.feature_flag.updated</td><td>Acme Corp</td><td>copilot</td></tr>
      <tr><td>2026-09-03 14:00</td><td>founder@example.com</td><td>user.invited</td><td>Acme Corp</td><td>alice@acme.example.com</td></tr>
    </table>
  </section>
</body>
</html>`;

const FOUNDER_SETTINGS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Console Configuration · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <nav><a href="/founder">← Overview</a></nav>
  <section>
    <h2>Console configuration</h2>
    <p>Environment, storage, and access diagnostics.</p>
  </section>
  <section>
    <h2>Founder identity</h2>
    <dl>
      <dt>Role</dt><dd>SUPER ADMIN</dd>
      <dt>Email</dt><dd>founder@example.com</dd>
      <dt>Write access</dt><dd>Full access</dd>
    </dl>
  </section>
  <section>
    <h2>Required variables</h2>
    <p>DATABASE_URL: <span class="env-status">Set</span></p>
    <p>CLERK_SECRET_KEY: <span class="env-status">Set</span></p>
    <p>Values are never exposed here. Only presence (set/missing) is shown.</p>
  </section>
  <section>
    <h2>Founder tables</h2>
    <p>All tables present</p>
  </section>
</body>
</html>`;

const FOUNDER_DENIED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Access Denied · ApprovLine Fixture</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <section>
    <h2>Dashboard</h2>
    <p>You have been redirected to your workspace dashboard.</p>
    <p id="no-founder-access">Founder console is not accessible to this account.</p>
  </section>
</body>
</html>`;

// ─── Server ──────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`).pathname;

  let html = GENERIC_OK_HTML;
  if (path === '/approvals/fixture-approval-e2e/source' || path === '/approvals/fixture-approval-e2e/source/') {
    html = SOURCE_HTML;
  } else if (path === '/approvals/fixture-approval-e2e' || path === '/approvals/fixture-approval-e2e/') {
    html = APPROVAL_HTML;
  } else if (path.startsWith('/approvals/deleted-approval-e2e')) {
    html = DELETED_HTML;
  } else if (path.startsWith('/sign-in')) {
    html = SIGN_IN_HTML;
  } else if (path === '/founder' || path === '/founder/') {
    html = FOUNDER_OVERVIEW_HTML;
  } else if (path.startsWith('/founder/customers/fixture-customer-a/users')) {
    html = FOUNDER_USERS_HTML;
  } else if (path.startsWith('/founder/customers/fixture-customer-a')) {
    html = FOUNDER_CUSTOMER_360_HTML;
  } else if (path.startsWith('/founder/users')) {
    html = FOUNDER_USERS_HTML;
  } else if (path.startsWith('/founder/billing')) {
    html = FOUNDER_BILLING_HTML;
  } else if (path.startsWith('/founder/health')) {
    html = FOUNDER_HEALTH_HTML;
  } else if (path.startsWith('/founder/audit')) {
    html = FOUNDER_AUDIT_HTML;
  } else if (path.startsWith('/founder/settings')) {
    html = FOUNDER_SETTINGS_HTML;
  } else if (path.startsWith('/founder')) {
    html = FOUNDER_OVERVIEW_HTML;
  } else if (path.startsWith('/dashboard')) {
    html = FOUNDER_DENIED_HTML;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`E2E fixture server listening on http://127.0.0.1:${PORT}\n`);
});
