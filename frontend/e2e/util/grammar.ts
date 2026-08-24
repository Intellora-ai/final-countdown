/**
 * GOAL 1, MADE CHECKABLE --- the design system is constant, the composition is not.
 *
 * WHY THIS EXISTS AT ALL.
 *
 * `CLAUDE.md` names `token-invariance.spec.ts` in its enforcement table as the
 * mechanism for Goal 1. Searched on 2026-08-25 across every branch:
 *
 *     find . -iname "*token-invariance*"                     -> nothing
 *     git log --all --diff-filter=A -- '*token-invariance*'  -> empty
 *
 * The file had never existed. Goal 1 --- the first line of the repository's own
 * central principle --- had no automated check of any kind, while the table
 * said it did. A documented guard that does not exist is worse than an absent
 * one, because it stops anybody looking.
 *
 * WHAT GOAL 1 ACTUALLY CLAIMS, AND THE HALF THAT IS EASY TO GET WRONG.
 *
 *     "Do not make every lesson look identical. Make every lesson feel like it
 *      belongs to the same product."
 *
 * So this may NOT assert that two lessons render the same. Which blocks appear,
 * how many, in what order, and how wide they end up are all supposed to differ.
 * `CLAUDE.md:437-439` states the boundary exactly: compare the style tokens per
 * block kind and exclude geometry --- width, height, item count.
 *
 * THE COMPARISON KEY IS (kind, emphasis), NOT kind.
 *
 * `BlockBase` in `spec/spec.ts` gives every block an `emphasis` and a `tone`,
 * and `BlockView.tsx:44` stamps `data-emphasis` and `data-kind` onto the
 * `.lc-block` container. Those are ROLES. Goal 1 says colour roles are constant
 * while WHICH roles are used is variable, so a `supporting` prose block and a
 * `primary` prose block are allowed to differ --- and a check keyed on `kind`
 * alone would call that a violation and be deleted for crying wolf within a
 * week.
 *
 * Two blocks with the same kind AND the same emphasis are the same recipe. If
 * those differ between lessons, the design system is not constant.
 */

/**
 * The properties that carry the design grammar.
 *
 * Each one maps to a line in Goal 1's own "constant across all lessons" list:
 * colour roles, typography roles, font sizes, line heights, spacing scale,
 * border styles, radius values, motion timing.
 */
export const GRAMMAR_PROPERTIES = [
  // typography roles
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  // colour roles, as resolved
  'color',
  'background-color',
  // spacing scale
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'column-gap',
  'row-gap',
  // border styles and radius values
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-top-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  // motion timing
  'transition-duration',
  'transition-timing-function',
] as const

/**
 * Deliberately NOT compared. Every one of these is Goal 1's "variable".
 *
 * Listed rather than merely omitted, so that adding one to the set above is a
 * decision somebody has to argue with this comment, instead of a line that
 * slips in and starts failing honest lessons.
 *
 *   width, height, min/max-*   a block sizes to its content and its column
 *   margin-*                   placement, decided by the layout grammar
 *   top/left/right/bottom      position, same
 *   grid-*, flex-*             where the block sits, not what it looks like
 *   transform                  motion state, not a token
 */
export const GEOMETRY_EXCLUDED = [
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'top', 'left', 'right', 'bottom', 'position',
  'grid-column', 'grid-row', 'grid-template-columns', 'flex-basis', 'flex-grow',
  'transform',
] as const

/** One block, as measured in one lesson. */
export interface Sample {
  /** The lesson this block was rendered in. Named so a violation can say where. */
  readonly lesson: string
  /** `data-kind` from `.lc-block`. */
  readonly kind: string
  /** `data-emphasis` from `.lc-block`. Part of the key, not part of the value. */
  readonly emphasis: string
  /** Computed value per property in `GRAMMAR_PROPERTIES`. */
  readonly style: Readonly<Record<string, string>>
}

/** One property of one recipe that did not agree across lessons. */
export interface Violation {
  readonly kind: string
  readonly emphasis: string
  readonly property: string
  /** Every distinct value seen, with the lessons that produced it. */
  readonly values: ReadonlyArray<{ readonly value: string; readonly lessons: readonly string[] }>
}

