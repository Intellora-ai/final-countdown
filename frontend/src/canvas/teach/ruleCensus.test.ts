/*
 * EVERY RULE IS PROVED IN BOTH DIRECTIONS, OR THE SUITE IS RED.
 *
 * A rule asserted only to REFUSE is satisfied by `return false`; one asserted
 * only to ACCEPT is satisfied by `return true`. Both are vacuous, so each rule
 * needs a pair: a lesson it must catch, and a near-identical lesson it must let
 * through. The pair is what makes the rule's boundary a fact rather than a hope.
 *
 * The census drives this, so it cannot go stale. Add a twenty-ninth rule and
 * `every declared rule has a pair` goes red naming it, without anyone
 * remembering to update a list.
 */
import { describe, expect, it } from 'vitest'
import { checkTeaching } from './teaching'
import { declaredRules } from './ruleCensus'
import { RULE_PAIRS } from './rulePairs'

describe('the rule census', () => {
  it('finds the rules the gate actually emits', () => {
    const rules = declaredRules()
    expect(rules).toContain('no-definition')
    expect(rules).toContain('run-too-long')
    expect(rules).not.toContain('')
    expect(rules.length).toBeGreaterThanOrEqual(28)
  })

  it('every declared rule has a pair', () => {
    const missing = declaredRules().filter((r) => !(r in RULE_PAIRS))
    expect(missing).toEqual([])
  })

  it('no pair names a rule the gate cannot emit', () => {
    const declared = new Set(declaredRules())
    const orphans = Object.keys(RULE_PAIRS).filter((r) => !declared.has(r))
    expect(orphans).toEqual([])
  })
})

describe('a chart that misrepresents its data is wrong at every level', () => {
  /*
   * `checkTeaching` splits its rules in two: chunk rules that hold everywhere,
   * and arc rules that only apply when an AUTHOR is writing a whole lesson.
   * The file states the reason -- an assembled doubt answer has no authored
   * opening, so demanding one refused five real call sites.
   *
   * `chart-fights-its-data` was first written inside `checkRepresentations`,
   * which is arc-gated, and that was wrong. Whether bars claim the gaps
   * between values carry no meaning is a fact about ONE BLOCK and its numbers.
   * It does not become true because the surrounding blocks form an arc, and a
   * learner reading a doubt answer is misled by exactly the same chart.
   *
   * Its neighbours in that function are arc-gated for real reasons:
   * `nothing-is-shown` counts blocks across the whole lesson, and
   * `representation-is-decoration` reads the relation graph. Both are
   * statements about a composed lesson. This one is not.
   */
  it('fires on a doubt answer, where the arc rules are off', () => {
    const fired = checkTeaching(RULE_PAIRS['chart-fights-its-data']!.refuses.lesson, {
      arc: false,
    })
    expect(fired.map((i) => i.rule)).toContain('chart-fights-its-data')
  })

  it('still stays silent on the line chart at that level', () => {
    /* The paired positive at the same level. A rule that fired on every chart
       would pass the test above and be useless. */
    const fired = checkTeaching(RULE_PAIRS['chart-fights-its-data']!.accepts.lesson, {
      arc: false,
    })
    expect(fired.map((i) => i.rule)).not.toContain('chart-fights-its-data')
  })
})

describe.each(Object.entries(RULE_PAIRS))('%s', (rule, pair) => {
  it('fires on the lesson that breaks it', () => {
    const fired = checkTeaching(pair.refuses.lesson, { arc: pair.refuses.arc })
    expect(fired.map((i) => i.rule)).toContain(rule)
  })

  it('stays silent on the lesson that does not', () => {
    const fired = checkTeaching(pair.accepts.lesson, { arc: pair.accepts.arc })
    expect(fired.map((i) => i.rule)).not.toContain(rule)
  })
})
