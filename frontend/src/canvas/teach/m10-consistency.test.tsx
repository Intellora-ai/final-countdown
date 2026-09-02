// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { billBecomesLaw } from '../lessons/billBecomesLaw'
import { classifierEvaluation } from '../lessons/classifierEvaluation'
import {
  ANSWER_LOST,
  TEACH_STORAGE_KEY,
  loadTeachProgress,
  resetTeachProgress,
  useTeachStore,
} from './teachStore'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'
import { deriveBeats } from './beats'
import { TeachView } from './TeachView'

/**
 * M10 — CANVAS CONSISTENCY.
 *
 * THE SPEC, VERBATIM
 * ------------------
 *   "what's seen matches saved state; no lost answers; no duplicate questions."
 *
 * Three promises to a child who is halfway through a lesson. Each is a
 * different way of breaking the same trust. What IS measured, in this session
 * and recorded below, is that each of them can be broken by a one-line change
 * to this repository's own code without any other test noticing:
 *
 *   1. WHAT IS SEEN MATCHES WHAT IS SAVED. The screen after a refresh is the
 *      screen before it — same questions, same answers, same order, same beat.
 *      A restore that comes back "close enough" is worse than one that comes
 *      back empty, because the learner cannot tell which half is missing.
 *   2. NO LOST ANSWERS. Anything they typed, and anything they were told, is
 *      still there. A question that was in flight when the tab died is the hard
 *      case: it may not vanish, and it may not come back wearing an invented
 *      answer.
 *   3. NO DUPLICATE QUESTIONS. One thing the learner did is one thing on the
 *      screen. Two clicks are one question. A refresh mid-flight is one
 *      question. A child who sees their question twice concludes the app is
 *      broken, or worse, that they asked twice and were ignored twice.
 *
 * WHY THIS FILE EXISTS BESIDE `TeachView.test.tsx` AND DOES NOT REPEAT IT
 * ----------------------------------------------------------------------
 * That file proves the round trip happens AT ALL — a draft comes back, a
 * conversation comes back, storage failing does not blank the page. Every one
 * of its restore assertions is about ONE remembered thing at a time, and every
 * one of them uses ONE fixed lesson and ONE fixed question.
 *
 * That is exactly the shape of test a partial restore survives. A restore that
 * brought back the questions and dropped their order, or brought back two
 * questions as one, or brought back the right conversation attached to the
 * wrong beat, passes every assertion over there. So this file asserts the WHOLE
 * screen as a comparable value — the questions in document order, the answers
 * in document order, the blocks in document order, the checkpoint — and
 * compares it across the reload rather than probing it one field at a time.
 *
 * NOTHING IS HARDCODED TO ONE INPUT
 * ---------------------------------
 * Every guarantee below is exercised over a LIST: several lesson ids, several
 * questions, several drafts. A guarantee proven with one string is a guarantee
 * about that string. Two genuinely different lessons are used — machine
 * learning (five beats, figures) and civics (three beats, a process flow) — so
 * "it works" cannot mean "it works on the fixture the code was written
 * against".
 *
 * WHAT A RELOAD IS HERE
 * ---------------------
 * `closeTab()` below. Unmounting and re-rendering proves nothing: the zustand
 * store is module level and still holds the values in memory, so the second
 * mount restores out of RAM with `localStorage` never touched. `closeTab`
 * snapshots what is on disk, drops the in-memory copy, writes the snapshot
 * back, and rehydrates — the write-back is not ceremony, because `persist`
 * writes on every `setState` and clearing the store in order to test the
 * restore persists the cleared value over the very thing under test. That trap
 * is recorded in `TeachView.test.tsx` as measured, and the same shape is used
 * here for the same reason.
 *
 * HOW STORAGE IS CLEANED BETWEEN TESTS — stated, because a shared key makes
 * this the difference between a real pass and a lucky one:
 *   - a FRESH in-memory `Storage` is installed on `window` in `beforeEach`, so
 *     no bytes at all survive from the previous test;
 *   - `resetTeachProgress()` runs in `afterEach`, which clears the in-memory
 *     zustand copy AND resets `teachStore`'s module-level `writable` latch — a
 *     quota test that left writing switched off would otherwise silently make
 *     every later test's save a no-op, and they would fail for a reason that
 *     has nothing to do with what they assert;
 *   - `window.localStorage` is deleted in `afterEach`, so a test that forgot to
 *     install one meets the environment's real absence rather than the previous
 *     test's leftovers;
 *   - `cleanup()` unmounts, so no component survives to write during the next
 *     test's setup.
 *
 * THIS SUITE PASSED ON ITS FIRST RUN, WHICH IS A SMELL AND IS SAID PLAINLY
 * ------------------------------------------------------------------------
 * The product was already built, so there was no red to watch. A suite written
 * after the code verifies what was built rather than what should have been, and
 * it cannot be trusted on a green run alone. So every rule below was attacked
 * with a mutant — the product broken on purpose, this file re-run, the product
 * restored and its checksum checked. Eleven mutants, all killed:
 *
 *   teachStore.ts:207   drop the lesson-id check ................ 4 tests died
 *   teachStore.ts:213   leave a pending record as it was ........ 6 tests died
 *   teachStore.ts:212   hand the history back reversed .......... 7 tests died
 *   teachStore.ts:129   let a failed write reach the caller ..... 3 tests died
 *   TeachView.tsx:357   drop the in-flight guard ................ 4 tests died
 *   TeachView.tsx:149   reopen at beat one ..................... 36 tests died
 *   TeachView.tsx:150   forget the restored questions .......... 24 tests died
 *   TeachView.tsx:151   forget the restored draft ............... 8 tests died
 *   TeachView.tsx:384   reuse a record's identity (`at = 0`) .... 6 tests died
 *   TeachView.tsx:390   overwrite the history instead of adding  10 tests died
 *   TeachView.tsx:399   land an answer on every record .......... 6 tests died
 *
 * TWO OF THOSE MUTANTS SURVIVED THE FIRST DRAFT, and the tests were made harder
 * rather than the finding being dropped. Both are recorded at the test that now
 * kills them: the reversed history survived because every question had been
 * asked on a DIFFERENT beat, and the in-flight guard survived because a double
 * Enter is already covered by an unrelated accident. Neither was visible from a
 * green run.
 *
 * MEASURED, and it is why the storage harness exists at all: jsdom here exposes
 * NO `window.localStorage`. Without installing one, every assertion below would
 * exercise the "storage missing" branch while appearing to prove a round trip.
 * The first test in this file asserts the harness itself, because a suite that
 * proved nothing looks identical to a suite that found nothing.
 */

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

function inMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => {
      entries.set(name, String(value))
    },
    removeItem: (name: string) => {
      entries.delete(name)
    },
    clear: () => {
      entries.clear()
    },
  } as Storage
}

