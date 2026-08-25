/**
 * Turn a curriculum concept name into something a learner can read as a title.
 *
 * WHAT WENT WRONG
 * ---------------
 * The heading was the concept name, rendered raw. A real lesson opened with:
 *
 *   "Fundamental Theorem of Arithmetic - statements after reviewing work done
 *    earlier and after illustrating and motivating through examples"
 *
 * Everything after the dash is an instruction to a TEACHER, lifted out of the
 * syllabus and shown to the learner as a title.
 *
 * Measured across `src/data/curriculum/class*.ts`: 984 of 4589 concept names
 * are over 60 characters, and the long tail holds exam questions, mark schemes
 * and raw textbook prose. This is not one bad row, it is 21% of the corpus.
 *
 * WHAT THIS FIXES, AND WHAT IT DOES NOT
 * -------------------------------------
 * It makes the HEADING readable. It does not repair the data. The extractor
 * that stored sentences as concept names is the real defect and a separate,
 * larger job. Trimming at render is honest as long as nobody claims otherwise.
 */

/** A heading longer than this stops being a title and becomes a sentence. */
const MAX = 70

/**
 * Tails that are instructions to a teacher, not part of the concept.
 *
 * Matched after a dash so an ordinary hyphenated term survives: splitting on
 * the first hyphen would turn "Non-terminating repeating decimals" into "Non",
 * which is a worse bug than the one being fixed.
 */
const TEACHER_TAIL =
  /\s+[-–—]\s+(statements?|proofs?|recall|motivate|illustrat|examples?|after |before |through |verify|prove)/i

const trimTrailing = (text: string): string => text.replace(/[\s,;:.\-–—]+$/, '')

/**
 * Cut on a word boundary, never mid-word.
 *
 * A heading ending "…comprehen…" reads as a rendering bug and costs more trust
 * than the length ever saved.
 */
function clampWords(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return trimTrailing(lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…'
}

export function conceptHeading(name: string, fallback = ''): string {
  const trimmed = (name ?? '').trim()
  if (trimmed === '') return fallback

  /* 1. Drop a teacher-instruction tail, if there is one. */
  const tail = TEACHER_TAIL.exec(trimmed)
  let heading = tail && tail.index > 0 ? trimmed.slice(0, tail.index) : trimmed

  /* 2. If it is really prose, keep the first clause only. A sentence has a
     full stop in it; a concept name does not. */
  if (heading.length > MAX) {
    const sentenceEnd = heading.search(/[.!?]\s/)
    if (sentenceEnd > 0) heading = heading.slice(0, sentenceEnd)
  }

  heading = trimTrailing(heading)

  /* 3. Whatever survives, it still has to fit. */
  return clampWords(heading, MAX)
}
