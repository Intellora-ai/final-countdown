/* P2 — WHAT IS STORABLE.
 *
 * NOT "what a memory contains". That was the first version of this file and it
 * was wrong: it fixed six field names -- whatExplained, howExplained, level,
 * mistakes, mastery, updatedAt -- and refused everything else. A store that
 * dictates the shape of what it holds is a store that has to be edited every
 * time the thing it holds learns something new, and it silently rejects any use
 * nobody thought of on the day it was written.
 *
 * The plan's own rule is the argument: the storage layer owns SAVING and
 * RETRIEVING; whoever owns the content owns its shape. So this file answers one
 * universal question -- can this value be stored and handed back BYTE FOR BYTE?
 * -- and takes no view whatever on what is inside it.
 *
 * "Never return a partial or corrupted record" is a promise about the STORE:
 * what comes out equals what went in, or nothing comes out. It was never a
 * promise that the caller filled in every field it meant to.
 */

/** Anything JSON can carry. The store has no opinion beyond this. */
export type Storable =
  | string
  | number
  | boolean
  | null
  | readonly Storable[]
  | { readonly [key: string]: Storable }

/** Why a value could not be stored, in words a person could act on. */
export class NotStorable extends Error {}

/**
 * Big enough for any real memory, small enough that one student cannot fill the
 * disk. A ceiling is not a guess about content -- it is the difference between
 * a bounded system and one that falls over on a Tuesday.
 */
export const MAX_RECORD_BYTES = 256 * 1024

/**
 * Prove a value survives the round trip, and return the exact text to store.
 *
 * THE CHECK IS THE ROUND TRIP ITSELF, NOT A LIST OF RULES. `undefined`, a
 * function, a `Map`, a `Date`, `NaN`, a cycle -- every one of them either
 * throws here or comes back as something different from what went in, and both
 * are caught by comparing the two encodings. That covers cases nobody has
 * thought of yet, which a hand-written list of forbidden types cannot.
 */
export function toStoredText(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    /* A cycle, or a value with a throwing `toJSON`. */
    throw new NotStorable('this cannot be written down, so it cannot be stored')
  }

  if (text === undefined) {
    /* `JSON.stringify(undefined)` and friends. Storing "undefined" as the
     * literal text would hand the next reader a string where a value was. */
    throw new NotStorable('there is nothing here to store')
  }

  const bytes = Buffer.byteLength(text)
  if (bytes > MAX_RECORD_BYTES) {
    throw new NotStorable(
      `this is ${bytes} bytes and the limit is ${MAX_RECORD_BYTES}`,
    )
  }

  /* THE ROUND TRIP, ASSERTED RATHER THAN ASSUMED. If re-encoding the decoded
   * value differs, something was lost or changed on the way through -- a Date
   * became a string, a NaN became null, a key order was rebuilt. The store
   * promises byte-for-byte return, so it must refuse anything that would break
   * that promise instead of discovering it later in front of a learner. */
  const back = JSON.stringify(JSON.parse(text))
  if (back !== text) {
    throw new NotStorable('this does not survive being written down and read back')
  }

  return text
}

/** Read stored text back. Throws rather than returning half a record. */
export function fromStoredText(text: string): Storable {
  try {
    return JSON.parse(text) as Storable
  } catch {
    throw new NotStorable('the stored record is unreadable')
  }
}
