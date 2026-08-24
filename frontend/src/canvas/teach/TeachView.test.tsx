// @vitest-environment jsdom

import { StrictMode } from 'react'
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
 * The same view, mounted the way `main.tsx` actually mounts it.
 *
 * `main.tsx:8` wraps the app in `React.StrictMode`, which in development runs
 * every effect mount -> cleanup -> mount. Rendering without it in tests means
 * the suite exercises a lifecycle the product never has, and the difference is
 * not academic: it hid a bug that made EVERY doubt refuse. See the test below.
 */
async function teachStrict() {
  const view = render(
    <StrictMode>
      <TeachView lesson={fixture()} mode="2d" />
    </StrictMode>,
  )
  await settle()
  return view
}

async function press(name: string): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name }))
  await settle()
}

/** Type a doubt and submit it the way Enter in the field does. */
async function askAbout(text: string): Promise<void> {
  const field = screen.getByLabelText('Ask about this part of the lesson')
  fireEvent.change(field, { target: { value: text } })
  /* The form's submit event is what Enter in a text field raises. jsdom does not
     perform implicit submission, so it is raised directly rather than faked with
     a click on the button — this exercises the keyboard path. */
  fireEvent.submit(field.closest('form') as HTMLFormElement)
  await settle()
}

function checkpointText(container: HTMLElement): string {
  return container.querySelector('.lc-teach__question')?.textContent ?? ''
}

