/**
 * WHAT THIS TOPIC IS ABOUT, AT THE TOP OF THE CANVAS.
 *
 * THE OWNER'S DECISION, 2026-09-03, in their words: "its not a map, its like a
 * text only like u display + persisting of same font, display, design, layout
 * tht appears on start of blank canvas". So: prose, in the canvas's own type,
 * present from the moment she arrives and still there while she learns. No
 * boxes, no tree lines, no icons, nothing to click.
 *
 * WHERE THE WORDS COME FROM IS THE POINT.
 *
 *   They are read from a committed, checked knowledge file -- see
 *   `src/knowledge/load.ts`, which has no way to write one. They are NOT asked
 *   of a model when she opens the topic. A model asked that question gives a
 *   different answer to every student, costs a call, takes seconds, and cannot
 *   be argued with afterwards. This can: every concept carries the syllabus
 *   page and the sentence it was read from.
 *
 * THREE THINGS IT WILL NOT DO.
 *
 *   It will not invent parts for a topic that is one idea. `shape: 'atomic'` is
 *   a real answer and it says so in a sentence, because manufacturing three
 *   bullets to fill a template is the exact failure this layer exists to stop.
 *
 *   It will not show a placeholder for a topic nothing is known about. Most of
 *   the 3,995 topics have no model yet; a line saying "no scope available"
 *   reads as something failing to load, which is worse than silence. It renders
 *   nothing and the canvas is exactly what it was.
 *
 *   It will not renumber or reorder anything. The order is the order the
 *   syllabus prints.
 */

import { knowledgeFor } from '../../knowledge/load'
import { notTeachable } from '../../knowledge/teachable'

export function TopicScope({ topicId, topicName }: { topicId: string | null; topicName?: string | null }) {
  /* SOME OF WHAT THE SIDEBAR OFFERS IS NOT A TOPIC.
   *
   * The curriculum was read out of 37 PDFs, and about nine entries in every
   * hundred are apparatus lists, instructions or a book's authors rather than
   * ideas -- "Collect the following items: A spring, a stand, a weight
   * hanger", "Microbiology - An introduction: Gerrard J. Tortora...". They stay
   * in the sidebar, because hiding a topic is the failure nobody notices.
   *
   * What she must not get is a canvas quietly trying to teach a shopping list.
   * She is told, in one sentence, and the ask box is right there. */
  const notATopic = typeof topicName === 'string' ? notTeachable(topicName) : null
  if (notATopic !== null) {
    return (
      <section className="lc-scope" aria-label="What this topic is about">
        <p className="lc-scope__one">
          This is a line from the syllabus, not something to learn on its own — {notATopic.reason}. Ask
          about the idea behind it and it will be taught.
        </p>
      </section>
    )
  }

  const known = topicId === null ? null : knowledgeFor(topicId)
  if (known === null) return null

  if (known.shape === 'atomic') {
    return (
      <section className="lc-scope" aria-label="What this topic is about">
        <p className="lc-scope__one">This topic focuses on understanding one central idea.</p>
      </section>
    )
  }

  return (
    <section className="lc-scope" aria-label="What this topic is about">
      <p className="lc-scope__lead">What this topic covers</p>
      <ul className="lc-scope__list">
        {known.concepts.map((concept) => (
          <li key={concept.id}>
            {concept.name}
            {concept.subConcepts !== undefined && concept.subConcepts.length > 0 && (
              <ul className="lc-scope__list lc-scope__list--inner">
                {concept.subConcepts.map((part) => (
                  <li key={part.id}>{part.name}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
