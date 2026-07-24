import { expect, test, type Page } from '@playwright/test';

const approvalId = process.env.E2E_APPROVAL_ID;
const forbiddenApprovalId = process.env.E2E_FORBIDDEN_APPROVAL_ID;
const deletedApprovalId = process.env.E2E_DELETED_APPROVAL_ID ?? 'deleted-approval-e2e';
const slowApprovalId = process.env.E2E_SLOW_APPROVAL_ID;
const hasAuthenticatedFixture = Boolean(process.env.E2E_STORAGE_STATE && approvalId);

async function expectRenderedPage(page: Page) {
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  await expect(page.locator('body')).not.toContainText('Application error');
}

test.describe('Approval Timeline production actions', () => {
  test.skip(!hasAuthenticatedFixture, 'Set E2E_STORAGE_STATE and E2E_APPROVAL_ID to run authenticated approval tests.');

  test('View Full Approval renders complete content and no blank page', async ({ page }) => {
    await page.goto(`/approvals/${approvalId}`);
    await expectRenderedPage(page);
    await expect(page.getByText('Decision', { exact: true })).toBeVisible();
    await expect(page.getByText('Evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('Comments', { exact: true })).toBeVisible();
    await expect(page.getByText('Decision metadata', { exact: true })).toBeVisible();
    await expect(page.getByText('Audit Trail', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Source' })).toBeVisible();
  });

  test('Open Source always renders retained evidence or an unavailable state', async ({ page }) => {
    await page.goto(`/approvals/${approvalId}/source`);
    await expectRenderedPage(page);
    await expect(page.getByText('Source Evidence', { exact: true })).toBeVisible();
    await expect(page.getByText(/Decision context|Original source is no longer available/)).toBeVisible();
  });

  test('evidence and all export actions produce files', async ({ page }) => {
    await page.goto(`/approvals/${approvalId}`);
    for (const label of ['Download Evidence', 'Export PDF', 'Export JSON', 'Export CSV']) {
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: label }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename().length).toBeGreaterThan(4);
    }
  });

  test('timeline and related-action controls have valid destinations', async ({ page }) => {
    await page.goto(`/approvals/${approvalId}`);
    await page.getByRole('link', { name: 'View Timeline' }).click();
    await expect(page.locator('#timeline')).toBeInViewport();
    for (const name of ['Open Investigation', 'Open Memory Graph', 'Open Copilot', 'Open Playbook']) {
      const link = page.getByRole('link', { name });
      await expect(link).toHaveAttribute('href', /\S+/);
    }
    await page.getByRole('button', { name: 'Copy Link' }).click();
    await expect(page.getByText('Approval link copied.')).toBeVisible();
  });

  test('deleted or missing approval shows a safe nonblank state', async ({ page }) => {
    await page.goto(`/approvals/${deletedApprovalId}`);
    await expectRenderedPage(page);
    await expect(page.getByText('This record may have been deleted')).toBeVisible();
  });

  test('missing source never creates a blank page', async ({ page }) => {
    await page.goto(`/approvals/${deletedApprovalId}/source`);
    await expectRenderedPage(page);
    await expect(page.getByText('This record may have been deleted')).toBeVisible();
  });

  test('cross-tenant or forbidden approval does not disclose record data', async ({ page }) => {
    test.skip(!forbiddenApprovalId, 'Set E2E_FORBIDDEN_APPROVAL_ID to test a record owned by another fixture tenant.');
    await page.goto(`/approvals/${forbiddenApprovalId}`);
    await expectRenderedPage(page);
    await expect(page.getByText(/deleted|permission/i)).toBeVisible();
    await expect(page.getByText('Decision', { exact: true })).toHaveCount(0);
  });

  test('expired session redirects to sign in instead of rendering a blank page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`/approvals/${approvalId}`);
    await expectRenderedPage(page);
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  });

  test('slow backend resolves to retryable content rather than infinite loading', async ({ page }) => {
    test.skip(!slowApprovalId, 'Set E2E_SLOW_APPROVAL_ID to a fixture backed by an intentionally delayed query.');
    await page.goto(`/approvals/${slowApprovalId}`);
    await expectRenderedPage(page);
    await expect(page.getByText(/taking longer|could not be displayed/i)).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('link', { name: /Retry approval|Retry/i })).toBeVisible();
  });

  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 1000 },
  ]) {
    test(`${viewport.name} layout has no horizontal overflow or permanent skeleton`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/approvals/${approvalId}`);
      await expectRenderedPage(page);
      await expect(page.locator('[aria-label="Loading approval"]')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    });
  }
});
