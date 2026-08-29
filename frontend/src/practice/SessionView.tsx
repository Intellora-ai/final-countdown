import { chapterById, chapterOfTopic, hasTopic, subjectOfChapter, topicById, topicsOfChapter } from './registry'
import { Suspense } from 'react'
import { FigureView } from '../canvas/render/FigureView'
import { useEffect, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, useState } from 'react'
import { STEERS, type Steer } from './engine/steer'
import { asChapterId, asSubjectId, asTopicId } from './engine/ids'

import {
  type TopicConcept,
} from './curriculum'
import { adviceFrom, orderByNeed, signalFrom } from './engine/mastery'
import { modelProvider } from './engine/modelProvider'
import { fixtureProvider } from './engine/provider'
import type { TopicProfile } from './engine/plan'
import type { OptionKey, QuestionCount } from './engine/types'
import {
  currentQuestion,
  progressOf,
  remainingFor,
  revealFor,
  useSessionStore,
} from './sessionStore'
import { usePracticeStore } from './store'

/**
 * Which generator the session uses.
 *
 * THE FIXTURE IS THE DEFAULT, AND THAT IS DELIBERATE
 * --------------------------------------------------
 * `modelProvider` posts to a same-origin proxy that holds the API key, because
 * a key shipped to a browser is a key you have published. Until that proxy
 * exists, defaulting to the model would mean every practice session opens,
 * fails, and shows the learner a refusal — a worse experience than templated
 * questions.
 *
 * So the switch is explicit. Set `VITE_PRACTICE_PROVIDER=model` once the
 * endpoint is deployed. Both providers go through the identical verifier, so
 * flipping this changes where questions come from and nothing about what is
 * allowed to reach a student.
 */
function chooseProvider() {
  const configured = import.meta.env['VITE_PRACTICE_PROVIDER'];
  if (configured === 'model') {
    return modelProvider({ endpoint: import.meta.env['VITE_PRACTICE_ENDPOINT'] });
  }
  return fixtureProvider();
}

/** The words on the four corner controls, and the marks beside them. */
const STEER_LABEL: Record<Steer, string> = {
  'more-like-this': 'More like this',
  different: 'Different',
  harder: 'Harder',
  easier: 'Easier',
}

/*
 * `aria-hidden`, because a screen reader announcing "clockwise open circle
 * arrow" adds nothing the label has not already said.
 */
const STEER_GLYPH: Record<Steer, string> = {
  'more-like-this': '\u21bb',
  different: '\u2260',
  harder: '\u2191',
  easier: '\u2193',
}

/** Everything the browser will hand focus to inside the card. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The practice session, from generation through to the result.
 *
 * IT IS A REAL MODAL, SO IT IS MADE TO BE ONE
 * -------------------------------------------
 * `aria-modal="true"` is not a description — it tells assistive technology to
 * ignore everything outside this node. Claiming it without trapping focus means
 * a screen-reader user tabs onto the map behind while their software insists
 * those controls do not exist. Focus is trapped while it is open and handed
 * back to whatever opened it.
 *
 * THE ANSWER ARRIVES ONLY AFTER THE LEARNER COMMITS
 * -------------------------------------------------
 * This component never holds the answer key. `currentQuestion()` returns a
 * shape with no `correctOption` and no `fullSolution` field on it, and
 * `revealFor()` returns null until the learner has answered. Both gates live in
 * the store, so "remember not to render it early" is not a thing anyone has to
 * remember.
 */
