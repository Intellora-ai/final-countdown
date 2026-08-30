/* What a rung PROMISES when it says it has an answer.
 *
 * `contract.ts` states it plainly of `DoubtAnswer.lesson`: "Already validated.
 * Renderers can trust every field." Every rung makes that promise and, until
 * this file, nothing enforced it. `chain.ts` checked `resolution.kind ===
 * 'answer'` and returned -- so a rung answering with a document it had not
 * filled in handed it straight to the renderer, three layers from the rung that
 * produced it, where the stack trace names the wrong component.
 *
 * Hoare's argument is that a component has a precondition and a postcondition
 * and that the two compose. This codebase already does that well twice --
 * `validateLesson` and `checkFrame` are real postconditions, and `frameIsSafe`
 * is the boolean gate over the second. The idea simply stopped before
 * `chain.ts`. This is the same shape at the rung boundary: a list of named
 * breaches, and a boolean over it.
 *
 * WHY THE TYPE IS NOT ENOUGH. `Resolution` already forbids an empty lesson at
 * compile time, and that stops nothing here: a rung can be a remote service, a
 * model reply parsed at runtime, or a resolver written against an older shape.
 * The type governs this repository; the postcondition governs what actually
 * arrives.
 *
 * WHY THIS IS NOT `validateLesson`. That runs the full schema and every teaching
 * rule, and it is the right check when a lesson is authored. Here it would be
 * the wrong one twice over: it is far heavier than a per-rung boundary should
 * be, and a rung answering with a lesson that is well-formed but scores poorly
 * against a teaching rule has kept its promise. The promise is "a renderable
 * document", not "a good lesson".
 */

import type { CheckResult } from '../layout/layout'
import type { Resolution } from './contract'

/**
 * No answer may be empty. A lesson with no blocks renders as a heading with
 * nothing under it, which reads to a learner as the feature being broken.
 *
 * READ DEFENSIVELY, AND THE REASON IS A REAL CRASH. The first version indexed
 * `resolution.lesson.blocks` directly and threw `Cannot read properties of
 * undefined` against a rung whose answer carried no `lesson` at all -- so the
 * postcondition took down the very call it existed to protect, and the stack
 * named this file instead of the rung that lied.
 *
 * A CONTRACT MUST SURVIVE WHAT IT IS CHECKING. Anything that inspects
 * untrusted output has to assume the shape is wrong, which is the whole reason
 * the check exists; assuming it is right is assuming the conclusion.
 */
export function hasBlocks(name: string, resolution: Resolution): CheckResult {
  if (resolution.kind !== 'answer') {
    return { name: `${name}: the answer has blocks`, ok: true, offenders: [] }
  }
  const blocks = resolution.lesson?.blocks
  const empty = !Array.isArray(blocks) || blocks.length === 0
  return { name: `${name}: the answer has blocks`, ok: !empty, offenders: empty ? [name] : [] }
}

/** Every block a renderer will key on needs an id, and two blocks may not share
 *  one -- React would drop the duplicate and the learner would lose a paragraph
 *  with nothing anywhere reporting it. */
export function hasUsableIds(name: string, resolution: Resolution): CheckResult {
  if (resolution.kind !== 'answer') {
    return { name: `${name}: block ids are usable`, ok: true, offenders: [] }
  }
  const ids = (resolution.lesson?.blocks ?? []).map((block) => block.id)
  const offenders = ids.filter((id, index) => id === '' || ids.indexOf(id) !== index)
  return { name: `${name}: block ids are usable`, ok: offenders.length === 0, offenders }
}

/** `drawnFrom` points back at the ORIGINAL lesson so the interface can
 *  highlight what an answer drew on. An id that is not in that lesson would
 *  make it point at nothing -- a citation to a source that does not exist. */
export function drawsFromRealBlocks(
  name: string,
  resolution: Resolution,
  originalIds: ReadonlySet<string>,
): CheckResult {
  if (resolution.kind !== 'answer') {
    return { name: `${name}: drawnFrom is real`, ok: true, offenders: [] }
  }
  const offenders = (resolution.drawnFrom ?? []).filter((id) => !originalIds.has(id))
  return { name: `${name}: drawnFrom is real`, ok: offenders.length === 0, offenders }
}

/**
 * Every postcondition a rung's answer must satisfy.
 *
 * Mirrors `checkFrame`: run them all, return them all. Returning the first
 * failure would hide the second, and a rung breaking two promises is worth
 * knowing about in one pass rather than two.
 */
export function checkResolution(
  name: string,
  resolution: Resolution,
  originalIds: ReadonlySet<string>,
): CheckResult[] {
  return [
    hasBlocks(name, resolution),
    hasUsableIds(name, resolution),
    drawsFromRealBlocks(name, resolution, originalIds),
  ]
}

/**
 * The breaches, as one sentence, or `null` when the rung kept its promise.
 *
 * A string rather than a thrown error because `chain.ts` records it as the
 * `error` on a `failed` rung, and that field is what `refusalFrom` reads when
 * it decides what to tell the learner.
 */
export function resolutionBreach(
  name: string,
  resolution: Resolution,
  originalIds: ReadonlySet<string>,
): string | null {
  const broken = checkResolution(name, resolution, originalIds).filter((check) => !check.ok)
  if (broken.length === 0) return null
  return broken
    .map((check) =>
      check.offenders.length > 0
        ? `${check.name} (${check.offenders.join(', ')})`
        : check.name,
    )
    .join('; ')
}
