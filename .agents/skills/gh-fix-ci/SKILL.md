---
name: gh-fix-ci
description: Use when debugging or fixing failing GitHub PR checks that run in GitHub Actions. Inspect the actual checks and logs, identify the root cause, implement only a justified fix, and recheck the affected gates.
---

# GitHub PR Checks Debugging

Use the GitHub CLI to inspect failing PR checks and GitHub Actions logs. Keep the workflow lean and fix the repository rather than weakening validation.

## Rules

- Inspect the failing check and its logs before changing code.
- Distinguish a product failure from a broken workflow, stale gate, flaky infrastructure, or external provider.
- Do not delete, skip, weaken, or condition away a failing test solely to obtain a green check.
- Prefer the smallest root-cause fix.
- After a fix, rerun the affected check and the relevant regression tests.
- External providers are out of scope; record the details URL and do not pretend they are repository failures.
- Never add hard-coded behavior merely to satisfy a check.

## Typical commands

- `gh pr checks <pr>`
- `gh run view <run-id> --log`
- `gh run view <run-id> --json name,workflowName,conclusion,status,url,event,headBranch,headSha`

If a run is still active and its full log is unavailable, inspect the relevant job log through the GitHub Actions API.

## Completion standard

A fix is complete only when the production change, regression coverage, and the relevant GitHub gate have all been verified, or the remaining blocker is explicitly documented.
