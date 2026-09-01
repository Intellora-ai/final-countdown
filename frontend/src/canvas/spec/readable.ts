/*
 * THE WORDS OF A LESSON, IN THE ORDER THEY ARE READ — DEFINED ONCE.
 *
 * There were two answers to this one question and they disagreed:
 *
 *   `server/handler.ts`  read nine fields, and stored the result as "what she
 *                        has been told", which novelty is judged against.
 *   `almanac/client.ts`  read `body` and nothing else, and treated the result
 *                        as the whole answer to a doubt.
 *
 * The second one is why a doubt answered with a misconception block, a table
 * or a reasoning block came back to the learner as "the answer came back
 * empty". The model had written a full reply; the reader looked for one field
 * that reply did not have. And because the server recorded the SAME lesson as
 * a page of text, novelty was being judged against words the screen had just
 * refused to show.
 *
 * WHAT COUNTS AS READABLE. Every field that carries a sentence a person reads.
 * A chart's points and a table's cells are deliberately left out: they are the
 * same facts in any telling, so counting them would make a genuinely fresh
 * explanation of the same data look like a repeat of it. A table's `caption`
 * IS included, because a caption is written prose about the data.
 */

/** Sentence-bearing fields, whatever block kind carries them. */
const READABLE_FIELDS = [
  'body',
  'why',
  'wrong',
  'correct',
  'counterexample',
  'claim',
  'therefore',
  'mentalModel',
  'caption',
] as const

export function readableText(lesson: unknown): string {
  if (typeof lesson !== 'object' || lesson === null) return ''
  const blocks = (lesson as Record<string, unknown>)['blocks']
  if (!Array.isArray(blocks)) return ''

  const said: string[] = []
  const say = (value: unknown): void => {
    if (typeof value === 'string' && value.trim() !== '') said.push(value.trim())
  }

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue
    const it = block as Record<string, unknown>
    for (const field of READABLE_FIELDS) say(it[field])

    /* A reasoning block keeps its whole argument in `steps`, so a reader that
       stops at the fields above captures only the claim and the conclusion and
       drops the derivation between them -- which is the part that teaches. */
    const steps = it['steps']
    if (Array.isArray(steps)) {
      for (const step of steps) {
        if (typeof step !== 'object' || step === null) continue
        const one = step as Record<string, unknown>
        say(one['expression'])
        say(one['because'])
      }
    }
  }
  return said.join('\n\n')
}
