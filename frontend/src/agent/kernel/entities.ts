import type { Entity } from './contracts'

/**
 * MERGING ENTITIES, ONCE.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `mergeEntities` was written twice — identically — in `understand.ts` and
 * `memory.ts`. Both copies had the same defect, and fixing one would have left
 * the other. This repository has already paid for that lesson once: `text.ts`
 * exists because two subsystems kept private copies of a stopword list and
 * drifted apart. A function duplicated across module boundaries is a bug that
 * has to be found twice.
 *
 * THE DEFECT, MEASURED
 * --------------------
 * The merge was `mentions: [...was.mentions, ...e.mentions]`. Both sides
 * accumulate, so every turn re-appended the entire prior history, and
 * `working.entities` grew QUADRATICALLY. Over 100 turns through the real loop:
 *
 *     turn 33   working = 7452 B    mentions lengths 1122, 561, 561, 561
 *     turn 66   working = 30552 B   mentions lengths 4422, 2211, 2211, 2211
 *     turn 99   working = 69763 B   mentions lengths 9900, 4950, 4950, 4950
 *
 * 4950 is 99 x 100 / 2. Every array element after the first was a duplicate
 * turn index. Nothing detected it because the entity COUNT stayed flat at
 * four — the leak was inside the values, where a length assertion never looks.
 *
 * The session object is what `createAgent()` carries between turns and what
 * `suspend()` serialises, so this was a conversation that got heavier the
 * longer it went: fine at fifty turns, several megabytes at a few thousand.
 */

/** How many mentions of one entity are worth keeping. See `mergeMentions`. */
export const MENTION_WINDOW = 10

/**
 * Combine two mention histories.
 *
 * DEDUPED, because a mention is a TURN INDEX and an entity cannot be mentioned
 * twice in one turn — a repeat is bookkeeping noise, never a second sighting.
 *
 * BOUNDED, because the only thing any caller reads is the most recent entry.
 * `resolveReferences` sorts on `last(mentions)` and compares ties on it; no
 * code anywhere reads the earlier ones. An unbounded array whose tail is never
 * read is a leak with a plausible-sounding excuse attached.
 *
 * The window is 10 rather than 1 deliberately. `Entity.mentions` is documented
 * as the record that makes "the second one" resolvable, and that resolution is
 * not built yet; keeping a short history leaves it possible without letting
 * the structure grow with the conversation. If it is still unused later, the
 * honest move is to delete the field, not to grow it.
 */
export function mergeMentions(a: readonly number[], b: readonly number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y).slice(-MENTION_WINDOW)
}

/**
 * Merge fresh entities into prior ones, keeping one record per id.
 *
 * A known entity keeps its identity and gains the new mentions; an unknown one
 * is added as-is. Order follows first appearance, so the caller's own ordering
 * is not silently reshuffled by a merge.
 */
export function mergeEntities(prior: readonly Entity[], fresh: readonly Entity[]): Entity[] {
  const byId = new Map(prior.map((e) => [e.id, e]))
  for (const e of fresh) {
    const was = byId.get(e.id)
    byId.set(e.id, was ? { ...was, mentions: mergeMentions(was.mentions, e.mentions) } : e)
  }
  return [...byId.values()]
}
