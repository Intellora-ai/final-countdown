// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

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
import { TeachView } from './TeachView'

/**
 * The teaching view, exercised the way a learner meets it.
 *
 * WHY THIS FILE OPTS INTO jsdom WHEN ALMOST NOTHING ELSE IN THE CANVAS DOES
 * ------------------------------------------------------------------------
 * jsdom performs no layout, so a claim here about where a block SITS would be a
 * claim about the stub. Every assertion below is about what is in the document
 * and what is not — the one question jsdom answers honestly, and the one that
 * matters most for this component: a teaching view that has quietly become a
 * slideshow still lays out perfectly.
 *
 * The regression this file exists for is the second test. "Continue reveals the
 * next beat" is easy to keep working. "…and the previous beat is still there" is
 * the half a later optimisation drops, and a lesson that replaces each part with
 * the next is a slide deck with extra clicks.
 *
 * NOTHING IS MOCKED. The beats come from `deriveBeats` and the answers from
 * `lessonResolver`, both against the real machine-learning lesson. A test that
 * stubbed the resolver would prove the view can render a fixture, which is not
 * the thing in doubt.
 */

afterEach(cleanup)
/* Persistence is real storage in these tests, so one test's saved lesson must
   not become the next test's restored one. */
afterEach(() => {
  resetTeachProgress()
})

function fixture(): Lesson {
  const result = validateLesson(classifierEvaluation)
  if (!result.ok)
    throw new Error(`the ML fixture does not validate: ${JSON.stringify(result.issues)}`)
  return result.lesson
}

/**
 * Render, and let the lazily imported shape renderers settle.
 *
 * `FigureView` reaches its shapes through `React.lazy`, so a bare `render` sees
 * "Loading series…" and the real tree arrives a tick later — outside `act`,
 * which React reports as a warning and which would let an assertion about
 * missing content pass for entirely the wrong reason.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function teach() {
  const view = render(<TeachView lesson={fixture()} mode="2d" />)
  await settle()
  return view
}

/**
 * Type something into the one box and submit it the way Enter does.
 *
 * THERE IS NO CONTINUE BUTTON ANY MORE, and these helpers are where that shows.
 * A beat already ends with a question, so it advances when the learner ANSWERS
 * it; a Continue button beside that question asked them to answer and then
 * separately confirm they had answered.
 *
 * One box, two meanings, and the TEXT decides which -- so the two helpers below
 * differ only in what they type.
 */
async function submitText(text: string): Promise<void> {
  const field = screen.getByLabelText('Answer the question, or ask one of your own')
  fireEvent.change(field, { target: { value: text } })
  /* The form's submit event is what Enter in a text field raises. jsdom does not
     perform implicit submission, so it is raised directly rather than faked with
     a click on the button — this exercises the keyboard path. */
  fireEvent.submit(field.closest('form') as HTMLFormElement)
  await settle()
}

/** Answer the beat's closing question. A plain statement, so it is read as an
 *  answer rather than as a doubt. */
async function answerBeat(): Promise<void> {
  await submitText('the model flags too many innocent transactions')
}

/** Ask a doubt. Kept as its own helper so every call site says which of the
 *  two meanings it intends. */
async function askAbout(text: string): Promise<void> {
  await submitText(text)
}

function checkpointText(container: HTMLElement): string {
  return container.querySelector('.lc-teach__question')?.textContent ?? ''
}

/** Blocks of the fixture, which `beats.ts` cuts into five parts. */
/*
 * One title from each of the ML lesson's three beats, re-pinned in this change.
 *
 * The lesson gained a definition and a summary, and a beat now ends when it is
 * FINISHED rather than at a cap of three, so the boundaries moved: the class
 * balance figure sits in the FIRST beat now, beside the headline it undercuts,
 * rather than opening the second. These constants have to name blocks that are
 * genuinely in different beats or the assertions below stop meaning anything.
 */
const FIRST_BEAT = 'Reported accuracy'
const SECOND_BEAT = 'Where the errors actually fall'
const THIRD_BEAT = 'Precision-recall tells the truth'
const LAST_BEAT = 'The rule'

/** Sentences that appear ONLY inside an answer, never in the first beat. */
const PR_ANSWER =
  /To catch half the fraud you accept that two in three flagged transactions are innocent/
const FEATURES_ANSWER = /Nothing here is a proxy for a protected attribute/

/* -------------------------------------------------------------------------- */
/* Teaching is cumulative                                                     */
/* -------------------------------------------------------------------------- */

describe('a lesson arrives one beat at a time', () => {
  it('shows the first beat and none of the later ones', async () => {
    await teach()

    expect(screen.queryByText(FIRST_BEAT)).not.toBeNull()
    expect(screen.queryByText(SECOND_BEAT)).toBeNull()
    expect(screen.queryByText(THIRD_BEAT)).toBeNull()
    expect(screen.queryByText('In one paragraph')).toBeNull()
  })

  it('keeps the earlier beat on screen when the next one arrives', async () => {
    /*
     * THE REGRESSION THIS FILE IS FOR.
     *
     * A view that swaps one beat for the next passes every "the next beat
     * appears" test ever written, and is a slideshow. Teaching is cumulative:
     * the learner has to still be able to look at the number they were just
     * shown while reading the thing that takes it apart.
     */
    await teach()
    await answerBeat()

    expect(screen.queryByText(SECOND_BEAT), 'the new beat did not arrive').not.toBeNull()
    expect(screen.queryByText(FIRST_BEAT), 'the earlier beat was replaced').not.toBeNull()
  })

  it('runs to the end by being answered, and then stops advancing', async () => {
    await teach()

    /* Bounded so a view that never reaches its last beat fails as a test rather
       than as a hung run. The bound is far above any sane cut of nine blocks
       and is not read for anything else. */
    let guard = 0
    while (screen.queryByText(/end of this lesson/i) === null) {
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await answerBeat()
    }

    /* And answering again at the end does not wrap around or blank the page. */
    await answerBeat()

    expect(screen.queryByText(FIRST_BEAT), 'the first beat is gone by the end').not.toBeNull()
    expect(screen.queryByText(LAST_BEAT)).not.toBeNull()
    expect(screen.queryByText(/end of this lesson/i)).not.toBeNull()
  })

  it('puts focus on the closing question when the last beat arrives', async () => {
    /*
     * Focus normally stays in the answer box, which is where the learner left
     * it and where the next answer will be typed. On the last beat the lesson
     * stops advancing, and a keyboard learner needs to be told the thing that
     * changed rather than left wondering whether their answer registered. It
     * lands on the closing question.
     */
    const { container } = await teach()

    let guard = 0
    while (screen.queryByText(/end of this lesson/i) === null) {
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await answerBeat()
    }

    expect(document.activeElement).toBe(container.querySelector('.lc-teach__question'))
  })
})

