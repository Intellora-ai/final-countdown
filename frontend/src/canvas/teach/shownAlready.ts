/**
 * Only the fields this function is allowed to look at, described structurally
 * rather than by importing `Resolution`.
 *
 * Naming the whole type here would mean every caller and every test had to
 * build a fully valid `Lesson` to ask a question about block ids, which tests
 * the type checker rather than this function. The narrow shape is also the
 * honest one: nothing below reads anything else.
 */
interface HasAnswered {
  resolution?:
    | { readonly kind: 'answer'; readonly lesson: { readonly blocks: readonly { readonly id: string }[] } }
    | { readonly kind: 'refusal' }
}

/**
 * The block ids this learner has already been given, in the order they saw
 * them, each one once.
 *
 * `TeachView` has kept this history since it was written and has never used it
 * for anything but rendering. Feeding it to `Doubt.shown` is what stops the
 * second ask returning the first answer.
 *
 * The `kind` check below is enforced by the COMPILER, not only by a test: only
 * the `answer` arm of the union carries a `lesson`, so deleting the check stops
 * the file compiling. A mutant that removed it first survived the suite -- an
 * earlier `?? []` had made the branch unreachable -- and a guard a mutant can
 * delete unnoticed is not a guard.
 *
 * Only an `answer` counts. A refusal put nothing on screen -- its `nearest` is
 * a list of places to look, not text that was read -- and prose came from
 * outside the lesson, so it retires no block of it.
 */
export function shownAlready(asked: readonly HasAnswered[]): readonly string[] {
  const seen: string[] = []
  for (const record of asked) {
    const resolution = record.resolution
    if (!resolution || resolution.kind !== 'answer') continue
    for (const block of resolution.lesson.blocks) {
      if (!seen.includes(block.id)) seen.push(block.id)
    }
  }
  return seen
}
