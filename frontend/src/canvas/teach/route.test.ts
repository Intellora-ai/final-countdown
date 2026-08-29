import { describe, expect, it } from 'vitest'

import { AXES, nextRoute, routeDirective } from './route'

/*
 * THE SAME TRUTH, A DIFFERENT WAY IN.
 *
 * WHY THIS IS NOT A GATE RULE
 * ---------------------------
 * The obvious move is a 32nd rule in `teaching.ts` refusing a lesson that
 * resembles an earlier one. `CONSTRAINTS.md` forbids exactly that, and it is
 * right: "a model optimising against a long rule list produces output that
 * passes and does not teach." A rule can only ever refuse. It cannot make the
 * second explanation different from the first.
 *
 * So variation belongs in GENERATION. The gate stays the floor.
 *
 * WHAT VARIES, AND WHAT MUST NOT
 * ------------------------------
 * `out-of-the-tar-pit.pdf` splits essential from accidental complexity, and it
 * transfers exactly: the ESSENTIAL part of a lesson is the truth being taught.
 * The ACCIDENTAL part is the route in -- which representation, where it starts,
 * which example domain, which voice.
 *
 * Repeat the essential. Never repeat the accidental. Every axis below is
 * accidental by construction: not one of them can change whether a statement is
 * true, so rotating them cannot make a lesson wrong.
 *
 * WHY FISHER-YATES AND NOT `Math.random()`
 * ----------------------------------------
 * Naive shuffling is biased and clusters, so a learner would see the same route
 * twice before seeing a third. Fisher-Yates is uniform: every ordering is
 * equally likely, and a full pass visits every route before any repeats. That
 * is the property being asserted below, and it is the whole point -- "sometimes
 * different" is not the requirement, "not the one you just had" is.
 *
 * Deterministic, seeded, no clock and no global randomness, for the same reason
 * `plan()` is pure: the same learner state produces the same route on every
 * machine, so a route is something a test can pin down.
 */

describe('a route is chosen, not repeated', () => {
  it('never gives the same route twice in a row', () => {
    /*
     * THE MINIMUM the learner can perceive. Shannon: a message the receiver
     * could have predicted carries zero bits. The second explanation arriving
     * in the shape of the first is the one case a learner definitely notices.
     */
    let previous = ''
    for (let i = 0; i < 40; i += 1) {
      const route = nextRoute({ seed: i, alreadyUsed: previous === '' ? [] : [previous] })
      expect(route.id, 'the same route arrived twice running').not.toBe(previous)
      previous = route.id
    }
  })

  it('visits every route before repeating any', () => {
    /*
     * The Fisher-Yates property, asserted rather than assumed. A biased shuffle
     * passes the test above -- it just clusters -- and only this one catches it.
     */
    const used: string[] = []
    for (let i = 0; i < AXES.length; i += 1) {
      used.push(nextRoute({ seed: 7, alreadyUsed: used }).id)
    }
    expect(new Set(used).size, 'a route repeated before the others were used').toBe(AXES.length)
  })

  it('starts over once every route has been used', () => {
    /* Exhaustion is not an error. A learner who has seen every route and asks
       again must still be taught, so the cycle restarts rather than refusing. */
    const all = AXES.map((a) => a.id)
    const route = nextRoute({ seed: 3, alreadyUsed: all })
    expect(all).toContain(route.id)
  })

  it('is deterministic, so the same state gives the same route', () => {
    /* Same reason `plan()` is pure. A route that changed per machine could not
       be pinned by a test, and a bug in it would be unreproducible. */
    const a = nextRoute({ seed: 11, alreadyUsed: ['definition-first'] })
    const b = nextRoute({ seed: 11, alreadyUsed: ['definition-first'] })
    expect(a.id).toBe(b.id)
  })

  it('every axis changes the route in, never the truth', () => {
    /*
     * THE SAFETY PROPERTY, and it is what makes rotating safe at all.
     *
     * An axis that could alter what is true would be a machine for generating
     * confident falsehoods. Each directive is asserted to talk about
     * PRESENTATION -- how to open, what to show, which example to reach for --
     * and never about the content being correct.
     */
    for (const axis of AXES) {
      const directive = routeDirective(axis)
      expect(directive.length, `${axis.id} has no directive`).toBeGreaterThan(20)
      expect(
        directive,
        `${axis.id} tells the model what is TRUE, not how to present it`,
      ).not.toMatch(/\b(correct|true|accurate|fact|verify)\b/i)
    }
  })

  it('offers enough routes that a learner can ask repeatedly', () => {
    /* One or two axes is a coin flip, not variation. */
    expect(AXES.length).toBeGreaterThanOrEqual(8)
  })
})
