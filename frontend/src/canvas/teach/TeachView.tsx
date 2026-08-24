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
import type { Block, Lesson } from '../spec/spec'
import { validateLesson, type Issue } from '../spec/validate'
import { deriveBeats } from './beats'
import { askChain } from './chain'
import {
  checkBeats,
  type AnyResolver,
  type Beat,
  type Beats,
  type Doubt,
  type DoubtAnswer,
  type DoubtRefusal,
  type Resolution,
} from './contract'
import { lessonResolver } from './doubt'

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
/**
 * Who gets asked, in order, when a learner has a doubt.
 *
 * A PROP WITH A DEFAULT, RATHER THAN AN IMPORT
 * --------------------------------------------
 * `lessonResolver` alone is the honest default: it needs no network, no key and
 * no configuration, and it is the only answerer that can point at the page the
 * learner is looking at. Anything further — the web, the engine — is a decision
 * about deployment, and burying that decision in this file is how a component
 * comes to require a backend nobody told you about.
 *
 * The order is a TRUST ranking. See `chain.ts`.
 */
const DEFAULT_RESOLVERS: readonly AnyResolver[] = [lessonResolver]

export function TeachView({
  lesson,
  mode,
  resolvers = DEFAULT_RESOLVERS,
}: {
  lesson: Lesson
  mode: '2d' | '3d'
  resolvers?: readonly AnyResolver[]
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

  /*
   * A counter rather than `previous.length`, because the record is now written
   * twice — once pending, once settled — and the settle has to find the row it
   * created. Length is not an identity once two questions can be in flight at
   * the same time.
   */
  const askCounter = useRef(0)

  /*
   * Leaving the lesson stops work being done on the learner's behalf.
   *
   * THE CONTROLLER IS CREATED INSIDE THE EFFECT, AND THAT IS NOT A STYLE CHOICE.
   *
   * The first version built it lazily during render and aborted it in this
   * cleanup. `main.tsx` wraps the app in `React.StrictMode`, which runs every
   * effect mount -> cleanup -> mount: the cleanup aborted the single controller,
   * the second mount found the ref already populated and reused it, and every
   * doubt from then on was cancelled before it was asked. The whole feature came
   * back "refused" and looked like a resolver bug.
   *
   * Creating it here means each mount gets a live one and each cleanup aborts
   * only the controller that mount created. Pinned by the StrictMode tests in
   * `TeachView.test.tsx`; the unit suite missed this because it rendered without
   * StrictMode, so a browser run was the first thing to see it.
   *
   * A ref rather than state because aborting must not cause a render.
   */
  const doubtAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    doubtAbort.current = controller
    return () => {
      controller.abort()
      /* Cleared so a question asked between unmount and the next mount finds no
         signal at all rather than a dead one — no signal means "not cancelled",
         which is the correct reading when nothing is there to cancel it. */
      if (doubtAbort.current === controller) doubtAbort.current = null
    }
  }, [])

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

  function ask(text: string): void {
    const trimmed = text.trim()
    /* An empty submit is a no-op, not a refusal. Handing the resolver whitespace
       would produce a perfectly reasoned "I cannot answer that" to a question
       nobody asked, which teaches the learner that asking is risky. */
    if (trimmed.length === 0 || current === undefined) return

    const doubt: Doubt = { text: trimmed, atBeatId: current.id }
    const beatId = current.id

    /*
     * The question appears BEFORE the answer does, and that ordering is the
     * whole reason `ask` is no longer synchronous.
     *
     * With one offline resolver the answer arrived in the same tick and this
     * distinction did not exist. A chain that can reach a network has a real
     * gap between asking and answering, and a learner staring at an unchanged
     * page during that gap cannot tell "working" from "broken". So the record
     * is appended immediately, in a pending state, and filled in when the chain
     * settles.
     */
    const at = askCounter.current
    askCounter.current += 1

    setAsked((previous) => [
      ...previous,
      { at, beatId, doubt, resolution: null, asking: null, answeredBy: null },
    ])
    setDraft('')
    setAnnouncement('Your question was added above the checkpoint.')

    const settle = (patch: Partial<Asked>): void => {
      setAsked((previous) =>
        previous.map((record) => (record.at === at ? { ...record, ...patch } : record)),
      )
    }

    void askChain(doubt, teaching, resolvers, {
      signal: doubtAbort.current?.signal,
      onTry: (name) => settle({ asking: name }),
    }).then((result) => {
      settle({ resolution: result.resolution, asking: null, answeredBy: result.answeredBy })
      setAnnouncement(
        result.resolution.kind === 'answer'
          ? 'A reply to your question has been added above the checkpoint.'
          : `A reply to your question has been added above the checkpoint. ${result.resolution.reason}`,
      )
    })

    /* Nothing above touches `revealed`. There is no route from a doubt to the
       next beat, which is the point of the feature, and `askChain` has no beat
       in scope so no resolver can find one however long it takes. */
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
          onAsk={ask}
          onContinue={advance}
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
  onContinue,
  closingRef,
}: {
  beat: Beat
  draft: string
  onDraft: (value: string) => void
  onAsk: (text: string) => void
  onContinue: () => void
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
            aria-label="Ask about this part of the lesson"
            placeholder="Not clear? Ask about it"
          />
          <button className="lc-teach__button" type="submit">
            Ask
          </button>
        </form>

        {/* The last beat asks what is still unclear, so there is nothing to
            continue TO and no button offering it. */}
        {!beat.isLast && (
          <button className="lc-teach__button lc-teach__button--go" type="button" onClick={onContinue}>
            Continue
          </button>
        )}
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
  /**
   * Null while the chain is still being asked.
   *
   * A separate state rather than an optimistic placeholder answer: a learner
   * must never be shown something that looks like an answer and is not one, and
   * the type is what guarantees the renderer cannot confuse the two.
   */
  resolution: Resolution | null
  /** The resolver currently being asked, so waiting can be explained. */
  asking: string | null
  /** Which resolver answered. Null when nothing did, or while pending. */
  answeredBy: string | null
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
  if (record.resolution === null) {
    /* No way back while the reply is still coming. Offering to move on before
       the answer has arrived invites the learner to skip the thing they just
       asked for. */
    return <Pending asked={record.doubt.text} asking={record.asking} />
  }
  if (record.resolution.kind === 'refusal') {
    return (
      <>
        <Refusal asked={record.doubt.text} refusal={record.resolution} lesson={lesson} />
        <Resume />
      </>
    )
  }
  return (
    <>
      <Answer
        asked={record.doubt.text}
        answer={record.resolution}
        lesson={lesson}
        width={width}
        mode={mode}
      />
      <WrittenBy who={record.resolution.writtenBy} />
      <Resume />
    </>
  )
}

