import { test, expect } from '@playwright/test'
import { sheOpensTheApp, sheStartsFresh, theBoxSheTypesIn, sheAsks } from './person'

/**
 * LAW G -- HER UNFINISHED QUESTION WAITS FOR HER, AND ONLY FOR HER.
 *
 * A person who says "I'll get back to you" and never does is not called
 * intelligent, however fluent they were while saying it. Before this law, the
 * app was that person: a question it could not answer ended in an honest
 * refusal, and the next visit remembered nothing -- the debt evaporated with
 * the tab. `/api/situation` is the memory of the promise; this law is what
 * keeps that memory honest, in a real browser against the real server.
 *
 * THE LAW HAS TWO EDGES, AND BOTH CUT.
 *
 *   She returns  -> the question is THERE, in her own words, with one way to
 *                   ask it again. An app that forgets fails here.
 *   Another child arrives on a clean machine -> the question is NOT there.
 *   An app that shows one child's confusion to the next fails here -- and this
 *   edge is also what makes the first non-vacuous, because a card that is
 *   simply always painted would pass the first edge and fail this one.
 *
 * AND THE CARD IS QUIET. Asked again and still unanswered, it must not stack,
 * must not nag twice in one sitting, must not become a queue. One promise, one
 * card, gone for the sitting once she presses it.
 */

/** A question this canvas can never answer from its lessons, in her words. */
const HER_QUESTION = 'how do i knit a woollen scarf for winter'

test('law G -- the question she was refused is waiting when she returns, and pressing it asks again', async ({ page }) => {
  await sheOpensTheApp(page, '/#/canvas')

  /* She asks something the canvas cannot answer. The laws run with no model
     credential on purpose, so this ends in an honest refusal -- which is
     exactly the moment the promise is recorded. */
  await theBoxSheTypesIn(page).waitFor({ timeout: 15_000 })
  await sheAsks(page, HER_QUESTION)

  /* THE LEDGER IS READ DIRECTLY BEFORE THE CARD IS LOOKED FOR, so a red run
     names WHICH half broke. Four CI runs said only "element(s) not found"
     while the server, the route and the client each passed their own tests;
     the join is what was untested, and a law that asks the server "what do
     you owe her?" through her own cookie jar splits the join in two: either
     the ask never wrote the debt, or the debt was written and the canvas did
     not paint it. `page.request` shares the page's cookies, so this is her
     identity asking, not a stranger's. */
  const owed = await page.request.get('/api/situation')
  expect(
    owed.status(),
    `the ledger route did not answer through the dev server; it said: ${(await owed.text()).slice(0, 400)}`,
  ).toBe(200)
  const ledger = (await owed.json()) as { openLoops?: Array<{ question?: string }> }
  expect(
    (ledger.openLoops ?? []).map((loop) => loop.question),
    'she asked and was not answered, and the server recorded no debt',
  ).toContain(HER_QUESTION)

  /* SHE COMES BACK. Same child, same machine: a reload keeps her identity,
     which is the whole premise -- the card follows the person, not the tab.

     THROUGH A BLANK PAGE FIRST, AND THE REASON IS A MEASUREMENT. `goto` to the
     URL she is already on differs only in the hash, and a browser treats that
     as a same-document navigation: nothing reloads, nothing remounts, and the
     canvas keeps every bit of the state her ask left behind -- "she has asked
     in this sitting" included, which is exactly the state that hides the card
     for the rest of a sitting. Five red runs (up to 33606201542) said only
     "element(s) not found"; the other edge of this law painted the card fine
     for a child who arrived by a real load. Coming back is a real load. */
  await page.goto('about:blank')
  await sheOpensTheApp(page, '/#/canvas')

  const card = page.locator('.lc-return-card')
  await expect(card, 'her unfinished question is not waiting for her').toBeVisible({ timeout: 15_000 })
  await expect(card, 'the card does not carry her own words').toContainText('knit a woollen scarf')

  /* ONE press asks it again through the same path as typing it by hand... */
  await card.getByRole('button', { name: /ask it again/i }).click()

  /* ...and the card leaves for this sitting -- pressed is pressed, whatever
     the answer turns out to be. A card that lingers becomes a nag. */
  await expect(card, 'the card nags after being pressed').toBeHidden({ timeout: 15_000 })

  /* The ask visibly happened: her words are IN THE TOPIC BOX, hers to see,
     edit and resend. Not asserted from page prose, deliberately -- refusals
     never echo her words (that is M7 working), so the box is the one honest
     surface her question stays visible on. A button that promises must do. */
  const topicBox = page.getByLabel('A topic to be taught')
  await expect(topicBox, 'pressing the card did not carry her words into the ask')
    .toHaveValue(/knit a woollen scarf/i, { timeout: 15_000 })
})

test('law G -- another child on a clean machine is never shown her question', async ({ page }) => {
  /* Her half: record a promise for the first child. */
  await sheOpensTheApp(page, '/#/canvas')
  await theBoxSheTypesIn(page).waitFor({ timeout: 15_000 })
  await sheAsks(page, HER_QUESTION)

  /* A DIFFERENT child: clean storage, clean cookies, fresh identity. */
  await sheStartsFresh(page, '/#/canvas')

  /* The canvas settles -- and no card. Waiting a moment first, because the
     card arrives from a fetch and asserting absence too early would pass
     against an app that shows it a beat later. */
  await page.waitForTimeout(3_000)
  await expect(
    page.locator('.lc-return-card'),
    "one child's unanswered question was shown to another",
  ).toHaveCount(0)
})
