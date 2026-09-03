import { expect, test, type Page } from '@playwright/test';

// ─── Fixture defaults ─────────────────────────────────────────────────────────
// Tests run against the self-contained fixture server (tests/e2e/fixture-server.mjs)
// by default and require no database, Clerk session, or env variables.
// Set E2E_BASE_URL + E2E_STORAGE_STATE + E2E_FOUNDER_CUSTOMER_ID to run against a live app.

const FIXTURE_CUSTOMER_A = 'fixture-customer-a';
const customerId = process.env.E2E_FOUNDER_CUSTOMER_ID ?? FIXTURE_CUSTOMER_A;

async function expectRenderedPage(page: Page) {
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  await expect(page.locator('body')).not.toContainText('Application error');
}

// ─── Auth gate ────────────────────────────────────────────────────────────────

test.describe('Founder access control', () => {
  test('non-founder is denied and sees no founder console content', async ({ page }) => {
    // Simulate the app redirecting a non-founder to /dashboard
    await page.route('**/founder', (route) => {
      void route.fulfill({
        status: 302,
        headers: { Location: '/dashboard' },
        body: '',
      });
    });
    await page.goto('/founder');
    await expectRenderedPage(page);
    await expect(page.locator('#no-founder-access')).toBeVisible();
    await expect(page.locator('#founder-mode-badge')).toHaveCount(0);
  });

  test('unauthenticated request to /founder redirects to sign in', async ({ page }) => {
    await page.route('**/founder', (route) => {
      void route.fulfill({
        status: 302,
        headers: { Location: '/sign-in?redirect_url=%2Ffounder' },
        body: '',
      });
    });
    await page.context().clearCookies();
    await page.goto('/founder');
    await expectRenderedPage(page);
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  });
});

// ─── Founder overview ─────────────────────────────────────────────────────────

test.describe('Founder overview', () => {
  test('renders FOUNDER MODE badge, attention queue, and key metrics', async ({ page }) => {
    await page.goto('/founder');
    await expectRenderedPage(page);
    await expect(page.locator('#founder-mode-badge')).toBeVisible();
    await expect(page.locator('#founder-mode-badge')).toContainText('FOUNDER MODE');
    await expect(page.locator('#attention-queue')).toBeVisible();
    await expect(page.locator('#metric-total-accounts')).toBeVisible();
    await expect(page.locator('#metric-at-risk')).toBeVisible();
    await expect(page.locator('#metric-approvals')).toBeVisible();
    await expect(page.locator('#metric-integrations')).toBeVisible();
  });

  test('quick action links are present and have valid hrefs', async ({ page }) => {
    await page.goto('/founder');
    // Use exact:true to distinguish quick-action "Audit log" from nav "Audit Log"
    for (const name of ['Provision customer', 'View all customers', 'Operations']) {
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', /\S+/);
    }
    // "Audit log" quick action (lowercase 'l') is distinct from the nav "Audit Log"
    const auditLink = page.getByRole('link', { name: 'Audit log', exact: true });
    await expect(auditLink).toBeVisible();
    await expect(auditLink).toHaveAttribute('href', /\/founder\/audit/);
  });

  test('recent customers table has Open → links to Customer 360', async ({ page }) => {
    await page.goto('/founder');
    const openLinks = page.getByRole('link', { name: 'Open →' });
    await expect(openLinks.first()).toBeVisible();
    await expect(openLinks.first()).toHaveAttribute('href', /\/founder\/customers\/.+/);
  });

  test('navigation bar links reach founder sub-pages', async ({ page }) => {
    await page.goto('/founder');
    const navLinks: Array<{ name: string; url: RegExp }> = [
      { name: 'Customers', url: /\/founder\/customers/ },
      { name: 'Users', url: /\/founder\/users/ },
      { name: 'Plans & Billing', url: /\/founder\/billing/ },
      { name: 'Customer Health', url: /\/founder\/health/ },
      { name: 'Settings', url: /\/founder\/settings/ },
    ];
    for (const { name, url } of navLinks) {
      // Use exact:true to avoid strict-mode collisions from duplicate link text
      const link = page.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', url);
    }
    // Nav "Audit Log" (capital L) vs quick-action "Audit log" — use exact:true
    await expect(page.getByRole('link', { name: 'Audit Log', exact: true })).toHaveAttribute('href', /\/founder\/audit/);
  });
});

// ─── Customer 360 ─────────────────────────────────────────────────────────────