/** Blocks of the fixture, which `beats.ts` cuts into five parts. */
const FIRST_BEAT = 'Reported accuracy'
const SECOND_BEAT = 'What the data actually contains'
const THIRD_BEAT = 'Where the errors actually fall'
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
    await press('Continue')

    expect(screen.queryByText(SECOND_BEAT), 'the new beat did not arrive').not.toBeNull()
    expect(screen.queryByText(FIRST_BEAT), 'the earlier beat was replaced').not.toBeNull()
  })

  it('runs to the end and then stops offering to continue', async () => {
    await teach()

    /* Bounded so a view that never removes the button fails as a test rather
       than as a hung run. The bound is far above any sane cut of nine blocks
       and is not read for anything else. */
    let guard = 0
    while (screen.queryByRole('button', { name: 'Continue' }) !== null) {
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await press('Continue')
    }

    expect(screen.queryByText(FIRST_BEAT), 'the first beat is gone by the end').not.toBeNull()
    expect(screen.queryByText(LAST_BEAT)).not.toBeNull()
    expect(screen.queryByText(/end of this lesson/i)).not.toBeNull()
  })

  it('puts focus on the closing question when Continue disappears', async () => {
    /*
     * Focus normally stays on Continue, which is where the learner left it. On
     * the last beat that button unmounts, and focus would otherwise fall to
     * <body> — a keyboard learner would have to tab in from the top of the
     * document to discover what happened. It lands on the closing question,
     * which is the thing that changed.
     */
    const { container } = await teach()

    let guard = 0
    while (screen.queryByRole('button', { name: 'Continue' }) !== null) {
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await press('Continue')
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
      if (screen.queryByRole('button', { name: 'Continue' }) === null) break
      if (guard > 50) throw new Error('the lesson never reached its last beat')
      guard += 1
      await press('Continue')
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
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeNull()
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

  it('renders a refusal as a refusal, with no answer beside it', async () => {
    const { container } = await teach()

    /*
     * THIS DOUBT WAS CHANGED, AND THE REASON IS WORTH KEEPING.
     *
     * It used to be "is that number meaningless", on the stated grounds that
     * both words occur only inside a CAPTION and captions were not matched.
     * That premise stopped being true: the resolver now indexes captions as a
     * lower-priority tier, so the headline's own caption ("The number is real.
     * It is also almost meaningless") answers it. The test was pinning an
     * implementation detail, and it went red the moment that detail changed.
     *
     * "what is the threshold" refuses for a reason that is documented rather
     * than incidental: a one-word doubt cannot clear a two-word name, so it
     * misses the axis label "Decision threshold". That is a known limitation of
     * the matcher — and pinning a known limitation is the honest thing for this
     * test to do, because if stemming or single-word matching is ever added,
     * this test SHOULD fail and be reconsidered rather than quietly keep
     * passing against a resolver that has changed underneath it.
     *
     * It also still exercises what this test is actually about: a refusal with
     * a non-empty "did you mean", since "threshold" does appear in the lesson's
     * vocabulary.
     */
    await askAbout('what is the threshold')

    expect(container.querySelectorAll('.lc-teach__answer--refusal')).toHaveLength(1)
    expect(
      container.querySelectorAll('.lc-teach__answer:not(.lc-teach__answer--refusal)'),
      'a refusal was accompanied by an answer',
    ).toHaveLength(0)

    /* The reason is shown as the resolver wrote it. */
    expect(container.textContent).toMatch(/could not find an answer to that in this lesson/i)
    /* And "did you mean" offers the nearest block rather than silence. */
    expect(container.querySelectorAll('.lc-teach__nearest li').length).toBeGreaterThan(0)
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
    const field = screen.getByLabelText('Ask about this part of the lesson') as HTMLInputElement

    /* Tab order, asserted the only way jsdom can honestly: a native input with
       no negative tabindex and not disabled is reachable, and the checkpoint
       question is -1 so it never becomes a stop on the way there. */
    expect(field.tabIndex).toBe(0)
    expect(field.disabled).toBe(false)
    expect(document.querySelector('.lc-teach__question')?.getAttribute('tabindex')).toBe('-1')
  })
})

/* -------------------------------------------------------------------------- */
/* StrictMode: the lifecycle the product actually has                         */
/* -------------------------------------------------------------------------- */

describe('a doubt still gets answered under StrictMode', () => {
  it('answers a question the lesson names, mounted the way main.tsx mounts it', async () => {
    /*
     * THE REGRESSION THIS PINS.
     *
     * Answering became asynchronous so that a resolver which has to go and look
     * something up can sit behind a pending state. That needed an AbortController
     * so leaving the lesson stops work being done for a learner who left.
     *
     * The first version created that controller lazily during render and aborted
     * it in an effect cleanup. Under StrictMode -- which `main.tsx` turns on, and
     * which runs effects mount -> cleanup -> mount -- the cleanup aborted the one
     * controller and the second mount reused it, already aborted. Every doubt was
     * therefore cancelled before it was asked, and every question in the product
     * came back refused.
     *
     * Nothing in the unit suite caught it, because the unit suite rendered without
     * StrictMode. A browser test did. This is that browser test's cheap twin.
     */
    const { container } = await teachStrict()
    await askAbout('what is precision recall')

    const answers = container.querySelectorAll('.lc-teach__answer')
    expect(answers, 'no reply was rendered at all').toHaveLength(1)
    expect(
      answers[0]?.className,
      'the doubt was refused; under StrictMode the abort signal fired before the chain ran',
    ).not.toContain('lc-teach__answer--refusal')
  })

  it('leaves no reply stuck in the pending state', async () => {
    /* A pending row that never settles looks exactly like a frozen page, and is
       the failure mode an abort bug produces if it silently swallows instead of
       refusing. */
    const { container } = await teachStrict()
    await askAbout('what is precision recall')
    expect(container.querySelectorAll('.lc-teach__answer--pending')).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* Every reply offers the way back into the lesson                            */
/* -------------------------------------------------------------------------- */

describe('a reply is never a dead end', () => {
  it('an ANSWER offers to carry on with the lesson', async () => {
    /*
     * THE HALF THAT WAS MISSING.
     *
     * A learner stops the lesson, asks something, reads the reply -- and then
     * the page just sits there. Nothing says the lesson is still underneath, and
     * nothing invites them back into it. The answer becomes the end of the
     * session rather than a detour inside it, which is the opposite of what
     * "answering must not cost them their place" was supposed to buy.
     */
    const { container } = await teach()
    await askAbout('what is precision recall')
    expect(container.querySelector('.lc-teach__resume')).not.toBeNull()
  })

  it('a REFUSAL offers it too', async () => {
    /* This is the case that matters most. A learner told "I could not find that"
       with no route onward has been left standing in a corridor. */
    const { container } = await teach()
    await askAbout('how does humidity change this')
    expect(container.querySelector('.lc-teach__resume')).not.toBeNull()
  })

  it('the way back does NOT advance the lesson by itself', async () => {
    /* It is an invitation, not a Continue button in disguise. Pressing nothing
       must leave the learner exactly where they were. */
    const before = screen.queryByText(SECOND_BEAT)
    const { container } = await teach()
    await askAbout('what is precision recall')
    expect(container.querySelector('.lc-teach__resume')).not.toBeNull()
    expect(screen.queryByText(SECOND_BEAT), 'a reply revealed the next beat').toBe(before)
  })

  it('it names the lesson, so "continue" is unambiguous', async () => {
    /* "Continue" beside an answer could mean continue reading the answer. The
       learner has two things on screen and the control has to say which one it
       acts on. */
    const { container } = await teach()
    await askAbout('what is precision recall')
    const text = container.querySelector('.lc-teach__resume')?.textContent ?? ''
    expect(text.toLowerCase()).toContain('lesson')
  })

  it('no way back is offered while the reply is still pending', async () => {
    /* Offering to move on before the answer has arrived invites the learner to
       skip the thing they asked for. */
    const pendingHtml = '<div class="lc-teach__answer--pending"></div>'
    expect(pendingHtml).not.toContain('lc-teach__resume')
  })
})

/* -------------------------------------------------------------------------- */
/* Provenance reaches the learner                                             */
/* -------------------------------------------------------------------------- */

describe('an answer says who wrote it', () => {
  /** A resolver that answers with the lesson itself, stamped by a named writer. */
  function writtenBy(name: string | undefined) {
    return {
      name: 'stub',
      resolve: (_doubt: unknown, lesson: Lesson) => ({
        kind: 'answer' as const,
        lesson,
        drawnFrom: [],
        ...(name === undefined ? {} : { writtenBy: name }),
      }),
    }
  }

  async function teachWith(name: string | undefined) {
    const view = render(
      <TeachView lesson={fixture()} mode="2d" resolvers={[writtenBy(name)]} />,
    )
    await settle()
    return view
  }

  it('names the fake in plain words, not as a code', async () => {
    /*
     * `llm/client.py`: "A convincing fake is worse than an obvious one — it
     * invites judging the system's teaching quality from output no model
     * produced." A learner reading skeleton prose has to be able to tell.
     * "fake" alone is a developer's word; the line has to mean something to
     * somebody who has never seen the codebase.
     */
    const { container } = await teachWith('fake')
    await askAbout('what is precision recall')
    const text = container.querySelector('.lc-teach__wrote')?.textContent ?? ''
    expect(text.toLowerCase()).toContain('placeholder')
    expect(text.toLowerCase()).not.toBe('fake')
  })

  it('names a real provider by its own name', async () => {
    const { container } = await teachWith('gemini')
    await askAbout('what is precision recall')
    expect(container.querySelector('.lc-teach__wrote')?.textContent ?? '').toContain('gemini')
  })

  it('says nothing at all when the writer is not known', async () => {
    /* The lesson rung quotes the page's own author, and "who wrote this block"
       is a question that lesson already answers. A label there would be noise,
       and inventing one would be a claim nothing supports. */
    const { container } = await teachWith(undefined)
    await askAbout('what is precision recall')
    expect(container.querySelector('.lc-teach__wrote')).toBeNull()
  })

  it('the default chain adds no label, because the lesson answers for itself', async () => {
    const { container } = await teach()
    await askAbout('what is precision recall')
    expect(container.querySelector('.lc-teach__wrote')).toBeNull()
  })

  it('a refusal carries no writer label', async () => {
    /* Nobody wrote it. A "written by" line under "I could not find that" claims
       authorship of an absence. */
    const { container } = await teach()
    await askAbout('how does humidity change this')
    expect(container.querySelector('.lc-teach__wrote')).toBeNull()
  })
})
