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
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`E2E fixture server listening on http://127.0.0.1:${PORT}\n`);
});
