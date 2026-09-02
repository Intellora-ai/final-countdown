import { describe, expect, it } from 'vitest'

import { loadPlannedSubjects } from '../../src/almanac/curriculum.ts'
import { isPlea } from '../../src/canvas/teach/turn.ts'
import { smallTalk } from '../smallTalk.ts'
import type { TeachingRequest } from './LearningIntelligence.ts'
import { codeSuffices, sufficientPath, type Looks } from './sufficiency.ts'

/**
 * THE SUFFICIENCY GATE, NAMED IN ONE PLACE.
 *
 * "Code decides when intelligence is unnecessary." The live path already
 * makes these decisions -- small talk, the alias shelf, the unseen-lesson
 * shelf, the in-lesson answerer -- scattered across the handler. This names
 * them as one verdict with a reason, so the shadow can record, on every
 * request, whether any brain was needed at all.
 *
 * The looks are the REAL functions where they are pure (small talk, plea) and
 * injected where they read a store (the two shelves).
 */

function aRequest(question: string, askedFrom = 'ask'): TeachingRequest {
  return { question, topicId: 'polynomials--zeros-of-a-polynomial', classId: '10', examId: null, alreadyUsed: [], askedFrom, studentId: 's' }
}

function looks(shelf: { subject: string | null; unseen: boolean }): Looks {
  return {
    smallTalk,
    isPlea,
    subjectFor: () => shelf.subject,
    unseenOnShelf: () => shelf.unseen,
  }
}

async function sixRealTopicNames(): Promise<readonly string[]> {
  const subjects = await loadPlannedSubjects('10')
  const names = subjects.slice(0, 6).map((s) => s.chapters[0]?.concepts[0]?.name).filter((n): n is string => typeof n === 'string')
  expect(names.length).toBeGreaterThanOrEqual(4)
  return names
}

describe('the sufficiency gate', () => {
  it('small talk is answered by code, and the verdict says so', () => {
    for (const said of ['hi', 'thanks', 'ok']) {
      expect(smallTalk(said), `${said} is not small talk to the real table, fix this fixture`).not.toBeNull()
      const verdict = sufficientPath(aRequest(said), looks({ subject: null, unseen: false }))
      expect(verdict.path, said).toBe(0)
      expect(codeSuffices(verdict), said).toBe(true)
      expect(verdict.because.length).toBeGreaterThan(0)
    }
  })

  it('a phrasing already decided, with an unseen lesson on the shelf, is one SQLite row -- no model', async () => {
    for (const name of await sixRealTopicNames()) {
      const verdict = sufficientPath(aRequest(`what is ${name}`), looks({ subject: name, unseen: true }))
      expect(verdict.path, name).toBe(1)
      expect(codeSuffices(verdict), name).toBe(true)
    }
  })

  it('a phrasing already decided but nothing unseen left needs the writer, not the chooser', async () => {
    for (const name of await sixRealTopicNames()) {
      const verdict = sufficientPath(aRequest(`what is ${name}`), looks({ subject: name, unseen: false }))
      expect(verdict.path, name).toBe(2)
      expect(codeSuffices(verdict), name).toBe(false)
    }
  })

  it('inside a lesson, an answer goes to the in-lesson answerer -- no model', () => {
    for (const said of ['x = 2', '-2 and 2', 'because it makes it zero']) {
      expect(isPlea(said), `${said} reads as a plea to the real rule, fix this fixture`).toBe(false)
      const verdict = sufficientPath(aRequest(said, 'polynomials--zeros-of-a-polynomial'), looks({ subject: null, unseen: false }))
      expect(verdict.path, said).toBe(3)
      expect(codeSuffices(verdict), said).toBe(true)
    }
  })

  it('inside a lesson, a plea needs diagnosis and the writer', () => {
    for (const said of ['i still dont get why there are two', 'i dont understand', 'what is mass? i never learnt that']) {
      expect(isPlea(said), `${said} is not a plea to the real rule, fix this fixture`).toBe(true)
      const verdict = sufficientPath(aRequest(said, 'polynomials--zeros-of-a-polynomial'), looks({ subject: null, unseen: false }))
      expect(verdict.path, said).toBe(4)
      expect(codeSuffices(verdict), said).toBe(false)
    }
  })

  it('a fresh question nobody has decided is the reasoner s -- code never claims it is sufficient', async () => {
    for (const name of await sixRealTopicNames()) {
      const verdict = sufficientPath(aRequest(`what is ${name}`), looks({ subject: null, unseen: false }))
      expect(verdict.path, name).toBe(5)
      expect(codeSuffices(verdict), name).toBe(false)
    }
  })

  it('never says code suffices on the strength of a shelf it did not look at', () => {
    /* A look that throws is a shelf that is not there. The gate must not treat
       "could not look" as "nothing there" (Law D, one layer over): it says 5,
       and its reason says the look failed. */
    const broken: Looks = { smallTalk, isPlea, subjectFor: () => { throw new Error('the shelf is unreachable') }, unseenOnShelf: () => true }
    const verdict = sufficientPath(aRequest('what is a zero of a polynomial'), broken)
    expect(verdict.path).toBe(5)
    expect(verdict.because).toMatch(/unreachable/)
  })
})
