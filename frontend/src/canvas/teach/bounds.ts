/* What the one box will carry, and what it refuses.
 *
 * WHAT WAS UNBOUNDED
 *   Nothing in `canvas/teach/` limited the input at all. A 10,000-character
 *   paste -- a whole chapter, a log file, an accident -- went to the model
 *   verbatim, at whatever that costs, and came back as an answer to something
 *   nobody asked.
 *
 * A SILENT TRUNCATION IS A LIE
 *   Cutting the text and saying nothing is worse than refusing it: the learner
 *   watches an answer arrive to half a question and has no way to know which
 *   half was read. Everything here reports what it did, and `TeachView` says so
 *   on the screen.
 */

/**
 * The longest question the box will hold, in CODE POINTS, not code units.
 *
 * Generous on purpose. A real question is a sentence; this is roughly a page,
 * so nobody composing honestly will ever meet it. It is a ceiling on accidents
 * and on pastes, not a writing limit.
 */
export const MOST_CHARACTERS = 2000

/**
 * The most questions one beat will send to the model.
 *
 * Far above real use -- `strugglingAfter` already treats two questions on one
 * beat as a signal the lesson is not landing -- because this is not a teaching
 * rule. It is the ceiling that stops a stuck page, a held key or a script
 * spending without end on one beat, and it exists because every other bound in
 * this path is a human pressing Enter.
 */
export const MOST_QUESTIONS_PER_BEAT = 12

export interface Bounded {
  /** What may be sent. Never longer than `MOST_CHARACTERS` code points. */
  readonly text: string
  /** Whether anything was cut. The caller must say so; see the file header. */
  readonly clamped: boolean
}

/**
 * Cut a draft to the bound, by CODE POINT.
 *
 * `String.prototype.slice` counts UTF-16 code units, so cutting at a boundary
 * inside a surrogate pair leaves a LONE SURROGATE at the end. That is not a
 * character; it is half of one. `JSON.stringify` will emit it, `fetch` encodes
 * it as U+FFFD, and the model receives a question whose last character is a
 * replacement glyph -- from an emoji, an Indic script, or any of the writing
 * systems this product is for. Found by the property test beside this file,
 * generating full-Unicode strings, not by reasoning about it first.
 */
export function bound(text: string): Bounded {
  const points = Array.from(text)
  if (points.length <= MOST_CHARACTERS) return { text, clamped: false }
  return { text: points.slice(0, MOST_CHARACTERS).join(''), clamped: true }
}
