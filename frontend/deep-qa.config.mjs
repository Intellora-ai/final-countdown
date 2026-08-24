/**
 * deep-qa configuration for this project.
 *
 * WHY readState LOOKS LIKE THIS AND NOT LIKE THE README EXAMPLE
 * -------------------------------------------------------------
 * The harness README shows `localStorage.getItem('progress')` and
 * `getItem('answered')`. Those are placeholder names. This app writes NEITHER:
 * everything lives under one key, `learning-os/v2`, holding a `DB` shaped
 * `{ students, progress, activity, currentId }` (src/types.ts:34).
 *
 * Copying the example verbatim is not a cosmetic mistake. `readState` is the
 * only thing the memory laws compare across reloads and sessions, so a reader
 * pointed at keys the app never writes returns `{progress: 0, answered: []}`
 * forever. `progress` never decreases from 0, `answered` never shrinks from
 * empty, and `memory-persists` therefore CANNOT fire. The run goes green for
 * twelve sessions and reports nothing -- while "it forgot everything after ten
 * sessions", the exact bug this harness exists to catch, walks straight past.
 *
 * WHAT THESE TWO NUMBERS MEAN
 * ---------------------------
 * `progress` is a three-level map: student -> subject -> concept -> record. The
 * count of leaf records is the honest "how far has this learner got" figure, and
 * it only ever grows as concepts are attempted. Counting the top level instead
 * would report 1 after the first student appeared and 1 forever after.
 *
 * `answered` is the flattened activity log. The law compares LENGTH across a
 * reload, so a list that shrinks is memory loss regardless of what the entries
 * say. Ids are not needed and are not collected -- fewer moving parts in a
 * function that runs inside the page after every single step.
 *
 * Everything is defensive. This runs after EVERY action, including on a page
 * where storage is empty, half-written, or corrupt. A throw here is reported as
 * a violation of whichever law was mid-check, which would blame the product for
 * a fault in the instrument.
 */
export default {
  // Where a session begins.
  start: '/',

  readState: () => {
    try {
      const raw = localStorage.getItem('learning-os/v2')
      if (!raw) return { progress: 0, answered: [] }

      const db = JSON.parse(raw)
      if (!db || typeof db !== 'object') return { progress: 0, answered: [] }

      // progress: student -> subject -> concept -> record. Count the leaves.
      let concepts = 0
      const byStudent = db.progress
      if (byStudent && typeof byStudent === 'object') {
        for (const bySubject of Object.values(byStudent)) {
          if (!bySubject || typeof bySubject !== 'object') continue
          for (const byConcept of Object.values(bySubject)) {
            if (byConcept && typeof byConcept === 'object') {
              concepts += Object.keys(byConcept).length
            }
          }
        }
      }

      // activity: student -> event[]. Flatten; the law compares length.
      let events = 0
      const activity = db.activity
      if (activity && typeof activity === 'object') {
        for (const list of Object.values(activity)) {
          if (Array.isArray(list)) events += list.length
        }
      }

      return { progress: concepts, answered: new Array(events).fill(1) }
    } catch {
      // Unreadable storage is not "no progress" -- but it is the only answer
      // available, and the alternative is throwing inside the page on every
      // step. The blank-page and crash laws still cover a genuinely broken app.
      return { progress: 0, answered: [] }
    }
  },

  // Controls the robot must not touch, or every long run ends in the first
  // thirty steps and session ten is never reached.
  exclude: ['log ?out', 'sign ?out', 'delete', 'remove account', 'reset'],

  sessions: 12,
  steps: 60,
  seed: 1
}
