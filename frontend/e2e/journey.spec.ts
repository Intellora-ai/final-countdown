import { expect, test } from '@playwright/test'

/*
 * THE ONLY LOGICALLY NECESSARY TEST IN THE SUITE.
 *
 * Saltzer's end-to-end argument, as Lampson puts it in 1983: "Error recovery at
 * the application level is absolutely necessary for a reliable system, and any
 * other error detection or recovery is not logically necessary but is strictly
 * for performance."
 *
 * His example is a file sent from machine A to B. To know it arrived you read it
 * back off B's disk and checksum it. Checking A's disk-to-memory, A-to-network
 * and B's memory-to-disk "is not sufficient, since there might be trouble at
 * some other point."
 *
 * Every other check here is an intermediate check. Typecheck, lint, 8,816 unit
 * tests, mutation across four shards, visual snapshots, and 44 e2e tests that
 * each enter at one route and exercise one feature. All real, all worth having,
 * and none of them establishes that the product works.
 *
 * This is the read-back: browser -> vite proxy -> backend on 8787 -> model ->
 * validator -> renderer. Nothing else in the suite crosses all of it.
 *
 * WHY `/learn` AND NOT `/#/canvas`, WHICH IS WHERE THIS TEST STARTED.
 *
 * Two attempts got this wrong and both were instructive.
 *
 * The first asked "what is a logarithm?" on the canvas and PASSED IN 1.7
 * SECONDS -- because the lesson on screen IS logarithms, so `lessonResolver`
 * answered locally and the run never left the browser. A green end-to-end test
 * that crossed no boundary is the same intermediate check as the other
 * forty-four wearing a better name.
 *
 * The second asked something the lesson could not answer, which forced
 * escalation -- and still never reached the backend, because the canvas's
 * engine rung posts to `/api/doubt`, a route the 8787 server does not serve. It
 * is handled by a vite dev plugin that spawns Python: a different engine
 * entirely. `CanvasRoute` also passes no `ask` prop at all, so its last rung
 * falls back to "no question service is configured".
 *
 * `/learn` is the path that actually crosses to the model -- `LearnView` posts
 * to `/api/lesson` and hands `TeachView` a real `ask` -- and it is the path that
 * was broken all of today: unset `VITE_TUTOR_*`, a withdrawn model id, a server
 * with no Groq support, and a 502 that read as a teaching failure. Every one of
 * those was found by hand. This is the check that would have caught them.
 */

/** A concept the shipped curriculum actually contains. */
const CONCEPT =
  'real-numbers--fundamental-theorem-of-arithmetic-statements-after-reviewing-work-done-earlier-a'

test.describe('the whole product, end to end', () => {
  test('a learner opens a concept and is taught it', async ({ page }) => {
    await page.goto(`/#/learn/${CONCEPT}`)

    /*
     * NOT `h1.td-h1`, WHICH IS THE FAILURE STATE'S HEADING.
     *
     * The first version asserted that selector and went red while the lesson
     * behind it had rendered perfectly. `LearnView` uses `td-h1` on its
     * `writing` and `failed` branches; once a lesson arrives, `TeachView`
     * replaces the whole subtree and renders its own heading. So the assertion
     * could only ever pass when the product had NOT worked -- a check that
     * fails on success, which is worse than no check at all.
     */
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 })

    /*
     * THE READ-BACK. A block on screen means the whole chain completed: the POST
     * was proxied, the backend chose a provider, the model answered, the reply
     * parsed, the lesson passed `validateLesson`, and the renderer drew it.
     *
     * Waiting on the LESSON rather than on the spinner disappearing. A spinner
     * that vanishes into an error message would satisfy the weaker check, and
     * "Writing this lesson for you..." forever was the exact symptom today.
     */
    const blocks = page.locator('.lc-teach__grid > .lc-teach__cell > .lc-block')
    await expect(blocks.first(), 'no lesson ever arrived').toBeVisible({ timeout: 60_000 })

    /* And it is a lesson, not a heading with nothing under it. */
    expect(
      await blocks.count(),
      'the lesson arrived with fewer blocks than a lesson has',
    ).toBeGreaterThan(1)

    /* NEITHER FAILURE STATE IS ON SCREEN. `LearnView` renders the reason in a
       `role="alert"` when writing fails, and a warning when it silently fell
       back to a stored lesson. A stored lesson is the right topic written for
       nobody -- passing on it would mean this test never noticed the server was
       unreachable, which is most of what it is here to catch. */
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('could not be reached')).toHaveCount(0)
  })
})