/* -------------------------------------------------------------------------- */
/* No step count reaches the learner                                          */
/* -------------------------------------------------------------------------- */

const COUNTS = /\b\d+\s*(of|\/)\s*\d+\b/
const NUMBERED_STEP = /\bstep\s*\d/i

describe('the learner is never told how far through they are', () => {
  it('renders no step count anywhere on the first beat', async () => {
    const { container } = await teach()

    expect(container.textContent).not.toMatch(COUNTS)
    expect(container.textContent).not.toMatch(NUMBERED_STEP)
  })

  it('renders no step count in the teaching chrome, at any point in the lesson', async () => {
    /*
     * SCOPED TO THE CHROME FOR THE NUMERIC FORM, AND HERE IS WHY.
     *
     * Once the third beat is revealed the page contains "It catches 55 of 300
     * frauds" — a caption from the lesson, about fraud, matching the count
     * pattern by coincidence. Asserting that pattern over the whole container
     * after that point would be an assertion about the fixture's English rather
     * than about the interface, and the first person to reword the caption would
     * "fix" a failing test by editing content the test was never about.
     *
     * `data-teach-chrome` marks everything this view writes itself: the
     * checkpoint, the answers, the refusals. Those are where a step count could
     * actually be introduced. "step 3" is still refused over the whole document
     * at every beat, because no lesson has a reason to say it.
     */
    const { container } = await teach()
    const chromeSeen: string[] = []

    let guard = 0
    for (;;) {
      for (const node of container.querySelectorAll('[data-teach-chrome]')) {
        chromeSeen.push(node.textContent ?? '')
      }
      expect(container.textContent).not.toMatch(NUMBERED_STEP)
      if (screen.queryByText(/end of this lesson/i) !== null) break
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await answerBeat()
    }

    expect(chromeSeen.length, 'no chrome was inspected, so this proved nothing').toBeGreaterThan(1)
    for (const text of chromeSeen) {
      expect(text, `the chrome counted the steps: "${text}"`).not.toMatch(COUNTS)
      expect(text).not.toMatch(NUMBERED_STEP)
    }
  })

  it('offers no control a position could be read off', async () => {
    await teach()

    /* A progressbar, a meter or a slider all answer "how much is left", which is
       the question the beat model exists to refuse. */
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* A doubt never advances the lesson                                          */
/* -------------------------------------------------------------------------- */

describe('asking a doubt', () => {
  it('does not advance the lesson', async () => {
    const { container } = await teach()
    const before = checkpointText(container)
    expect(screen.queryByText(SECOND_BEAT)).toBeNull()

    await askAbout('what is precision recall')

    /*
     * Whatever the resolver said, the learner is exactly where they were. There
     * is no route from a Doubt to the next beat — this is the test that would
     * notice one being added, and the checkpoint comparison is the sharper half:
     * a view that advanced and then re-rendered the same block list would still
     * fail here.
     */
    expect(screen.queryByText(SECOND_BEAT), 'a doubt revealed the next beat').toBeNull()
    expect(screen.queryByText(FIRST_BEAT)).not.toBeNull()
    expect(checkpointText(container), 'the checkpoint moved on').toBe(before)
    /* And the box is still there to answer with, so the learner is not stuck. */
    expect(screen.queryByLabelText('Answer the question, or ask one of your own')).not.toBeNull()
  })

  it('renders the answer through the lesson renderer, not a prose fallback', async () => {
    const { container } = await teach()

    await askAbout('what is precision recall')

    const answers = container.querySelectorAll('.lc-teach__answer:not(.lc-teach__answer--refusal)')
    expect(answers, 'the resolver produced no answer for a question the lesson names').toHaveLength(1)

    /* The answer's own content, drawn out of the lesson and shown on its own.
       This sentence is a caption on a block three beats away, so its presence
       can only be the answer. */
    expect(container.textContent).toMatch(PR_ANSWER)
    /* And it went through BlockView: the block kept its heading. */
    expect(screen.queryByText('Precision-recall tells the truth')).not.toBeNull()
  })

  it('ESCALATES instead of refusing when the lesson has no answer', async () => {
    /*
     * THIS TEST REPLACED "renders a refusal as a refusal", AND THE REASON IS A
     * REQUIREMENTS CHANGE, NOT A WEAKENED ASSERTION.
     *
     * The lesson resolver still refuses -- it answers only out of material the
     * author already wrote, which is exactly why it cannot invent a wrong
     * answer. What changed is what happens NEXT. A learner who has just
     * admitted confusion is the worst possible audience for "I cannot answer
     * that", so the refusal now escalates to the model.
     *
     * With no ask port configured, escalation cannot complete -- and the
     * learner is told THAT, which is a different and honest thing. What must
     * never appear again is a dead end.
     */
    const { container } = await teach()

    await askAbout('how tall is mount everest')

    /* The question is on screen, attributed to them. Matched as a substring:
       it is rendered inside "You asked: ..." rather than as its own node. */
    expect(container.textContent).toContain('how tall is mount everest')
    /* And it was answered with something, not closed down. */
    expect(container.textContent).toMatch(/could not reach|saved/i)
    /* The old dead end is gone. */
    expect(container.querySelectorAll('.lc-teach__answer--refusal')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/could not find an answer to that in this lesson/i)
  })

  it('answers an off-lesson question through the model when one is reachable', async () => {
    render(
      <TeachView
        lesson={fixture()}
        mode="2d"
        ask={async () => ({ ok: true, text: 'Mount Everest is 8,849 metres high.' })}
      />,
    )
    await settle()
    await askAbout('how tall is mount everest')

    expect(screen.queryByText(/8,849 metres/)).not.toBeNull()
    /* And exactly one soft invitation back, never a reprimand. */
    expect(document.body.textContent?.match(/Shall we get back to it\?/g) ?? []).toHaveLength(1)
  })

  it('never leaves the learner on "Working on it" when the chain throws', async () => {
    /*
     * MEASURED ON CI, AND FOUND TWICE INDEPENDENTLY.
     *
     * `TeachView.tsx:290` reads `void answering.answer(...).then(...)` with no
     * `.catch`. When that promise REJECTS, `setRecord` never runs, the record
     * stays `pending: true`, and the learner reads "Working on it…" forever.
     *
     * That is exactly what GitHub reported on `scene-regressions.spec.ts:454`:
     *
     *   Locator: locator('.lc-teach__answer')
     *   Expected: 1     24 x locator resolved to 0 elements
     *
     * Zero elements, not a refusal element -- because the component never left
     * the pending branch. It failed on three different viewports across three
     * runs, which is what a timing-dependent unhandled rejection looks like.
     *
     * It became reachable the moment `engineResolver` gained a deadline: a dead
     * middleware now THROWS after 3s instead of hanging, and the throw lands
     * here. The deadline was correct; the missing catch is what turned it into
     * a permanent spinner.
     *
     * A rung failing is normal. Silence is not. The learner must always be told
     * something.
     */
    const unhandled: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      event.preventDefault()
      unhandled.push(event.reason)
    }
    window.addEventListener('unhandledrejection', onUnhandled)

    try {
      render(
        <TeachView
          lesson={fixture()}
          mode="2d"
          ask={async () => {
            throw new Error('engine timed out after 3000ms')
          }}
        />,
      )
      await settle()
      await askAbout('what is a confusion matrix')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      /*
       * The REJECTION is the evidence, not the rendered text. Asserting on
       * "Working on it…" was the wrong symptom: the component can leave that
       * branch for other reasons, and the test passed while the promise was
       * still being dropped on the floor. An unhandled rejection is the bug
       * itself -- it is what stops `setAsked` running.
       */
      expect(
        unhandled.map((r) => (r instanceof Error ? r.message : String(r))),
        'the answer promise rejected with nobody listening, so the record never left pending',
      ).toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  })

  it('keeps every answer when a second doubt is asked', async () => {
    const { container } = await teach()

    await askAbout('what is precision recall')
    await askAbout('what is feature importance')

    const answers = container.querySelectorAll('.lc-teach__answer:not(.lc-teach__answer--refusal)')
    expect(answers, 'the second answer replaced the first').toHaveLength(2)
    expect(container.textContent).toMatch(PR_ANSWER)
    expect(container.textContent).toMatch(FEATURES_ANSWER)

    /* Both questions are still readable above their answers, which is what makes
       the second one an answer to something rather than a loose diagram. */
    expect(screen.queryByText('what is precision recall')).not.toBeNull()
    expect(screen.queryByText('what is feature importance')).not.toBeNull()
  })

  it('does nothing at all when the field is empty or only spaces', async () => {
    const { container } = await teach()

    await askAbout('')
    expect(container.querySelectorAll('.lc-teach__answer')).toHaveLength(0)

    await askAbout('    ')
    expect(
      container.querySelectorAll('.lc-teach__answer'),
      'whitespace produced an answer or a refusal',
    ).toHaveLength(0)
  })

  it('leaves the doubt field reachable by keyboard', async () => {
    await teach()
    const field = screen.getByLabelText('Answer the question, or ask one of your own') as HTMLInputElement

    /* Tab order, asserted the only way jsdom can honestly: a native input with
       no negative tabindex and not disabled is reachable, and the checkpoint
       question is -1 so it never becomes a stop on the way there. */
    expect(field.tabIndex).toBe(0)
    expect(field.disabled).toBe(false)
    expect(document.querySelector('.lc-teach__question')?.getAttribute('tabindex')).toBe('-1')
  })
})

/* -------------------------------------------------------------------------- */
/* One submit, one effect                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A submit that is already in flight may not start a second one.
 *
 * WHAT WAS MEASURED FIRST, BEFORE ANY OF THIS WAS WRITTEN
 * -------------------------------------------------------
 * The suspected defect was "a double Enter spends two model calls". It does
 * NOT, and the reason is worth recording so nobody re-adds a guard for it and
 * believes they fixed something: `submit` clears `draft`, React re-renders
 * between the two discrete submit events, and the second one therefore carries
 * an EMPTY string. Measured directly — the field reads `''` between the two
 * events, and `ask` is called once.
 *
 * That accident guards the model call and nothing else. Two real holes were
 * measured underneath it:
 *
 *   1. THE STRAY ENTER IS CHARGED AS AN EMPTY ANSWER. `''` is classified
 *      `empty`, which increments `emptyAnswers`, and `strugglingAfter` fires at
 *      two. Measured: two double-Enters called `onStruggling` once. A learner
 *      who asked two questions and pressed a key too fast is silently moved to
 *      an easier lesson, and nothing on screen ever says so.
 *
 *   2. TWO DIFFERENT QUESTIONS RACE. Ask one, and before it lands ask another:
 *      measured two concurrent `ask` calls, two answers in flight against one
 *      beat. This is the hole the `draft` accident cannot cover, because the
 *      second submit carries real text.
 *
 * Both are the same defect — a submit acts while another is still working — so
 * both are guarded by the same fact: whether an answer is in flight. Not a
 * timer. A timer is a guess about how fast people press keys; pending is a fact
 * about whether work is outstanding.
 *
 * WHY `ask` IS COUNTED AND NOT A STUBBED `answering`
 * --------------------------------------------------
 * `ask` is the port that reaches the model, so one extra call is one extra call
 * the learner paid for. A stubbed `answering` would prove the component guards
 * a stub; counting `ask` proves the guard sits on the path a real question
 * travels — resolver chain first, model second.
 *
 * EVERY GUARD HERE IS TESTED IN A PAIR
 * ------------------------------------
 * A latch that never releases passes every blocking test perfectly and destroys
 * the product: the box dies after one question. So each "it must refuse" has an
 * "and it must still allow" beside it, including when the answer path throws.
 */
describe('one submit is one effect', () => {
  /** Questions the lesson cannot answer out of its own blocks, so they escalate
   *  past the resolver chain and reach the model port. Both open with an
   *  interrogative word, so `classifyTurn` reads them as doubts and not as
   *  answers to the beat's closing question. */
  const OFF_LESSON = 'who first wrote down the central limit theorem'
  const ALSO_OFF_LESSON = 'when was that theorem proved in general'

  /** An `ask` port that never settles until told to, so the in-flight window is
   *  a fact under the test's control rather than a race with a timer. */
  function deferredAsk(behaviour: 'resolve' | 'reject' = 'resolve') {
    const waiting: Array<() => void> = []
    let calls = 0
    const ask = (_question: string) =>
      new Promise<{ ok: boolean; text: string }>((resolve, rejectIt) => {
        calls += 1
        waiting.push(() =>
          behaviour === 'resolve'
            ? resolve({ ok: true, text: 'An answer from the model.' })
            : rejectIt(new Error('the model service fell over')),
        )
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

  function teachWith(
    ask: (question: string) => Promise<{ ok: boolean; text: string }>,
    onStruggling?: () => void,
  ) {
    return render(
      <TeachView lesson={fixture()} mode="2d" ask={ask} onStruggling={onStruggling} />,
    )
  }

  function field(): HTMLInputElement {
    return screen.getByLabelText('Answer the question, or ask one of your own') as HTMLInputElement
  }

  function send(text: string): void {
    const box = field()
    fireEvent.change(box, { target: { value: text } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
  }

  /** Type once, then raise submit twice with nothing awaited between them —
   *  which is what two fast keypresses are. */
  function sendTwiceFast(text: string): void {
    const box = field()
    fireEvent.change(box, { target: { value: text } })
    const form = box.closest('form') as HTMLFormElement
    fireEvent.submit(form)
    fireEvent.submit(form)
  }

  it('spends exactly one model call when Enter is pressed twice quickly', async () => {
    const port = deferredAsk()
    teachWith(port.ask)
    await settle()

    sendTwiceFast(OFF_LESSON)
    await settle()
    expect(port.calls, 'a double Enter spent two model calls').toBe(1)

    await port.releaseAll()
    expect(port.calls, 'a second call arrived once the first answer landed').toBe(1)
  })

  /**
   * Ask two questions, three beats in — and never trip the struggle signal.
   *
   * WHY THE SCENARIO IS SHAPED SO CAREFULLY
   * `strugglingAfter` fires on ANY of three conditions, so a naive "ask twice
   * and check" is deepened for a legitimate reason (two questions on one beat
   * is 2/1, over the ratio) and proves nothing about stray keypresses. This
   * walks to the third beat first, which puts the learner's REAL behaviour
   * comfortably under every threshold: two questions over three beats is 0.67,
   * and two is below the three-question bar.
   *
   * That leaves exactly one way for the signal to fire — `emptyAnswers >= 2`,
   * which only a stray Enter can reach. So a non-zero count here is the stray
   * keypress and nothing else, and the test cannot pass for another reason.
   */
  async function walkToThirdBeat(): Promise<void> {
    await answerBeat()
    await answerBeat()
  }

  it('never deepens the lesson because a key was pressed twice', async () => {
    const port = deferredAsk()
    let struggled = 0
    teachWith(port.ask, () => {
      struggled += 1
    })
    await settle()
    await walkToThirdBeat()

    sendTwiceFast(OFF_LESSON)
    await settle()
    await port.releaseAll()
    sendTwiceFast(ALSO_OFF_LESSON)
    await settle()
    await port.releaseAll()

    expect(struggled, 'a stray Enter nudged the learner toward an easier lesson').toBe(0)
  })

  it('DOES still deepen the lesson when the learner is genuinely stuck', async () => {
    /* The pair. A guard that made the struggle signal unreachable would pass
       the test above perfectly and quietly disable adaptive difficulty for
       everyone — the signal has to survive the fix, not be silenced by it.
       Three questions on one beat is over the bar by two separate conditions. */
    const port = deferredAsk()
    let struggled = 0
    teachWith(port.ask, () => {
      struggled += 1
    })
    await settle()

    for (const question of [OFF_LESSON, ALSO_OFF_LESSON, 'why does accuracy mislead here']) {
      send(question)
      await settle()
      await port.releaseAll()
    }

    expect(struggled, 'the struggle signal was silenced along with the double submit').toBe(1)
  })

  it('refuses a SECOND question while the first is still in flight', async () => {
    const port = deferredAsk()
    teachWith(port.ask)
    await settle()

    send(OFF_LESSON)
    await settle()
    /* Different text, so the cleared-draft accident cannot mask this one. */
    send(ALSO_OFF_LESSON)
    await settle()

    expect(port.calls, 'two questions were in flight against one beat').toBe(1)
  })

  it('still answers a SECOND, different question once the first has landed', async () => {
    const port = deferredAsk()
    teachWith(port.ask)
    await settle()

    sendTwiceFast(OFF_LESSON)
    await settle()
    await port.releaseAll()

    send(ALSO_OFF_LESSON)
    await settle()
    expect(port.calls, 'the guard latched shut and the learner can never ask again').toBe(2)

    await port.releaseAll()
    /* Pinned as the learner reads it, quotation marks and all, rather than as a
       bare substring — the question is echoed back inside a "You asked" line,
       and an assertion that did not include the echo would still pass if the
       text leaked onto the page some other way. */
    expect(
      screen.queryByText('You asked: \u201c' + ALSO_OFF_LESSON + '\u201d'),
      'the second question was never recorded on screen',
    ).not.toBeNull()
  })

  it('visibly disables the box while an answer is in flight, and frees it after', async () => {
    const port = deferredAsk()
    teachWith(port.ask)
    await settle()

    expect(field().disabled, 'the box started out disabled').toBe(false)

    send(OFF_LESSON)
    await settle()

    /* A key that does nothing with no feedback reads as a broken app. The guard
       has to be SEEN, not merely enforced. */
    expect(field().disabled, 'the box stayed live while a question was in flight').toBe(true)

    await port.releaseAll()
    expect(field().disabled, 'the box never came back after the answer landed').toBe(false)
  })

  /**
   * The model is unreachable — and the learner can still ask again.
   *
   * A SURVIVING MUTANT IS RECORDED HERE ON PURPOSE
   * ----------------------------------------------
   * The guard is released in a `.finally`. Swapping that for a `.then` — which
   * would lock the box forever if the answer promise ever rejected — was run as
   * a mutant and SURVIVED all 21 tests. It survives for a real reason, not a
   * missing assertion: `answering.answer` catches its own failures and returns
   * an `unavailable` answer instead (`answering.ts`, the `try/catch` around
   * `options.ask`), so the promise this component awaits never rejects, and no
   * test reachable through the component's public surface can tell the two
   * apart.
   *
   * The `.finally` stays because it is correct for a future `answer` that CAN
   * reject, and this note stays because the alternative is a later session
   * reading the old test name — "even when the answer path throws" — and
   * believing that path is covered. It is not. What IS covered, and what this
   * test now claims, is the failure a learner can actually meet: the model is
   * unreachable, they are told so, and the box comes back.
   */
  it('frees the box when the model cannot be reached, and says so', async () => {
    const port = deferredAsk('reject')
    teachWith(port.ask)
    await settle()

    send(OFF_LESSON)
    await settle()
    expect(field().disabled, 'the box stayed live while a question was in flight').toBe(true)

    await port.releaseAll()

    /* The failure mode this pins is a guard released only on the path where an
       answer arrived: a learner whose question failed would be locked out of
       asking again, which is strictly worse than the double call the guard was
       added to prevent. */
    expect(field().disabled, 'a failed question locked the learner out for good').toBe(false)
    expect(
      screen.queryByText(/I could not reach the part of me that answers questions/),
      'the learner was left with a silent failure instead of being told',
    ).not.toBeNull()

    send(ALSO_OFF_LESSON)
    await settle()
    expect(port.calls, 'no question could be asked after one failed').toBe(2)
  })
})

/* -------------------------------------------------------------------------- */
/* Nothing typed is lost                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A reload must not cost the learner their work — and must not invent any.
 *
 * WHAT A "RELOAD" IS HERE, AND WHY IT IS NOT JUST A RE-RENDER
 * -----------------------------------------------------------
 * Unmounting and mounting again proves nothing: a module-level store still
 * holds the values in memory, so the second mount would "restore" from RAM and
 * the test would pass with `localStorage` never touched. `reload()` below drops
 * the in-memory copy first and rehydrates from storage, so the only route the
 * values can travel is the one a real refresh uses.
 *
 * THE THREE THINGS A RESTORE MUST NOT DO
 * --------------------------------------
 *   1. Come back mid-flight. `answerInFlight` disables the box, and it is
 *      released by the promise that set it. A persisted `true` has no promise
 *      coming back for it, so the box would be dead forever — a worse bug than
 *      the one persistence fixes. The same trap sits on each record's own
 *      `pending` flag, which is why both are asserted.
 *   2. Re-fire `strugglingAfter`. `reportStruggle` is fired at most once per
 *      mount, guarded by a ref that a reload resets. Restore the counters
 *      without restoring the "already reported" fact and the callback fires a
 *      second time on the learner's next submit — the exact harm removed in the
 *      previous task, arriving by a second route.
 *   3. Blank the page when storage is unavailable. Private mode, a full quota,
 *      or a `localStorage` that throws on access must cost the learner their
 *      restore and nothing else.
 *
 * WHY THE STORAGE-FAILURE TESTS USE SPIES AND NOT `vi.resetModules()`
 * -------------------------------------------------------------------
 * `src/practice/store.test.ts` records the reason, measured: replacing the
 * global `window` and resetting modules TWICE in one file pushed a latent
 * echarts/jsdom crash in `FigureView` from never firing to firing about half
 * the time. This file renders figures. Spying on `Storage.prototype` produces
 * the same failure without touching the module graph.
 *
 * WHY THE FAILURE TESTS ARE NOT VACUOUS
 * -------------------------------------
 * "The view survives broken storage" is satisfied completely by never
 * persisting anything at all. It is only worth something beside the tests that
 * demand a normal session DOES come back — the pair. Neither half is optional.
 */
describe('nothing typed is lost', () => {
  const HALF_TYPED = 'the model flags too many innoc'
  const OFF_LESSON = 'who first wrote down the central limit theorem'

  /**
   * A real `localStorage`, because this environment has none.
   *
   * MEASURED, and it is the reason these tests are shaped this way: jsdom 30
   * here exposes NO `window.localStorage` — it reads `undefined`, and Node
   * reports `localStorage is not available because --localstorage-file was not
   * provided`. So a test that simply trusted the environment would exercise the
   * "storage missing" branch every time while appearing to prove the round
   * trip, which is the most expensive kind of green.
   *
   * It also explains a comment already in `src/practice/store.test.ts`: the
   * persisted route there had to replace the global `window` and reset the
   * module graph. This installs a plain in-memory `Storage` on `window`
   * instead, which needs neither — and so avoids the measured echarts/jsdom
   * flake that `resetModules` caused in files that render figures. This file
   * renders figures.
   */
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
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'localStorage')
  })

  it('is running against a storage this environment does not otherwise provide', () => {
    /* The harness, asserted rather than assumed. Every test below is a claim
       about a round trip, and all of them would pass vacuously against a
       storage that silently dropped everything. */
    window.localStorage.setItem('probe', 'kept')
    expect(window.localStorage.getItem('probe'), 'the test storage does not store').toBe('kept')
  })

  function field(): HTMLInputElement {
    return screen.getByLabelText('Answer the question, or ask one of your own') as HTMLInputElement
  }

  function type(text: string): void {
    fireEvent.change(field(), { target: { value: text } })
  }

  function send(text: string): void {
    type(text)
    fireEvent.submit(field().closest('form') as HTMLFormElement)
  }

  /**
   * Close the tab and open it again.
   *
   * The in-memory copy is dropped before re-rendering, so anything that comes
   * back has genuinely been read out of storage. Rendered with the same lesson,
   * because a different lesson is a different session and is not what this
   * describes.
   */
  async function reload(props: Record<string, unknown> = {}) {
    await closeTab()
    const view = render(<TeachView lesson={fixture()} mode="2d" {...props} />)
    await settle()
    return view
  }

  /**
   * Everything a refresh destroys, destroyed — and nothing it keeps.
   *
   * The saved record is snapshotted and written back around the in-memory
   * clear, and that is not ceremony. `persist` writes on EVERY `setState`, so
   * clearing the store in order to prove the value comes back from storage
   * persists the cleared value first and erases the very thing under test.
   * Measured: storage read back `{"state":{"progress":null}}` and three restore
   * tests failed for that reason and not the one they were written for.
   *
   * This lives in the test and not in `teachStore` on purpose. Production code
   * has no business carrying a "pretend the tab closed" routine, and a helper
   * that clears memory while secretly preserving disk is a trap for the next
   * person to read it.
   */
  async function closeTab(): Promise<void> {
    const onDisk = storage.getItem(TEACH_STORAGE_KEY)
    cleanup()
    useTeachStore.setState({ byLesson: {} })
    if (onDisk !== null) storage.setItem(TEACH_STORAGE_KEY, onDisk)
    await useTeachStore.persist?.rehydrate()
  }

  it('brings a half-typed answer back, character for character', async () => {
    await teach()
    type(HALF_TYPED)
    await settle()

    await reload()

    expect(
      field().value,
      'the learner reopened the tab and their half-written sentence was gone',
    ).toBe(HALF_TYPED)
  })

  it('brings the conversation and the place in the lesson back', async () => {
    const { container } = await teach()
    await answerBeat()
    expect(checkpointText(container), 'the lesson did not advance before the reload').not.toBe('')
    await askAbout('what is precision recall')

    const before = checkpointText(document.body as HTMLElement)
    await reload()

    expect(screen.queryByText(SECOND_BEAT), 'the lesson reopened at the beginning').not.toBeNull()
    /* The bare form, because a doubt the LESSON answered renders through
       `<Answer>` rather than the "You asked" prose branch — the same form the
       older tests in this file assert. */
    expect(
      screen.queryByText('what is precision recall'),
      'the answered question was dropped on reload',
    ).not.toBeNull()
    /* And the answer's own words, which is the assertion that would catch a
       `resolution` that did not survive being written to storage and read back:
       a record whose resolution was lost falls through to the prose branch, so
       this text disappears while the question text stays. */
    expect(screen.queryByText(PR_ANSWER), 'the answer itself was dropped on reload').not.toBeNull()
    expect(checkpointText(document.body as HTMLElement), 'the lesson came back at a different beat').toBe(before)
  })

  it('never restores an answer as still in flight', async () => {
    /* Sent, and deliberately never resolved — the shape of closing the tab while
       the model is still thinking. */
    const stalled = () => new Promise<{ ok: boolean; text: string }>(() => {})
    render(<TeachView lesson={fixture()} mode="2d" ask={stalled} />)
    await settle()

    send(OFF_LESSON)
    await settle()
    expect(field().disabled, 'the box was not in flight before the reload').toBe(true)

    await reload({ ask: stalled })

    /* Nothing is coming back to release this. If it restores as busy, the
       learner has a permanently dead box and no way to know why. */
    expect(
      field().disabled,
      'the box came back disabled with no answer on its way — the learner is locked out',
    ).toBe(false)

    /* The question is not thrown away, and it is not left claiming to be
       working either. It says what actually happened. */
    expect(
      screen.queryByText('You asked: “' + OFF_LESSON + '”'),
      'the unanswered question was silently discarded',
    ).not.toBeNull()
    expect(
      screen.queryByText(ANSWER_LOST),
      'a question stuck mid-flight came back still pretending to be working',
    ).not.toBeNull()
  })

  it('keeps her draft while the next part is being written, instead of swallowing it', async () => {
    /* The lesson has run out of parts and the model is composing the next one.
       Sent, and deliberately never resolved -- a slow model, which is the
       normal case rather than the edge. */
    let asked = 0
    const stillWriting = () => {
      asked += 1
      return new Promise<boolean>(() => {})
    }
    render(<TeachView lesson={fixture()} mode="2d" onNeedNextPart={stillWriting} />)
    await settle()

    /* Answer every beat until the lesson asks for a part it does not have. */
    for (let step = 0; step < 12 && asked === 0; step += 1) await answerBeat()
    expect(asked, 'the lesson never asked for a next part').toBe(1)

    const field = screen.getByLabelText('Answer the question, or ask one of your own') as HTMLInputElement
    /* THE BOX IS BUSY, AND SAYS SO. It used to stay enabled for the whole model
       call -- `busy` carried only the doubt path -- so nothing told her a part
       was on its way. */
    expect(field.disabled, 'the box stayed open while the next part was being written').toBe(true)

    /* Enter pressed anyway -- keyboard focus was already in the box. Before
       this guard, `submit` read the text as an answer, cleared the draft, and
       `advance` then refused because a part was already in flight: her words
       gone, nothing moved, nothing announced. */
    fireEvent.change(field, { target: { value: 'the false positives were the cost' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    await settle()
    expect(field.value, 'her draft was cleared by a submit that did nothing').toBe(
      'the false positives were the cost',
    )
    expect(asked, 'a second next-part request was sent while the first was in flight').toBe(1)
  })

  it('does not re-fire the struggle signal for a session that already fired it', async () => {
    let struggled = 0
    const answered = async () => ({ ok: true, text: 'An answer from the model.' })
    render(<TeachView lesson={fixture()} mode="2d" ask={answered} onStruggling={() => { struggled += 1 }} />)
    await settle()

    /* Three questions on the first beat is over the bar twice over, so the
       signal fires here, before the reload. */
    for (const question of [OFF_LESSON, 'when was that theorem proved in general', 'why does accuracy mislead here']) {
      send(question)
      await settle()
    }
    expect(struggled, 'the signal did not fire before the reload, so the reload proves nothing').toBe(1)

    struggled = 0
    await reload({ ask: answered, onStruggling: () => { struggled += 1 } })

    /* The restored counters are still over every threshold. A mount that
       re-fires, or a next submit that re-fires, deepens a lesson that was
       already deepened. */
    expect(struggled, 'the restored session deepened the lesson a second time on mount').toBe(0)
    /* An interrogative opener, so `classifyTurn` reads it as a QUESTION. Worded
       'and what about recall' this test passed against a mutant that dropped
       `struggleReported` entirely: 'and' is not an opener, so the submit was
       classified as an ANSWER, advanced the beat, and never asked anything for
       the signal to re-fire on. */
    send('what about recall')
    await settle()
    expect(struggled, 'the restored session deepened the lesson again on the next question').toBe(0)
  })

  it('carries the turn counters across the reload, still counting', async () => {
    /*
     * A restore must not re-count what the learner did — and must not forget it
     * either. Written because a mutant that dropped `questionsAsked` from the
     * restore SURVIVED everything else here: every other test either had the
     * signal already fired, or was below the bar both ways round.
     *
     * The scenario is chosen so the two answers differ. Three beats in, two
     * questions is under every threshold, so nothing fires before the reload.
     * The third question takes `questionsAsked` to 3, which is over the bar —
     * but only if the first two came back. Forget them and the reloaded session
     * counts one question and stays silent.
     */
    let struggled = 0
    const answered = async () => ({ ok: true, text: 'An answer from the model.' })
    const onStruggling = () => {
      struggled += 1
    }
    render(<TeachView lesson={fixture()} mode="2d" ask={answered} onStruggling={onStruggling} />)
    await settle()
    await answerBeat()
    await answerBeat()

    send(OFF_LESSON)
    await settle()
    send('when was that theorem proved in general')
    await settle()
    expect(struggled, 'the signal fired before the reload, so this proves nothing').toBe(0)

    await reload({ ask: answered, onStruggling })

    send('why does accuracy mislead here')
    await settle()
    expect(
      struggled,
      'the reloaded session forgot the two questions already asked and stopped counting',
    ).toBe(1)
  })

  it('keeps teaching when localStorage refuses to be written', async () => {
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    try {
      await teach()
      type(HALF_TYPED)
      await settle()
      await answerBeat()

      /* The restore is lost. The lesson is not. */
      expect(screen.queryByText(SECOND_BEAT), 'a full disk stopped the lesson being taught').not.toBeNull()
      expect(write, 'the view never even tried to save, so this proves nothing').toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })

  /**
   * Read what is on disk, then open the lesson.
   *
   * WITHOUT THIS THE TWO TESTS BELOW WERE VACUOUS, and mutation proved it: the
   * store hydrates once when the module is imported, so a test that merely
   * wrote to `localStorage` and rendered was served the in-memory copy and
   * never touched storage at all. Mutants that removed the corrupt-JSON guard
   * and the read-throws guard both SURVIVED. Forcing the rehydrate is what puts
   * the failing read on the path the assertion depends on.
   */
  /*
   * TWO SURVIVING MUTANTS ARE RECORDED HERE, NOT PAPERED OVER.
   *
   * Removing the corrupt-JSON guard and the read-throws guard from
   * `teachStore` leaves all 32 tests green. They survive for a real reason
   * rather than a missing assertion: zustand wraps `storage.getItem` in its own
   * try/catch (`toThenable`, `zustand/esm/middleware.mjs`), so a throwing read
   * and a JSON parse error both abort hydration quietly and the view starts
   * fresh either way. No assertion reachable through this component can tell
   * our guard from the library's.
   *
   * The guards stay. Deleting one because today's version of a dependency also
   * catches is how a fix evaporates in a version bump. What is NOT claimed is
   * that these two tests prove our guard runs -- they prove the OUTCOME the
   * learner needs, which is that a broken read costs a restore and not a
   * lesson. The write guard is a different story and IS observable: a mutant
   * that let `setItem` throw fails the quota test.
   */
  async function openTabReadingDisk() {
    useTeachStore.setState({ byLesson: {} })
    await useTeachStore.persist?.rehydrate()
    const view = render(<TeachView lesson={fixture()} mode="2d" />)
    await settle()
    return view
  }

  it('keeps teaching when localStorage refuses to be read', async () => {
    /* Something IS saved, so a guard that works by finding nothing would not be
       credited for this. */
    storage.setItem(TEACH_STORAGE_KEY, JSON.stringify({ state: { progress: null }, version: 1 }))
    const read = vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('access denied', 'SecurityError')
    })
    try {
      const view = await openTabReadingDisk()
      expect(read, 'the failing read was never reached, so this proves nothing').toHaveBeenCalled()
      expect(
        screen.queryByText(FIRST_BEAT),
        'a private-mode storage read blanked the whole lesson',
      ).not.toBeNull()
      expect(view.container.querySelector('.lc-teach__input'), 'the box was gone').not.toBeNull()
    } finally {
      read.mockRestore()
    }
  })

  it('keeps teaching when the saved session is corrupt', async () => {
    storage.setItem(TEACH_STORAGE_KEY, '{not json at all')
    const view = await openTabReadingDisk()

    expect(screen.queryByText(FIRST_BEAT), 'a corrupt save blanked the lesson').not.toBeNull()
    expect(field().value, 'a corrupt save was read as a draft').toBe('')
    expect(view.container.querySelector('.lc-teach__input'), 'the box was gone').not.toBeNull()
  })

  it('starts a DIFFERENT lesson clean rather than restoring the last one', async () => {
    /* The pair for every restore above: a store that hands back whatever it has
       would open a physics lesson showing a machine-learning conversation. */
    await teach()
    type(HALF_TYPED)
    await settle()

    await closeTab()
    const other = { ...fixture(), id: 'a-completely-different-lesson' }
    render(<TeachView lesson={other} mode="2d" />)
    await settle()

    expect(field().value, "another lesson's draft was restored into this one").toBe('')
  })

  it('saves under the lesson it belongs to, and nothing more', async () => {
    await teach()
    type(HALF_TYPED)
    await settle()

    const saved = loadTeachProgress(fixture().id)
    expect(saved, 'nothing was persisted at all').not.toBeNull()
    expect(saved?.draft, 'the draft was not the thing saved').toBe(HALF_TYPED)
    /* Asserted on the SAVED record, because this is the field that cannot be
       allowed to come back true and the view-level test can only see its
       effect. */
    expect(
      Object.prototype.hasOwnProperty.call(saved as object, 'answerInFlight'),
      'the in-flight latch was written to storage, where it can only do harm',
    ).toBe(false)
  })
})

describe('the server is the truth; this browser is the fast copy', () => {
  /* The owner's decision, 2026-09-02: memory lives in both places and the
     server wins. `/api/memory` had been built, tested and exposed and no
     browser had ever called it. These are the calls. */
  let calls: { url: string; init?: RequestInit }[] = []
  let remote: unknown = null
  beforeEach(() => {
    calls = []
    remote = null
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, ...(init === undefined ? {} : { init }) })
      if (url.startsWith('/api/memory')) {
        if (init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ saved: true }) } as unknown as Response
        return { ok: true, status: 200, json: async () => ({ record: remote }) } as unknown as Response
      }
      throw new Error(`nothing in this test should reach ${url}`)
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  const puts = () => calls.filter((c) => c.url === '/api/memory' && c.init?.method === 'PUT').map((c) => JSON.parse(String(c.init?.body)) as { lessonId: string; record: { revealed: number } })
  const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })

  it('sends progress to the server after a change, once it settles', async () => {
    await teach()
    await answerBeat()
    await wait(900)
    const sent = puts()
    expect(sent.length, 'nothing was written to the server').toBeGreaterThan(0)
    expect(sent[sent.length - 1]!.lessonId).toBe(fixture().id)
    expect(sent[sent.length - 1]!.record.revealed).toBeGreaterThanOrEqual(2)
  })

  it('adopts what the server remembers when it is further along than this browser', async () => {
    remote = { lessonId: fixture().id, revealed: 3, asked: [], draft: '', questionsAsked: 0, emptyAnswers: 0, struggleReported: false }
    await teach()
    await wait(50)
    expect(loadTeachProgress(fixture().id)?.revealed, 'the server was further along and this browser ignored it').toBe(3)
  })

  it("keys a topic canvas's memory by the topic, not by the lesson it happened to write", async () => {
    render(<TeachView lesson={fixture()} mode="2d" memoryKey="topic-42" />)
    await settle()
    await answerBeat()
    await wait(900)
    expect(puts().some((p) => p.lessonId === 'topic-42'), 'the memory was keyed by the lesson id').toBe(true)
  })
})

describe('C3 — what she types inside a lesson is evidence, and a plea is not an answer', () => {
  /* Decided 2026-09-02: questions are rare; a question is the system's move
     only when the learner did not understand. So a plea must reach the tutor
     with everything already taught, not the in-lesson answerer; and a plain
     statement must be filed as what she said, then the lesson goes on. */
  it('a plea goes to the tutor with what was taught, and the box is not left on "Working on it"', async () => {
    const heard: { taught: string; justSaid: string; beat: string; afterBlock: string; beatTitles: readonly string[]; suspects: readonly string[] }[] = []
    render(
      <TeachView
        lesson={fixture()}
        mode="2d"
        onNotUnderstood={async (context) => {
          heard.push(context)
          return { grown: false, question: 'Which step lost you?' }
        }}
      />,
    )
    await settle()
    await askAbout('i still dont get why it stops')
    expect(heard, 'the plea never reached the tutor').toHaveLength(1)
    expect(heard[0]?.justSaid).toBe('i still dont get why it stops')
    expect(heard[0]?.taught.length, 'nothing already taught was sent along').toBeGreaterThan(0)
    expect(heard[0]?.beat).not.toBe('')
    expect(heard[0]?.afterBlock, 'no block to put the answer after').not.toBe('')
    expect(heard[0]?.beatTitles.length, 'the beat she was on has no names to ask about').toBeGreaterThan(0)
    expect(Array.isArray(heard[0]?.suspects), 'the beat carries no warnings list').toBe(true)
    expect(document.body.textContent).not.toMatch(/Working on it/)
  })

  it('a statement is filed as said, at the beat she was on, and the lesson goes on', async () => {
    const filed: { said: string; beat: string }[] = []
    render(<TeachView lesson={fixture()} mode="2d" onSaid={(context) => filed.push(context)} />)
    await settle()
    await askAbout('so it stops when there is nothing left to split')
    expect(filed).toEqual([{ said: 'so it stops when there is nothing left to split', beat: expect.any(String) }])
  })
})

describe('C4 — a plea at a beat that warned her names the belief it warned against', () => {
  /* Decided 2026-09-02: a misconception is a hypothesis with evidence. The
     lesson's misconception blocks say what is WRONG; when she pleads at a beat
     carrying one, that wrong belief is what she may hold, and the server files
     it as a low-confidence hypothesis. Nothing is inferred from a statement. */
  it('sends the wrong beliefs of the beat she was reading, and nothing when the beat warns of none', async () => {
    const heard: { suspects: readonly string[] }[] = []
    const warned = {
      id: 'free-fall',
      question: 'Why do all objects fall at the same rate?',
      blocks: [
        { id: 'heavier-first', kind: 'misconception', role: 'misconception', wrong: 'heavier objects fall faster', correct: 'in a vacuum they fall together', why: 'Gravity pulls harder on more mass, and more mass is harder to move. The two cancel.' },
        { id: 'closing', kind: 'summary', role: 'summary', progression: ['gravity pulls harder on more mass', 'more mass is harder to move', 'the two cancel'], mentalModel: 'Mass cancels out, so everything falls at the same rate.' },
      ],
      relations: [],
    }
    const checked = validateLesson(warned, { teaching: 'answer' })
    if (!checked.ok) throw new Error(`the fixture does not validate: ${JSON.stringify(checked.issues)}`)
    render(
      <TeachView
        lesson={checked.lesson}
        teaching="answer"
        mode="2d"
        onNotUnderstood={async (context) => {
          heard.push(context)
          return { grown: false, question: null }
        }}
      />,
    )
    await settle()
    await askAbout('i dont get why the hammer doesnt land first')
    expect(heard[0]?.suspects, 'the warning the beat carries never reached the server').toEqual(['heavier objects fall faster'])
  })
})
