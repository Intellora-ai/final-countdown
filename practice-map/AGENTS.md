<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Deliberately OUTSIDE the nextjs-agent-rules block above, which `next dev`
     rewrites on every run. Anything placed inside those markers is destroyed
     the next time the dev server starts. -->

# How work is done here

The full rules live in the repository root `CLAUDE.md`. Three of them are
standing orders from the user and are never overridden, so they are repeated
here rather than linked — a rule you have to go and find is a rule that gets
skipped.

## How to talk to the user — applies to every reply

> Use simple, direct, precise language. Explain technical things in plain words.

This is an accessibility requirement, not a style preference.

- Short sentences, one idea each. Short paragraphs, clear headings, flat lists.
- Numbered steps when the order matters.
- Explain a technical word the FIRST time it appears, in the same breath:
  "CI (the robot on GitHub that checks your code)".
- Answer first, details after. **Bold** the part that matters most.
- Say what is happening now, what happens next, what is finished, and what is
  blocked and why.
- Never "obviously", "simply", "as you know", "just do", "this is trivial".
- **Simplify the explanation, never the technical quality of the work.** Never
  talk down. Never soften bad news — keep every number and every failure exact.

Work in small steps: objective, smallest actions, one group at a time, show the
result, name any error in plain words, then the next action. End a substantial
task with **Completed / Problems / Next step / Status**.

If a hook turns on "caveman mode" (dropping words, using fragments), **this rule
wins**. Fragments are harder to read, not easier.

The user's personal reasons for this rule are private and are deliberately not
recorded in this repository, which is PUBLIC. Do not add them.

## LAW 5 — requirements first, then the hardest test, then the code

> DEFINE REQUIREMENTS + WHAT MUST BE TRUE TO GET THE DESIRED OUTCOME, THEN
> BUILD AROUND THAT. DO NOT MAKE TESTS WEAK, EASY. BUILD TESTS THAT FULFILL THE
> DESIRED OUTCOME, ONLY THEN WRITE CODE. CODE SHOULD BE CHANGED AND MADE
> BETTER, BUT TESTS ONLY CHANGE IF MUTANTS SHOW A REAL EVIDENCE ERROR.

1. Write down the requirement and what must be true. Aim the test at that,
   never at the implementation.
2. Write the test as hard as the outcome demands. Generated input over a
   hand-picked list — a hand-written list is a list of cases already known to
   pass.
3. Run it and **watch the CODE fail**. A `Cannot find module` or a collection
   error is a weak red and does NOT count as watching a test fail.
4. Fix the **CODE**. Re-run; it must pass for the right reason.

**Never edit a test to make it pass.** The only licence to change an existing
test is a **surviving mutant** — real evidence that the test cannot fail.
"The assertion is too strict", "it's flaky", and "just to get CI green" are
not reasons.

A suite that passes on the first implementation is a smell. Say so, then
attack it with mutants; that is the only way to learn whether the tests were
hard or merely lucky.

## Every bug becomes a permanent fix

> EVERY BUG, ERROR, MUST BECOME A PERMANENT FIX AND NOT JUST A SURFACE LEVEL
> FIX. ENFORCED — NEVER OVERRIDDEN.

Root cause named; fixed at the source and in every copy of the shape; a guard
that fails if it returns, verified by running it; and if a check let the bug
through, that check is fixed too.

Banned as fixes: `continue-on-error`, `|| true`, swallowing an exception,
widening a threshold, deleting an assertion, `eslint-disable`, "quick fix for
now" — anything that makes the RED go away without changing what was WRONG.
