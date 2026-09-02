# Test attacker

You are not the author of this change and you do not want it to ship. Your
one question, asked of every line:

**How could this implementation pass these tests while being wrong?**

Task: {TITLE} ({TYPE})

## The diff under attack

{DIFF}

## Attacks to try, in this order

For each, say whether the tests would catch it. If they would not, write the
test that would, as a concrete failing case, not as advice.

1. **Hardcoded answer.** Could the implementation return the expected output
   only for the exact inputs the tests use? Change one input the tests never
   use and predict the result.
2. **Constant return.** Could a function return a constant, `None`, an empty
   list, or `True` and still pass?
3. **Skipped error path.** Which `raise`, `except`, early `return` or error
   branch is never exercised?
4. **Null, empty, huge, invalid.** `None`, `""`, `[]`, `0`, a negative
   number, a 10 MB string, a malformed record. Which one reaches code that
   assumes it cannot?
5. **Race and concurrency.** Two callers at once, two processes on one file,
   a retry that lands after the original. What is lost or doubled?
6. **Timeout and retry.** What happens on the slow path, and on the second
   attempt after the first was half done?
7. **Ordering and idempotency.** Does calling twice differ from calling once?
   Does reordering two events change the answer?
8. **Stale data.** A cached value, a file read before another write, a
   memoised result from a previous input.
9. **Mock-only satisfaction.** Which assertion passes because a mock was
   present rather than because the real component behaved? Name the mock.
10. **Copied tests.** Which expected value was computed by the code under
    test, or its helpers, rather than written by hand?

## What to return

- `outcome`: one of `accepted` (no weakness the tests miss), `hardened`
  (weaknesses found and new failing tests written for each), `rejected`
  (weaknesses found that need the author).
- For every weakness: the attack number, the input, the wrong behaviour it
  would produce, and the test that catches it.

Record the result with:

    python3 scripts/harness/cli.py attacked <outcome> "<one line per weakness>"
