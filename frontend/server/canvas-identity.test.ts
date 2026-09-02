import { describe, expect, it } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from './handler.ts'
import { CLASS_LEVELS, EXAM_LEVELS, levelScope } from '../src/canvas/teach/level.ts'

/**
 * WHAT A TEACHING REQUEST SAYS ABOUT ITSELF, AND WHAT THE SERVER DOES WITH IT.
 *
 * MEASURED 2026-09-03: the browser posted `{question, alreadyUsed}` to
 * `/api/ask` and nothing else. The topic id and name `App.tsx` had already
 * resolved, and the student's class, never left the page. Two consequences
 * were live in the shipped product:
 *
 *   1. The web search ran on the RAW question. A Class 9 student and a JEE
 *      candidate asking "trigonometric ratios" were sent to the same pages,
 *      and the browser's own `scopedQuery` -- written for exactly this -- was
 *      only ever reached on the local-model path, which almost nobody is on.
 *   2. Nothing the lesson produced could be filed against the topic she was
 *      actually on, because the server was never told which one that was.
 *
 * These are about the SERVER's behaviour. The browser half is proven in
 * `src/canvas/CanvasRoute.test.tsx`.
 */

const A_TEST_SECRET = 'identity-secret-not-used-anywhere-real'

/** A real Class 10 maths topic, and the one that measurably broke the search. */
const A_REAL_QUESTION = 'trigonometric ratios'

const A_LESSON = {
  id: 'ratios', question: 'What is a sine?',
  technicalTerms: [{ term: 'ratio', introducedIn: 'says' }],
  blocks: [
    { id: 'says', kind: 'prose', emphasis: 'primary', tone: 'neutral', role: 'definition', depth: 'core',
      body: 'A sine is the ratio of the opposite side to the hypotenuse.', terms: [{ text: 'ratio', mark: 'key' }] },
    { id: 'shown', kind: 'table', emphasis: 'supporting', tone: 'neutral', role: 'framework', depth: 'core',
      columns: [{ key: 'side', label: 'Side', type: 'text' }, { key: 'name', label: 'Name', type: 'text' }],
      rows: [{ side: 'opposite', name: 'across from the angle' }, { side: 'hypotenuse', name: 'the long one' }] },
  ],
  relations: [{ kind: 'supports', from: 'says', to: 'shown' }],
  checkpoint: 'Which side is the hypotenuse, and how do you know?',
  next: [{ id: 'cos', label: 'What cosine measures' }, { id: 'why', label: 'Why the ratio never changes' }],
}

/** Records every query the server sends to the web, and the level it sends with it. */
function watchingSearch(): { port: SearchPort; queries: string[]; scopes: string[] } {
  const queries: string[] = []
  const scopes: string[] = []
  return {
    queries,
    scopes,
    port: {
      search: async (query: string, scope = '') => {
        queries.push(query)
        scopes.push(scope)
        return []
      },
    },
  }
}

const model: ModelPort = {
  lesson: async () => { throw new Error('the whole-lesson path is not under test here') },
  chat: async () => JSON.stringify(A_LESSON),
}

describe('the level she is working at reaches the web search', () => {
  /*
   * DRIVEN FROM THE REAL TABLES, NOT FROM ONE EXAMPLE I HAPPENED TO TRY.
   *
   * The first version of this asserted one class ("10") and one exam, with the
   * expected words typed out by hand. That proves the product agrees with me
   * about one row and says NOTHING about the other seven -- and a class added
   * to `CLASS_LEVELS` tomorrow would arrive unscoped with every test green.
   *
   * So the cases come from `CLASS_LEVELS` and `EXAM_LEVELS` themselves. Every
   * class the product knows, and every exam, is asked for; a new row is
   * covered the day it is added, and a row whose wording changes does not
   * break anything, because nothing here retypes that wording.
   */

  for (const classId of Object.keys(CLASS_LEVELS)) {
    it(`scopes a class ${classId} student's search to class ${classId}`, async () => {
      const { port, queries, scopes } = watchingSearch()
      const handle = createHandler({ model, search: port, identitySecret: A_TEST_SECRET })
      await handle({
        method: 'POST', path: '/api/ask',
        body: { question: A_REAL_QUESTION, topicId: 'a-topic', classId },
      })
      expect(queries.length, 'the server never searched at all').toBeGreaterThan(0)
      expect(scopes, `the class was known and the search was never told`).toContain(levelScope(null, classId))
      /* THE LEVEL GOES BESIDE THE QUESTION, NEVER INSIDE IT. Glued on, its own
         words are read as part of the subject: measured live 2026-09-03, a
         Class 10 photosynthesis search came back with "Bantu languages" and
         Harvard's "Language" page, both honest matches for "simple language". */
      expect(queries, 'the level was glued onto the question and became part of the subject')
        .toEqual([A_REAL_QUESTION])
    })
  }

  for (const examId of Object.keys(EXAM_LEVELS)) {
    it(`scopes a ${examId} candidate's search by what that exam MEANS`, async () => {
      /* By what it means, never by its name. `EXAM_LEVELS` says why: "JEE Main"
         as a query returns syllabus PDFs, coaching adverts and cutoffs, and
         none of those teach anybody anything. */
      const { port, queries, scopes } = watchingSearch()
      const handle = createHandler({ model, search: port, identitySecret: A_TEST_SECRET })
      await handle({
        method: 'POST', path: '/api/ask',
        body: { question: A_REAL_QUESTION, topicId: 'a-topic', examId },
      })
      expect(scopes, `the exam was known and the search was not told`).toContain(levelScope(examId, null))
      expect(queries, 'the exam scope was glued onto the question').toEqual([A_REAL_QUESTION])
      const examName = examId.split('-')[0]!
      expect(scopes.join(' ').toLowerCase(), `the exam's own name "${examName}" was sent as the scope`)
        .not.toContain(examName.toLowerCase())
    })
  }

  it('scopes by both when she is in a class AND sitting an exam', async () => {
    const classId = Object.keys(CLASS_LEVELS)[0]!
    const examId = Object.keys(EXAM_LEVELS)[0]!
    const { port, queries, scopes } = watchingSearch()
    const handle = createHandler({ model, search: port, identitySecret: A_TEST_SECRET })
    await handle({ method: 'POST', path: '/api/ask', body: { question: A_REAL_QUESTION, classId, examId } })
    expect(scopes).toContain(levelScope(examId, classId))
    expect(queries).toEqual([A_REAL_QUESTION])
  })

  it('searches the bare question when it is told nothing, rather than guessing a level', async () => {
    const { port, queries, scopes } = watchingSearch()
    const handle = createHandler({ model, search: port, identitySecret: A_TEST_SECRET })
    await handle({ method: 'POST', path: '/api/ask', body: { question: A_REAL_QUESTION } })
    expect(queries).toEqual([A_REAL_QUESTION])
    expect(scopes, 'a level was invented for a student who named none').toEqual([''])
  })

  it('searches the bare question for a class or exam it has never heard of', async () => {
    /* A stale id in a browser's storage, or one from a newer build. It must
       never be able to stop a lesson, and it must never be pasted into the
       query as if it meant something. */
    const { port, queries, scopes } = watchingSearch()
    const handle = createHandler({ model, search: port, identitySecret: A_TEST_SECRET })
    await handle({
      method: 'POST', path: '/api/ask',
      body: { question: A_REAL_QUESTION, classId: 'class-from-the-future', examId: 'no-such-exam-2099' },
    })
    expect(queries).toEqual([A_REAL_QUESTION])
    expect(scopes, 'an unknown id was pasted into the scope as if it meant something').toEqual([''])
  })
})
