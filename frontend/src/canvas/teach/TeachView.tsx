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
import { isPlea, classifyTurn, strugglingAfter } from './turn'
import { createAnswering, type AskPort } from './answering'
import type { Block, Lesson } from '../spec/spec'
import { validateLesson, type Issue, type TeachingLevel } from '../spec/validate'
import { deriveBeats } from './beats'
import { declines } from './turn'
import {
  checkBeats,
  type Beat,
  type Beats,
  type Doubt,
  type DoubtAnswer,
  type Resolution,
} from './contract'
import { lessonResolver } from './doubt'
import type { SituationPort } from './situation'
import { loadTeachProgress, saveTeachProgress } from './teachStore'
import { readProgress, writeProgress } from '../api/memoryClient'
import type { AnyResolver } from './contract'

/** The offline answer a learner can always be given. */
const DEFAULT_RESOLVERS: readonly AnyResolver[] = [lessonResolver]

import './teach.css'
import { shownAlready } from './shownAlready'

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
  /* Renamed on the way in: `teaching` is already the name of the validated
     lesson twenty lines below, and this is the level it is judged BY. */
  teaching: teachingLevel = 'lesson',
  ask: askPort,
  resolvers = DEFAULT_RESOLVERS,
  situation,
  initialDraft,
  onStruggling,
  onNeedNextPart,
  onNotUnderstood,
  onSaid,
  memoryKey,
}: {
  lesson: Lesson
  mode: '2d' | '3d'
  /** What this lesson's memory is filed under. A topic canvas passes the
      TOPIC id, so one topic keeps one memory whatever lesson was written
      for it; absent, the lesson's own id. */
  memoryKey?: string
  /**
   * WHICH TEACHING RULES THIS LESSON IS JUDGED BY, AND WHY IT HAS TO BE PASSED.
   *
   * `validateLesson` takes a level and this view re-runs it (see below). Until
   * now it re-ran it with no level, so it always used the default, `'lesson'`
   * — the strictest one. A caller that had already accepted a lesson at
   * `'answer'` level then handed it to a view that refused it.
   *
   * MEASURED IN A BROWSER, and it is why `law-a` was red. `CanvasRoute` offers
   * "Same contract, written by hand" at `teaching: 'answer'`, because it is a
   * human's prose and its definition runs to 54 words against a 30-word cap
   * (`.agent/deferred.md`). `validateLesson(byHand, { teaching: 'answer' })`
   * returns `ok: true`; `validateLesson(byHand)` returns seven issues. So the
   * route said teach it and this view said refuse it, and the learner who
   * pressed that button got a list of `blocks[0] — this block marks no
   * important word` and no way to read, ask or continue. A dead end with a
   * reason is still a dead end.
   *
   * The default is unchanged, so every other caller is judged exactly as
   * before. What is fixed is that the two gates now answer the same question.
   */
  teaching?: TeachingLevel
  /* Reaches the model for questions the lesson itself cannot answer. Absent by
   * default so the canvas still runs standalone -- and when it is absent the
   * learner is TOLD the outside answer is unreachable rather than refused. */
  ask?: AskPort
  /* The resolver chain. An injection point `CanvasRoute` supplies, and the
   * reason a web or engine resolver can be added without touching this file. */
  resolvers?: readonly AnyResolver[]
  /* The open-loop ledger. An injection point like `ask` and `resolvers`, and
   * optional for the same reason: this view must keep working with no server
   * at all, and the ledger is a courtesy, never a dependency. */
  situation?: SituationPort
  /* Seeds the ask box ONCE, for the arrival card's "ask it again": her old
   * question waiting in the box, hers to send or edit. Never re-applied on
   * re-render -- the box is hers after first paint. */
  initialDraft?: string
  /* Called ONCE, the moment the learner's own turns show they are struggling.
   * Depth is added when they ask for it and automatically when their answers
   * show a gap; this is the automatic half. Nothing on screen ever says
   * "difficulty" -- they are being taught, not graded. */
  onStruggling?: () => void
  /**
   * Fetch the NEXT part of this lesson, written now, knowing what she has read
   * and what she just said. Resolves true when a part was added.
   *
   * AN INJECTION POINT, LIKE `resolvers` AND `ask`, for the same reason: this
   * view must keep working with no network at all. Absent, a lesson simply
   * ends when its authored beats end, which is exactly what happened before
   * and is still the right behaviour for a hand-written lesson.
   */
  onNeedNextPart?: (context: { taught: string; justSaid: string }) => Promise<boolean>
  /** C3: she said, in these words, that it did not land. The tutor is told
      what was taught and what she said; it comes back a different way and,
      when it wrote one, with the ONE question that finds out what did not land.
      The canvas shows that question; this view only grows the lesson. */
  onNotUnderstood?: (context: { taught: string; justSaid: string; beat: string; afterBlock: string; beatTitles: readonly string[]; suspects: readonly string[] }) => Promise<{ grown: boolean; question: string | null }>
  /** C3: a statement she typed, filed as what she said, at the beat she was on. */
  onSaid?: (context: { said: string; beat: string }) => void
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
  const validated = useMemo(
    () => validateLesson(lesson, { teaching: teachingLevel }),
    [lesson, teachingLevel],
  )
  const safe = validated.ok ? validated.lesson : null

  const beats = useMemo<Beats>(() => (safe === null ? [] : deriveBeats(safe)), [safe])
  /*
   * THE SAME LEVEL, AT THE SECOND GATE TOO.
   *
   * `checkBeats` already takes `{ teaching }` -- see `BeatOptions` -- and this
   * view was the one caller that never passed it, so it always used the
   * default `true`. That reintroduces one level lower exactly the disagreement
   * the `teaching` prop removes: an ANSWER clears `validateLesson` at
   * `'answer'` because `nothing-is-shown` is an arc rule and arc rules are off
   * there, and was then refused by "beat ... shows the learner nothing", which
   * is the same rule under another name.
   *
   * `teachingLevel === 'lesson'` is not a new mapping: it is the one
   * `validate.ts:240` already makes when it turns the arc rules on, written the
   * same way so the two gates cannot drift.
   */
  const beatIssues = useMemo(
    () =>
      safe === null
        ? []
        : checkBeats(beats, safe, { teaching: teachingLevel === 'lesson' }),
    [beats, safe, teachingLevel],
  )

  const frame = useMemo<Frame | null>(
    () => (safe === null ? null : plan(safe, { width, height: PLAN_HEIGHT })),
    [safe, width],
  )
  const frameFailures = useMemo(
    () => (frame === null ? [] : checkFrame(frame).filter((check) => !check.ok)),
    [frame],
  )

  /*
   * The saved session, read ONCE.
   *
   * Read here, in the initialisers, rather than in an effect: an effect would
   * paint the lesson at beat one and then jump, and a learner who saw their
   * place appear and then move would not trust it again. `useState` takes the
   * function form so storage is touched on the first render only.
   *
   * `loadTeachProgress` returns nothing for a different lesson, for a corrupt
   * record, and when storage cannot be read -- so every one of those cases
   * arrives here as a plain fresh start.
   */
  const restored = useRef(loadTeachProgress(safe === null ? '' : (memoryKey ?? safe.id)))

  /* How many beats have been revealed — never rendered, only sliced with. */
  const [revealed, setRevealed] = useState(() => restored.current?.revealed ?? 1)
  const [asked, setAsked] = useState<Asked[]>(() => restored.current?.asked ?? [])
  const [draft, setDraft] = useState(() => restored.current?.draft ?? initialDraft ?? '')
  const [announcement, setAnnouncement] = useState('')
  /* Watched, never shown. Depth is added when the learner asks for it and
     automatically when their answers show a gap; nothing on screen ever says
     "difficulty", because they are being taught, not graded. */
  const [questionsAsked, setQuestionsAsked] = useState(() => restored.current?.questionsAsked ?? 0)
  const [emptyAnswers, setEmptyAnswers] = useState(() => restored.current?.emptyAnswers ?? 0)
  /*
   * Whether an answer is outstanding. ONE SUBMIT IS ONE EFFECT.
   *
   * WHY THIS IS A FACT AND NOT A TIMER
   *   A debounce is a guess about how fast a person presses keys, and it is
   *   wrong for the slow presser in both directions. This is the actual
   *   question: is work already in flight.
   *
   * WHAT IT GUARDS, MEASURED
   *   Two DIFFERENT questions sent before the first landed reached the model
   *   twice, racing two answers against one beat. And the stray second Enter of
   *   a fast double-press arrived as an EMPTY submit -- because `submit` clears
   *   the draft -- which was banked as an empty answer, and two of those trip
   *   `strugglingAfter` and silently deepen the lesson. Same defect, two
   *   routes: a submit acting while another is still working.
   *
   * WHY IT GATES EVERY KIND OF SUBMIT AND NOT JUST QUESTIONS
   *   `answering.ts` already states the invariant this serves: an async answer
   *   must not let the lesson advance while it is in flight. Letting an ANSWER
   *   through here would advance the beat out from under a question the learner
   *   is still waiting on.
   */
  const [answerInFlight, setAnswerInFlight] = useState(false)
  /* A part is being written. Separate from `answerInFlight` because they are
   * different waits: one is her question being answered, one is the lesson
   * carrying on, and showing the wrong message for either is confusing. */
  const [nextPartInFlight, setNextPartInFlight] = useState(false)
  /* The last thing she typed, so the next part can respond to it. A ref, not
   * state: nothing renders from it, and re-rendering on every keystroke to
   * store something only the network reads is waste. */
  const lastSaid = useRef('')
  /*
   * Fired once. Telling the caller repeatedly would deepen the lesson again on
   * every subsequent turn, which is how "adaptive" becomes "unreadable".
   *
   * SEEDED FROM THE RESTORE, and that is the whole point of persisting it. This
   * is a ref, so a reload resets it -- restore the counters beside it and leave
   * this `false` and the learner's next submit re-fires a signal that already
   * fired, deepening a lesson twice for turns they took once.
   */
  const struggleReported = useRef(restored.current?.struggleReported ?? false)

  /*
   * A different lesson is a different session.
   *
   * Without this a learner switching lessons opens the new one partway through
   * and carrying the old one's answers, because the component is the same
   * instance and the state outlives the prop. The previous key is held in a ref
   * rather than compared in an effect body with no guard, so a plain mount does
   * not queue four state updates it will immediately discard.
   */
  const lessonKey = safe === null ? '' : (memoryKey ?? safe.id)
  const taught = useRef(lessonKey)
  if (taught.current !== lessonKey) {
    taught.current = lessonKey
    /* The new lesson's OWN saved session, which is nothing unless this learner
       has been here before. Read through the same door as the first mount, so a
       switch and a reload cannot disagree about what "restored" means. */
    const next = loadTeachProgress(lessonKey)
    restored.current = next
    setRevealed(next?.revealed ?? 1)
    setAsked(next?.asked ?? [])
    setDraft(next?.draft ?? '')
    setAnnouncement('')
    /* The counters travel with the lesson too. They were left behind here
       before, which meant questions asked about one lesson could deepen the
       next one -- a verdict about a lesson the learner had not yet started. */
    setQuestionsAsked(next?.questionsAsked ?? 0)
    setEmptyAnswers(next?.emptyAnswers ?? 0)
    struggleReported.current = next?.struggleReported ?? false
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
  /*
   * Write through, on every change worth keeping.
   *
   * `answerInFlight` is not among the dependencies and not in the record: it is
   * released by the promise that set it, so a stored `true` comes back with
   * nothing on its way to release it and the box is disabled for good. The one
   * flag that could only ever be wrong on the way back is the one flag not
   * saved.
   *
   * `struggleReported` is a ref, so it is read here rather than depended on --
   * every change that flips it also changes a counter in this list, so the
   * record is never written without it.
   */
  /* THE LAST RECORD THE SERVER AND THIS SCREEN AGREED ON. Opening a lesson
     writes nothing -- what is on screen is what was loaded -- and adopting the
     server's own record writes nothing back. Only a change she made is sent.
     Measured 2026-09-02: every reload wrote the progress record once, unchanged. */
  const agreed = useRef<string | null>(null)
  useEffect(() => {
    if (safe === null) return
    const record = {
      lessonId: lessonKey,
      revealed,
      asked,
      draft,
      questionsAsked,
      emptyAnswers,
      struggleReported: struggleReported.current,
    }
    const wire = JSON.stringify(record)
    if (agreed.current === null || agreed.current === wire) {
      agreed.current = wire
      saveTeachProgress(record)
      return
    }
    agreed.current = wire
    saveTeachProgress(record)
    /* THE SERVER IS THE TRUTH, AND THIS IS HOW IT IS TOLD. Debounced: `draft`
       changes on every keystroke and a write per keystroke is noise the
       server would have to refuse in order. What settles is what is sent. */
    const settle = setTimeout(() => {
      void writeProgress(record)
    }, 600)
    return () => clearTimeout(settle)
  }, [safe, lessonKey, revealed, asked, draft, questionsAsked, emptyAnswers])

  /* THE SERVER IS READ ON OPEN, AND WINS WHEN IT IS FURTHER ALONG. The local
     copy has already drawn the screen; if the server remembers more -- this
     student on another browser, or a cleared cache -- that is adopted, through
     the same setters a lesson change uses. Nothing here goes backwards. */
  useEffect(() => {
    if (lessonKey === '') return
    let live = true
    void readProgress(lessonKey).then((remote) => {
      if (!live || remote === null) return
      const local = loadTeachProgress(lessonKey)
      const ahead =
        local === null ||
        remote.revealed > local.revealed ||
        remote.questionsAsked > local.questionsAsked ||
        remote.asked.length > local.asked.length
      if (!ahead) return
      restored.current = remote
      agreed.current = JSON.stringify({
        lessonId: lessonKey,
        revealed: remote.revealed,
        asked: remote.asked,
        draft: remote.draft,
        questionsAsked: remote.questionsAsked,
        emptyAnswers: remote.emptyAnswers,
        struggleReported: remote.struggleReported,
      })
      setRevealed(remote.revealed)
      setAsked(remote.asked)
      setDraft(remote.draft)
      setQuestionsAsked(remote.questionsAsked)
      setEmptyAnswers(remote.emptyAnswers)
      struggleReported.current = remote.struggleReported
    })
    return () => {
      live = false
    }
  }, [lessonKey])

  const pleaInFlight = useRef(false)
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
    ...(situation === undefined ? {} : { situation }),
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
    /* First, before the text is even classified -- an empty stray Enter must be
       dropped, not counted. See `answerInFlight`.

       `nextPartInFlight` too. `advance` refuses while a part is being written,
       so a submit let through here would clear her draft and move nothing:
       her words gone, the lesson still, no announcement. The box is disabled
       for the same span below, and this guard is what holds when it is not. */
    if (answerInFlight || nextPartInFlight) return

    const kind = classifyTurn(text)
    if (current === undefined) return

    /* Kept for the NEXT part to read. Set before the branch so it holds an
     * answer and a doubt alike -- both tell the model something about where
     * she is, and only recording one of them would make the lesson adapt to
     * half of what she said. */
    lastSaid.current = text.trim()

    if (kind === 'empty') {
      /* Not a refusal and not an advance. Counted, because pressing Enter on an
         empty box twice is someone stuck for what to say, and that is one of
         the signals that deepens the lesson without anyone being graded. */
      setEmptyAnswers((count) => count + 1)
      reportStruggle({ questionsAsked, emptyAnswers: emptyAnswers + 1, beatsSeen: revealed })
      return
    }

    if (kind === 'answer') {
      onSaid?.({ said: text.trim(), beat: current.id })
      setDraft('')
      /* AN OFFER DECLINED IS HONOURED. The core has ended and this beat's
         question offered the deeper material by name; "no" means no. Nothing
         moves, the offer stays on screen, and a later yes still opens it.
         Measured before this existed: any answer here advanced, and "no
         thanks" put every deeper block on the screen. */
      if (current.offersDeeper === true && declines(text)) {
        setAnnouncement('That is the end of this one. Say the word, and I will go on.')
        return
      }
      advance()
      return
    }
    /* C3: A PLEA GOES TO THE TUTOR, NOT TO THE IN-LESSON ANSWERER. The
       answerer settles a doubt about a word; a plea means the last part did
       not land, and only the tutor, told what it already said, can come at
       it another way. */
    if (isPlea(text) && onNotUnderstood !== undefined) {
      /* Synchronous, because a click on the submit button fires the click AND
         the form's submit before React has set any state: without this, one
         plea went to the tutor twice and the next part arrived twice. */
      if (pleaInFlight.current) return
      pleaInFlight.current = true
      const said = text.trim()
      setDraft('')
      setAnswerInFlight(true)
      setAnnouncement('Coming at it another way…')
      const afterBlock = current.blockIds[current.blockIds.length - 1] ?? current.id
      /* The names of what she was reading, so a question can be asked about
         THEM if the tutor asks none: a block's title, or its first words. */
      const beatTitles = current.blockIds.flatMap((id) => {
        const block = blockById.get(id) as Record<string, unknown> | undefined
        if (block === undefined) return []
        const title = typeof block['title'] === 'string' ? block['title'].trim() : ''
        if (title !== '') return [title]
        const body = typeof block['body'] === 'string' ? block['body'].trim() : ''
        return body === '' ? [] : [body.split(/\s+/).slice(0, 6).join(' ')]
      })
      /* C4: what this beat WARNED her against. A plea here is evidence she may
         hold it -- a hypothesis for the server to file, never a verdict. */
      const suspects = current.blockIds.flatMap((id) => {
        const block = blockById.get(id) as Record<string, unknown> | undefined
        const wrong = block?.['kind'] === 'misconception' && typeof block['wrong'] === 'string' ? block['wrong'].trim() : ''
        return wrong === '' ? [] : [wrong]
      })
      void onNotUnderstood({ taught: whatSheHasBeenTaught(), justSaid: said, beat: current.id, afterBlock, beatTitles, suspects })
        .then(({ grown, question }) => {
          /* The plea has been answered: it is not "the last thing she said"
             any more, or the next part would be asked for as if she had just
             said it again -- and filed again. */
          lastSaid.current = ''
          if (grown) advance()
          setAnnouncement(question === null ? 'The next part has been added.' : 'There is one question for you below.')
        })
        .catch(() => setAnnouncement('That did not come through. Try once more.'))
        .finally(() => {
          pleaInFlight.current = false
          setAnswerInFlight(false)
        })
      return
    }

    /* The history this component has always kept, finally handed over. Without
       it the resolver cannot tell a first ask from a fourth, and answers all
       four identically -- see `shownAlready` and `Doubt.shown`. */
    const doubt: Doubt = {
      text: text.trim(),
      atBeatId: current.id,
      shown: shownAlready(asked),
    }
    const at = asked.length
    setDraft('')

    /* Recorded as PENDING first, so the question is visibly received before any
       answer exists. A learner who sees nothing happen assumes they were
       ignored, and stops asking. */
    setAsked((previous) => [...previous, { at, beatId: current.id, doubt, pending: true }])
    setAnnouncement('Your question was received. Working on it.')
    setAnswerInFlight(true)

    void answering
      .answer(doubt, teaching)
      .then((answered) => {
        setAsked((previous) =>
          previous.map((record) =>
            record.at === at
              ? {
                  ...record,
                  pending: false,
                  /* RENDER WHAT CAME BACK, NOT WHO SENT IT.
                   *
                   * This branched on `answered.from`, so anything labelled
                   * 'lesson' was rendered as a structured resolution and
                   * everything else as prose. A reply that is from the lesson
                   * AND is a sentence -- "that is not something this lesson
                   * covers, it is about X" -- fell down the gap between them:
                   * `resolution` was undefined, the prose was discarded unread,
                   * and the learner saw her own question echoed with nothing
                   * under it.
                   *
                   * Measured in a browser: asked how to bake a cake, the screen
                   * showed `You asked: "how do i bake a chocolate cake?"` and
                   * then silence. The refusal sentence existed the whole time
                   * and was thrown away one line from being displayed.
                   *
                   * The source label is for telling her WHO answered. It was
                   * never the right thing to pick a renderer with. */
                  ...(answered.resolution !== undefined
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
      .catch((error: unknown) => {
      /*
       * WITHOUT THIS THE LEARNER WAITS FOREVER.
       *
       * `answer` returning a refusal is handled above. `answer` THROWING was
       * not handled at all: the rejection was dropped, `setAsked` never ran,
       * the record stayed `pending: true`, and the screen kept saying "Working
       * on it…" with no answer and no explanation.
       *
       * MEASURED ON CI. `scene-regressions.spec.ts:454` reported
       * `24 x locator resolved to 0 elements` waiting for `.lc-teach__answer`
       * -- ZERO elements, not a refusal element, because the component never
       * left the pending branch. It failed on `desktop-1440`, then
       * `square-900`, then `mobile-375`: three viewports across three runs,
       * which is what a timing-dependent dropped rejection looks like rather
       * than a layout bug.
       *
       * It became reachable when `engineResolver` gained a deadline. A dead
       * middleware used to hang forever; now it throws after 3s, and the throw
       * landed here. The deadline was right. The missing catch is what turned
       * it into a permanent spinner.
       *
       * A rung failing is ordinary and the chain is built for it. SILENCE is
       * not ordinary. The learner is told, in the same place the answer would
       * have appeared, and the record leaves `pending` either way.
       */
      const why = error instanceof Error ? error.message : String(error)
      setAsked((previous) =>
        previous.map((record) =>
          record.at === at
            ? {
                ...record,
                pending: false,
                prose:
                  'That question could not be answered just now — ' +
                  `${why}. Ask it again, or carry on and come back to it.`,
              }
            : record,
        ),
      )
      setAnnouncement('Your question could not be answered. The reason is above the checkpoint.')
      })
      /* Released on EVERY path, including a rejection. `answering.answer` is
         written not to throw, and a guard that trusts that is one refactor away
         from locking a learner out of the box for good -- strictly worse than
         the double call it was added to prevent. */
      .finally(() => {
        setAnswerInFlight(false)
      })
  }

  /**
   * The words already on her screen, in order, for the model to read.
   *
   * Only what has actually been REVEALED. Sending the whole lesson would tell
   * the model things she has not seen, and it would then write a part that
   * follows from something she never read.
   */
  function whatSheHasBeenTaught(): string {
    const lines: string[] = []
    for (const beat of shown) {
      for (const id of beat.blockIds) {
        const block = blockById.get(id) as Record<string, unknown> | undefined
        if (block === undefined) continue
        const said = [block['title'], block['body'], block['caption']]
          .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
          .join(' — ')
        if (said !== '') lines.push(said)
      }
    }
    return lines.join('\n')
  }

  function advance(): void {
    const next = beats[revealed]
    if (next !== undefined) {
      focusClosing.current = next.isLast
      setRevealed((count) => count + 1)
      setAnnouncement(revealedAnnouncement(next, blockById))
      return
    }

    /* NO PART IS WAITING, SO ASK FOR ONE. THIS IS THE WHOLE FEATURE.
     *
     * Until now this line was `if (next === undefined) return` -- the lesson
     * simply stopped, and pressing continue did nothing at all.
     *
     * It stopped because the WHOLE lecture had been written before she read a
     * word of it: `authorLesson.ts` asks the model to "Output one JSON object"
     * with every block filled, and `deriveBeats` slices that finished article
     * into beats. She watched it arrive in pieces, but no piece could respond
     * to her, because all of them were decided in advance.
     *
     * Now the next part is written when she asks for it, and it is told what
     * she has already been shown and what she last said. Part two of a lesson
     * on function graphs is composed after her answer to part one. That is
     * invariant I3 -- one thing at a time -- made real rather than simulated
     * by slicing. */
    if (onNeedNextPart === undefined || nextPartInFlight) return
    setNextPartInFlight(true)
    setAnnouncement('Working on the next part…')
    void onNeedNextPart({ taught: whatSheHasBeenTaught(), justSaid: lastSaid.current })
      .then((arrived) => {
        /* `false` means there genuinely is no more, which is an ending and not
         * a failure. Anything else and she is told plainly, because a button
         * that quietly does nothing is how she learns to stop pressing it. */
        setAnnouncement(
          arrived ? 'The next part has been added.' : 'That is the end of this one.',
        )
      })
      .finally(() => {
        setNextPartInFlight(false)
      })
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
          busy={answerInFlight || nextPartInFlight}
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
  busy,
  closingRef,
}: {
  beat: Beat
  draft: string
  onDraft: (value: string) => void
  onAsk: (text: string) => void
  /* Makes the guard VISIBLE. A key that does nothing, with nothing on screen
     saying why, reads as a broken app -- so the box says it is working rather
     than silently swallowing the press. */
  busy: boolean
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
            disabled={busy}
          />
          <button className="lc-teach__button" type="submit" disabled={busy}>
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

export function markerNumbers(frame: Frame, blockById: Map<string, Block>): Map<string, number | null> {
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
