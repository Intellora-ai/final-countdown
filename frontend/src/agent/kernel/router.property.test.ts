import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { Ambiguity, Entity, Intent, IntentKind, Understanding } from './contracts'
import { route } from './router'

/*
 * LAWS FOR THE ROUTER, ASSERTED AGAINST UNDERSTANDINGS NOBODY WROTE DOWN.
 *
 * The router decides which capabilities run: whether to search the live web,
 * whether to write to memory, whether to wake the learning layer. Its own
 * contract says what makes that decision reviewable --
 *
 *   rationale  "Why each was selected, keyed by capability. Auditable by test."
 *   rejected   "This is what makes 'it didn't search' a debuggable decision
 *               rather than a silent absence."
 *
 * -- and those two sentences are the law this whole plan is built on, already
 * written down here: no branch may produce a verdict it has no evidence for. A
 * capability selected with no rationale is exactly that verdict.
 *
 * WHY THE GENERATOR IS STRUCTURED AND NOT A STRING
 * -----------------------------------------------
 * `route` takes an `Understanding`, not text, so the input space is objects.
 * `fc.record` over the real fields is the house pattern -- see
 * `canvas/spec/lessonSpec.property.test.ts`, which builds lessons the same way.
 * Generating text and running it through `understand` first would test two
 * units at once and blame the wrong one when it broke.
 *
 * The intent KINDS are enumerated on purpose: they are a closed union in
 * `contracts.ts`, so listing them is completeness rather than a hand-picked
 * sample. Everything around them -- how many, in what order, with what
 * confidence, with which entities and ambiguities -- is generated.
 */

const INTENT_KINDS: readonly IntentKind[] = [
  'information',
  'explanation',
  'action',
  'research',
  'calculation',
  'comparison',
  'recommendation',
  'troubleshooting',
  'planning',
  'coding',
  'learning',
  'conversation',
  'memory-write',
  'memory-read',
  'continuation',
  'correction',
]

const anIntent: fc.Arbitrary<Intent> = fc.record({
  kind: fc.constantFrom(...INTENT_KINDS),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  because: fc.string({ unit: 'grapheme', maxLength: 40 }),
})

const anEntity: fc.Arbitrary<Entity> = fc.record({
  id: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 12 }),
  label: fc.string({ unit: 'grapheme', maxLength: 20 }),
  kind: fc.constantFrom('person', 'place', 'topic', 'file', 'number', ''),
  mentions: fc.array(fc.nat({ max: 200 }), { maxLength: 4 }),
})

const anAmbiguity: fc.Arbitrary<Ambiguity> = fc.record({
  what: fc.string({ unit: 'grapheme', maxLength: 30 }),
  blocking: fc.boolean(),
})

/** `intents` is documented "Never empty", so the generator honours that -- a
 *  test that fed an empty list would be testing a state the contract forbids
 *  rather than one the router must survive. */
const anUnderstanding: fc.Arbitrary<Understanding> = fc.record({
  intents: fc.array(anIntent, { minLength: 1, maxLength: 4 }),
  goal: fc.string({ unit: 'grapheme', maxLength: 60 }),
  constraints: fc.array(fc.string({ unit: 'grapheme', maxLength: 30 }), { maxLength: 3 }),
  entities: fc.array(anEntity, { maxLength: 4 }),
  language: fc.constantFrom('en', 'hi', 'hi-Latn', 'fr', '', 'zz-ZZ'),
  topicShift: fc.boolean(),
  ambiguities: fc.array(anAmbiguity, { maxLength: 3 }),
})

/** The vacuity floor, from `scripts/check_vacuity.py`: "reject specs whose
 *  precondition is (almost) never satisfiable." */
const REACHED_FLOOR = 0.01

function assertReached(label: string, reached: number, total: number): void {
  const rate = total === 0 ? 0 : reached / total
  const pct = `${(rate * 100).toFixed(2)}%`
  console.log(
    rate < REACHED_FLOOR
      ? `vacuous — ${label} held for ${pct} of inputs`
      : `reachable — ${label} held for ${pct} of inputs`,
  )
  expect(
    rate,
    `${label}: reached for ${pct} of inputs, so the assertion never ran and ` +
      `this property proved nothing. The fix is more inputs that reach the ` +
      `branch, never a lower floor.`,
  ).toBeGreaterThanOrEqual(REACHED_FLOOR)
}

describe('route, against understandings nobody wrote down', () => {
  it('never throws, whatever it is handed', () => {
    fc.assert(
      fc.property(anUnderstanding, (u) => {
        expect(() => route(u)).not.toThrow()
      }),
      { numRuns: 1_000 },
    )
  })

  it('never selects a capability without recording why', () => {
    /*
     * THE LAW, in the router's own words: rationale is "Why each was selected,
     * keyed by capability. Auditable by test." This is that test. A capability
     * turned on with no entry is a decision nobody can review -- and turning on
     * search or memory-write is not free, so an unexplained one is a cost with
     * no argument behind it.
     */
    let selected = 0
    let total = 0

    fc.assert(
      fc.property(anUnderstanding, (u) => {
        total += 1
        const plan = route(u)
        if (plan.selected.length === 0) return
        selected += 1
        for (const capability of plan.selected) {
          expect(
            plan.rationale[capability],
            `selected ${capability} with no rationale, for intents ` +
              `${JSON.stringify(u.intents.map((i) => i.kind))}`,
          ).toBeDefined()
        }
      }),
      { numRuns: 1_000 },
    )

    assertReached('a selected capability', selected, total)
  })

  it('never rejects a capability without recording why', () => {
    /*
     * The other half, and the more valuable one. `rejected` exists so that
     * "it didn't search" is a debuggable decision rather than a silent
     * absence -- a rejection with an empty reason is the silent absence
     * wearing a record.
     */
    let rejected = 0
    let total = 0

    fc.assert(
      fc.property(anUnderstanding, (u) => {
        total += 1
        const plan = route(u)
        const reasons = Object.entries(plan.rejected)
        if (reasons.length === 0) return
        rejected += 1
        for (const [capability, reason] of reasons) {
          expect(
            reason.trim(),
            `rejected ${capability} with an empty reason`,
          ).not.toBe('')
        }
      }),
      { numRuns: 1_000 },
    )

    assertReached('a rejected capability', rejected, total)
  })

  /*
   * A FOURTH LAW WAS WRITTEN HERE AND REMOVED, ON MUTATION EVIDENCE.
   *
   * It asserted that no capability appears in both `selected` and `rejected` --
   * a real invariant: a plan that says a capability was chosen AND declined is
   * two decisions, and whichever the kernel reads first wins, which makes
   * behaviour depend on iteration order rather than on the request.
   *
   * `router.ts:98` guards it (`if (l.selected.has(cap)) return`), and that
   * guard is live code -- there are 15 `reject` calls against 20 `select` calls.
   * But deleting the guard left all four tests GREEN. The mutant survived, so
   * the law was proving nothing: this generator never produces an Understanding
   * where one capability is both selected and considered for rejection.
   *
   * A test that cannot fail is worse than no test, because it stops anyone
   * looking. Removed rather than kept as decoration.
   *
   * WHAT WOULD MAKE IT REAL: a generator built from the router's own selection
   * conditions rather than from the type -- intents chosen so that two rules
   * genuinely contend for the same capability. That is a bigger piece of work
   * than this task, and guessing at it would produce another law that passes
   * without meaning anything.
   */
})
