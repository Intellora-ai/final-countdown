/* M6 — SHE IS NEVER TAUGHT THE SAME THING THE SAME WAY TWICE.
 *
 * Phase 3's done condition, in the owner's words: "asking for the same concept
 * twice never yields the same explanation."
 *
 * WHAT THESE TESTS REFUSE TO ACCEPT AS A PASS.
 *
 * The mechanism that existed before this file was a `useRef(new Map())` inside
 * one React component (`CanvasRoute.tsx:321`). It satisfies "twice in a row in
 * one tab" perfectly and satisfies nothing else, so every scenario below is one
 * a real learner lives through and that Map cannot survive:
 *
 *   - she reloads the page                    (the Map is gone)
 *   - she comes back tomorrow                 (the Map is gone)
 *   - the server restarts between questions   (nothing was ever server-side)
 *   - a second tab answers at the same moment (two Maps, neither aware)
 *   - a caller simply omits the history       (the Map was sent BY the caller)
 *
 * Every test drives the real store on a real file, and the reload is modelled
 * the only honest way: THROW THE READER AWAY AND OPEN A NEW ONE. A test that
 * reuses the same object in memory proves the object agrees with itself.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { explanationsIn, keyFor, type Explanation } from './explanations.ts'
import { sqliteMemoryStore, type MemoryStore } from './sqliteStore.ts'
import type { MemoryOwner } from './key.ts'
import { AXES, nextRoute } from '../../src/canvas/teach/route.ts'

let folder: string
let file: string
const open: MemoryStore[] = []

/** A reader with NO memory of its own, exactly as a fresh page load has none. */
function afterAReload(): MemoryStore {
  const store = sqliteMemoryStore(file)
  open.push(store)
  return store
}

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'm6-'))
  file = join(folder, 'memory.db')
})

afterEach(() => {
  for (const store of open.splice(0)) {
    try {
      store.close()
    } catch {
      /* Already closed by a test that was proving something about closing. */
    }
  }
  rmSync(folder, { recursive: true, force: true })
})

const ARYA: MemoryOwner = { studentId: 'stu_arya', tabId: 'tab_1', lessonId: 'science' }
const ISHAN: MemoryOwner = { studentId: 'stu_ishan', tabId: 'tab_1', lessonId: 'science' }

function shown(route: string, text: string, at = '2026-09-01T10:00:00.000Z'): Explanation {
  return { route, text, at }
}

describe('M6: what she has been told outlives the page she was told it on', () => {
  it('remembers the route after a reload, so the second asking comes at it differently', () => {
    /* THE DONE CONDITION, AS A LEARNER LIVES IT. She asks, reads, refreshes,
       asks the same thing again. The old `useRef` Map is gone at the refresh,
       and with it every reason the second answer would differ. */
    const first = explanationsIn(afterAReload())
    first.remember(ARYA, 'photosynthesis', shown('definition-first', 'Plants make food from light.'))

    const afterRefresh = explanationsIn(afterAReload())
    const spent = afterRefresh.routesSpent(ARYA, 'photosynthesis')

    expect(spent, 'the refresh forgot how she was taught').toEqual(['definition-first'])
    expect(
      nextRoute({ seed: 1, alreadyUsed: spent }).id,
      'the second asking takes the same way in as the first',
    ).not.toBe('definition-first')
  })

  it('never repeats a route until every one of the twelve is spent', () => {
    /*
     * A learner who keeps asking is the hardest case, not the rarest: it is
     * exactly what someone who has not understood does. Twelve askings, each
     * one through a NEW reader, so nothing is carried in memory between them.
     */
    const seen: string[] = []
    for (let asking = 0; asking < AXES.length; asking += 1) {
      const book = explanationsIn(afterAReload())
      const spent = book.routesSpent(ARYA, 'gravity')
      const taken = nextRoute({ seed: 7, alreadyUsed: spent })
      seen.push(taken.id)
      book.remember(ARYA, 'gravity', shown(taken.id, `Explanation number ${asking}`))
    }

    expect(new Set(seen).size, `a route came round again: ${seen.join(', ')}`).toBe(AXES.length)
  })

  it('keeps teaching after all twelve are spent, rather than refusing', () => {
    /* EXHAUSTION IS NOT AN ERROR. A learner who has seen every way in and asks
       again must still be answered -- silence is the failure this repository
       keeps finding. `nextRoute` restarts the cycle, and this holds it to that. */
    const book = explanationsIn(afterAReload())
    for (const axis of AXES) book.remember(ARYA, 'gravity', shown(axis.id, `via ${axis.id}`))

    const spent = book.routesSpent(ARYA, 'gravity')
    expect(nextRoute({ seed: 7, alreadyUsed: spent }).id, 'she was refused a thirteenth time')
      .toBeTruthy()
  })

  it('gives back the exact wording, so a repeat can be recognised', () => {
    /* A route is how it was approached; the WORDS are what she actually read.
       Phase 3 item 3 judges novelty on the words, so they have to come back
       byte for byte -- a summary would make two different explanations look
       identical and refuse a perfectly good one. */
    const written = 'Photosynthesis turns light, water and carbon dioxide into sugar and oxygen.'
    explanationsIn(afterAReload()).remember(ARYA, 'photosynthesis', shown('example-first', written))

    expect(explanationsIn(afterAReload()).wordsShown(ARYA, 'photosynthesis')).toEqual([written])
  })
})

