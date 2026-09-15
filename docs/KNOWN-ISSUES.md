# Known issues

These are confirmed product issues that should not be hidden inside agent/session state.

## 1. Teaching input loses focus after an in-flight submit

A real browser blurs the disabled input while an answer is being generated. The current code does not restore focus when the input becomes enabled again. jsdom does not reproduce this browser behavior, so this requires a Playwright test.

**Status:** open.

## 2. Deepened lessons are lost on reload

Teaching progress can persist the `struggleReported` flag while the additional lesson held by `LearnView` remains only in component state. After reload, the learner can therefore return to the original lesson while the stored flag prevents earning the deepened lesson again.

This needs a product decision: persist added lessons, or scope the struggle flag to the lesson currently on screen.

**Status:** open.

These issues are intentionally tracked separately from CI configuration. A green unit suite must not be treated as evidence that browser-only state behavior is correct.