/** The outcome of a comparison, including how much of it was real. */
export interface Comparison {
  readonly violations: readonly Violation[]
  /**
   * Recipes that appeared in two or more lessons, and were therefore actually
   * compared. A recipe seen in one lesson proves nothing about invariance.
   *
   * REPORTED SO THE CALLER CAN REFUSE A VACUOUS PASS. Without it, a change
   * that stopped every recipe from being shared would leave zero comparisons,
   * zero violations, and a green test that had checked nothing --- which is
   * the same failure shape as a suite that collected no tests at all.
   */
  readonly comparedRecipes: readonly string[]
  /** Recipes seen in only one lesson. Not a failure; recorded for the report. */
  readonly singleLessonRecipes: readonly string[]
}

const recipeOf = (s: Sample): string => `${s.kind}/${s.emphasis}`

/**
 * Compare every recipe that appears in more than one lesson.
 *
 * A PURE FUNCTION, ON PURPOSE. The browser half of this check can only ever be
 * asserted to pass --- the three lessons that ship are consistent, so a real
 * run is green whether or not the comparison works. Keeping the judgement in a
 * function that takes plain data means it can be handed a deliberate violation
 * and required to catch it, which is the only thing that makes the green run
 * evidence of anything.
 */
export function compareGrammar(samples: readonly Sample[]): Comparison {
  const byRecipe = new Map<string, Sample[]>()
  for (const s of samples) {
    const key = recipeOf(s)
    const list = byRecipe.get(key)
    if (list) list.push(s)
    else byRecipe.set(key, [s])
  }

  const violations: Violation[] = []
  const compared: string[] = []
  const single: string[] = []

  for (const [recipe, group] of [...byRecipe.entries()].sort()) {
    const lessons = new Set(group.map((s) => s.lesson))
    if (lessons.size < 2) {
      single.push(recipe)
      continue
    }
    compared.push(recipe)

    for (const property of GRAMMAR_PROPERTIES) {
      /* Values are grouped by LESSON, not by block. Two blocks of the same
         recipe inside one lesson differing is a different defect --- a
         renderer that is not deterministic --- and folding it in here would
         report it as a cross-lesson inconsistency, sending the next reader to
         the wrong place entirely. */
      const byValue = new Map<string, Set<string>>()
      for (const s of group) {
        const value = s.style[property]
        if (value === undefined) continue
        const seen = byValue.get(value)
        if (seen) seen.add(s.lesson)
        else byValue.set(value, new Set([s.lesson]))
      }

      const distinctAcrossLessons = [...byValue.entries()].filter(([, ls]) =>
        [...ls].some((l) => lessons.has(l)),
      )
      if (distinctAcrossLessons.length <= 1) continue

      /* Only a violation when the DISAGREEMENT crosses a lesson boundary. If
         every lesson holds the same set of values, the variation is within a
         lesson and is not what Goal 1 is about. */
      const perLesson = new Map<string, Set<string>>()
      for (const s of group) {
        const value = s.style[property]
        if (value === undefined) continue
        const seen = perLesson.get(s.lesson)
        if (seen) seen.add(value)
        else perLesson.set(s.lesson, new Set([value]))
      }
      const signatures = new Set(
        [...perLesson.values()].map((vs) => [...vs].sort().join('|')),
      )
      if (signatures.size <= 1) continue

      violations.push({
        kind: group[0].kind,
        emphasis: group[0].emphasis,
        property,
        values: distinctAcrossLessons
          .map(([value, ls]) => ({ value, lessons: [...ls].sort() }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      })
    }
  }

  return { violations, comparedRecipes: compared, singleLessonRecipes: single }
}

/** A violation, rendered so a reader knows what to change without re-running.
 *
 * NOT NAMED `describe`. It was, and Playwright refused to load the spec that
 * imported it -- "You are calling test.describe() from an async test.describe()
 * block" -- because the loader binds the name before the `as` alias applies.
 * The error names a line with no async describe anywhere near it, which costs
 * more to diagnose than the name was ever worth.
 */
export function describeViolation(v: Violation): string {
  const seen = v.values
    .map((entry) => `      ${entry.value}   <- ${entry.lessons.join(', ')}`)
    .join('\n')
  return (
    `  ${v.kind} (emphasis: ${v.emphasis}) has a different ${v.property} ` +
    `depending on which lesson it appears in:\n${seen}`
  )
}
