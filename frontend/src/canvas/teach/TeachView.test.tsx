// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { classifierEvaluation } from '../lessons/classifierEvaluation'
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
