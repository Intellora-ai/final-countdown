import { expect, test } from '@playwright/test'

import { LESSONS, open, settle, teach } from './util/canvas'
import {
  compareGrammar,
  describeViolation,
  GRAMMAR_PROPERTIES,
  type Sample,
} from './util/grammar'

/**
 * GOAL 1 --- THE DESIGN SYSTEM IS CONSTANT.
 *
 * `CLAUDE.md`'s enforcement table names `token-invariance.spec.ts` as the
 * mechanism for Goal 1. Searched on 2026-08-25 across every branch:
 *
 *     find . -iname "*token-invariance*"                     -> nothing
 *     git log --all --diff-filter=A -- '*token-invariance*'  -> empty
 *
 * It had never existed. The first line of the repository's own central
 * principle had no automated check, while the table said it had one. This file
 * is that check.
 *
 * WHAT IT ASSERTS, AND THE HALF IT MUST NOT.
 *
 * Two blocks with the same kind and the same emphasis are the same recipe, and
 * a recipe must resolve to the same tokens in every lesson. What it may NOT
 * assert is that lessons look alike --- which blocks appear, how many, in what
 * order and how wide they end up are all supposed to differ. `CLAUDE.md:439`
 * draws the line: compare style tokens per block kind, exclude geometry.
 *
 * WHY A SELF-CHECK SITS ABOVE THE REAL TEST.
 *
 * The three shipping lessons are consistent, so the browser half is green
 * whether or not the comparison works at all. Asserted only to pass, it is
 * satisfied by `return []`. The two tests below hand `compareGrammar` a
 * deliberate violation and a deliberate agreement and require it to tell them
 * apart --- which is the only thing that makes the green run downstream mean
 * anything.
 */

const style = (over: Record<string, string> = {}): Record<string, string> => ({
  'font-size': '16px',
  'padding-top': '12px',
  color: 'rgb(20, 20, 20)',
  ...over,
})

const sample = (lesson: string, over: Record<string, string> = {}): Sample => ({
  lesson,
  kind: 'prose',
  emphasis: 'supporting',
  style: style(over),
})

test.describe('the comparison can tell agreement from disagreement', () => {
  test('a recipe that differs between lessons is reported', () => {
    const result = compareGrammar([
      sample('Physics'),
      sample('Civics', { 'padding-top': '20px' }),
    ])

    expect(
      result.violations.map((v) => v.property),
      'a padding token differing between two lessons is exactly Goal 1 failing',
    ).toEqual(['padding-top'])
    expect(result.comparedRecipes).toEqual(['prose/supporting'])
  })

  test('a recipe that agrees between lessons is not reported', () => {
    const result = compareGrammar([sample('Physics'), sample('Civics')])

    expect(
      result.violations,
      'identical recipes were reported as a violation, so this check would ' +
        'fail on a correct product and get deleted',
    ).toEqual([])
    expect(result.comparedRecipes).toEqual(['prose/supporting'])
  })

  test('emphasis is part of the key, not part of the value', () => {
    /* A `primary` block and a `supporting` block are DIFFERENT recipes. Goal 1
       says which roles are used is variable, so this must not be a violation.
       Keyed on `kind` alone it would be one, and the check would be wrong
       about the product on its very first run. */
    const result = compareGrammar([
      sample('Physics'),
      { ...sample('Civics'), emphasis: 'primary', style: style({ 'font-size': '22px' }) },
    ])

    expect(result.violations).toEqual([])
    expect(
      result.comparedRecipes,
      'two different recipes were compared against each other',
    ).toEqual([])
    expect(result.singleLessonRecipes.sort()).toEqual(['prose/primary', 'prose/supporting'])
  })

  test('a recipe seen in only one lesson is not counted as compared', () => {
    /* The vacuity guard's own guard. If single-lesson recipes counted, a
       product where no recipe was shared would report a healthy number of
       comparisons while comparing nothing. */
    const result = compareGrammar([sample('Physics'), sample('Physics')])
    expect(result.comparedRecipes).toEqual([])
    expect(result.singleLessonRecipes).toEqual(['prose/supporting'])
  })
})