export function SessionView() {
  const launchedFrom = usePracticeStore((state) => state.launchedFrom)
  const settings = usePracticeStore((state) => state.settings)
  const dismissLaunch = usePracticeStore((state) => state.dismissLaunch)
  const recordPractice = usePracticeStore((state) => state.recordPractice)

  /*
   * Selected field by field rather than as a whole snapshot. Subscribing to the
   * entire store would re-render this on every timer tick even when nothing it
   * displays has moved.
   */
  const status = useSessionStore((state) => state.status)
  const session = useSessionStore((state) => state.session)
  const errorDetail = useSessionStore((state) => state.error?.detail ?? null)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const open = launchedFrom !== null

  /* ---- Focus trap ------------------------------------------------------ */

  useEffect(() => {
    if (!open) return

    const opener = document.activeElement
    focusFirst(cardRef.current)

    /* Tab is trapped by the keydown handler; this catches everything else —
       a scrim click, a screen reader's own navigation, a stray focus() call.
       Without it, "trapped" would mean "trapped against one key". */
    const onFocusIn = (event: FocusEvent) => {
      const inside = cardRef.current
      if (!inside || (event.target instanceof Node && inside.contains(event.target))) return
      focusFirst(inside)
    }
    document.addEventListener('focusin', onFocusIn)

    /*
     * THE TRAP HAS TO SURVIVE THE CONTENT CHANGING UNDER IT.
     *
     * `focusin` only fires when something GAINS focus. When this card goes from
     * "generating" to a rendered question, React replaces the subtree and the
     * focused button goes with it — focus falls to `document.body`, which fires
     * no `focusin` at all. So the guard above sees nothing and a keyboard user
     * is silently dropped out of a dialog that still claims to be modal.
     *
     * A MutationObserver catches exactly that: content changed, nothing inside
     * holds focus, pull it back.
     */
    const observer = new MutationObserver(() => {
      const card = cardRef.current
      if (!card) return
      const active = document.activeElement
      if (active && card.contains(active)) return
      focusFirst(card)
    })
    if (cardRef.current) {
      observer.observe(cardRef.current, { childList: true, subtree: true })
    }

    return () => {
      observer.disconnect()
      // Removed BEFORE focus goes back, or the guard would snatch it straight
      // out of the map again.
      document.removeEventListener('focusin', onFocusIn)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [open])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const card = cardRef.current
    if (!card) return

    const stops = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  /* ---- Generation ------------------------------------------------------ */

  /*
   * The next set is shaped by the last ones.
   *
   * `orderByNeed` puts the concepts this learner is getting wrong at the front,
   * and the planner already rotates through concepts in order — so reordering
   * here is the entire mechanism, with no planner change and no special case.
   * A topic with no history comes back untouched.
   */
  const profile = useMemo(() => {
    const base = profileFor(launchedFrom)
    if (!base) return null

    const signal = signalFrom(useSessionStore.getState().history)
    return { ...base, concepts: orderByNeed(base.concepts, signal) }
  }, [launchedFrom])

  /*
   * Generation is read out of the store inside the effect rather than closed
   * over from a render. Depending on the store's own function would re-run this
   * whenever the store changed identity, and the whole point is that it runs
   * once per opened session — the `idle` guard is what enforces that.
   */
  useEffect(() => {
    if (!open || !profile) return
    if (useSessionStore.getState().status !== 'idle') return

    void useSessionStore.getState().start({
      sessionId: `${profile.topicId}-${Date.now()}`,
      userId: 'local',
      profile,
      count: settings.questionCount as QuestionCount,
      provider: chooseProvider(),
      timerEnabled: settings.timerEnabled,
      timerMinutes: settings.timerMinutes,
    })
  }, [open, profile, settings.questionCount, settings.timerEnabled, settings.timerMinutes])

  /* ---- The clock ------------------------------------------------------- */

  const timed = session?.timerEnabled === true
  const live = session !== null && session.status === 'IN_PROGRESS'

  useEffect(() => {
    if (!timed || !live) return
    const id = window.setInterval(() => useSessionStore.getState().tick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [timed, live])

  /* ---- Leaving --------------------------------------------------------- */

  const finished = session !== null && session.status !== 'IN_PROGRESS'

  const leave = () => {
    const session = useSessionStore.getState().session
    if (session && session.status === 'IN_PROGRESS') {
      useSessionStore.getState().exit(Date.now())
    }

    /* Feed the map. A session that produced no answers still counts as having
       been opened, but it must not claim attempts nobody made. */
    const result = useSessionStore.getState().history[0]
    if (result && result.answeredCount > 0) {
      const topicId = result.topicId
      if (hasTopic(topicId)) {
        recordPractice(topicId, result.answeredCount, result.correctCount)
      }
    }

    useSessionStore.getState().dismiss()
    dismissLaunch()
  }

  if (!launchedFrom) return null

  const scope =
    launchedFrom.kind === 'chapter'
      ? (chapterById(launchedFrom.id)?.name ?? 'this chapter')
      : (topicById(launchedFrom.id)?.name ?? 'this topic')

  return (
    /*
     * The same disagreement as `PanZoom`: the rule reads the tag, not the role.
     * A modal dialog MUST handle the keyboard -- Escape closes it, and focus is
     * trapped inside -- so `onKeyDown` on the element carrying `role="dialog"`
     * and `aria-modal` is the required pattern, not a violation of it.
     */
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="pm-session"
      role="dialog"
      aria-modal="true"
      aria-label="Practice session"
      onKeyDown={onKeyDown}
    >
      <div ref={cardRef} className="pm-session-card">
        <header className="pm-q-head">
          <p className="pm-session-eyebrow">{scope}</p>
          {status === 'ready' && !finished ? <Progress /> : null}
        </header>

        {status === 'generating' ? <Generating /> : null}
        {status === 'failed' ? <Failed detail={errorDetail ?? 'Unknown failure.'} /> : null}
        {status === 'ready' && !finished ? <Question /> : null}
        {finished ? <Result /> : null}

        <button type="button" className="pm-session-back" onClick={leave}>
          Back to the map
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/*
 * SELECTORS RETURN PRIMITIVES OR STABLE REFERENCES. NEVER FRESH OBJECTS.
 *
 * zustand compares a selector's result by reference, so a selector that builds
 * `{current, total}` returns a new object on every call, reads as "changed" on
 * every store update, and re-renders forever. React reports it as "Maximum
 * update depth exceeded", which names the symptom and not the cause.
 *
 * `store.ts` already carries this warning for the map's selectors. The same
 * trap was walked into here. So the components below select `session` — one
 * stable reference — and derive through `useMemo`.
 */
function Progress() {
  const session = useSessionStore((state) => state.session)

  const progress = useMemo(() => progressOf(session), [session])
  const remaining = useMemo(() => remainingFor(session), [session])

  return (
    <div className="pm-q-meta">
      {progress ? (
        <span className="pm-q-count">
          Question {progress.current} / {progress.total}
        </span>
      ) : null}
      {remaining !== null ? (
        <span className="pm-q-clock" aria-live="off">
          {formatClock(remaining)} remaining
        </span>
      ) : null}
    </div>
  )
}

function Generating() {
  return (
    <p className="pm-session-note" role="status">
      Writing your questions. Every one is checked before it is shown, so this
      takes a moment.
    </p>
  )
}

function Failed({ detail }: { detail: string }) {
  return (
    <div role="alert">
      <h2 className="pm-session-title">No set to give you</h2>
      {/* Saying what went wrong rather than "something went wrong". A learner
          who is told the truth can decide whether to retry or pick another
          topic; a shrug leaves them tapping a button that will fail again. */}
      <p className="pm-session-note">{detail}</p>
      <p className="pm-session-note">
        Nothing unverified is ever shown, so the set was refused rather than
        filled out with questions that had not been checked.
      </p>
    </div>
  )
}

function Question() {
  const session = useSessionStore((state) => state.session)
  const revealedMap = useSessionStore((state) => state.revealed)
  const answer = useSessionStore((state) => state.answer)

  const question = useMemo(() => currentQuestion(session), [session])

  const revealed = useMemo(
    () => (question ? revealFor(session, revealedMap, question.questionId) : null),
    [session, question, revealedMap],
  )

  /*
   * The option the student has touched but not committed.
   *
   * Selecting used to reveal instantly, which left no moment where a learner had
   * decided and not yet been graded -- and that moment is the one where a
   * mis-click can still be taken back. Keyed by question id so moving on clears
   * it without a second effect to forget.
   */
  const [pending, setPendingRaw] = useState<{ id: string; key: OptionKey } | null>(null)
  /*
   * What the student asked for next. Recorded rather than acted on immediately:
   * the request belongs to the NEXT generation, and firing it here would throw
   * away the solution they are still reading.
   */
  const [steerChoice, setSteer] = useState<Steer | null>(null)
  const pendingKey = pending && question && pending.id === question.questionId ? pending.key : null
  const setPending = (key: OptionKey) => {
    if (question) setPendingRaw({ id: question.questionId, key })
  }

  if (!question || !session) return null

  const chosen = session.attempts.find((a) => a.questionId === question.questionId)
  const atLast = session.currentIndex >= session.questions.length - 1

  return (
    <div className="pm-q">
      <h2 className="pm-q-text">{question.questionText}</h2>

      {question.figure === null ? null : (
        <div className="pm-q-figure">
          {/*
            * The figure is drawn by the canvas renderer the rest of the product
            * uses -- `FigureView` dispatches one of twelve shapes and refuses a
            * figure whose data contradicts its own type. No chart is built
            * here, and none is styled here either: a second implementation of a
            * bar chart is how two parts of one product start disagreeing about
            * what a bar chart looks like.
            *
            * `Suspense`, because every shape renderer is behind `lazy` so a
            * question with one flow diagram does not download the plotting
            * engine. The fallback is a sized blank rather than a spinner: the
            * space is reserved either way, so the options below do not jump
            * once the chart arrives.
            */}
          <Suspense fallback={<div className="pm-q-figure-wait" aria-hidden />}>
            <FigureView block={question.figure} />
          </Suspense>
        </div>
      )}

      <ul className="pm-q-options">
        {question.options.map((option, index) => {
          const isChosen = revealed ? chosen?.selectedOption === option.key : pendingKey === option.key
          const isAnswer = revealed?.correctOption === option.key

          return (
            <li key={option.key} className="pm-q-slot" data-slot={String(index)}>
              <button
                type="button"
                className="pm-q-option"
                data-slot={String(index)}
                /* The state is on the element, not in a colour. A learner using
                   a screen reader gets the same information a sighted one does. */
                aria-pressed={isChosen}
                /*
                 * SPELLED OUT because the two spans below concatenate to
                 * "A25 units" with no separator, which a screen reader reads as
                 * "A twenty-five units". The visual layout supplies the gap; the
                 * accessible name has to supply its own.
                 */
                aria-label={`${option.key} — ${option.text}`}
                data-state={revealed ? (isAnswer ? 'correct' : isChosen ? 'wrong' : 'idle') : 'idle'}
                disabled={revealed !== null}
                onClick={() => setPending(option.key as OptionKey)}
              >
                <span className="pm-q-key">{option.key}</span>
                <span className="pm-q-option-text">{option.text}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {pendingKey !== null && revealed === null ? (
        <button
          type="button"
          className="pm-q-confirm"
          onClick={() => answer(question.questionId, pendingKey, Date.now())}
        >
          Confirm
        </button>
      ) : null}

      {revealed ? (
        <div className="pm-q-solution">
          <p className="pm-q-verdict">
            {chosen?.correct ? 'Correct.' : `Not quite — the answer is ${revealed.correctOption}.`}
          </p>
          <p className="pm-q-working">{revealed.fullSolution}</p>

          <button
            type="button"
            className="pm-start"
            onClick={() => {
              if (atLast) {
                useSessionStore.getState().submit(Date.now())
                return
              }
              useSessionStore.getState().next()
            }}
          >
            {atLast ? 'Finish' : 'Next question'}
          </button>

        </div>
      ) : null}

      {/*
        * THE FOUR STEERS, in the corner, from the moment the question opens.
        *
        * They used to appear only after the answer was revealed, so that a
        * student could not skip a hard question by asking for a different one.
        * The reference screen places them beside Confirm while the question is
        * still open, and that is the product decision.
        *
        * The cost is real and is not hidden: a student CAN now press Easier
        * instead of thinking. `engine/steer.ts` still decides what each one
        * asks for and §17 still holds -- no steer ever leaves the topic, so the
        * worst case is an easier question about the right thing.
        */}
      <div className="pm-q-steer" role="group" aria-label="Ask for another question like this">
        {STEERS.map((each) => (
          <button
            key={each}
            type="button"
            className="pm-q-steer-button"
            data-steer={each}
            onClick={() => setSteer(each)}
            aria-pressed={steerChoice === each}
          >
            <span aria-hidden="true" className="pm-q-steer-glyph">
              {STEER_GLYPH[each]}
            </span>
            {STEER_LABEL[each]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Result() {
  const history = useSessionStore((state) => state.history)
  const result = history[0]

  /*
   * The advice is the reason the per-question record exists.
   *
   * "7 of 10" tells a learner they got three wrong. This tells them the three
   * were the same idea, or the same slip across three different ideas — which
   * are different problems with different fixes, and only the second reading
   * suggests one. It is empty when there is nothing worth saying, because a
   * message every session trains people to skip the one that mattered.
   */
  const advice = useMemo(() => adviceFrom(signalFrom(history)), [history])

  if (!result) return null

  return (
    <div className="pm-q-result">
      <h2 className="pm-session-title">
        {result.correctCount} of {result.answeredCount} correct
      </h2>
      <p className="pm-session-note">
        {describeEnding(result.status)} {result.answeredCount} of {result.requested} answered.
      </p>

      {advice.map((line) => (
        <p key={line} className="pm-q-advice">
          {line}
        </p>
      ))}

      <ul className="pm-q-breakdown">
        {result.attempts.map((attempt) => (
          <li key={attempt.questionId} data-correct={attempt.correct}>
            <span className="pm-q-concept">{attempt.conceptId.replace(/-/g, ' ')}</span>
            <span className="pm-q-mark">{attempt.correct ? 'right' : 'wrong'}</span>
            {attempt.mistakePattern ? (
              <span className="pm-q-slip">{attempt.mistakePattern}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A topic profile from what the curriculum actually knows.
 *
 * THE HONEST LIMITATION, STATED RATHER THAN HIDDEN
 * ------------------------------------------------
 * `curriculum.ts` carries subjects, chapters and topic names. It does NOT carry
 * per-topic concepts, prerequisites or common misconceptions, which is what the
 * planner would use to spread a set across ideas.
 *
 * So a topic becomes one concept, and a chapter becomes one concept per topic.
 * That is a real constraint, not a placeholder pretending to be data: with one
 * concept the set still varies by reasoning route and difficulty, because those
 * are planned independently, but it cannot spread across sub-ideas the
 * curriculum has never been told about. Enriching the curriculum is what lifts
 * it, and inventing concepts here would only hide that.
 */
function profileFor(selection: ReturnType<typeof usePracticeStore.getState>['launchedFrom']): TopicProfile | null {
  if (!selection) return null

  if (selection.kind === 'topic') {
    const topic = topicById(selection.id)
    if (!topic) return null

    return {
      topicId: asTopicId(topic.id),
      chapterId: asChapterId(chapterOfTopic(selection.id) ?? 'unknown'),
      subjectId: asSubjectId(
        subjectOfChapter(chapterOfTopic(selection.id) ?? '') ?? 'unknown',
      ),
      quantitative: quantitativeOf(topic),
      concepts: conceptsOf(topic),
    }
  }

  const chapter = chapterById(selection.id)
  if (!chapter) return null
  const topics = topicsOfChapter(selection.id)
  if (topics.length === 0) return null

  /*
   * A chapter draws one concept per topic rather than every topic's full
   * breakdown. Fifteen questions spread across five topics is the point of
   * practising a chapter; spreading them across a chapter's forty sub-concepts
   * would touch each one at most once and teach nothing about any of them.
   */
  return {
    topicId: asTopicId(chapter.id),
    chapterId: asChapterId(chapter.id),
    subjectId: asSubjectId(subjectOfChapter(chapter.id) ?? 'unknown'),
    quantitative: average(topics.map(quantitativeOf)),
    concepts: topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      topicId: asTopicId(topic.id),
      numeric: (topic.concepts ?? []).some((concept) => concept.numeric),
      prerequisites: [],
      commonMisconception: null,
    })),
  }
}

/**
 * The topic's concepts, or the topic itself as its only concept.
 *
 * The fallback is honest rather than convenient: a topic nobody has broken
 * down yet genuinely has one known idea in it, and pretending otherwise would
 * mean inventing sub-concepts at render time.
 */
function conceptsOf(topic: { id: string; name: string; concepts?: readonly TopicConcept[] }) {
  const declared = topic.concepts ?? []
  if (declared.length === 0) {
    return [
      {
        id: topic.id,
        name: topic.name,
        topicId: asTopicId(topic.id),
        numeric: true,
        prerequisites: [],
        commonMisconception: null,
      },
    ]
  }

  return declared.map((concept) => ({
    id: concept.id,
    name: concept.name,
    topicId: asTopicId(topic.id),
    numeric: concept.numeric,
    prerequisites: concept.prerequisites ?? [],
    commonMisconception: concept.misconception ?? null,
  }))
}

/**
 * How computational the topic is, measured rather than assumed.
 *
 * The old 0.5 was a placeholder standing in for every topic in the syllabus,
 * which meant the type mix never actually varied by subject matter — the thing
 * `typeMixFor` exists to do. Where concepts are declared, the share of numeric
 * ones is a real signal. Where they are not, 0.5 is still the honest answer.
 */
function quantitativeOf(topic: { concepts?: readonly TopicConcept[] }): number {
  const declared = topic.concepts ?? []
  if (declared.length === 0) return 0.5
  return declared.filter((concept) => concept.numeric).length / declared.length
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0.5
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function describeEnding(status: string): string {
  if (status === 'TIMED_OUT') return 'Time ran out.'
  if (status === 'EXITED') return 'You left early.'
  if (status === 'COMPLETED') return 'You finished the set.'
  return 'Submitted.'
}

/** mm:ss, floored, so a countdown never shows a second it has already spent. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function focusFirst(card: HTMLElement | null): void {
  if (!card) return
  const first = card.querySelector<HTMLElement>(FOCUSABLE)
  if (first) {
    first.focus()
    return
  }
  card.tabIndex = -1
  card.focus()
}