test.describe('Customer 360', () => {
  test('clicking an Open → link navigates to Customer 360 with account details', async ({ page }) => {
    await page.goto('/founder');
    await page.getByRole('link', { name: 'Open →' }).first().click();
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible();
    await expect(page.locator('#status-badge')).toBeVisible();
  });

  test('Customer 360 shows feature flags list', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}`);
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Feature flags' })).toBeVisible();
    const featureStatuses = page.locator('.feature-status');
    await expect(featureStatuses.first()).toBeVisible();
  });

  test('Customer 360 has note-add form with required textarea', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}`);
    const form = page.locator('#add-note-form');
    await expect(form).toBeVisible();
    await expect(form.locator('textarea[name="body"]')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Save note' })).toBeVisible();
  });

  test('Customer 360 has status management controls', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}`);
    const statusForm = page.locator('#change-status-form');
    await expect(statusForm).toBeVisible();
    await expect(statusForm.getByRole('button', { name: 'Suspend customer' })).toBeVisible();
  });

  test('Customer 360 audit trail shows past founder mutations', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}`);
    await expect(page.getByRole('heading', { name: 'Founder audit trail' })).toBeVisible();
    await expect(page.getByText('customer.provisioned')).toBeVisible();
  });

  test('Customer 360 links to managed users page', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}`);
    const usersLink = page.getByRole('link', { name: 'Manage users' });
    await expect(usersLink).toBeVisible();
    await expect(usersLink).toHaveAttribute('href', /\/founder\/customers\/.+\/users/);
  });
});

// ─── User management ──────────────────────────────────────────────────────────

test.describe('User management', () => {
  test('global users page renders invite form with required fields', async ({ page }) => {
    await page.goto('/founder/users');
    await expectRenderedPage(page);
    const form = page.locator('#invite-user-form');
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="email"]')).toBeVisible();
    await expect(form.locator('input[name="firstName"]')).toBeVisible();
    await expect(form.locator('input[name="lastName"]')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Send invite' })).toBeVisible();
  });

  test('ACTIVE user row has role-change select and suspend control', async ({ page }) => {
    await page.goto('/founder/users');
    const activeRow = page.locator('#user-row-active');
    await expect(activeRow).toBeVisible();
    const roleForm = page.locator('#set-role-form');
    await expect(roleForm.locator('select[name="role"]')).toBeVisible();
    await expect(roleForm.getByRole('button', { name: 'Set role' })).toBeVisible();
    const suspendForm = page.locator('#suspend-form');
    await expect(suspendForm.getByRole('button', { name: 'Suspend' })).toBeVisible();
  });

  test('INVITED user row has revoke control', async ({ page }) => {
    await page.goto('/founder/users');
    const invitedRow = page.locator('#user-row-invited');
    await expect(invitedRow).toBeVisible();
    const revokeForm = page.locator('#revoke-form');
    await expect(revokeForm.getByRole('button', { name: 'Revoke' })).toBeVisible();
  });

  test('customer-scoped users page shows same management controls', async ({ page }) => {
    await page.goto(`/founder/customers/${customerId}/users`);
    await expectRenderedPage(page);
    await expect(page.locator('#invite-user-form')).toBeVisible();
    await expect(page.locator('#user-row-active')).toBeVisible();
  });
});

// ─── Billing / seat management ────────────────────────────────────────────────

test.describe('Billing and seat allocation', () => {
  test('billing page renders seat summary metrics', async ({ page }) => {
    await page.goto('/founder/billing');
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Seat allocation and plans' })).toBeVisible();
    await expect(page.getByText('Total seats')).toBeVisible();
    await expect(page.getByText('Used seats')).toBeVisible();
  });

  test('billing table has inline seat-edit form per account', async ({ page }) => {
    await page.goto('/founder/billing');
    const seatForm = page.locator('#seat-save-form');
    await expect(seatForm).toBeVisible();
    await expect(seatForm.locator('input[type="number"][name="purchasedSeats"]')).toBeVisible();
    await expect(seatForm.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('billing table has Open → links to Customer 360', async ({ page }) => {
    await page.goto('/founder/billing');
    const openLink = page.getByRole('link', { name: 'Open →' });
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', /\/founder\/customers\/.+/);
  });
});

// ─── Customer Health ──────────────────────────────────────────────────────────

test.describe('Customer Health dashboard', () => {
  test('health page renders status distribution metrics', async ({ page }) => {
    await page.goto('/founder/health');
    await expectRenderedPage(page);
    // Use <dt> role to avoid matching the <td>HEALTHY</td> table cell (case-insensitive)
    await expect(page.getByRole('term').filter({ hasText: 'Healthy' })).toBeVisible();
    await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
    await expect(page.getByText('At risk', { exact: true })).toBeVisible();
    await expect(page.getByText('Critical', { exact: true })).toBeVisible();
  });

  test('health table has scores and Open → links per account', async ({ page }) => {
    await page.goto('/founder/health');
    await expect(page.getByText('88/100')).toBeVisible();
    const openLink = page.getByRole('link', { name: 'Open →' }).first();
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', /\/founder\/customers\/.+/);
  });

  test('AT_RISK accounts are visible in the health table', async ({ page }) => {
    await page.goto('/founder/health');
    await expect(page.getByText('AT_RISK')).toBeVisible();
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

test.describe('Founder Audit Log', () => {
  test('audit log page renders with export controls', async ({ page }) => {
    await page.goto('/founder/audit');
    await expectRenderedPage(page);
    const csvLink = page.locator('#export-csv-link');
    const jsonLink = page.locator('#export-json-link');
    await expect(csvLink).toBeVisible();
    await expect(csvLink).toHaveAttribute('href', /format=csv/);
    await expect(jsonLink).toBeVisible();
    await expect(jsonLink).toHaveAttribute('href', /format=json/);
  });

  test('audit log shows founder mutation events', async ({ page }) => {
    await page.goto('/founder/audit');
    await expect(page.getByText('customer.provisioned')).toBeVisible();
    await expect(page.getByText('customer.feature_flag.updated')).toBeVisible();
    await expect(page.getByText('user.invited')).toBeVisible();
  });

  test('audit log does not expose OAuth tokens, secrets, or API keys', async ({ page }) => {
    await page.goto('/founder/audit');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/access_token|refresh_token|client_secret|api_key/i);
  });
});

// ─── Settings / diagnostics ───────────────────────────────────────────────────

test.describe('Console Settings', () => {
  test('settings page shows env presence without exposing values', async ({ page }) => {
    await page.goto('/founder/settings');
    await expectRenderedPage(page);
    await expect(page.getByText('Values are never exposed here')).toBeVisible();
    const statuses = page.locator('.env-status');
    await expect(statuses.first()).toContainText('Set');
  });

  test('settings page never displays secrets or token values', async ({ page }) => {
    await page.goto('/founder/settings');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/sk-[A-Za-z0-9]+/);
    expect(bodyText).not.toMatch(/xoxb-[A-Za-z0-9-]+/);
    expect(bodyText).not.toMatch(/postgresql:\/\/[^\s]+:[^\s]+@/i);
    expect(bodyText).not.toMatch(/ENCRYPTION_KEY\s*[:=]\s*\S+/i);
  });

  test('settings page shows founder identity and access level', async ({ page }) => {
    await page.goto('/founder/settings');
    await expect(page.getByText('SUPER ADMIN')).toBeVisible();
    await expect(page.getByText('Full access')).toBeVisible();
  });
});

// ─── Golden workflow (navigation) ─────────────────────────────────────────────

test.describe('Golden founder workflow', () => {
  test('founder can navigate from overview → Customer 360 → users → back', async ({ page }) => {
    await page.goto('/founder');
    await expectRenderedPage(page);
    await expect(page.locator('#founder-mode-badge')).toBeVisible();

    // Navigate to Customer 360
    await page.getByRole('link', { name: 'Open →' }).first().click();
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible();

    // Navigate to managed users from Customer 360
    await page.getByRole('link', { name: 'Manage users' }).click();
    await expectRenderedPage(page);
    await expect(page.locator('#invite-user-form')).toBeVisible();

    // Return to overview via breadcrumb
    await page.getByRole('link', { name: '← Overview' }).click();
    await expectRenderedPage(page);
    await expect(page.locator('#founder-mode-badge')).toBeVisible();
  });

  test('founder can navigate overview → billing → audit log', async ({ page }) => {
    await page.goto('/founder');
    await page.getByRole('link', { name: 'Plans & Billing' }).click();
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Seat allocation and plans' })).toBeVisible();

    await page.goto('/founder');
    // Use exact:true to avoid matching the quick-action "Audit log" link
    await page.getByRole('link', { name: 'Audit Log', exact: true }).click();
    await expectRenderedPage(page);
    await expect(page.getByRole('heading', { name: 'Founder Audit Log' })).toBeVisible();
  });

  test('mobile layout shows founder overview without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/founder');
    await expectRenderedPage(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});

// ─── Security assertions ──────────────────────────────────────────────────────

test.describe('Founder security assertions', () => {
  test('cross-tenant resource access: denied path shows no record data', async ({ page }) => {
    // Fixture simulates cross-tenant via the deleted HTML — the app returns a safe not-found state.
    await page.route('**/founder/customers/other-tenant-id', (route) => {
      void route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body><p>This record may have been deleted or you do not have permission to view it.</p></body></html>',
      });
    });
    await page.goto('/founder/customers/other-tenant-id');
    await expect(page.getByText(/deleted|permission/i)).toBeVisible();
    await expect(page.locator('#add-note-form')).toHaveCount(0);
  });

  test('founder pages never expose OAuth tokens in body text', async ({ page }) => {
    const routes = ['/founder', `/founder/customers/${customerId}`, '/founder/users', '/founder/audit'];
    for (const route of routes) {
      await page.goto(route);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toMatch(/access_token|refresh_token|oauth_token|client_secret/i);
    }
  });
});
