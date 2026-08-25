import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'

import { Question } from '../design/primitives'
import { cssVariables } from '../design/tokens'
import { checkFrame, plan, type Frame, type Placed } from '../layout/layout'
import { BlockView } from '../render/BlockView'
import { classifyTurn, strugglingAfter } from './turn'
import { createAnswering, type AskPort } from './answering'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson, type Issue } from '../spec/validate'
import { deriveBeats } from './beats'
import {
  checkBeats,
  type Beat,
  type Beats,
  type Doubt,
  type DoubtAnswer,
  type Resolution,
} from './contract'
import { lessonResolver } from './doubt'
import type { AnyResolver } from './contract'

/** The offline answer a learner can always be given. */
const DEFAULT_RESOLVERS: readonly AnyResolver[] = [lessonResolver]

import './teach.css'

/**
 * A lesson, taught one beat at a time.
 *
 * WHAT THIS REPLACES, AND WHY
 * ---------------------------
 * The all-at-once grid paints nine blocks and walks away. That is a lecture:
 * there is no moment where the software finds out whether any of it landed, and
 * a learner who lost the thread at block two reads the remaining seven anyway.
 * Here the lesson arrives in beats, and between beats it stops and asks.
 *
 * THE FRAME IS PLANNED ONCE, FROM THE WHOLE LESSON
 * ------------------------------------------------
 * Not once per reveal. Re-planning is what makes a block that is already on
 * screen change width or column when the next one arrives, and the pause we just
 * took to check the learner's understanding is then spent re-finding something
 * they had already read. Planning from the whole lesson and revealing INTO that
 * frame means a block's column and width are decided before it is first painted
 * and never revised.
 *
 * NO STEP COUNT REACHES THE SCREEN
 * --------------------------------
 * `Beat` deliberately carries no index and no total (see the comment on the type
 * in `contract.ts`), and nothing here derives one. `beats.length` is available
 * and is never read for display. The learner is told whether there is MORE,
 * which is what lets them decide whether to go on; they are never told how much,
 * which is what turns a lesson into a queue to be drained.
 *
 * NEVER PAINT A FAILING FRAME
 * ---------------------------
 * The engine's existing rule, extended to beats. A lesson that fails validation,
 * a cut that fails `checkBeats`, or a frame that fails `checkFrame` produces the
 * reason and nothing else. A half-taught lesson is indistinguishable from a
 * lesson that ended.
 */
