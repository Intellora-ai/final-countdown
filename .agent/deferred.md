# Deferred — found during work, out of scope where they were found

## Focus is lost when the doubt box re-enables

**Found:** task 7, while adding the in-flight submit guard to
`frontend/src/canvas/teach/TeachView.tsx`.

**What happens:** the input is `disabled` while an answer is in flight, so the
guard is visible rather than silently swallowing a keypress. A real browser
BLURS an element when it becomes disabled, so the learner's focus drops to
`<body>`. Nothing restores it when the box re-enables, so a keyboard learner has
to tab back in from the top of the document after every question they ask.

**Why it is not fixed here:** jsdom does NOT blur a disabled element. A probe
run in `TeachView.test.tsx` reported focus still on the input through the whole
in-flight window — that is jsdom disagreeing with browsers, not evidence the
behaviour is fine. Any test written for this in jsdom would pass against the
broken code, which is worse than no test.

**What it needs:** a real-browser test (the Playwright e2e suite), asserting
focus returns to the box once the answer lands. Not a unit test.

**Status:** open. Raised with Tanveer separately.

## A deepened lesson does not survive a reload, and cannot be earned again

**Found:** task 8, while persisting the teaching view's progress. Surfaced by a
real regression in `frontend/src/canvas/learn/LearnView.test.tsx`.

**What happens:** `TeachView` now persists `struggleReported`, so a restored
session does not deepen a second time — which is what task 8 asked for, and
right on its own terms. But `LearnView` holds the lessons it has ADDED in plain
component state, and that is not persisted. So after a reload the learner is
back on the original lesson, the deepened one it fetched for them is gone, and
the flag saying "already deepened" is still true. They cannot get it again by
struggling, because the signal has already fired.

**Why it is not fixed here:** `LearnView` is outside
`frontend/src/canvas/teach/`, and task 8's stop conditions name a conflict
outside that directory as a reason to stop rather than widen.

**Two ways to close it, and they differ in what they claim:**
- persist which lessons `LearnView` has added, so the deepened lesson comes back
  with everything else; or
- scope `struggleReported` to the lesson actually on screen, so returning to the
  original lesson can earn the deepening again.

The first keeps the learner where they were. The second treats a reload as a
fresh chance. That is a product decision, not a technical one.

**Status:** open. Not a regression introduced by task 8 alone — the state was
always lost on reload; task 8 makes it visible by remembering the flag.
