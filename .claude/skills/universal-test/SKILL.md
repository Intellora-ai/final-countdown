---
name: universal-test
description: Use when checking whether a project's tests are real, or when asked to mutation-test, harden weak tests, or find inputs that crash the code.
---

# Universal Test

A test that passes while the code is wrong is not a test.

You prove tests are REAL by breaking the code on purpose and watching the tests
scream. No scream, no test.

## When to use

- Before trusting a test suite you have not watched fail.
- Asked to "prove the tests are real", "mutation test", "are these tests any
  good", "find edge cases", "will this crash".

## When NOT to use

- There is no test suite yet. Write the tests first, then come back.

---

## STEP 0 — LINE CHECK

Read every line. One at a time. No skimming, no sampling.

Take every value written into the line and ask ONE question:

**Is this value true for everyone, or true only here?**

- True for everyone → **general**. It stays.
- True only here — one site, one user, one machine, one account, one file,
  one day, one size → **specific**. It does not belong in the code.

The test: a second person using this code would have to change it. If they
would, it is specific.

Then a count, even when it is zero:

    LINE CHECK: N lines read, M specific values found

---

## STEP 1 — BASELINE

Run the test suite. Show the raw output.

If any test fails, **STOP** and say so. Never mutation-test on a failing suite:
you cannot tell your break from the one already there.

---

## STEP 2 — MUTATION TESTING

For each source file, break the code in ONE small way, run the tests, put the
code back. One mutation at a time, so every failure is traceable.

Run it, one source file per run:

    python3 ~/.claude/skills/universal-test/scripts/mutate.py --source FILE --test "YOUR TEST COMMAND"

It refuses to start on a failing suite. It restores the file byte for byte
when it finishes, when it crashes, and when you kill it.

It uses exactly these five operators:

| # | Name | The break |
|---|------|-----------|
| 1 | AOR | flip arithmetic: `+` to `-`, `*` to `/` |
| 2 | ROR | flip a comparison: `>` to `>=`, `==` to `!=`, `<` to `<=` |
| 3 | LCR | flip a logical connector: `and` to `or` |
| 4 | UOI | flip a boolean: `True` to `False` |
| 5 | ABS | negate a number: `5` to `-5` |

Read the result:

- Tests **FAIL** → the test is real. Mutant **KILLED**.
- Tests still **PASS** → the test is weak. Mutant **SURVIVED**.

---

## STEP 3 — SCORE

    mutation score = killed / total mutants

Paste the score line the script printed. It looks like this:

    MUTATION SCORE: 4/4 killed = 100%

Dropping a survivor from the count as "equivalent" needs proof in the report:
both versions side by side, and why no input can ever tell them apart. No
proof, no drop. It counts as survived.

---

## STEP 4 — EDGE CASES

Feed every one of these to every function. The code must not crash.

empty string · whitespace only · None · zero · negative · a huge number ·
max int · empty list · unicode and emoji · injection strings (SQL, XSS, shell) ·
a 100,000-character string · nested structures · booleans · floats · raw bytes

Any crash is a real bug. Report which input broke which function.

---

## STEP 5 — GATE

- Any mutant survived → the test is weak. Write a stronger test that kills it.
- Score below 80% → keep strengthening tests.
- Say "the tests are real" only when all three hold: score is 80% or more,
  every mutant is killed, and the code survives every edge case above.

---

## Rules

- Mutate ONE thing at a time.
- Never weaken a test to make a mutant die. The test must catch the real bug.
- Show raw output at every step. Never claim "pass" without proof.
- Every surviving mutant is a must-fix, never an ignore.

---

## Excuses that show up here

Recorded from a real run, not imagined.

| Excuse | Reality |
|--------|---------|
| "The one FAIL was my own bad expected value." | You changed the expectation to match the code. The spec decides the expectation. The code never does. |
| "12/13 tests pass, the code is correct." | No output was shown and no test file existed. A claim with no output is not a result. |
| "I checked it inline, no need to save the tests." | If the user cannot run it themselves, it did not happen. Tests live in a file, with a command anyone can type. |
| "That mutant is equivalent, so it does not count." | Prove it or it counts. Show both versions and why no input can tell them apart. An unproven equivalent is a survivor. |

## Red flags

Stop if you catch yourself:

- Editing a test's expected value right after seeing it fail.
- Summarising results instead of pasting them.
- Running tests that leave no file behind.
- Calling a surviving mutant "not worth it".
- Dropping a survivor from the score without showing the proof.