export function TeachView({
  lesson,
  mode,
  ask: askPort,
  resolvers = DEFAULT_RESOLVERS,
  onStruggling,
}: {
  lesson: Lesson
  mode: '2d' | '3d'
  /* Reaches the model for questions the lesson itself cannot answer. Absent by
   * default so the canvas still runs standalone -- and when it is absent the
   * learner is TOLD the outside answer is unreachable rather than refused. */
  ask?: AskPort
  /* The resolver chain. An injection point `CanvasRoute` supplies, and the
   * reason a web or engine resolver can be added without touching this file. */
  resolvers?: readonly AnyResolver[]
  /* Called ONCE, the moment the learner's own turns show they are struggling.
   * Depth is added when they ask for it and automatically when their answers
   * show a gap; this is the automatic half. Nothing on screen ever says
   * "difficulty" -- they are being taught, not graded. */
  onStruggling?: () => void
}): JSX.Element {
  const width = useViewportWidth()

  /*
   * Re-validated here even though the caller's type says `Lesson`.
   *
   * The same argument `FigureView` makes for re-checking a figure the validator
   * has already seen: a lesson can arrive from a source that never met the gate
   * — a live edit, a fetch, a future authoring tool — and a view that trusts its
   * input will one day teach a lie. One call, and the refusal is the same one
   * the rest of the canvas gives.
   */
  const validated = useMemo(() => validateLesson(lesson), [lesson])
  const safe = validated.ok ? validated.lesson : null

  const beats = useMemo<Beats>(() => (safe === null ? [] : deriveBeats(safe)), [safe])
  const beatIssues = useMemo(
    () => (safe === null ? [] : checkBeats(beats, safe)),
    [beats, safe],
  )

  const frame = useMemo<Frame | null>(
    () => (safe === null ? null : plan(safe, { width, height: PLAN_HEIGHT })),
    [safe, width],
  )
  const frameFailures = useMemo(
    () => (frame === null ? [] : checkFrame(frame).filter((check) => !check.ok)),
    [frame],
  )

  /* How many beats have been revealed — never rendered, only sliced with. */
  const [revealed, setRevealed] = useState(1)
  const [asked, setAsked] = useState<Asked[]>([])
  const [draft, setDraft] = useState('')
  const [announcement, setAnnouncement] = useState('')
  /* Watched, never shown. Depth is added when the learner asks for it and
     automatically when their answers show a gap; nothing on screen ever says
     "difficulty", because they are being taught, not graded. */
  const [questionsAsked, setQuestionsAsked] = useState(0)
  const [emptyAnswers, setEmptyAnswers] = useState(0)
  /* Fired once. Telling the caller repeatedly would deepen the lesson again on
     every subsequent turn, which is how "adaptive" becomes "unreadable". */
  const struggleReported = useRef(false)

  /*
   * A different lesson is a different session.
   *
   * Without this a learner switching lessons opens the new one partway through
   * and carrying the old one's answers, because the component is the same
   * instance and the state outlives the prop. The previous key is held in a ref
   * rather than compared in an effect body with no guard, so a plain mount does
   * not queue four state updates it will immediately discard.
   */
  const lessonKey = safe === null ? '' : safe.id
  const taught = useRef(lessonKey)
  if (taught.current !== lessonKey) {
    taught.current = lessonKey
    setRevealed(1)
    setAsked([])
    setDraft('')
    setAnnouncement('')
  }

  /*
   * Focus is moved only when the control the learner just used disappears.
   *
   * Revealing a beat normally leaves focus on Continue, which is where the
   * learner put it and where the next one will be — moving it would be taking
   * the pointer out of someone's hand. The exception is the LAST beat, where
   * Continue unmounts: focus would fall to <body> and a keyboard learner would
   * have to tab in from the top of the document to find out what happened. So it
   * lands on the closing question instead, which is the thing that changed.
   */
  const closingRef = useRef<HTMLParagraphElement | null>(null)
  const focusClosing = useRef(false)
  useEffect(() => {
    if (!focusClosing.current) return
    focusClosing.current = false
    closingRef.current?.focus()
  }, [revealed])

  if (!validated.ok) {
    return (
      <Shell>
        <Refused title="This lesson was refused, so it is not being taught" issues={validated.issues} />
      </Shell>
    )
  }

  if (beatIssues.length > 0) {
    return (
      <Shell>
        <Refused
          title="This lesson could not be cut into honest parts, so it is not being taught"
          issues={beatIssues.map((issue) => ({ path: 'beats', message: issue.message }))}
        />
      </Shell>
    )
  }

  if (frame === null || frameFailures.length > 0) {
    return (
      <Shell>
        <Refused
          title="This lesson laid out badly, so it was not painted"
          issues={frameFailures.map((failure) => ({
            path: failure.name,
            message: `failed on: ${failure.offenders.join(', ')}`,
          }))}
        />
      </Shell>
    )
  }

  /* The lesson answers what it can, instantly and without inventing anything.
     Everything else escalates to the model rather than being refused: a learner
     who has just admitted confusion is the worst possible audience for "I
     cannot answer that". */
  const answering = createAnswering({
    resolvers,
    ask: askPort ?? (async () => ({ ok: false, reason: 'no question service is configured' })),
  })

  const teaching = validated.lesson
  const shown = beats.slice(0, Math.min(revealed, beats.length))
  const current = shown[shown.length - 1]

  const blockById = new Map(teaching.blocks.map((block) => [block.id, block]))
  const placedById = new Map(frame.blocks.map((placed) => [placed.id, placed]))

  /*
   * Markers are numbered over the WHOLE lesson, in frame order, once.
   *
   * Numbering only what is currently on screen would renumber the page every
   * time a beat arrived — the block a learner just read as ③ becomes ④ — and the
   * markers exist precisely so they can walk the argument in a fixed order.
   * Counting only titled blocks is `LessonGrid`'s rule and the reason is
   * unchanged: an untitled block draws no marker, so counting by index skips a
   * number and ① ② ③ ⑤ reads as a section that failed to render.
   */
  const markers = markerNumbers(frame, blockById)

  /*
   * ONE BOX, TWO JOBS, AND NO CONTROL TO CHOOSE BETWEEN THEM.
   *
   * A beat already ends with a question. A Continue button beside it asked the
   * learner to answer and then separately confirm that they answered -- a
   * control that served the code, not the person. It is gone. The beat now
   * advances when they ANSWER it.
   *
   * So this one submission carries both meanings, and the TEXT decides which:
   * a question is answered where they stand and never advances the lesson; an
   * answer moves it on. Nothing was added to the screen to disambiguate them.
   */
  function reportStruggle(history: { questionsAsked: number; emptyAnswers: number; beatsSeen: number }): void {
    if (struggleReported.current) return
    if (!strugglingAfter(history)) return
    struggleReported.current = true
    onStruggling?.()
  }

  function submit(text: string): void {
    const kind = classifyTurn(text)
    if (current === undefined) return

    if (kind === 'empty') {
      /* Not a refusal and not an advance. Counted, because pressing Enter on an
         empty box twice is someone stuck for what to say, and that is one of
         the signals that deepens the lesson without anyone being graded. */
      setEmptyAnswers((count) => count + 1)
      reportStruggle({ questionsAsked, emptyAnswers: emptyAnswers + 1, beatsSeen: revealed })
      return
    }

    if (kind === 'answer') {
      setDraft('')
      advance()
      return
    }

    const doubt: Doubt = { text: text.trim(), atBeatId: current.id }
    const at = asked.length
    setDraft('')

    /* Recorded as PENDING first, so the question is visibly received before any
       answer exists. A learner who sees nothing happen assumes they were
       ignored, and stops asking. */
    setAsked((previous) => [...previous, { at, beatId: current.id, doubt, pending: true }])
    setAnnouncement('Your question was received. Working on it.')

    void answering.answer(doubt, teaching).then((answered) => {
      setAsked((previous) =>
        previous.map((record) =>
          record.at === at
            ? {
                ...record,
                pending: false,
                ...(answered.from === 'lesson'
                  ? { resolution: answered.resolution as Resolution }
                  : { prose: answered.text }),
              }
            : record,
        ),
      )
      setQuestionsAsked((count) => count + 1)
      setAnnouncement('A reply to your question has been added above the checkpoint.')
      reportStruggle({ questionsAsked: questionsAsked + 1, emptyAnswers, beatsSeen: revealed })
    })
  }

  function advance(): void {
    const next = beats[revealed]
    if (next === undefined) return
    focusClosing.current = next.isLast
    setRevealed((count) => count + 1)
    setAnnouncement(revealedAnnouncement(next, blockById))
  }

  return (
    <Shell>
      <p className="lc-teach__announce" role="status" aria-live="polite">
        {announcement}
      </p>

      <Question>{teaching.question}</Question>

      <div
        className="lc-teach__grid"
        style={{ gridTemplateColumns: `repeat(${frame.columns}, minmax(0, 1fr))` }}
      >
        {shown.map((beat) => {
          const answers = asked.filter((record) => record.beatId === beat.id)
          return (
            <Fragment key={beat.id}>
              {/*
                A beat's blocks are rendered in FRAME order, not in the order the
                beat lists them. The two usually agree; `plan` reorders when it
                stacks a derived block beneath its source or hoists a simulation
                to the centre, and following the frame keeps a block's cell the
                one the planner gave it.
              */}
              {inFrameOrder(beat, frame).map((id) => {
                const block = blockById.get(id)
                const placed = placedById.get(id)
                if (block === undefined || placed === undefined) return null
                return (
                  <div
                    key={id}
                    className="lc-teach__cell"
                    data-fresh={String(beat === current)}
                    style={{ gridColumn: columnOf(placed, frame) }}
                  >
                    <BlockView block={block} marker={markers.get(id) ?? null} mode={mode} />
                  </div>
                )
              })}

              {/*
                Answers sit with the beat they were asked about, full width.

                Full width because an answer is an interruption and reading as
                one is honest; with the beat because an answer that drifted to
                the bottom of the page would, three beats later, be a correct
                explanation of nothing in particular.
              */}
              {answers.length > 0 && (
                <div className="lc-teach__cell" style={{ gridColumn: '1 / -1' }}>
                  {answers.map((record) => (
                    <Outcome
                      key={record.at}
                      record={record}
                      lesson={teaching}
                      width={width}
                      mode={mode}
                    />
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {current !== undefined && (
        <Checkpoint
          beat={current}
          draft={draft}
          onDraft={setDraft}
          onAsk={submit}
          closingRef={closingRef}
        />
      )}
    </Shell>
  )
}

/* The viewport height `plan` is given. It reads only `width` today, but the
   signature asks for both and inventing a number at each call site is how two
   callers end up planning the same lesson differently. */
const PLAN_HEIGHT = 900

/* -------------------------------------------------------------------------- */
/* The checkpoint                                                             */
/* -------------------------------------------------------------------------- */

function Checkpoint({
  beat,
  draft,
  onDraft,
  onAsk,
  closingRef,
}: {
  beat: Beat
  draft: string
  onDraft: (value: string) => void
  onAsk: (text: string) => void
  closingRef: RefObject<HTMLParagraphElement>
}) {
  return (
    <section className="lc-teach__checkpoint" data-teach-chrome aria-label="Checkpoint">
      {/*
        `beat.checkpoint` is rendered verbatim. The derivation phrases it from
        the lead block's tone and names what is coming next; rewording it here
        would put the question back in the hands of a component that cannot see
        the content, and "Shall I continue?" nine times is a button legend
        wearing a question mark.

        `tabIndex={-1}` makes it programmatically focusable and nothing more —
        it never enters the tab order, so a learner tabbing through the page
        still meets the input and then the buttons.
      */}
      <p className="lc-teach__question" tabIndex={-1} ref={beat.isLast ? closingRef : undefined}>
        {beat.checkpoint}
      </p>

      <div className="lc-teach__controls">
        <form
          className="lc-teach__ask"
          onSubmit={(event) => {
            /* Enter in the field submits the form, which is the whole reason
               this is a <form> and not two handlers on an input. */
            event.preventDefault()
            onAsk(draft)
          }}
        >
          <input
            className="lc-teach__input"
            type="text"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            aria-label="Answer the question, or ask one of your own"
            placeholder="Answer here — or ask if something is not clear"
          />
          <button className="lc-teach__button" type="submit">
            Send
          </button>
        </form>

      </div>

      {/*
        Whether there is more — never how much more. This is the one place a
        progress indicator would be natural and it is deliberately not one: a
        learner told that six parts remain says "continue" to get through them
        rather than to say the last part landed.
      */}
      <p className="lc-teach__more" data-end={String(beat.isLast)}>
        <span className="lc-teach__more-dot" aria-hidden />
        {beat.isLast ? 'That is the end of this lesson.' : 'There is more after this.'}
      </p>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Doubts                                                                     */
/* -------------------------------------------------------------------------- */

interface Asked {
  /** Insertion order. Answers accumulate, so this is a stable React key. */
  at: number
  beatId: string
  doubt: Doubt
  /** True until an answer arrives. A learner who sees nothing happen assumes
   *  they were ignored, and stops asking. */
  pending: boolean
  /** The lesson's own answer, when the lesson could give one. */
  resolution?: Resolution
  /** An answer from outside the lesson, as prose. */
  prose?: string
}

function Outcome({
  record,
  lesson,
  width,
  mode,
}: {
  record: Asked
  lesson: Lesson
  width: number
  mode: '2d' | '3d'
}) {
  if (record.pending) {
    return (
      <p className="lc-teach__asked" data-teach-chrome role="status">
        You asked: “{record.doubt.text}”. Working on it…
      </p>
    )
  }

  /* No refusal branch, and that is the point of this phase. A learner who has
     just admitted confusion is the worst possible audience for "I cannot answer
     that", so a doubt the lesson cannot resolve escalates to the model instead
     of ending the conversation. */
  if (record.resolution !== undefined && record.resolution.kind === 'answer') {
    return (
      <Answer
        asked={record.doubt.text}
        answer={record.resolution}
        lesson={lesson}
        width={width}
        mode={mode}
      />
    )
  }

  return (
    /* `data-teach-chrome` is not decoration: it is what the "never show a step
       count" law scans. A new surface that the view writes and that the law
       cannot see is a hole in the law, not a tidy-up. */
    <div className="lc-teach__asked" data-teach-chrome>
      <p>You asked: “{record.doubt.text}”</p>
      {(record.prose ?? '').split('\n\n').map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}

/**
 * An answer, rendered through the same machinery as the lesson.
 *
 * A `DoubtAnswer` carries a `Lesson`, so it goes through `plan` and `checkFrame`
 * and out through `BlockView` exactly like the main content. That is not tidiness
 * — it is the reason a learner who cannot see why two curves cross gets the two
 * curves drawn again rather than a paragraph about them. A second, simpler,
 * prose-only renderer here would quietly defeat the feature the type was shaped
 * to allow, and it would drift from the design system the first time either side
 * changed.
 */
function Answer({
  asked,
  answer,
  lesson,
  width,
  mode,
}: {
  asked: string
  answer: DoubtAnswer
  lesson: Lesson
  width: number
  mode: '2d' | '3d'
}) {
  const frame = useMemo(() => plan(answer.lesson, { width, height: PLAN_HEIGHT }), [answer, width])
  const failures = useMemo(() => checkFrame(frame).filter((check) => !check.ok), [frame])

  const blockById = new Map(answer.lesson.blocks.map((block) => [block.id, block]))
  const markers = markerNumbers(frame, blockById)

  /* Titled by the block it came from where there is a title, by id otherwise —
     an id is worse to read than a title and far better than a silent gap. */
  const drawnFrom = answer.drawnFrom.map(
    (id) => lesson.blocks.find((block) => block.id === id)?.title ?? id,
  )

  return (
    <div className="lc-teach__answer" data-teach-chrome>
      <span className="lc-teach__answer-label">In answer to your question</span>
      <p className="lc-teach__answer-asked">{asked}</p>

      {/* The gate applies to an answer exactly as it applies to a lesson. An
          answer that lays out badly is not painted badly. */}
      {failures.length > 0 ? (
        <Refused
          title="That answer laid out badly, so it was not painted"
          issues={failures.map((failure) => ({
            path: failure.name,
            message: `failed on: ${failure.offenders.join(', ')}`,
          }))}
        />
      ) : (
        <div
          className="lc-teach__answer-grid"
          style={{ gridTemplateColumns: `repeat(${frame.columns}, minmax(0, 1fr))` }}
        >
          {frame.blocks.map((placed) => {
            const block = blockById.get(placed.id)
            if (block === undefined) return null
            return (
              <div
                key={placed.id}
                className="lc-teach__cell"
                style={{ gridColumn: columnOf(placed, frame) }}
              >
                <BlockView block={block} marker={markers.get(placed.id) ?? null} mode={mode} />
              </div>
            )
          })}
        </div>
      )}

      {drawnFrom.length > 0 && (
        <p className="lc-teach__answer-foot">Drawn from: {drawnFrom.join(' · ')}</p>
      )}
    </div>
  )
}

/**
 * A refusal, rendered as a refusal.
 *
 * Not as an error and not as an apology. A resolver that always produces
 * something is a resolver that invents things, and a confident wrong answer to a
 * learner who has just admitted confusion is the worst output this software can
 * make. So `reason` is shown as written — it is already phrased for the learner
 * — and the design carries no warning colour, because nothing went wrong.
 */
/* The refusal renderer was deleted with this phase. A doubt the lesson
 * cannot answer no longer ends in a refusal -- it escalates to the model --
 * so there is nothing left for it to draw. */

/* -------------------------------------------------------------------------- */
/* Shell and refusal                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The token layer, published on this view's own root.
 *
 * The route that mounts this normally does it too, and declaring the same custom
 * properties twice costs nothing because the values are identical — they come
 * from the same function. Doing it here means a `TeachView` mounted on its own
 * still resolves every `var(--…)` in `teach.css`, rather than rendering an
 * unstyled lesson, which is a broken frame by another name.
 */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="lc-teach" style={cssVariables() as CSSProperties}>
      {children}
    </div>
  )
}

function Refused({ title, issues }: { title: string; issues: Issue[] }) {
  return (
    <div className="lc-refusal" role="alert" data-teach-chrome>
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, index) => (
          <li key={index}>
            <code>{issue.path}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A narrow frame collapses to one column, and a cell must then span all of it.
 *
 * `plan` already answers "how wide"; this only translates the answer into the
 * grid's own words. It never decides a width, which is why the numbers below are
 * indices rather than sizes.
 */
function columnOf(placed: Placed, frame: Frame): string {
  if (frame.columns === 1) return '1 / -1'
  return `${placed.col + 1} / span ${placed.span}`
}

function inFrameOrder(beat: Beat, frame: Frame): string[] {
  const rank = new Map(frame.blocks.map((placed, index) => [placed.id, index]))
  return [...beat.blockIds].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
}

function markerNumbers(frame: Frame, blockById: Map<string, Block>): Map<string, number | null> {
  const out = new Map<string, number | null>()
  let n = 0
  for (const placed of frame.blocks) {
    const block = blockById.get(placed.id)
    out.set(placed.id, block?.title === undefined ? null : (n += 1))
  }
  return out
}

/**
 * What a screen reader is told when a beat arrives.
 *
 * The titles of what appeared, and nothing about position. "A new part has been
 * added" would be true and useless; "part four" would be the count the whole
 * model is built to withhold, and an aria-label is exactly the crack a step
 * number slips through.
 */
function revealedAnnouncement(beat: Beat, blockById: Map<string, Block>): string {
  const titles = beat.blockIds
    .map((id) => blockById.get(id)?.title)
    .filter((title): title is string => title !== undefined)

  if (titles.length === 0) return 'More of the lesson has been added above the checkpoint.'
  return `Added above the checkpoint: ${titles.join(', ')}.`
}

/**
 * The width `plan` is given.
 *
 * Re-planning on RESIZE is not the re-planning the beat model forbids: the
 * learner turned their device, and a frame that ignored that would overflow or
 * waste half the screen. What must never happen is a re-plan triggered by a
 * REVEAL, and nothing here is subscribed to `revealed`.
 */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? DEFAULT_WIDTH : window.innerWidth,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

/* Server-rendered or otherwise window-less. Wide enough to get the full grid,
   so a first paint without a window does not collapse to the one-column frame
   and then jump when the real width arrives. */
const DEFAULT_WIDTH = 1400
