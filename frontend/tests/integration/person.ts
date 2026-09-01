import type { Page, Locator } from '@playwright/test'

/**
 * A PERSON. Everything a human can actually do to this app, and nothing else.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: a test may only know what a person
 * standing in front of the screen knows. Visible words, things that look
 * pressable, the box you type in, the back button, the tab closing.
 *
 * It may NOT know a component name, a store shape, a prop, a CSS class that
 * carries meaning, or any identifier a developer invented. Where a selector is
 * unavoidable it is an ARIA role or an accessible name, because those are what
 * a screen-reader user perceives -- they are the interface, not the source.
 *
 * WHY THAT MATTERS HERE SPECIFICALLY. The suite this replaces asserted
 * `.lc-teach__answer` had one child and called it "the answer drew something".
 * The canvas satisfied that assertion by re-drawing the diagram the learner was
 * already looking at. The class was present, the count was right, and the child
 * learned nothing. A test that can only see class names cannot tell those two
 * apart. A test that reads words can.
 */

/** Words that carry meaning. Everything else is noise a person skims past. */
const NOISE = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do',
  'does', 'for', 'from', 'get', 'go', 'had', 'has', 'have', 'he', 'her', 'his',
  'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of',
  'on', 'or', 'our', 'out', 'she', 'so', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'to', 'up', 'us', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
  'about', 'into', 'more', 'next', 'now', 'one', 'two', 'said', 'says', 'see',
  'like', 'just', 'also', 'been', 'over', 'than', 'some', 'each', 'here',
])

/**
 * The meaningful words in a piece of text, lowercased and de-duplicated.
 *
 * Short tokens go too. "kPa" survives at three characters because a unit a
 * lesson teaches is content; "of" does not.
 */
export function meaningfulWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3) continue
    if (NOISE.has(raw)) continue
    if (/^\d+$/.test(raw)) continue
    out.add(raw)
  }
  return out
}

/**
 * Everything the person can currently read on the screen, LINE BY LINE.
 *
 * The line structure is load-bearing and an earlier version destroyed it by
 * collapsing every run of whitespace into one space. `addedText` splits on
 * lines to work out what is new, so with the lines gone the whole screen
 * became one enormous run and a reply of six words made the entire page look
 * newly added. Law B duly reported "30 new words of material" for a screen
 * whose real delta was a single sentence.
 *
 * A test that measures wrongly is worse than no test: it reports defects that
 * are not there, and the true ones drown in them.
 */
