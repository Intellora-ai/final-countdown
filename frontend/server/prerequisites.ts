/**
 * D3 — THE CURRICULUM IS A PRIOR, NEVER THE TRUTH.
 *
 * The curriculum says A comes before B (506-1252 real `deps` edges per class,
 * in `src/data/curriculum/`). That is a prior, and priors are wrong about
 * individual people. Three questions, never collapsed into one boolean:
 *
 *   1. Does the curriculum say A → B?      the caller passes what it lists
 *   2. Is A actually necessary for B?      not decidable here; the model reads
 *                                          the named blockers and may disagree
 *   3. Does THIS learner lack A?           decided here, from what she DID
 *
 * WHAT COUNTS AS EVIDENCE, and nothing else does: she was taught it (a lesson
 * on it is on her canvas), she answered on it (a statement filed by C3), she
 * pleaded on it (a plea filed by C3). No mastery number is invented, for the
 * reason `explanations.ts` gives: a number this software cannot measure
 * poisons every decision made from it.
 *
 * ORDER IS THE POINT. A prerequisite she pleaded about blocks hardest -- it
 * was covered and did not land. Never met comes next. Taught but never
 * answered is the weakest signal, because silence is not failure.
 */

export interface Listed {
  readonly id: string
  readonly name: string
}

/** What this learner has observably done, by concept id. */
export interface Known {
  readonly taught: readonly string[]
  readonly answered: readonly string[]
  readonly pleaded: readonly string[]
}

export interface Blocker extends Listed {
  /** Higher blocks harder. */
  readonly weight: number
  readonly because: string
}

export function blocking(listed: readonly Listed[], known: Known): readonly Blocker[] {
  const taught = new Set(known.taught)
  const answered = new Set(known.answered)
  const pleaded = new Set(known.pleaded)
  return listed
    .flatMap((one) => {
      if (pleaded.has(one.id)) {
        return [{ ...one, weight: 3, because: 'it was covered and she pleaded about it: it did not land' }]
      }
      if (!taught.has(one.id)) {
        return [{ ...one, weight: 2, because: 'she has never met it' }]
      }
      if (!answered.has(one.id)) {
        return [{ ...one, weight: 1, because: 'it was covered but she has said nothing back about it' }]
      }
      return []
    })
    .sort((a, b) => b.weight - a.weight)
}
