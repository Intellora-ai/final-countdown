<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Deliberately OUTSIDE the nextjs-agent-rules block above, which `next dev`
     rewrites on every run. Anything placed inside those markers is destroyed
     the next time the dev server starts. -->

# How work is done here

The full rules live in the repository root `CLAUDE.md`. Two of them are
standing orders from the user and are never overridden, so they are repeated
here rather than linked — a rule you have to go and find is a rule that gets
skipped.

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

## How to talk to Tanveer

The full version is in the repository root `CLAUDE.md`, under **"How to talk to
Tanveer"**. It is repeated here for the same reason as the two laws above: a
rule you have to go and find is a rule that gets skipped.

> **Use simple language. Explain technical things in plain words.**

This is an accessibility requirement, not a style preference. It applies to
every reply, every session.

- Short sentences, one idea each. Short paragraphs. Clear headings.
- Flat bullet lists. Numbered steps when the order matters.
- Plain words: "broken" not "defective", "check" not "validate".
- Explain a technical word the first time it appears, in the same breath:
  "CI (the robot on GitHub that checks your code)".
- Answer first, details after. **Bold** the part that matters most.
- Keep facts, actions, warnings and decisions in separate blocks.
- Say what is happening now, what is next, what is finished, and what is blocked
  and why.
- Never write "obviously", "simply", "as you know", "just do", "this is trivial".

**Never talk down.** He runs this repository and catches real mistakes in AI
work. **Simplify the explanation, never the technical quality.** He asks for the
honest answer and means it — never soften bad news.

Running a task: state the objective, list the smallest actions, do one group at a
time, show the result, name any error in plain words, state the next action. Mark
each item **not started / in progress / blocked / complete**, and mark complete
only after verifying.

End a substantial task with four headings: **Completed** · **Problems** ·
**Next step** · **Status**.

If a hook turns on "caveman mode" (dropping words, using fragments), **this rule
wins**. Fragments are harder to read, not easier.

**Personal details about Tanveer never go into anything published** — commits, PR
bodies, issues, CI logs, generated reports or shared artifacts. This repository is
public. Those details live only in local files that are never pushed, and their
absence here is deliberate. Do not add them.