/**
 * Who wrote the sentences the learner just read.
 *
 * THE RULE, IN THE REPOSITORY'S OWN WORDS.
 * `learning-os/.../llm/client.py`: "A convincing fake is worse than an obvious
 * one -- it invites judging the system's teaching quality from output no model
 * produced." And `CanvasRoute.tsx` labels the hand-written lesson "so nobody
 * reads it as a model's work" -- the lesson picker already ships provenance
 * labels. The doubt path was the one place that rule had lapsed.
 *
 * THE FAKE IS NAMED IN WORDS A LEARNER HAS. "fake" is a developer's term and
 * means nothing to somebody who has never seen the codebase; what they need to
 * know is that these sentences are a placeholder rather than teaching.
 *
 * NOTHING IS RENDERED WHEN THE WRITER IS UNKNOWN. The lesson rung quotes the
 * page's own author, and "who wrote this block" is a question that lesson
 * already answers -- a label there would be noise, and inventing one would be a
 * claim nothing supports.
 */
function WrittenBy({ who }: { who?: string }) {
  if (who === undefined) return null
  return (
    <p className="lc-teach__wrote" data-teach-chrome>
      {who === 'fake'
        ? 'Written by a placeholder, not a real model — the words are a stand-in, the shape is real.'
        : `Written by ${who}.`}
    </p>
  )
}

/**
 * The way back into the lesson, under every settled reply.
 *
 * THE HALF THAT WAS MISSING, AND WHY IT MATTERS MORE THAN THE ANSWER
 * ------------------------------------------------------------------
 * The feature's whole promise is that asking a question does not cost the
 * learner their place. The types enforced the first half of that — a `Doubt`
 * carries its beat, and there is no route from one to the next — but nothing
 * enforced the second half. A learner stopped, asked, read the reply, and then
 * the page just sat there. The lesson was still underneath and nothing said so.
 * A detour with no marked exit is indistinguishable from an arrival.
 *
 * It appears under a REFUSAL as well, and that is the case that matters most.
 * "I could not find an answer to that" with nothing after it leaves somebody who
 * has just admitted confusion standing in a corridor.
 *
 * IT IS A SENTENCE, NOT A BUTTON, AND THAT IS DELIBERATE.
 * Continue already exists, below, and it is the only control that reveals a
 * beat. A second control here that also advanced would be two buttons doing one
 * job, and the learner would have to guess which of the two things on screen
 * "continue" acted on. This points at the one that already works.
 */
function Resume() {
  return (
    <p className="lc-teach__resume" data-teach-chrome>
      That is as much as I can say about it. Shall we carry on with the lesson?
    </p>
  )
}

/**
 * The question, on screen, before there is an answer to put under it.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * With one offline resolver there was no gap: the answer arrived in the same
 * tick the question was submitted, and a pending state would have been a frame
 * nobody ever saw. A chain that can reach a network has a real gap, and during
 * it the page is unchanged — which is indistinguishable from a page that
 * ignored the question. A learner who has just admitted confusion and appears
 * to be ignored does not ask again.
 *
 * It shows the resolver being asked rather than a bare spinner, because "asking
 * the web" and "thinking" mean different things to somebody deciding whether to
 * wait. `role="status"` so a screen reader announces it without stealing focus
 * from the field the learner just typed into.
 */
function Pending({ asked, asking }: { asked: string; asking: string | null }) {
  return (
    <div className="lc-teach__answer lc-teach__answer--pending" data-teach-chrome role="status">
      <span className="lc-teach__answer-label">About your question</span>
      <p className="lc-teach__answer-asked">{asked}</p>
      <p className="lc-teach__answer-body">
        {asking === null ? 'Looking…' : `Looking in: ${asking}…`}
      </p>
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
function Refusal({
  asked,
  refusal,
  lesson,
}: {
  asked: string
  refusal: DoubtRefusal
  lesson: Lesson
}) {
  const nearest = refusal.nearest
    .map((id) => lesson.blocks.find((block) => block.id === id)?.title ?? id)
    .filter((label) => label.length > 0)

  return (
    <div className="lc-teach__answer lc-teach__answer--refusal" data-teach-chrome>
      <span className="lc-teach__answer-label">About your question</span>
      <p className="lc-teach__answer-asked">{asked}</p>
      <p className="lc-teach__answer-body">{refusal.reason}</p>

      {nearest.length > 0 && (
        <>
          <p className="lc-teach__answer-foot">Did you mean:</p>
          <ul className="lc-teach__nearest">
            {nearest.map((label) => (
              <li key={label} className="lc-pill">
                {label}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

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
