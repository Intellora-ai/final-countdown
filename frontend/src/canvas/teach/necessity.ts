/**
 * E3 — WHETHER, BEFORE WHICH. "No picture" is a real answer.
 *
 * The gate demands a representation for every reading except `define` and
 * `example`, so a lesson about the word "onomatopoeia" owes a chart of
 * something. The prompt says "never add one because this list asked for one"
 * in the same breath as the gate refusing the lesson that obeys, and a model
 * caught between the two draws a chart of nothing -- which is worse than
 * plain prose, because it looks like evidence.
 *
 * A picture is owed when the CONTENT HAS SOMETHING TO SHOW: quantities to
 * compare, steps in an order, cases to set side by side, parts of a whole, or
 * a relationship between named things. Etymology, a convention, a definition
 * of a word -- these have nothing to draw, and drawing them invents structure
 * that is not in the idea.
 *
 * THE AUTHOR MAY SAY SO, AND MUST SAY WHY. `mayShowNothing` accepts a lesson
 * with no figure only when the content has no showable signal AND a reason is
 * given. So "no picture" is a decision on the record, never a silent omission,
 * and it cannot be used to escape drawing something the idea needs.
 */

/** Kinds that already show something; nothing more is owed. */
const SHOWS = new Set(['chart', 'table', 'flow', 'figure', 'simulation', 'equation'])

/** Two or more quantities, which can be compared or plotted. */
const QUANTITIES = /(?:\b\d[\d,.]*\s*(?:%|percent|degrees?|metres?|meters?|grams?|kg|km|cm|mm|seconds?|minutes?|hours?|years?|times)\b|\b\d[\d,.]*\b)/gi
/** Order words: something happens, then something else. */
const IN_ORDER = /\b(?:first|firstly|then|next|after that|finally|lastly|step \d|begins? with|ends? with)\b/i
/** Two things held against each other. */
const AGAINST = /\b(?:whereas|while|but|unlike|compared with|compared to|on the other hand|difference between|both|either|neither)\b/i
/** Parts of a whole. */
const PARTS = /\b(?:percent|proportion|share|fraction|made up of|consists? of|composed of|divided into)\b/i
/** Named things standing in a relation to each other. */
const RELATED = /\b(?:causes?|leads? to|depends? on|results? in|because of|feeds? into|connected to|between .+ and )\b/i

function words(blocks: readonly Record<string, unknown>[]): string {
  return blocks
    .flatMap((block) => [block['title'], block['body'], block['caption'], block['mentalModel']])
    .filter((one): one is string => typeof one === 'string')
    .join(' ')
}

/**
 * True when the idea itself carries structure a picture could show. Errs
 * towards true: a picture that was not needed costs a little space, and a
 * missing picture costs the understanding.
 */
export function hasSomethingToShow(blocks: readonly Record<string, unknown>[]): boolean {
  if (blocks.some((block) => SHOWS.has(String(block['kind'])))) return true
  const said = words(blocks)
  if ((said.match(QUANTITIES) ?? []).length >= 2) return true
  return IN_ORDER.test(said) || AGAINST.test(said) || PARTS.test(said) || RELATED.test(said)
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly why: string }

/** The shortest reason that is a reason rather than a shrug. */
const ENOUGH_OF_A_REASON = 25

export function mayShowNothing(blocks: readonly Record<string, unknown>[], reason: string): Verdict {
  /* The idea comes first: a lesson that HAS something to show is told to show
     it, whatever it wrote in the reason box. Asking for a better excuse would
     send the author back to the excuse rather than to the drawing. */
  if (hasSomethingToShow(blocks)) {
    return {
      ok: false,
      why: 'this idea has something to show — quantities to compare, steps in an order, cases side by side, or parts of a whole — so show it',
    }
  }
  if (reason.trim().length < ENOUGH_OF_A_REASON) {
    return {
      ok: false,
      why: 'say in one sentence why this idea has nothing worth drawing, or draw it',
    }
  }
  return { ok: true }
}
