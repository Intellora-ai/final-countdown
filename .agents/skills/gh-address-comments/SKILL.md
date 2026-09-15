---
name: gh-address-comments
description: Help address review and issue comments on the open GitHub PR for the current branch. Inspect the actual review threads, apply justified fixes, and verify them.
---

# PR Comment Handler

Use GitHub CLI to inspect review comments and issue threads on the current PR.

## Rules

- Read the surrounding implementation before changing code.
- Treat reviewer comments as evidence to investigate, not instructions to blindly patch.
- Address valid comments at the root cause.
- Do not weaken tests or product behavior to silence a comment.
- Verify every applied fix with the narrowest relevant test, then rerun the affected gate.

## Typical commands

- `gh pr view --json number,url`
- `gh pr checks <pr>`
- `gh pr view <pr> --comments`

## Completion standard

Report which comments were addressed, what changed, what was verified, and which comments remain unresolved.