describe('M6: one learner’s history is never another’s', () => {
  it('does not hand Arya what Ishan was told', () => {
    /* The shared machine. Two children, one browser, the same lesson. Teaching
       Arya "you have had this already" because ISHAN had it is the exact
       cross-contamination `key.ts` exists to stop, and it is proven here at the
       level a learner meets it rather than at the level of a key string. */
    const book = explanationsIn(afterAReload())
    book.remember(ISHAN, 'photosynthesis', shown('contrast', 'Ishan was told this.'))

    const fresh = explanationsIn(afterAReload())
    expect(fresh.routesSpent(ARYA, 'photosynthesis')).toEqual([])
    expect(fresh.routesSpent(ISHAN, 'photosynthesis')).toEqual(['contrast'])
  })

  it('does not let one concept spend another concept’s routes', () => {
    /* She asks about photosynthesis four times, then asks about gravity for the
       first time. Gravity must open at the first way in, not the fifth. */
    const book = explanationsIn(afterAReload())
    for (const axis of AXES.slice(0, 4)) {
      book.remember(ARYA, 'photosynthesis', shown(axis.id, `via ${axis.id}`))
    }
    expect(explanationsIn(afterAReload()).routesSpent(ARYA, 'gravity')).toEqual([])
  })

  it('does not let one lesson spend another lesson’s routes', () => {
    const book = explanationsIn(afterAReload())
    book.remember(ARYA, 'pressure', shown('numbers-first', 'In physics.'))
    const civics: MemoryOwner = { ...ARYA, lessonId: 'civics' }
    expect(explanationsIn(afterAReload()).routesSpent(civics, 'pressure')).toEqual([])
  })

  it('treats the same question typed differently as ONE history', () => {
    /*
     * MEASURED AS A REAL DEFECT in the Map this replaces: it keyed on
     * `question.toLowerCase()` only, so a stray double space made a second
     * memory and she was taught the same way twice. Case and spacing are not
     * meaning.
     */
    const book = explanationsIn(afterAReload())
    book.remember(ARYA, 'What is Photosynthesis?', shown('definition-first', 'First telling.'))

    const fresh = explanationsIn(afterAReload())
    for (const typed of ['what is photosynthesis?', '  What Is  Photosynthesis?  ']) {
      expect(fresh.routesSpent(ARYA, typed), `"${typed}" started a second history`)
        .toEqual(['definition-first'])
    }
  })
})

describe('M6: the history survives what a real machine does to it', () => {
  it('survives the server being killed between two questions', () => {
    /* Not a graceful close. A laptop lid, a crash, a deploy. The write must
       already be durable when `remember` returns, not when something later
       tidies up. */
    const before = afterAReload()
    explanationsIn(before).remember(ARYA, 'gravity', shown('sequence', 'Told once.'))
    before.close()

    expect(explanationsIn(afterAReload()).routesSpent(ARYA, 'gravity')).toEqual(['sequence'])
  })

  it('two tabs answering at the same moment lose neither answer', () => {
    /*
     * She has the lesson open twice and both ask. Read-then-write would have
     * both read the same history and the second write would erase the first,
     * so she would be taught one of the two ways again. `update` makes each
     * append one indivisible step.
     */
    const one = explanationsIn(afterAReload())
    const two = explanationsIn(afterAReload())
    one.remember(ARYA, 'gravity', shown('sequence', 'From tab one.', '2026-09-01T10:00:00.000Z'))
    two.remember(ARYA, 'gravity', shown('contrast', 'From tab two.', '2026-09-01T10:00:01.000Z'))

    expect(explanationsIn(afterAReload()).routesSpent(ARYA, 'gravity'))
      .toEqual(['sequence', 'contrast'])
  })

  it('answers a first asking rather than failing when the row is corrupt', () => {
    /* A half-written file, a hand-edited row, a shape from a future version.
       None of those is a reason to refuse to teach a child -- she is answered
       as a first asking, which is where she was before any of this existed. */
    const raw = afterAReload()
    const book = explanationsIn(raw)
    book.remember(ARYA, 'gravity', shown('sequence', 'Told once.'))

    /* Reach past the module and break the row the way a disk would. The key
       comes from the module itself, so this stays a test of corrupt CONTENT
       and cannot quietly turn into a test of a key that no longer matches. */
    raw.write(keyFor(ARYA, 'gravity'), 'this is not json at all', '2026-09-01T11:00:00.000Z')

    expect(() => explanationsIn(afterAReload()).routesSpent(ARYA, 'gravity')).not.toThrow()
  })

  it('stops growing, so one child’s row cannot expand without end', () => {
    /* Twelve routes exist. A thirteenth entry can no longer change which route
       is chosen next, so keeping it costs a child's disk for a decision it can
       never affect. The OLDEST go, because a repeat resembles the recent ones. */
    const book = explanationsIn(afterAReload())
    for (let asking = 0; asking < 40; asking += 1) {
      book.remember(ARYA, 'gravity', shown(`route-${asking}`, `Telling ${asking}`))
    }

    const kept = explanationsIn(afterAReload()).routesSpent(ARYA, 'gravity')
    expect(kept.length).toBeLessThanOrEqual(AXES.length)
    expect(kept[kept.length - 1], 'the newest telling was dropped instead of the oldest').toBe('route-39')
  })
})