/**
 * The floor is MEASURED, not chosen.
 *
 * First real run, 2026-08-25, desktop-1440, against the three shipping lessons:
 *
 *     blocks measured                          25
 *     recipes compared (seen in 2+ lessons)     4
 *       callout/supporting
 *       figure/primary
 *       figure/supporting
 *       prose/supporting
 *     recipes seen in only one lesson          10
 *     properties compared per recipe           28
 *     violations                                0
 *
 * So 112 comparisons, and Goal 1 held. The floor is set at the number actually
 * observed, which is the only value that can catch a regression: at 3 it would
 * have absorbed the loss of a whole recipe in silence, and at 5 it would fail
 * today on a correct product.
 *
 * I had guessed callout, metric and prose before running it. `metric` appears
 * in Physics and Machine learning but with different emphasis in each, so the
 * two are different recipes and neither is comparable; `figure` is shared and I
 * had missed it. Recording that because the guess was wrong in both directions,
 * which is the argument for pinning a measured number rather than a plausible
 * one.
 *
 * Raise it when the real number rises. Never lower it to make a run pass --- a
 * drop here means recipes stopped being shared, and this test quietly stopped
 * checking anything.
 */
const MINIMUM_RECIPES_COMPARED = 4

test.describe('Goal 1 --- one design grammar across every lesson', () => {
  test('every shared recipe resolves to the same tokens in every lesson', async ({
    page,
  }, testInfo) => {
    await open(page, testInfo)

    const samples: Sample[] = []
    for (const lesson of LESSONS) {
      await teach(page, lesson.label)
      await settle(page)

      const measured = await page.evaluate(
        ({ properties, lessonLabel }) =>
          [
            ...document.querySelectorAll('.lc-teach__grid > .lc-teach__cell > .lc-block'),
          ].map((el) => {
            const computed = getComputedStyle(el)
            const style: Record<string, string> = {}
            for (const property of properties) style[property] = computed.getPropertyValue(property)
            return {
              lesson: lessonLabel,
              kind: el.getAttribute('data-kind') ?? 'unknown',
              emphasis: el.getAttribute('data-emphasis') ?? 'unknown',
              style,
            }
          }),
        { properties: [...GRAMMAR_PROPERTIES], lessonLabel: lesson.label },
      )

      expect(
        measured.length,
        `${lesson.label} rendered no blocks, so nothing about it was measured`,
      ).toBeGreaterThan(0)
      samples.push(...measured)
    }

    const result = compareGrammar(samples)

    /* WHAT WAS COVERED, ATTACHED TO EVERY RUN INCLUDING THE GREEN ONES.
       A pass tells a reader that nothing disagreed. It does not tell them how
       much was looked at, and those are the two things most easily confused
       about a check like this. Recording it means the number is in the report
       when somebody later asks whether the floor is still honest. */
    await testInfo.attach('grammar-coverage.txt', {
      contentType: 'text/plain',
      body:
        `blocks measured: ${samples.length} across ${LESSONS.length} lessons\n` +
        `recipes compared (seen in 2+ lessons): ${result.comparedRecipes.length}\n` +
        `${result.comparedRecipes.map((r) => `  ${r}`).join('\n')}\n` +
        `recipes seen in only one lesson: ${result.singleLessonRecipes.length}\n` +
        `${result.singleLessonRecipes.map((r) => `  ${r}`).join('\n')}\n` +
        `properties compared per recipe: ${GRAMMAR_PROPERTIES.length}\n` +
        `violations: ${result.violations.length}\n`,
    })

    /* THE VACUITY GUARD RUNS FIRST, AND ON PURPOSE.
       A pass with zero comparisons and a pass with every recipe agreeing are
       the same green tick from the outside. Asserting the count first means the
       failure message says "this checked nothing" rather than "no violations",
       which are opposite findings that look identical. */
    expect(
      result.comparedRecipes.length,
      `only ${result.comparedRecipes.length} recipe(s) appeared in more than one ` +
        `lesson, so this test compared almost nothing. Recipes seen once: ` +
        `${result.singleLessonRecipes.join(', ')}`,
    ).toBeGreaterThanOrEqual(MINIMUM_RECIPES_COMPARED)

    expect(
      result.violations.map(describeViolation).join('\n'),
      'the design system is not constant: the same block recipe resolves to ' +
        'different tokens depending on which lesson it appears in. Goal 1 says ' +
        'geometry may differ and grammar may not.',
    ).toBe('')
  })
})
