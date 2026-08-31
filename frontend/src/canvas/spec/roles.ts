import { z } from 'zod'

/**
 * What a block is FOR in the teaching.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * `spec.ts` imports `FigureBlock` from `figure.ts`, so `figure.ts` cannot import
 * back from `spec.ts` — the cycle would leave one of the two zod objects
 * undefined at module-evaluation time, which fails at runtime rather than at
 * the type level. `figure.ts` works around that today by re-declaring
 * `emphasis` and `tone` inline, and those two copies can already drift.
 *
 * A third copy would make that worse, so this enum lives where both can reach
 * it and neither has to repeat it. The existing two are left alone: they are
 * not broken, and widening this change to fix them would touch files this work
 * has no business in.
 *
 * SEMANTIC, SO LAW 3 HOLDS. `definition` says what the block IS to the lesson.
 * It says nothing about size, weight, colour or place — the design system reads
 * the role and decides all of that, exactly as it already does for `emphasis`.
 *
 * `support` is the default, so a block with no teaching job named is ordinary
 * material rather than silently claiming to be a definition.
 */
export const BlockRole = z.enum([
  /**
   * Ground the learner already stands on, before anything new arrives.
   *
   * The one role allowed BEFORE the definition, and the reason is the strongest
   * pattern in the reference explanation: it opens on `2³ = 8` — something the
   * reader can already read — and only then asks "2 to what power gives 8?".
   * The definition then arrives as the ANSWER to a question the reader is
   * already holding, instead of as a fact they are asked to accept.
   */
  'anchor',
  'definition',
  /** How the notation is read aloud, and what each part of it is called. */
  'notation',
  'framework',
  'classification',
  'component',
  /** A rule, stated. It owes a derivation — see `teaching.ts`. */
  'rule',
  /** Where the thing stops being valid, and what is therefore not allowed. */
  'restriction',
  'contrast',
  'misconception',
  'example',
  'summary',
  'support',
])
export type BlockRole = z.infer<typeof BlockRole>