/*
 * ELEMENTS ARE GIVEN A SIZE, AND IT IS NOT A CLAIM ABOUT LAYOUT.
 *
 * jsdom performs no layout, so every element reports a width and height of
 * zero. echarts reads those to size a chart, and the `decisionFlow` the civics
 * lesson uses -- which no other test in this directory renders -- builds a roam
 * coordinate system from them. At zero it produces a null transform and throws
 * ASYNCHRONOUSLY, after the test that caused it has already finished.
 *
 * MEASURED: one or two `Unhandled Rejection ... zrender/lib/core/matrix.js` per
 * run of `src/canvas` with this file present, zero without it, and never a
 * failing assertion. Vitest's own words for that state are "This might cause
 * false positive tests", and a green that might not be a green is worse than a
 * red. So the library is given the numbers it asks for.
 *
 * NOTHING HERE READS A DIMENSION. Every assertion in this file is about what is
 * in the document and in what order -- the questions jsdom answers honestly.
 * This exists so a chart library can finish its own setup instead of dying
 * halfway through it, not so a test can claim to know where anything sits.
 */
const SIZED = { configurable: true, value: 640 }
const originalRect = HTMLElement.prototype.getBoundingClientRect

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', SIZED)
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', SIZED)
  HTMLElement.prototype.getBoundingClientRect = function rect(): DOMRect {
    return { x: 0, y: 0, width: 640, height: 640, top: 0, left: 0, right: 640, bottom: 640, toJSON: () => ({}) } as DOMRect
  }
})

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

let storage: Storage

beforeEach(() => {
  storage = inMemoryStorage()
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
})

afterEach(() => {
  cleanup()
  /* Clears the in-memory record AND re-arms `teachStore`'s `writable` latch
     (`teachStore.ts:234`), which the quota tests deliberately switch off. */
  resetTeachProgress()
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'localStorage')
})

/** The machine-learning lesson, optionally re-badged with another id. Ids are
 *  varied rather than fixed because the storage key is SHARED between lessons
 *  and the id is the only thing keeping them apart. */
function ml(id?: string): Lesson {
  const result = validateLesson(classifierEvaluation)
  if (!result.ok) throw new Error(`the ML fixture does not validate: ${JSON.stringify(result.issues)}`)
  return id === undefined ? result.lesson : { ...result.lesson, id }
}

/** A second, genuinely different lesson: civics, three beats, no figures in
 *  common with the first. Proves a guarantee about the FEATURE and not about
 *  the fixture the feature was written against. */
function civics(id?: string): Lesson {
  const result = validateLesson(billBecomesLaw)
  if (!result.ok) throw new Error(`the civics fixture does not validate: ${JSON.stringify(result.issues)}`)
  return id === undefined ? result.lesson : { ...result.lesson, id }
}

/**
 * Let the lazily imported shape renderers settle.
 *
 * `FigureView` reaches its shapes through `React.lazy`, so a bare `render` sees
 * "Loading process…" and the real tree arrives a tick later — outside `act`,
 * which React reports as a warning and which would let an assertion about
 * missing content pass for entirely the wrong reason.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

interface Props {
  ask?: (question: string) => Promise<{ ok?: boolean; text?: string; reason?: string }>
  onStruggling?: () => void
}

async function open(lesson: Lesson, props: Props = {}) {
  const view = render(<TeachView lesson={lesson} mode="2d" {...props} />)
  await settle()
  return view
}

function field(): HTMLInputElement {
  return screen.getByLabelText('Answer the question, or ask one of your own') as HTMLInputElement
}

function type(text: string): void {
  fireEvent.change(field(), { target: { value: text } })
}

/** Submit the way Enter does. jsdom performs no implicit submission, so the
 *  form's submit event is raised directly — this is the keyboard path. */
function send(text: string): void {
  type(text)
  fireEvent.submit(field().closest('form') as HTMLFormElement)
}

async function sendAndSettle(text: string): Promise<void> {
  send(text)
  await settle()
}

/** Type once, then raise submit twice with nothing awaited between them, which
 *  is what two fast keypresses are. */
function sendTwiceFast(text: string): void {
  type(text)
  const form = field().closest('form') as HTMLFormElement
  fireEvent.submit(form)
  fireEvent.submit(form)
}

/** Two clicks on Send, the mouse version of the same accident. */
function clickSendTwice(text: string): void {
  type(text)
  const button = screen.getByRole('button', { name: 'Send' })
  fireEvent.click(button)
  fireEvent.click(button)
}

/**
 * Close the tab and open it again.
 *
 * The snapshot-and-write-back around the in-memory clear is load-bearing:
 * `persist` writes on every `setState`, so clearing the store to prove a value
 * comes back from storage would persist the cleared value first and erase the
 * thing under test.
 */
async function closeTab(): Promise<void> {
  const onDisk = storage.getItem(TEACH_STORAGE_KEY)
  cleanup()
  useTeachStore.setState({ byLesson: {} })
  if (onDisk !== null) storage.setItem(TEACH_STORAGE_KEY, onDisk)
  await useTeachStore.persist?.rehydrate()
}

async function reopen(lesson: Lesson, props: Props = {}) {
  await closeTab()
  return open(lesson, props)
}

/* -------------------------------------------------------------------------- */
/* Reading the screen                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every question on the screen, in the order a reader meets them.
 *
 * TWO SHAPES, ONE LIST, AND THAT IS THE WHOLE POINT. A question the LESSON
 * answered renders through `<Answer>` (`.lc-teach__answer-asked` holds the bare
 * text); a question answered by the model, still pending, or restored as lost
 * renders through the prose branch (`.lc-teach__asked`, holding
 * `You asked: "..."`). A test that read only one of them would call an entry
 * that changed shape "lost" and an entry that appeared in both "duplicated".
 *
 * `querySelectorAll` returns DOCUMENT ORDER, which is reading order: answers
 * sit under the beat they were asked about, and beats render oldest first. So
 * this list IS "same questions, same order".
 */
function transcript(root: ParentNode): string[] {
  return [...root.querySelectorAll('.lc-teach__asked, .lc-teach__answer-asked')].map((node) => {
    const text = node.textContent ?? ''
    if (node.classList.contains('lc-teach__answer-asked')) return text
    const quoted = /“([\s\S]*?)”/.exec(text)
    return quoted === null ? text : (quoted[1] ?? text)
  })
}

/** The checkpoint the learner is standing at — which beat is current. */
function checkpoint(root: ParentNode): string {
  return root.querySelector('.lc-teach__question')?.textContent ?? ''
}

/**
 * A comparable value for "what is on screen".
 *
 * `blocks` is every rendered block's kind in document order — lesson blocks and
 * the blocks drawn inside an answer alike. It is what makes "same place in the
 * lesson" and "the answers are still drawn" a single equality rather than four
 * hopeful `queryByText` calls: reveal one beat fewer and the list shortens;
 * lose an answer's figure and it shortens; reorder anything and it reorders.
 */
function seen(root: ParentNode): { checkpoint: string; questions: string[]; blocks: string[] } {
  return {
    checkpoint: checkpoint(root),
    questions: transcript(root),
    blocks: [...root.querySelectorAll('.lc-block')].map(
      (node) => node.getAttribute('data-kind') ?? '?',
    ),
  }
}

/** How many entries on screen carry this exact question text. The duplicate
 *  detector: one thing the learner did is one thing on the screen. */
function entriesFor(root: ParentNode, question: string): number {
  return transcript(root).filter((asked) => asked === question).length
}

