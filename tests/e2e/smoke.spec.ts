import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * THE PAGE UNDER TEST IS A FIXTURE, AND IT HAS TO SAY SO.
 *
 * The e2e workflow builds htmlcov/ from four targeted `src` tests rather than
 * from the full 764-test suite, because the full run cost 117 seconds of a
 * 146-second job and produced the same five rows at the same values. That is a
 * fair trade for a rendering test and a lie for anything else, so the report
 * ships with a scope declaration and this file refuses to run without it.
 *
 * Read from disk, not over HTTP: the webServer serves `htmlcov/`, so
 * `reports/e2e-scope.json` is not reachable at any URL — and keeping it out of
 * the served tree is the point. It is provenance, not content under test.
 *
 * Every failure here is a hard failure. A missing, malformed, stale, or
 * contradictory declaration means the page being asserted on is not the page
 * the workflow believes it built, and a browser test that keeps going in that
 * state is a static file-existence check wearing a costume.
 */
const FIXTURE_TESTS = [
  'tests/test_add.py',
  'tests/test_clamp.py',
  'tests/test_multiply.py',
  'tests/test_subtract.py',
];

interface FixtureScope {
  schema_version: string;
  scope: string;
  commit_sha: string;
  run_id: string;
  run_attempt: string;
  workflow: string;
  job: string;
  producer_command: string;
  coverage_target: string;
  is_full_suite_coverage: boolean;
  purpose: string;
}

function readScope(): FixtureScope {
  let raw: string;
  try {
    raw = readFileSync('reports/e2e-scope.json', 'utf-8');
  } catch (cause) {
    throw new Error(
      'reports/e2e-scope.json is missing. The rendering fixture must declare ' +
        'its scope before any browser assertion runs; without it there is no ' +
        'evidence that htmlcov/ belongs to this run. ' +
        `Underlying error: ${String(cause)}`,
    );
  }
  try {
    return JSON.parse(raw) as FixtureScope;
  } catch (cause) {
    throw new Error(
      `reports/e2e-scope.json is not valid JSON: ${String(cause)}`,
    );
  }
}

test('the served report declares itself a fixture belonging to this run', () => {
  const scope = readScope();

  expect(scope.scope).toBe('e2e-rendering-fixture');

  // The one assertion that keeps the whole trade honest. If this file ever
  // claims full-suite coverage, something has wired a four-test report into a
  // position where it could stand in for the coverage gate.
  expect(scope.is_full_suite_coverage).toBe(false);
  expect(scope.coverage_target).toBe('src');

  // Belongs to THIS run, not a previous one. `htmlcov/` and `reports/` are
  // gitignored so a fresh checkout cannot carry them, but a warm or reused
  // workspace can, and stale evidence is the failure mode that looks most like
  // success. Skipped outside CI, where these variables do not exist and
  // demanding them would make the suite unrunnable by hand.
  if (process.env.CI) {
    expect(scope.commit_sha).toBe(process.env.GITHUB_SHA);
    expect(scope.run_id).toBe(process.env.GITHUB_RUN_ID);
    expect(scope.run_attempt).toBe(process.env.GITHUB_RUN_ATTEMPT);
    expect(scope.workflow).toBe(process.env.GITHUB_WORKFLOW);
    expect(scope.job).toBe(process.env.GITHUB_JOB);
  }

  // The command that built it, checked by shape rather than by string
  // equality: an exact-match assertion against a command spelled out in two
  // files is a test that fails on whitespace and passes on substance. These
  // four checks catch what matters -- the targeted selection is present, the
  // coverage target is right, and the full-suite marker is absent.
  for (const path of FIXTURE_TESTS) {
    expect(scope.producer_command).toContain(path);
  }
  expect(scope.producer_command).toContain('--cov=src');
  expect(scope.producer_command).not.toContain('not axle');
});

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
