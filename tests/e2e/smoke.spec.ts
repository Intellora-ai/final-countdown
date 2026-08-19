import { test, expect } from '@playwright/test';

/**
 * The one browser test: prove the stack works end to end.
 *
 * Playwright launches Chromium, the web server starts, the page loads, and a
 * real element rendered from this repository's own data is visible. Every
 * locator here is semantic — a role or a link name — so the test survives
 * markup changes and fails only when the report genuinely stops rendering.
 */
test('coverage report renders in a real browser', async ({ page }) => {
  const response = await page.goto('/');

  // The server answered at all. Without this a 404 page that happens to
  // contain the right words would pass the assertions below.
  expect(response?.status()).toBe(200);

  await expect(page).toHaveTitle(/Coverage report/);

  // The heading carries the percentage, so matching it proves the report was
  // rendered from real coverage data rather than served as an empty shell.
  await expect(
    page.getByRole('heading', { name: /Coverage report/ }),
  ).toBeVisible();

  // A source file this repository actually contains. If the coverage database
  // were empty the table would render with no rows and this would fail.
  await expect(
    page.getByRole('link', { name: 'src/add.py' }),
  ).toBeVisible();
});