/**
 * Two block titles from one lesson: one the first beat shows, one only a later
 * beat shows. Read off `deriveBeats`, never written down here.
 *
 * WHY THIS IS DERIVED, MEASURED 2026-09-01.
 *
 * The three "refuses X's conversation to Y" cases below pinned two literal
 * strings -- "Reported accuracy" present, "What the data actually contains"
 * absent -- and both were correct on the day they were written. Then
 * `7b608488 merge: bring 115 commits of main into codex` brought in the beats
 * "complete idea" rule from the other branch, which recut `classifierEvaluation`:
 *
 *     before   [headline] [imbalance] [confusion roc] ...
 *     after    [what-accuracy-is headline imbalance] [confusion roc] ...
 *
 * `imbalance` IS the first beat now, so a lesson opening correctly at its own
 * first beat legitimately shows "What the data actually contains", and the
 * assertion demanding its absence failed the product for being right. Measured
 * before changing anything: the switched-to lesson's `seen()` is byte-identical
 * to a pristine first open of that same lesson, and `loadTeachProgress` for it
 * returns null -- so nothing leaks, and the leak the test hunts is not there.
 *
 * The property the test is FOR is unchanged and is what these two labels still
 * check: the lesson opened at its OWN first beat rather than carrying the
 * previous lesson's position. Deriving them means the next change to the beat
 * rule recuts the expectation with the product instead of failing it.
 *
 * It THROWS rather than skipping when a lesson has only one beat. A lesson that
 * cannot distinguish "first beat" from "a later beat" cannot support this
 * check, and a silently skipped case is a case that cannot fail.
 */
function labelsAcrossTheBeatCut(lesson: Lesson): { atFirstBeat: string; onlyLater: string } {
  const beats = deriveBeats(lesson)
  const titleOf = (id: string): string | undefined =>
    lesson.blocks.find((block) => block.id === id)?.title

  const firstBeatTitles = (beats[0]?.blockIds ?? []).map(titleOf).filter((t) => t !== undefined)
  const atFirstBeat = firstBeatTitles[0]
  const onlyLater = beats
    .slice(1)
    .flatMap((beat) => beat.blockIds)
    .map(titleOf)
    .find((title) => title !== undefined && !firstBeatTitles.includes(title))

  if (atFirstBeat === undefined || onlyLater === undefined) {
    throw new Error(
      `labelsAcrossTheBeatCut: "${lesson.id}" cuts into ${beats.length} beat(s) and does not offer ` +
        'both a titled block in the first beat and a differently-titled one after it. ' +
        'This case cannot prove where the lesson opened. That is a bug in this test data, ' +
        'not in the product.',
    )
  }
  return { atFirstBeat, onlyLater }
}

/* -------------------------------------------------------------------------- */
/* What a learner types                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pick from a fixed list, wrapping round the end.
 *
 * `ANSWERS[i % ANSWERS.length]` is obviously in range to a reader and NOT to
 * TypeScript, which cannot narrow a COMPUTED index even on a tuple. Measured:
 * `as const` on the four data lists closed 42 of 43 `noUncheckedIndexedAccess`
 * errors and left exactly this one.
 *
 * A `!` would silence it by promising, and that promise breaks on the one edit
 * that matters -- emptying the list. `undefined` would then travel into
 * `sendAndSettle` and fail somewhere else, reading as a product bug. This
 * throws AT the mistake and says whose fault it is.
 */
function nthWrapping<T>(list: readonly T[], index: number): T {
  const picked = list[index % list.length]
  if (picked === undefined) {
    throw new Error(
      `nthWrapping: nothing at ${index % list.length} of ${list.length}. ` +
        'The test data list is empty. That is a bug in this test, not in the product.',
    )
  }
  return picked
}

/**
 * Plain statements. None begins with an interrogative and none carries a
 * question mark, so `classifyTurn` (`turn.ts:35`) reads each as an ANSWER and
 * the beat advances.
 */
const ANSWERS = [
  'the model flags too many innocent transactions',
  'it scores well by always guessing the common class',
  'that number hides the rare cases entirely',
] as const

/**
 * Questions no lesson here can answer out of its own blocks, so each escalates
 * past the resolver chain to the `ask` port under this test's control. Every
 * one opens with an interrogative word, so `classifyTurn` reads it as a
 * QUESTION and it never advances the beat.
 *
 * Deliberately about five unrelated subjects. A duplicate-detection test run
 * over five near-identical strings is a test about string similarity.
 */
const OFF_LESSON = [
  'who first wrote down the central limit theorem',
  'when did the first telegraph cable cross the atlantic',
  'where does the river danube begin',
  'which planet has the shortest day',
  'how deep is the mariana trench',
] as const

/** Questions the MACHINE-LEARNING lesson answers out of its own blocks, so
 *  they come back as a structured resolution and render through `<Answer>`.
 *  Both shapes of entry are exercised, never just the easy one. */
const ON_LESSON_ML = ['what is precision recall', 'what is feature importance'] as const

/** Half-written sentences a learner would be furious to lose. Varied on
 *  purpose: one is an ordinary answer in progress, one would classify as a
 *  QUESTION if it were ever submitted, one is a single character, one carries
 *  punctuation and an accent. */
const DRAFTS = [
  'the model flags too many innoc',
  'why does the accuracy number',
  'i',
  "it's the rare class — surely? no",
] as const

/** A model that always answers, with the question echoed back so an answer can
 *  be told from every other answer on the page. */
function answersEverything(): (question: string) => Promise<{ ok: boolean; text: string }> {
  return async (question: string) => ({ ok: true, text: `The short answer to ${question} is yes.` })
}

const modelAnswerFor = (question: string): string => `The short answer to ${question} is yes.`

/** An `ask` port that never settles until told to, so the in-flight window is a
 *  fact under the test's control rather than a race with a timer. */
function deferredAsk() {
  const waiting: Array<() => void> = []
  let calls = 0
  const ask = (question: string) =>
    new Promise<{ ok: boolean; text: string }>((resolve) => {
      calls += 1
      waiting.push(() => resolve({ ok: true, text: modelAnswerFor(question) }))
    })
  return {
    ask,
    get calls() {
      return calls
    },
    async releaseAll(): Promise<void> {
      waiting.splice(0).forEach((go) => go())
      await settle()
    },
  }
}

/** Sent and never answered — the shape of closing the tab while the model is
 *  still thinking. */
const stalledAsk = () => new Promise<{ ok: boolean; text: string }>(() => {})

/* -------------------------------------------------------------------------- */
/* The harness itself                                                         */
/* -------------------------------------------------------------------------- */