export async function whatSheCanRead(page: Page): Promise<string> {
  const raw = await page.locator('body').innerText()
  return raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

/**
 * The things on this screen that look pressable to a person.
 *
 * Buttons and links, visible and enabled. Nothing about how they were built.
 */
export async function thingsSheCanPress(page: Page): Promise<Locator[]> {
  const all = page.getByRole('button').or(page.getByRole('link'))
  const found: Locator[] = []
  const total = await all.count()
  for (let i = 0; i < total; i++) {
    const one = all.nth(i)
    if (await one.isVisible().catch(() => false) && await one.isEnabled().catch(() => false)) {
      found.push(one)
    }
  }
  return found
}

/**
 * The choices this screen offers as a "pick one of these" group.
 *
 * `aria-pressed` is the web's standard way to say "this is one of a set and
 * this one is currently chosen". A screen reader announces it. That makes it
 * something the PERSON perceives, which is why using it does not break the rule
 * at the top of this file -- unlike a class name, which is invisible to
 * everyone who is not reading the source.
 */
export function choicesSheIsOffered(page: Page): Locator {
  return page.locator('button[aria-pressed]')
}

/**
 * The DIFFERENT THINGS she can be taught here, told apart from the different
 * ways of drawing one of them.
 *
 * `aria-pressed` marks every pick-one control on the screen, and on this app
 * that is both the lesson switcher and a 2D/3D view toggle. An earlier version
 * treated all of them as lessons and duly reported the same lesson three times
 * under the names "Physics", "2D" and "3D".
 *
 * The distinction is made by pressing, not by reading a name: a control that
 * changes the subject on the page is a lesson, and one that leaves the subject
 * alone is a way of looking at it. That works on any app with a pick-one
 * control, which is the point.
 */
export async function lessonsSheIsOffered(page: Page): Promise<number[]> {
  const choices = choicesSheIsOffered(page)
  const total = await choices.count()
  const seen = new Map<string, number>()

  for (let i = 0; i < total; i++) {
    await choices.nth(i).click().catch(() => {})
    await page.waitForTimeout(1500)
    const subject = await theSubjectOnScreen(page)
    if (subject && !seen.has(subject)) seen.set(subject, i)
  }
  return [...seen.values()].sort((a, b) => a - b)
}

/**
 * What this screen says it is about: its most prominent heading.
 *
 * A heading is what a screen reader announces first and what a sighted person
 * reads first, so it is the person's own idea of "what am I looking at" rather
 * than a developer's.
 */
export async function theSubjectOnScreen(page: Page): Promise<string> {
  const headings = page.getByRole('heading')
  const howMany = await headings.count()
  for (let i = 0; i < howMany; i++) {
    const text = (await headings.nth(i).textContent().catch(() => ''))?.trim() ?? ''
    if (text.length > 10) return text
  }
  return ''
}

/** The box where you type, if this screen has one. */
export function theBoxSheTypesIn(page: Page): Locator {
  return page.getByRole('textbox').filter({ hasNot: page.locator('[type=range]') }).last()
}

/**
 * Ask something and wait until the screen actually changes.
 *
 * Returns the words that were ADDED. That delta is the whole point: it is the
 * only thing the person gained by asking, and a law about learning has to be a
 * law about the delta, never about the total.
 */
export async function sheAsks(page: Page, question: string): Promise<{
  before: string
  after: string
  added: string
}> {
  const box = theBoxSheTypesIn(page)
  const before = await whatSheCanRead(page)
  await box.fill(question)
  /*
   * WHICHEVER SUBMIT THIS SCREEN OFFERS. Inside a lesson the box is
   * `TeachView`'s and its button says "Send". On the blank landing -- which is
   * what /#/canvas IS since the auto-staged logarithm lesson was removed
   * ("it opened into a logarithm lesson nobody had asked for") -- the only box
   * is the topic box and its button says "Teach me". The law is about what
   * happens AFTER she asks; which control carried the question is the
   * product's business, so the helper follows the product rather than pinning
   * the old landing. `.last()` for the same reason `theBoxSheTypesIn` uses it:
   * when both exist, the one beside the box she just typed in wins.
   */
  await page.getByRole('button', { name: /^(send|teach me)$/i }).last().click()

  /* WAIT FOR THE REPLY TO SETTLE, NOT FOR THE FIRST FLICKER.
   *
   * This used to wait for the screen to differ from its starting text at all, and
   * that is the wrong event. A good app acknowledges instantly -- this one
   * writes "Your question was received. Working on it." the moment she presses
   * send -- so the very first change is the acknowledgement, never the answer.
   * The wait returned there, slept 2.5s, and read a half-arrived screen.
   *
   * Measured: Law A reported "gained 0 new words" for six lessons while the
   * app, asked the same question by hand, replied with a full honest sentence.
   * Six false accusations from one bad wait. A law that measures the wrong
   * moment does not test the product, it slanders it.
   *
   * So: poll until the text stops changing. A person does the same -- she
   * watches until the screen stops moving, then reads it. */
  const settleFor = 1800
  const giveUpAfter = 40_000
  await page.waitForFunction(
    ({ quiet, cap }) => {
      const w = window as unknown as { __seen?: string; __since?: number; __start?: number }
      const now = Date.now()
      w.__start ??= now
      const text = document.body.innerText
      if (w.__seen !== text) { w.__seen = text; w.__since = now; return false }
      if (now - w.__start > cap) return true
      return now - (w.__since ?? now) >= quiet
    },
    { quiet: settleFor, cap: giveUpAfter },
    { timeout: giveUpAfter + 5_000, polling: 250 },
  ).catch(() => { /* never settling is itself something a law may judge */ })

  /* Clear the marks so the next question measures its own settle, not this
   * one's. A leftover `__start` would make every later wait return at once. */
  await page.evaluate(() => {
    const w = window as unknown as { __seen?: string; __since?: number; __start?: number }
    delete w.__seen; delete w.__since; delete w.__start
  }).catch(() => {})

  const after = await whatSheCanRead(page)
  return { before, after, added: addedText(before, after) }
}

/**
 * The text that is on screen now and was not before.
 *
 * Compared line by line, because a reply is appended as new lines rather than
 * woven into old ones.
 */
export function addedText(before: string, after: string): string {
  const old = new Set(before.split('\n'))
  return after
    .split('\n')
    .filter((line) => !old.has(line))
    .join('\n')
}

/**
 * Words she gained: in the reply, not already on screen, not just her own
 * question read back to her.
 *
 * The third exclusion is load-bearing. Every reply echoes the question, so
 * without it "You asked: what is X" would count as having taught her X.
 */
export function wordsSheGained(before: string, after: string, question: string): Set<string> {
  const had = meaningfulWords(before)
  const asked = meaningfulWords(question)
  const gained = new Set<string>()
  for (const word of meaningfulWords(addedText(before, after))) {
    if (!had.has(word) && !asked.has(word)) gained.add(word)
  }
  return gained
}

/** Open the app the way a person does: type the address, press enter. */
export async function sheOpensTheApp(page: Page, where = '/'): Promise<void> {
  await page.goto(where, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

/**
 * A DIFFERENT CHILD, ON A CLEAN MACHINE.
 *
 * WHY THIS EXISTS, AND WHY IT IS ISOLATION RATHER THAN SOFTENING.
 *
 * This app remembers her conversation, which is Law E working exactly as it
 * should. Reloading therefore does NOT give a question a clean screen: the
 * previous question and its reply come straight back out of storage.
 *
 * Measured, from a failing run's own page snapshot: the screen carried both
 *   "You asked: what is recursive?"  -> "I could not reach the part of me..."
 *   "You asked: what is function?"   -> "I could not reach the part of me..."
 * The second reply was word for word the first, so it was already on screen
 * before it arrived, and `addedText` correctly reported that nothing new had
 * appeared. Law A then accused the product of answering with what she was
 * already looking at, when what really happened was two honest identical
 * replies in one sitting.
 *
 * That is the measurement seeing double. The assertion each question must pass
 * is untouched: it still has to earn its own new words. This only guarantees
 * that "already on screen" means what it says.
 */
export async function sheStartsFresh(page: Page, where = '/'): Promise<void> {
  await page.goto(where, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    try { localStorage.clear() } catch { /* a private window has none */ }
    try { sessionStorage.clear() } catch { /* nor this */ }
  }).catch(() => {})
  /* NOT `page.reload()`. WebKit on a loaded runner answers reload with
   * "WebKit encountered an internal error" -- the safari leg's only failure,
   * annotated at exactly this line. A hop through about:blank and back forces
   * the same full document boot with the storage now clear, through the plain
   * navigation path every engine survives. */
  await page.goto('about:blank')
  await page.goto(where, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
}
