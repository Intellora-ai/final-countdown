---
name: universal-code
description: Use when writing, reviewing, or refactoring any code, or when asked to make code universal, generic, reusable, or to stop hardcoding.
---

# Universal Code

Code that GENERALIZES, and is PROVEN by invariants.

Never code hardcoded to one scenario. Never code claimed correct without
evidence you can paste.

## When to use

- Writing new code from a spec or a request.
- Reviewing or refactoring existing code.
- Any of the trigger phrases: "universal code", "generic", "reusable",
  "stop hardcoding", "generalize", "make this work for any", "write
  invariants", "property test", "no magic numbers", "clean up this code",
  "refactor".

## When NOT to use

- A throwaway one-off script the user has said is throwaway.
- A change with no logic in it: renaming a file, fixing a typo in a comment.

---

## The rules — they apply in every phase

1. **NO HARDCODING.** No hardcoded credentials, IDs, URLs, magic numbers, or
   secrets. Everything configurable goes in config or environment variables.
2. **GENERALIZE.** Parameterize inputs. Never write for one specific scenario.
   If the same logic appears twice, extract it. Abstract only at 3+ real call
   sites — never for a single use case.
3. **NO FALLBACKS / HIDDEN DEFAULTS** unless explicitly requested.
4. **SMALLEST CHANGE** that satisfies the request. No over-engineering, no
   extra dependencies, no speculative abstraction.
5. **TESTS FIRST.** Write the test from the SPEC before the implementation.
   Expected values come from the spec, never from your own code.
6. **NEVER claim "pass" or "done"** without showing raw test output as
   evidence.

---

## PHASE 1 — LINE CHECK

Run this on every file you are about to change, and every file you wrote:

    python3 ~/.claude/skills/universal-code/scripts/list_values.py FILE [FILE ...]

It prints every value on every line, and the count of lines it read. It has no
opinion about which values are bad. It cannot have one: a list of bad value
types is itself a hardcoded list, and it misses whatever is not on it.

Judge every value it printed. One question each:

**Is this value true for everyone, or true only here?**

- True for everyone → **general**. It stays in the code.
- True only here — one site, one user, one machine, one account, one file,
  one day, one size → **specific**. It does not belong in the code.

The test for specific: a second person using this code would have to change
it. If they would, it is specific.

List every specific value you found:

    file:line — the value — what makes it specific — where it goes instead

Paste the script's own count line as your evidence:

    LINE CHECK: N lines read, M values to judge

**Gate:** every specific value is moved out, or the user says to keep it.
Nothing moves to Phase 2 while one is left in.

---

## PHASE 2 — BASELINE

Find the test command from the project itself, not from memory: its scripts,
its config, its docs. If the project has none, say so and ask for one.

Run it. Show the raw output.

**Gate:** any test already failing → **STOP** and say so. You cannot tell your
break from the one already there.

---

## PHASE 3 — INVARIANTS

Name the truths that must hold for EVERY input, not one case:

- **Roundtrip** — encode then decode returns the original.
- **Idempotence** — running twice equals running once.
- **Preserved property** — something that must never change (stays sorted,
  loses no data, only goes up).
- **No crash on ANY input** — empty, huge, weird, malicious, special
  characters.

Write them as a numbered list, then write them as tests.

Generate many inputs, not one. If the project already has a property-based
tool, use that one. If it has none, loop over inputs you generate yourself.
Do not add a dependency the project does not already have.

---

## PHASE 4 — RED

Write the tests from the spec, before the code exists. Expected values come
from the spec. Never from the code.

Run them. Show the raw output.

**Gate:** a new test that passes before the code exists is testing nothing.
Rewrite it.

---

## PHASE 5 — GREEN

Write the smallest code that passes. No fallback and no default that was not
asked for.

Run the whole suite. Show the raw output.

---

## PHASE 6 — MUTATION

Break each behaviour on purpose, one at a time, then put the code back.

Run the tests after each break. The test must **FAIL**.

**Gate:** the tests still pass while the code is wrong → that test is fake.
Go back to Phase 4 and write a real one.

---

## PHASE 7 — SHOW

Finish with this block. Nothing in it may be summarised:

    Target:       files changed
    Line check:   lines read, values found, where each moved to
    Test command: the command anyone can type to run this
    Invariants:   one line each
    Evidence:     the raw output, pasted
    Mutation:     what you broke, and the test that caught it
    Status:       DONE | DONE_WITH_CONCERNS | BLOCKED

---

## Self-review checklist

- [ ] Every line read, one at a time. Every value judged general or specific.
- [ ] No hardcoded secrets, IDs, URLs, or magic numbers anywhere.
- [ ] All configurable values come from config or env variables.
- [ ] Logic is generalized, not written for one scenario.
- [ ] No unrequested fallbacks, hidden defaults, or speculative abstractions.
- [ ] Smallest change that satisfies the request.
- [ ] Tests written from the spec first, expected values from the spec.
- [ ] Property-based invariants cover the core behavior.
- [ ] Mutation-tested: breaking behavior fails the test.
- [ ] Raw test output shown as evidence of passing.

---

## Anti-patterns

Reject these:

- Hardcoding a value that should be a parameter or config.
- Writing a test that matches your implementation instead of the spec.
- Adding a fallback or default that was not asked for.
- Creating an abstraction for a single use case.
- Claiming "all tests pass" without showing output.
- Weakening an invariant to make a test pass.
- Writing code for one scenario when the same logic serves many.