describe('the harness is not vacuous', () => {
  it('runs against a storage this environment does not otherwise provide', () => {
    /* Every test below is a claim about a round trip, and all of them would
       pass against a storage that silently dropped everything. */
    window.localStorage.setItem('probe', 'kept')
    expect(window.localStorage.getItem('probe'), 'the test storage does not store').toBe('kept')
  })

  it('reads the screen in a way that can tell two entries from one', () => {
    /* The detector, detected. `transcript` and `entriesFor` are what every
       duplicate assertion in this file rests on; a reader that always returned
       one entry would make all of them vacuous. */
    const page = document.createElement('div')
    page.innerHTML = [
      '<p class="lc-teach__asked">You asked: “where does the river danube begin”. Working on it…</p>',
      '<p class="lc-teach__answer-asked">what is precision recall</p>',
      '<p class="lc-teach__asked">You asked: “where does the river danube begin”</p>',
    ].join('')

    expect(transcript(page)).toEqual([
      'where does the river danube begin',
      'what is precision recall',
      'where does the river danube begin',
    ])
    expect(entriesFor(page, 'where does the river danube begin')).toBe(2)
    expect(entriesFor(page, 'what is precision recall')).toBe(1)
    expect(entriesFor(page, 'a question nobody asked')).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 1-3. What is seen matches what is saved                                    */
/* -------------------------------------------------------------------------- */

describe("what's seen matches saved state", () => {
  /**
   * SPEC 1. The screen after a reload is the screen before it.
   *
   * Not "the draft came back" and not "a question came back" — the WHOLE
   * comparable screen: the questions in reading order, the answers still drawn
   * as blocks in reading order, and the checkpoint that says which beat the
   * learner is standing at.
   *
   * The scenario is built so a partial restore cannot hide. Two beats are
   * walked, so `revealed` is not its default. A question is asked on the FIRST
   * beat and another on the SECOND, so an `asked` list that came back grouped
   * by beat, sorted, deduplicated or reversed changes the value. One question
   * is answered by the lesson and one by the model, so the two record shapes —
   * `resolution` and `prose` — both have to survive being written to storage
   * and read back.
   *
   * Run over three different lesson ids because the id is the only thing that
   * decides whether a saved record is handed back at all
   * (`teachStore.ts:207`).
   */
  for (const lessonId of ['classifier-evaluation', 'a-lesson-with-a-very-long-id-1234567890', 'x']) {
    it(`brings the whole screen back, question for question and in order (${lessonId})`, async () => {
      const lesson = ml(lessonId)
      const { container } = await open(lesson, { ask: answersEverything() })

      /* TWO QUESTIONS ON THE FIRST BEAT, THEN ONE ON THE SECOND, and the pair on
         one beat is not decoration. Answers are grouped by the beat they were
         asked about (`TeachView.tsx:518`), so questions spread one-per-beat come
         out in beat order however badly the saved list is ordered. MEASURED: a
         mutant that reversed `asked` on restore (`teachStore.ts:212`) survived
         this test until the two same-beat questions were added, and dies now.
         Ordering within a beat is the only place the SAVED order is visible. */
      await sendAndSettle(ON_LESSON_ML[0])
      await sendAndSettle(OFF_LESSON[0])
      await sendAndSettle(ANSWERS[0])
      await sendAndSettle(OFF_LESSON[1])

      const before = seen(container)
      /* Guards against a vacuous pass: an empty screen matches an empty screen
         perfectly. */
      expect(before.questions, 'nothing was asked before the reload').toEqual([
        ON_LESSON_ML[0],
        OFF_LESSON[0],
        OFF_LESSON[1],
      ])
      expect(before.blocks.length, 'no blocks were on screen before the reload').toBeGreaterThan(2)

      const reopened = await reopen(lesson, { ask: answersEverything() })

      expect(
        seen(reopened.container),
        'the screen after the reload is not the screen before it',
      ).toEqual(before)
      /* And the answers themselves, by their own words — a record whose
         `resolution` did not survive the round trip falls through to the prose
         branch, which keeps the question and loses the answer. */
      expect(
        screen.queryByText(/To catch half the fraud you accept that two in three flagged/),
        "the lesson's own answer was dropped on reload",
      ).not.toBeNull()
      expect(
        screen.queryByText(modelAnswerFor(OFF_LESSON[0]), { exact: false }),
        "the model's answer was dropped on reload",
      ).not.toBeNull()
    })
  }

  it('brings the whole screen back for a completely different lesson too', async () => {
    /* The pair for the fixture, not for the guarantee. Civics has three beats,
       a process flow and no metric, so a restore that quietly depended on the
       machine-learning lesson's shape fails here and nowhere else. */
    const lesson = civics()
    const { container } = await open(lesson, { ask: answersEverything() })

    await sendAndSettle(OFF_LESSON[1])
    await sendAndSettle(OFF_LESSON[2])
    await sendAndSettle(ANSWERS[1])
    await sendAndSettle(OFF_LESSON[3])

    const before = seen(container)
    expect(before.questions).toEqual([OFF_LESSON[1], OFF_LESSON[2], OFF_LESSON[3]])

    const reopened = await reopen(lesson, { ask: answersEverything() })
    expect(seen(reopened.container), 'the civics lesson came back different').toEqual(before)
  })

  /**
   * SPEC 2. A save that cannot be written costs the restore and NOTHING else.
   *
   * A full quota and a private-mode profile are the same event from the
   * learner's side: `setItem` throws. `guardedStorage`
   * (`teachStore.ts:125-136`) catches it and switches writing off for the
   * session. What must be true on screen is that the child never finds out:
   * the lesson keeps teaching, the answer they were given stays, the words
   * they were typing stay, and no error reaches them.
   *
   * NOT VACUOUS, and this is the half that is easy to get wrong: "survives
   * broken storage" is satisfied completely by never persisting anything at
   * all. It is worth something only beside the tests above, which demand that
   * a normal session DOES come back. Both halves, or neither.
   */
  for (const [why, failure] of [
    ['a full quota', new DOMException('quota exceeded', 'QuotaExceededError')],
    ['a private-mode profile', new DOMException('access denied', 'SecurityError')],
  ] as const) {
    it(`keeps the screen intact when the save throws (${why}), and never shows the learner an error`, async () => {
      const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw failure
      })
      try {
        const { container } = await open(ml(), { ask: answersEverything() })

        await sendAndSettle(OFF_LESSON[3])
        await sendAndSettle(ANSWERS[0])
        type(DRAFTS[0])
        await settle()

        expect(write, 'the view never even tried to save, so this proves nothing').toHaveBeenCalled()

        /* The lesson advanced, the question is still attributed, the answer is
           still under it, and the half-typed sentence is still in the box. */
        expect(
          screen.queryByText('What the data actually contains'),
          'a full disk stopped the lesson being taught',
        ).not.toBeNull()
        expect(transcript(container), 'a failed save wiped the conversation off the screen').toEqual([
          OFF_LESSON[3],
        ])
        expect(container.textContent).toContain(modelAnswerFor(OFF_LESSON[3]))
        expect(field().value, 'a failed save wiped the box the learner was typing in').toBe(DRAFTS[0])

        /* And nothing that looks like a crash reached the page. The canvas has
           exactly one way of telling a learner it gave up, and it is not on. */
        /* Narrow on purpose: the lesson's OWN words include "errors", and a
           pattern wide enough to catch that would be a test about the fixture's
           English. These four are the exact strings the failure carries. */
        expect(container.textContent).not.toMatch(
          /QuotaExceededError|SecurityError|quota exceeded|access denied/i,
        )
        expect(container.querySelector('.lc-teach__input'), 'the box was gone').not.toBeNull()
      } finally {
        write.mockRestore()
      }
    })
  }

  it('loses the restore, and only the restore, when the save throws', async () => {
    /* The other side of the same event, and the reason the test above is not
       satisfied by a component that simply never saves: the write really did
       fail, so there really is nothing to come back to. Asserted so that a
       future "we caught the error and carried on" cannot quietly mean "we
       never tried". */
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    let onDisk: string | null
    try {
      await open(ml(), { ask: answersEverything() })
      await sendAndSettle(OFF_LESSON[3])
      onDisk = storage.getItem(TEACH_STORAGE_KEY)
    } finally {
      write.mockRestore()
    }

    expect(onDisk, 'the write did not actually fail, so this scenario never happened').toBeNull()

    const reopened = await reopen(ml())
    expect(
      transcript(reopened.container),
      'a conversation came back from a save that never landed',
    ).toEqual([])
    expect(
      screen.queryByText('Reported accuracy'),
      'the lesson did not reopen at all after a failed save',
    ).not.toBeNull()
  })

  /**
   * SPEC 3. Opening a DIFFERENT lesson never shows the previous one's
   * conversation.
   *
   * The storage key is SHARED — one record, for whichever lesson was last open
   * (`teachStore.ts:44`). The id on the record is the only thing standing
   * between a child opening civics and being shown a machine-learning
   * conversation attached to a bill in Parliament.
   *
   * PAIRED, and the pair is the whole test. "Never restore anything" passes the
   * refusal half perfectly and destroys the feature, so each pair below proves
   * the SAME saved session comes back for its own lesson and is refused for the
   * other one.
   */
  for (const [first, second] of [
    ['classifier-evaluation', 'bill-becomes-law'],
    ['lesson-a', 'lesson-b'],
    ['same-lesson-almost', 'same-lesson-almost-2'],
  ]) {
    it(`refuses ${first}'s conversation to ${second}, and gives it back to ${first}`, async () => {
      const { container } = await open(ml(first), { ask: answersEverything() })
      await sendAndSettle(OFF_LESSON[4])
      await sendAndSettle(ANSWERS[2])
      type(DRAFTS[1])
      await settle()
      const before = seen(container)
      expect(before.questions, 'nothing was saved, so neither half proves anything').toEqual([
        OFF_LESSON[4],
      ])

      /* Half one: its own lesson gets it back. */
      const same = await reopen(ml(first), { ask: answersEverything() })
      expect(seen(same.container), 'the lesson did not get its own session back').toEqual(before)
      expect(field().value).toBe(DRAFTS[1])

      /* Half two: a different lesson gets nothing. */
      const other = await reopen(ml(second), { ask: answersEverything() })
      expect(
        transcript(other.container),
        "another lesson's conversation was shown against this one",
      ).toEqual([])
      expect(field().value, "another lesson's draft was restored into this one").toBe('')
      const cut = labelsAcrossTheBeatCut(ml(second))
      expect(
        screen.queryByText(cut.atFirstBeat),
        'the different lesson did not open at its first beat',
      ).not.toBeNull()
      expect(
        screen.queryByText(cut.onlyLater),
        "the different lesson opened at the previous lesson's beat",
      ).toBeNull()
    })
  }

  /**
   * THE SWITCH THAT HAPPENS WITHOUT A REMOUNT, WHICH NOTHING COVERED.
   *
   * Every case above changes lesson through `reopen`, and `reopen` calls
   * `closeTab`, which unmounts. That is the reload path. It is NOT the path a
   * learner takes when the lesson changes under a mounted view, and the two run
   * different code: a remount re-runs the `useState` initialisers, while an
   * in-place change is caught only by the `taught`-ref branch at
   * `TeachView.tsx:213-227`, which resets `revealed`, `asked`, `draft` and the
   * counters by hand.
   *
   * MEASURED 2026-09-01, and this is why the test exists. Deleting
   * `setRevealed(next?.revealed ?? 1)` from that branch — so a switched-to
   * lesson keeps the previous lesson's beat, the exact defect line 738 above is
   * written against — left the whole of `src/canvas/teach` green: 26 files, 453
   * tests, no new failures. `grep -rn "rerender" src` returned nothing. The
   * branch was reachable and unguarded.
   *
   * It is reachable in production, not only in theory. `CanvasRoute.tsx:590`
   * passes `key={chosen.id}`, which forces a remount and is safe. But
   * `LearnView.tsx:176` renders `<TeachView lesson={deeper} …>` with no key,
   * and `AskView.tsx:99` does the same — so on those routes a new lesson
   * arrives as a prop change into a live component.
   */
  it('switching the lesson in place, with no remount, opens the new one at its own first beat', async () => {
    const from = ml('switched-away-from')
    const to = ml('switched-into')

    const view = await open(from, { ask: answersEverything() })
    const atFirstBeat = seen(view.container)

    /* A statement, not a question: `classifyTurn` reads it as an ANSWER and the
       beat advances. Asserted rather than assumed — if the lesson never moved,
       the switch below would be proving nothing. */
    await sendAndSettle(ANSWERS[0])
    const advanced = seen(view.container)
    expect(
      advanced.blocks.length,
      'the first lesson never advanced a beat, so this case cannot prove a beat is reset',
    ).toBeGreaterThan(atFirstBeat.blocks.length)

    /* THE SWITCH. Same component instance, new lesson prop, no unmount and no
       storage round trip. */
    view.rerender(<TeachView lesson={to} mode="2d" ask={answersEverything()} />)
    await settle()

    const cut = labelsAcrossTheBeatCut(to)
    expect(
      screen.queryByText(cut.atFirstBeat),
      'the switched-into lesson did not open at its first beat',
    ).not.toBeNull()
    expect(
      screen.queryByText(cut.onlyLater),
      "the switched-into lesson kept the previous lesson's beat",
    ).toBeNull()
    expect(
      transcript(view.container),
      "the previous lesson's conversation survived the switch",
    ).toEqual([])
    expect(field().value, "the previous lesson's draft survived the switch").toBe('')
  })

  it('refuses the machine-learning conversation to the civics lesson', async () => {
    /* The same rule where the two lessons are genuinely different documents and
       not one document under two names — the case a real learner meets when
       they close one lesson and open another. */
    await open(ml(), { ask: answersEverything() })
    await sendAndSettle(OFF_LESSON[0])
    await sendAndSettle(ANSWERS[0])

    const other = await reopen(civics())
    expect(
      transcript(other.container),
      'the civics lesson opened showing a machine-learning conversation',
    ).toEqual([])
    expect(
      screen.queryByText('The passage of a bill'),
      'the civics lesson did not open at its own first beat',
    ).not.toBeNull()
    expect(
      screen.queryByText('What the data actually contains'),
      "the civics lesson opened at the machine-learning lesson's beat",
    ).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* 4-7. No lost answers                                                       */
/* -------------------------------------------------------------------------- */

describe('no lost answers', () => {
  /**
   * SPEC 4. An answer that arrived is still there after a reload.
   *
   * Asserted on the answer's OWN WORDS, not on the presence of a record. A
   * restore that keeps the question and loses the answer renders the prose
   * branch with an empty body: the question is still on screen, so every
   * question-shaped assertion passes, and the child is looking at their own
   * words with nothing underneath.
   *
   * Both routes an answer can arrive by are covered, because they are stored as
   * different fields (`resolution` and `prose`, `TeachView.tsx:419-421`) and a
   * round trip can lose one without touching the other.
   */
  for (const question of OFF_LESSON.slice(0, 3)) {
    it(`keeps the model's answer to "${question}" across a reload`, async () => {
      const { container } = await open(ml(), { ask: answersEverything() })
      await sendAndSettle(question)

      expect(container.textContent, 'the answer never arrived in the first place').toContain(
        modelAnswerFor(question),
      )

      const reopened = await reopen(ml(), { ask: answersEverything() })

      expect(entriesFor(reopened.container, question), 'the question was lost or doubled').toBe(1)
      expect(
        reopened.container.textContent,
        'the answer was dropped and the learner was left with their own question',
      ).toContain(modelAnswerFor(question))
      /* And it is not sitting there claiming to still be working. */
      expect(reopened.container.textContent).not.toContain('Working on it')
    })
  }

  for (const question of ON_LESSON_ML) {
    it(`keeps the lesson's own answer to "${question}" across a reload`, async () => {
      const { container } = await open(ml())
      await sendAndSettle(question)

      const drawnBefore = container.querySelectorAll('.lc-teach__answer .lc-block').length
      expect(drawnBefore, 'the lesson answered with no blocks at all').toBeGreaterThan(0)

      const reopened = await reopen(ml())

      expect(entriesFor(reopened.container, question)).toBe(1)
      expect(
        reopened.container.querySelectorAll('.lc-teach__answer .lc-block').length,
        'the answer came back as bare prose with its blocks gone',
      ).toBe(drawnBefore)
    })
  }

  /**
   * SPEC 5. A question in flight when the tab closed comes back saying so.
   *
   * The promise that would have delivered the answer died with the page.
   * Exactly three things may happen, and the first two are the traps:
   *   - it may NOT be silently dropped. The child typed it.
   *   - it may NOT come back with an invented answer. A restore that guesses is
   *     the one thing this product may never do.
   *   - it may NOT come back still saying "Working on it…", which would leave a
   *     child watching a spinner with nothing behind it forever.
   * So it comes back as the question, plus `ANSWER_LOST`, which says what
   * actually happened and invites them to ask again
   * (`teachStore.ts:212-215`).
   */
  for (const question of OFF_LESSON.slice(0, 3)) {
    it(`comes back saying the answer to "${question}" never arrived`, async () => {
      const { container } = await open(ml(), { ask: stalledAsk })
      await sendAndSettle(question)
      expect(container.textContent, 'the question was not in flight, so this proves nothing').toContain(
        'Working on it',
      )

      const reopened = await reopen(ml(), { ask: stalledAsk })

      expect(
        entriesFor(reopened.container, question),
        'the question the learner typed was thrown away by the reload',
      ).toBe(1)
      expect(
        screen.queryByText(ANSWER_LOST),
        'a question stuck mid-flight came back pretending an answer existed',
      ).not.toBeNull()
      expect(
        reopened.container.textContent,
        'a question with nothing on its way came back still claiming to be working',
      ).not.toContain('Working on it')
      /* And the box is live, so "ask again" is something they can actually do. */
      expect(field().disabled, 'the learner came back to a box they cannot type in').toBe(false)
    })
  }

  it('invents nothing at all in place of the answer that was lost', async () => {
    /* The sharper half of the rule above, asserted on the SAVED record rather
       than on the screen: the restored entry's prose is exactly the sentence
       that says the answer was lost, and its `resolution` — the field that
       would render a structured answer — is absent. A restore that filled the
       gap with the resolver's best guess would still show `ANSWER_LOST`
       somewhere on the page and pass every assertion above. */
    await open(ml(), { ask: stalledAsk })
    await sendAndSettle(OFF_LESSON[0])

    await closeTab()
    const saved = loadTeachProgress(ml().id)

    expect(saved, 'nothing was saved, so this proves nothing').not.toBeNull()
    expect(saved?.asked).toHaveLength(1)
    expect(saved?.asked[0]?.doubt.text, 'the question itself was rewritten').toBe(OFF_LESSON[0])
    expect(saved?.asked[0]?.pending, 'the record came back still marked in flight').toBe(false)
    expect(saved?.asked[0]?.prose, 'the restore wrote something other than the truth').toBe(
      ANSWER_LOST,
    )
    expect(
      saved?.asked[0]?.resolution,
      'the restore invented a structured answer for a question that was never answered',
    ).toBeUndefined()
  })

  /**
   * SPEC 6. A second question does not replace the first. History GROWS.
   *
   * The failure this is aimed at is an `asked` list that is assigned rather
   * than appended (`TeachView.tsx:390`), or a restore that keeps only the last
   * record. Both leave a screen that looks entirely correct — there IS a
   * question and there IS an answer under it — and quietly delete everything
   * the child asked before it.
   *
   * Checked after EVERY question rather than only at the end, so a list that
   * grows and then collapses cannot pass, and checked again after a reload,
   * because the storage round trip is a second place the history can be
   * truncated.
   */
  it('grows the history one question at a time and never overwrites it', async () => {
    const { container } = await open(ml(), { ask: answersEverything() })
    const expected: string[] = []

    for (const [index, question] of OFF_LESSON.entries()) {
      /* Every other question advances a beat first, so the history has to
         survive being spread across beats as well as accumulating within
         one — answers are grouped by beat when rendered
         (`TeachView.tsx:518`), which is exactly where an ordering bug hides. */
      if (index > 0 && index % 2 === 0) await sendAndSettle(nthWrapping(ANSWERS, index))
      await sendAndSettle(question)
      expected.push(question)
      expect(transcript(container), `the history was wrong after question ${index + 1}`).toEqual(
        expected,
      )
    }

    const reopened = await reopen(ml(), { ask: answersEverything() })
    expect(
      transcript(reopened.container),
      'the reload kept only part of the conversation',
    ).toEqual(expected)
    /* Every answer is still under its own question. */
    for (const question of OFF_LESSON) {
      expect(reopened.container.textContent, `the answer to "${question}" was lost`).toContain(
        modelAnswerFor(question),
      )
    }
  })

  it('grows the history the same way on a lesson with different beats', async () => {
    /* Civics has three beats, not five. A history that survived only because
       the machine-learning lesson happened to have enough beats to spread it
       across fails here. */
    const { container } = await open(civics(), { ask: answersEverything() })
    const expected: string[] = []

    for (const question of OFF_LESSON.slice(0, 3)) {
      await sendAndSettle(question)
      expected.push(question)
      expect(transcript(container)).toEqual(expected)
    }

    const reopened = await reopen(civics(), { ask: answersEverything() })
    expect(transcript(reopened.container)).toEqual(expected)
  })

  /**
   * SPEC 7. Nothing the learner typed is lost — a half-written draft survives.
   *
   * The most ordinary loss in the product: a child is three words into a
   * sentence, the tab reloads, and the sentence is gone. Asserted character for
   * character, over four different half-sentences, because a draft that came
   * back trimmed, lower-cased, or with its punctuation mangled is still a
   * child's words being edited by software that was asked to keep them.
   */
  for (const draft of DRAFTS) {
    it(`brings back the half-written "${draft}" character for character`, async () => {
      await open(ml())
      type(draft)
      await settle()

      await reopen(ml())

      expect(
        field().value,
        'the learner reopened the tab and their half-written sentence was gone',
      ).toBe(draft)
    })
  }

  it('a lesson visited in between leaves the first lesson\'s conversation where it was', async () => {
    /*
     * PINNED GAP — A REAL LOSS, ASSERTED AS IT ACTUALLY BEHAVES, NOT AS IT
     * SHOULD.
     *
     * The spec says "no lost answers". This is a way to lose them that the
     * product does not prevent, and it takes one click a child would make
     * without thinking: open lesson A, ask a question, get an answer, glance at
     * lesson B, come back to A. A's place, A's question and A's answer are all
     * gone, and nothing on screen ever said they would be.
     *
     * The cause is not a bug in the restore. It is the STORAGE KEY: there is
     * one record for all lessons (`teachStore.ts:42-45`), so opening B
     * overwrites A. The comment there gives the reason — a per-lesson key would
     * grow `localStorage` without bound — which makes this a decision with a
     * cost, not an oversight. The cost is what is pinned here.
     *
     * MEASURED, this session: after A → B → A, `seen()` came back
     * `{questions: [], blocks: ['metric']}` against `{questions: [one],
     * blocks: ['metric','figure']}` before the round trip.
     *
     * THIS TEST ASSERTS THE LOSS. When the key becomes per-lesson, or a small
     * number of recent lessons are kept, this test WILL fail — and that failure
     * is the fix arriving, not a regression. Rewrite it then to assert the
     * conversation survives. Do not weaken it in the meantime, and do not read
     * its green as "switching lessons is safe".
     */
    const { container } = await open(ml('lesson-the-child-was-doing'), {
      ask: answersEverything(),
    })
    await sendAndSettle(OFF_LESSON[0])
    await sendAndSettle(ANSWERS[0])
    const before = seen(container)
    expect(before.questions, 'nothing was there to lose, so this proves nothing').toEqual([
      OFF_LESSON[0],
    ])

    /* One glance at another lesson. */
    await reopen(ml('lesson-the-child-glanced-at'))
    const back = await reopen(ml('lesson-the-child-was-doing'), { ask: answersEverything() })

    expect(
      transcript(back.container),
      /* THE GAP IS CLOSED (2026-09-02). `teachStore` kept one record under one
         key, so a lesson glanced at in between erased the first lesson's
         conversation; this test pinned that. It keeps a record per lesson now,
         and this asserts what a child would expect: her conversation is where
         she left it. */
      "a lesson visited in between erased the first lesson's conversation",
    ).toHaveLength(1)
    expect(
      checkpoint(back.container),
      'the place in the lesson was lost on the round trip',
    ).toBe(before.checkpoint)
    expect(
      back.container.textContent,
      'the answer was lost on the round trip',
    ).toContain(modelAnswerFor(OFF_LESSON[0]))
  })

  it('keeps the draft that was typed after a question, not the question', async () => {
    /* The submit that clears the box and the keystrokes that follow it are two
       different writes to the same field. A restore that replayed the wrong one
       hands the child back the question they already asked, in the box, as if
       they had never sent it. */
    await open(ml(), { ask: answersEverything() })
    await sendAndSettle(OFF_LESSON[0])
    type(DRAFTS[0])
    await settle()

    const reopened = await reopen(ml(), { ask: answersEverything() })

    expect(field().value, 'the box came back holding the wrong text').toBe(DRAFTS[0])
    expect(entriesFor(reopened.container, OFF_LESSON[0]), 'the asked question was lost').toBe(1)
  })
})

/* -------------------------------------------------------------------------- */
/* 8-10. No duplicate questions                                               */
/* -------------------------------------------------------------------------- */

describe('no duplicate questions', () => {
  /**
   * SPEC 8. One deliberate ask makes exactly ONE entry.
   *
   * Run over five unrelated questions and both answer routes. The failure it is
   * aimed at is a record appended twice — once when the question is received
   * and once when the answer lands (`TeachView.tsx:390` and the `.map` at 397
   * that must UPDATE the record rather than add one). That bug shows the child
   * their question twice, once pending and once answered, and looks like the
   * app asked on their behalf.
   */
  for (const question of OFF_LESSON) {
    it(`makes exactly one entry for "${question}"`, async () => {
      const { container } = await open(ml(), { ask: answersEverything() })

      await sendAndSettle(question)

      expect(transcript(container), 'one question did not make exactly one entry').toEqual([
        question,
      ])
      expect(
        container.querySelectorAll('.lc-teach__answer, .lc-teach__asked'),
        'the question was recorded twice, pending and answered',
      ).toHaveLength(1)
    })
  }

  for (const question of ON_LESSON_ML) {
    it(`makes exactly one entry for the lesson-answered "${question}"`, async () => {
      const { container } = await open(ml())
      await sendAndSettle(question)
      expect(transcript(container)).toEqual([question])
    })
  }

  it('records a genuine re-ask as a second turn, and keeps both distinguishable', async () => {
    /*
     * THE OTHER READING OF "NO DUPLICATE QUESTIONS", AND WHY IT IS NOT A BUG.
     *
     * A child who asks the same thing twice, on purpose, minutes apart, has
     * taken two turns. Collapsing them would delete a turn they took — which is
     * the "no lost answers" rule, broken to satisfy the "no duplicates" rule.
     * So two entries is CORRECT here, and the guarantee that matters is that
     * each one carries its own answer rather than being a copy of the other.
     *
     * The second ask is deliberately answered differently, so the two entries
     * are told apart by their CONTENT and not merely counted.
     */
    let turn = 0
    const varyingAnswer = async (question: string) => {
      turn += 1
      return { ok: true, text: `Answer ${turn} to ${question}.` }
    }
    const { container } = await open(ml(), { ask: varyingAnswer })

    await sendAndSettle(OFF_LESSON[0])
    expect(entriesFor(container, OFF_LESSON[0]), 'the first ask did not land').toBe(1)

    await sendAndSettle(OFF_LESSON[0])

    expect(
      entriesFor(container, OFF_LESSON[0]),
      'a deliberate second ask was swallowed, so the learner was ignored',
    ).toBe(2)
    expect(container.textContent).toContain(`Answer 1 to ${OFF_LESSON[0]}.`)
    expect(
      container.textContent,
      'the second ask was rendered as a copy of the first instead of being answered',
    ).toContain(`Answer 2 to ${OFF_LESSON[0]}.`)

    /* And both survive the reload, still two, still in order. */
    const reopened = await reopen(ml(), { ask: varyingAnswer })
    expect(transcript(reopened.container)).toEqual([OFF_LESSON[0], OFF_LESSON[0]])
    expect(reopened.container.textContent).toContain(`Answer 1 to ${OFF_LESSON[0]}.`)
    expect(reopened.container.textContent).toContain(`Answer 2 to ${OFF_LESSON[0]}.`)
  })

  /**
   * SPEC 9. A double submit is ONE question.
   *
   * Two clicks and two Enters are the same accident from two devices, and both
   * are what a child does when nothing appears to happen fast enough. The guard
   * is `answerInFlight` (`TeachView.tsx:357`), a fact about whether work is
   * outstanding rather than a timer, which is a guess about how fast people
   * press keys.
   *
   * PAIRED with the release, always. A latch that never opens passes every
   * blocking assertion perfectly and destroys the product: the box dies after
   * one question, and a child who cannot ask a second question stops asking.
   */
  for (const question of OFF_LESSON.slice(0, 3)) {
    it(`makes one question, not two, when Enter is pressed twice on "${question}"`, async () => {
      const port = deferredAsk()
      const { container } = await open(ml(), { ask: port.ask })

      sendTwiceFast(question)
      await settle()

      expect(transcript(container), 'a double Enter put the question on screen twice').toEqual([
        question,
      ])
      expect(port.calls, 'a double Enter spent two model calls').toBe(1)

      await port.releaseAll()
      expect(transcript(container), 'the second Enter arrived late as a duplicate').toEqual([
        question,
      ])
      expect(
        container.textContent?.split(modelAnswerFor(question)).length,
        'the answer was rendered twice',
      ).toBe(2)
    })
  }

  /**
   * THE SAME QUESTION, SENT AGAIN WHILE THE FIRST IS STILL IN FLIGHT.
   *
   * WHY THIS TEST EXISTS AND THE TWO ABOVE ARE NOT ENOUGH — MEASURED.
   * The brief asks for proof that the `pending` guard actually holds. It is
   * NOT what makes a double Enter or a double click safe. Deleting
   * `if (answerInFlight) return` (`TeachView.tsx:357`) and running this file
   * left every double-Enter and double-click assertion GREEN, because `submit`
   * clears the draft, React flushes between two discrete submit events, and the
   * second one therefore carries an empty string that `classifyTurn` reads as
   * `empty` and drops. The same accident is written up in `TeachView.test.tsx`.
   *
   * So the guard is proven where the accident cannot cover for it: text is
   * typed AGAIN before the first answer lands. That is the impatient re-ask —
   * "nothing is happening, I will send it again" — and it is the only path by
   * which the same question could be recorded twice against one beat. The
   * mutant that removes the guard kills this test and only this one.
   *
   * The box is also asserted disabled, because that is the FIRST line of
   * defence a real child meets: they cannot type into it at all. The guard
   * behind it is what survives a future restyling that forgets the `disabled`
   * attribute.
   */
  for (const question of OFF_LESSON.slice(0, 3)) {
    it(`records one entry when "${question}" is sent again before the first lands`, async () => {
      const port = deferredAsk()
      const { container } = await open(ml(), { ask: port.ask })

      send(question)
      await settle()
      expect(field().disabled, 'the box stayed live while a question was in flight').toBe(true)

      /* Sent again, with the text really there this time. */
      send(question)
      await settle()

      expect(
        transcript(container),
        'an impatient re-ask put the same question on screen twice',
      ).toEqual([question])
      expect(port.calls, 'an impatient re-ask spent a second model call').toBe(1)

      await port.releaseAll()
      expect(transcript(container), 'the second send arrived late as a duplicate').toEqual([
        question,
      ])
      /* The pair: the box comes back, so the guard is a gate and not a lock. */
      expect(field().disabled, 'the learner was locked out for good').toBe(false)
    })
  }

  it('makes one question, not two, when Send is clicked twice', async () => {
    const port = deferredAsk()
    const { container } = await open(ml(), { ask: port.ask })

    clickSendTwice(OFF_LESSON[3])
    await settle()

    expect(transcript(container), 'a double click put the question on screen twice').toEqual([
      OFF_LESSON[3],
    ])
    expect(port.calls, 'a double click spent two model calls').toBe(1)
  })

  it('refuses a SECOND, different question while the first is still in flight', async () => {
    const port = deferredAsk()
    const { container } = await open(ml(), { ask: port.ask })

    send(OFF_LESSON[0])
    await settle()
    /* Different text, so the cleared-draft accident cannot mask this. */
    send(OFF_LESSON[1])
    await settle()

    expect(
      transcript(container),
      'two questions were racing one beat, and both are on screen',
    ).toEqual([OFF_LESSON[0]])
    expect(port.calls).toBe(1)
  })

  it('DOES let the next question through once the first has landed', async () => {
    /* The pair. Without it every assertion above is satisfied by a box that
       accepts one question and then dies. */
    const port = deferredAsk()
    const { container } = await open(ml(), { ask: port.ask })

    sendTwiceFast(OFF_LESSON[0])
    await settle()
    await port.releaseAll()

    await sendAndSettle(OFF_LESSON[1])
    await port.releaseAll()

    expect(port.calls, 'the guard latched shut and the learner can never ask again').toBe(2)
    expect(transcript(container), 'the second question was never recorded').toEqual([
      OFF_LESSON[0],
      OFF_LESSON[1],
    ])
  })

  /**
   * SPEC 10. A reload mid-flight does not duplicate the in-flight question.
   *
   * The nastiest version of the accident, because the two copies arrive by
   * different routes: one is restored out of storage and one is created by the
   * learner's retry. Each record's identity is its insertion index
   * (`TeachView.tsx:384`, `const at = asked.length`), and that index is also
   * the React key (`TeachView.tsx:556`) and the thing the answer is matched
   * back onto (`TeachView.tsx:399`). If a restored history is not counted, a
   * retry is handed an index that already exists — and the answer to the new
   * question would be written onto the old record.
   */
  for (const question of OFF_LESSON.slice(0, 3)) {
    it(`comes back with one copy of the in-flight "${question}", not two`, async () => {
      await open(ml(), { ask: stalledAsk })
      await sendAndSettle(question)

      const reopened = await reopen(ml(), { ask: stalledAsk })

      expect(
        entriesFor(reopened.container, question),
        'the reload duplicated the question that was in flight',
      ).toBe(1)
      expect(transcript(reopened.container)).toEqual([question])
    })
  }

  it('lets the learner retry the lost question, and keeps the two apart', async () => {
    /*
     * `ANSWER_LOST` ends with "Ask again and I will have another go", so this is
     * the exact thing the product invites the child to do. Two entries is
     * correct — one lost, one answered — and what must never happen is the
     * retry's answer landing on the restored record, which is what a reused
     * index does. Measured through the screen: the lost sentence and the new
     * answer are both present, each once.
     */
    await open(ml(), { ask: stalledAsk })
    await sendAndSettle(OFF_LESSON[0])

    const reopened = await reopen(ml(), { ask: answersEverything() })
    await sendAndSettle(OFF_LESSON[0])

    expect(transcript(reopened.container), 'the retry did not become its own turn').toEqual([
      OFF_LESSON[0],
      OFF_LESSON[0],
    ])
    expect(
      screen.queryAllByText(ANSWER_LOST),
      'the lost question was overwritten by the retry, or the notice was duplicated',
    ).toHaveLength(1)
    expect(
      reopened.container.textContent,
      'the retry was never answered',
    ).toContain(modelAnswerFor(OFF_LESSON[0]))
  })

  it('does not duplicate anything when a reload lands between two questions', async () => {
    /* One answered, one in flight, then the tab dies. The answered one must not
       be re-run and the in-flight one must not be doubled — the two records are
       in different states, which is where a restore that rebuilds rather than
       reads gets one of them wrong. */
    const port = deferredAsk()
    await open(ml(), { ask: port.ask })

    await sendAndSettle(OFF_LESSON[0])
    await port.releaseAll()
    await sendAndSettle(OFF_LESSON[1])

    const reopened = await reopen(ml(), { ask: stalledAsk })

    expect(transcript(reopened.container), 'the reload changed the conversation').toEqual([
      OFF_LESSON[0],
      OFF_LESSON[1],
    ])
    expect(reopened.container.textContent).toContain(modelAnswerFor(OFF_LESSON[0]))
    expect(screen.queryAllByText(ANSWER_LOST), 'the answered question was also marked lost').toHaveLength(1)
  })
})
