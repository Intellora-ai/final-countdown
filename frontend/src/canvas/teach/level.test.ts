import { describe, expect, it } from 'vitest'

import { EXAM_LEVELS, levelScope, scopedQuery } from './level'

/*
 * THE RIGHT LEVEL, BY CONSTRUCTION RATHER THAN BY CHECKING AFTERWARDS.
 *
 * Batch 5 of the plan, and the design decision is the whole of it:
 *
 *   subjects + entrance exam the student picked  ->  level
 *   level                                        ->  scopes the WEB SEARCH
 *   scoped sources                               ->  the lesson is at the right
 *                                                    level because the wrong-level
 *                                                    material never arrived
 *
 * `grounding.ts` already states this principle for TRUTH -- "the fix belongs
 * BEFORE the sentence exists" -- and it carries to level unchanged. A level
 * check applied to a finished lesson would reject good lessons and still pass a
 * badly-pitched one that happened to score in band. Scoping the query means the
 * model never sees material written for the wrong reader.
 *
 * WHERE THIS DEPARTS FROM THE WRITTEN PLAN, DELIBERATELY.
 *
 * The plan said: "No silent default. A missing profile REFUSES. A default is
 * exactly how a class-10 student gets an MIT-level explanation."
 *
 * That is overruled, and the reason is a later and more important instruction:
 * a valid educational request must never be refused because configuration is
 * missing. Refusing a lesson because nobody picked an exam is precisely the
 * curriculum lock this product is supposed to not have -- "missing pre-authored
 * content is a CONTENT GAP, not a USER ERROR."
 *
 * The plan's underlying worry is still respected. An unset profile does not get
 * an invented default level either; it gets NO scoping at all, which leaves the
 * search exactly as it behaved before this existed. Unscoped is honest.
 * Wrongly-scoped is not.
 */

describe('the level comes from what the student picked', () => {
  it('gives two different exams two different scopes', () => {
    /* If every exam produced the same scope, this whole module would be
       decoration and a CLAT student would be handed JEE physics sources. */
    const jee = levelScope('jee-main-2026')
    const clat = levelScope('clat-2027')
    expect(jee).not.toBe('')
    expect(clat).not.toBe('')
    expect(jee, 'two different exams scoped the search identically').not.toBe(clat)
  })

  it('every exam the product offers has a scope', () => {
    /*
     * A missing entry would silently fall through to no scoping, and the
     * student would never know their level had been ignored. Driven off the
     * list itself so a fifth exam arrives here unscoped and this goes red
     * naming it -- the same technique `ruleCensus` uses on teaching rules.
     */
    for (const id of Object.keys(EXAM_LEVELS)) {
      expect(levelScope(id), `${id} has no scope`).not.toBe('')
    }
  })

  it('an unset profile does NOT refuse, and does not invent a level either', () => {
    /*
     * THE DEPARTURE FROM THE PLAN, ASSERTED SO IT CANNOT DRIFT BACK.
     *
     * Refusing here would mean a learner who never opened the practice screen
     * cannot be taught anything at all. Defaulting would mean guessing their
     * level, which is the harm the plan actually warned about. Neither: no
     * scope, and the search behaves as it did before this module existed.
     */
    expect(levelScope(null)).toBe('')
    expect(scopedQuery('what is a derivative', null)).toBe('what is a derivative')
  })

  it('an exam nobody has heard of is ignored rather than refused', () => {
    /* Same reason. A stale id in storage, or one from a future build, must not
       be able to stop a lesson. */
    expect(levelScope('some-exam-from-2099')).toBe('')
  })

  it('a class 9 student and a class 12 student get different sources', () => {
    /*
     * THE CLASS IS HALF THE LEVEL, AND WITHOUT IT THE EXAM IS TOO COARSE.
     *
     * Onboarding asks for BOTH: the class (9, 10, 11 or 12) and the entrance
     * exam (IPMAT, JEE, NEET or CLAT). A class 9 student and a class 12 student
     * both preparing for JEE are years apart, and handing them the same sources
     * is the exact harm the plan warned about -- "a class-10 student gets an
     * MIT-level explanation."
     *
     * The exam says WHICH SUBJECTS matter. The class says HOW FAR ALONG they
     * are. Neither alone is the level.
     */
    const nine = levelScope('jee-main-2026', '9')
    const twelve = levelScope('jee-main-2026', '12')
    expect(nine).not.toBe('')
    expect(twelve).not.toBe('')
    expect(nine, 'class 9 and class 12 were given the same sources').not.toBe(twelve)
  })

  it('uses the class even when no exam is picked', () => {
    /* Onboarding may give one and not the other. A class on its own is still a
       level, and it is still better than nothing. */
    expect(levelScope(null, '10')).not.toBe('')
    expect(scopedQuery('what is a derivative', null, '10')).toContain('10')
  })

  it('scopes the query the search actually receives', () => {
    /*
     * The scope must reach the QUERY, not sit in a variable. This is the same
     * check that caught `concept.ts` measuring 5 of 6 while the product called
     * a different function entirely -- a module nothing calls is worth nothing.
     */
    const scoped = scopedQuery('what is a derivative', 'jee-main-2026')
    expect(scoped).toContain('what is a derivative')
    expect(scoped, 'the level never reached the query').not.toBe('what is a derivative')
    expect(scoped).toContain(levelScope('jee-main-2026'))
  })

  it('keeps the learner question first, so the search is still about the topic', () => {
    /*
     * Scope is a qualifier, not the subject. A query that leads with the exam
     * name returns pages ABOUT the exam rather than about the thing asked, and
     * the learner gets a syllabus PDF instead of an explanation.
     */
    const scoped = scopedQuery('why does inflation happen', 'ipmat-2026-rohtak')
    expect(scoped.indexOf('why does inflation happen')).toBe(0)
  })
})
