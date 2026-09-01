import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { AnyResolver } from './teach/contract'
import { lessonResolver } from './teach/doubt'
import { engineResolver } from './teach/engineResolver'
import { webResolver, type SearchResult } from './teach/webResolver'
import { modelResolver } from './teach/modelResolver'
import { cssVariables } from './design/tokens'
import { billBecomesLaw } from './lessons/billBecomesLaw'
import { classifierEvaluation } from './lessons/classifierEvaluation'
import { gasPressure } from './lessons/gasPressure'
import { logarithms } from './lessons/logarithms'
import { tenses } from './lessons/tenses'
/* Engine output, not hand-authored. `learning-os` generates these from two
   learners with IDENTICAL knowledge and different histories — see
   `learning_os/api/demo.py`, whose `--check` keeps them from drifting. The
   picker shows the ENGINE choosing differently, not a human writing twice. */
import learnerA from './lessons/generated/learner-a-first-attempt.json'
import learnerB from './lessons/generated/learner-b-preferred-mechanism-failed.json'
/* NOT engine output. Prose written by hand to the same contract, because the
   fake model writes badly on purpose (see `llm/client.py`) and thin skeletons
   cannot show what the contract does to real sentences. Labelled as
   hand-written wherever it appears, so nobody reads it as a model's work. */
import byHand from './lessons/handwritten/contract-honoured-by-hand.json'
import { validateLesson, type Issue, type TeachingLevel } from './spec/validate'
import { chatOnce } from '../agent/ports/httpModel'
import { sourcesFrom } from './teach/researched'
import type { Source } from './teach/grounding'
import { explainAgain, NOTHING_YET, type Remembered } from './teach/again'
import { scopedQuery } from './teach/level'
import type { Lesson } from './spec/spec'
import { TeachView } from './teach/TeachView'

import './design/canvas.css'
import './route.css'

/**
 * The canvas, inside this app.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * This is the second canvas to live at `src/canvas/`. The first one rendered a
 * single hand-built gas lesson and a gallery beside it; its panels stated their
 * own positions, so every new lesson meant a new coordinate table and a new
 * component. It is gone. What sits here now is the engine: a lesson is DATA, a
 * layout is DERIVED from that data, and adding a subject adds a file of content
 * rather than a file of code. The three lessons below are unrelated on purpose
 * — physics, civics, machine learning — because three subjects that lay out
 * differently through one engine is the only real evidence that the engine is
 * reading the content rather than repeating a template.
 *
 * WHY THIS FILE IS THIN
 * ---------------------
 * Everything specific to teaching lives in `teach/`. This file knows three
 * things the engine must not: that there is a dashboard to go back to, which
 * lessons this product ships, and that a learner may want the 3D view. Keeping
 * those here is what lets `spec/`, `layout/` and `render/` stay portable — they
 * have no idea they are inside a study app.
 */

/**
 * WHY EACH ENTRY CARRIES ITS OWN TEACHING LEVEL
 * ---------------------------------------------
 * The first five are authored LESSONS and owe the whole arc — a definition
 * first, a summary last, something shown rather than told.
 *
 * The two GENERATED entries are lessons too, as of Batch 4.
 *
 * They were ANSWERS because the engine's `emit` built only `prose` and
 * `callout` -- so it could not open with a definition, could not close with a
 * progression, and could not show anything at all. That was a limit of the
 * output contract, not of the canvas: `GeneratedContent.blocks` was a
 * `(kind, text)` pair, and a sentence cannot carry a summary's progression or a
 * flow's nodes. The pair grew an optional third slot for exactly that, and the
 * emitter now sets `role` from the model's own declaration -- which is what
 * `checkArc` reads to find the definition and the summary.
 *
 * `by-hand` stays an ANSWER, and the reason is different in kind: it is a HUMAN
 * meeting the same contract, and its prose does not meet the arc (a 54-word
 * definition against a 30-word cap). Recorded in `.agent/deferred.md`. The
 * level is a property of what a thing IS, so it is recorded here beside the
 * thing rather than assumed at the call site.
 */
const LESSONS = [
  { id: 'logs', label: 'Maths', spec: logarithms, teaching: 'lesson' },
  { id: 'tenses', label: 'English', spec: tenses, teaching: 'lesson' },
  { id: 'gas', label: 'Physics', spec: gasPressure, teaching: 'lesson' },
  { id: 'bill', label: 'Civics', spec: billBecomesLaw, teaching: 'lesson' },
  { id: 'ml', label: 'Machine learning', spec: classifierEvaluation, teaching: 'lesson' },
  // The last three are the engine's, not an author's. A and B share a knowledge
  // state and differ only in what has already been tried on them, so the two
  // sitting side by side is the adaptation claim rendered rather than asserted.
  { id: 'engine-a', label: 'Engine: first attempt', spec: learnerA, teaching: 'lesson' },
  { id: 'engine-b', label: 'Engine: preferred mechanism failed', spec: learnerB, teaching: 'lesson' },
  { id: 'by-hand', label: 'Same contract, written by hand', spec: byHand, teaching: 'answer' },
] as const satisfies readonly { id: string; label: string; spec: unknown; teaching: TeachingLevel }[]

/**
 * How the canvas reaches a source outside the lesson, if it has one.
 *
 * A FUNCTION PASSED IN, NOT A MODULE IMPORTED HERE. Two reasons, both real.
 *
 * The first is the bundle. `src/websearch` is not tiny, and a static import
 * would land it in whichever chunk this file belongs to whether or not anyone
 * ever asks a question. `App.tsx` hands down a loader that `import()`s it on
 * first use, so a learner who never gets stuck never downloads it.
 *
 * The second is the type-checker. `tsconfig.canvas.json` checks this directory
 * under `noUncheckedIndexedAccess`, a flag `src/websearch` was not written
 * against; importing it from here drags the whole directory into that stricter
 * project. Taking a function keeps the dependency one-way and erased.
 */
export type WebSearch = (query: string, options: Record<string, unknown>) => Promise<SearchResult>

/**
 * The local model the learner's own machine is running.
 *
 * Same three variables `TutorView` reads, on purpose. A second set would mean a
 * machine configured for the tutor still could not author a lesson, and the
 * learner would have no way to tell which half they had missed.
 */
/**
 * Offered as a CHOICE, not as a refusal.
 *
 * This used to be shown "instead of a refusal when there is no model to refuse
 * anything", on a control that was disabled. Nothing was refused because
 * nothing was asked, and nothing could be asked. The server writes lessons
 * whether or not she has a model of her own, so the only thing setting this
 * variable changes is WHERE the writing happens -- and the wording says that
 * rather than implying the canvas is broken until she edits a dotfile.
 */
const OWN_MODEL_NOTE =
  'Lessons are written by the server. To have them written by a model you run '
  + 'yourself instead, set VITE_TUTOR_ENDPOINT to a chat-completions URL — usually '
  + 'http://localhost:11434/v1/chat/completions (Ollama) '
  + 'or http://localhost:1234/v1/chat/completions (LM Studio).'

/**
 * A LESSON FROM THE SERVER, FOR A LEARNER WHO HAS NO MODEL OF HER OWN.
 *
 * `/api/ask` is not new and is not a fallback bolted on here: it is the route
 * `needNextPart` below has been posting to all along, and `server/handler.ts`
 * already picks a provider, validates what comes back against THIS SAME
 * `validateLesson`, and refuses with the gate's own issues. So this adds a
 * caller, not a mechanism.
 *
 * WHY IT IS VALIDATED AGAIN HERE. The server validated it, and this file's own
 * rule is that a block the model wrote is not trusted further than an authored
 * one -- `picked` re-validates the grown blocks for exactly that reason. A
 * second check costs one pass over a small object and means nothing reaches the
 * screen that this build's gate has not read.
 *
 * EVERY FAILURE ARRIVES AS ISSUES, NEVER AS A THROW. `authorFailed` is what the
 * canvas renders when a lesson cannot be written, and it renders `Issue[]`. A
 * network error that arrived as an exception would be reported by the caller's
 * catch as `(model)`, blaming a model that was never asked -- the same wrong
 * blame that disabling this control was originally meant to avoid.
 */
async function askTheServer(
  question: string,
  /** Routes already spent on this topic, so the server can pick a fresh one. */
  alreadyUsed: readonly string[],
): Promise<
  | {
      ok: true
      lesson: Lesson
      route: string
      teaching: TeachingLevel
      /** See `TutorTurn`. Absent when the whole-lesson path answered. */
      turn: TutorTurn | null
    }
  | { ok: false; issues: Issue[] }
> {
  let body: { lesson?: unknown; error?: unknown; route?: unknown; checkpoint?: unknown; next?: unknown }
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, alreadyUsed }),
    })
    body = (await response.json()) as { lesson?: unknown; error?: unknown }
    if (!response.ok) {
      /* The server's own words where it gave them. Replacing them with a status
         code would throw away the only description of what went wrong. */
      const said = typeof body?.error === 'string' && body.error.trim() !== ''
        ? body.error
        : `the server answered ${response.status} and said nothing more`

      /*
       * THREE FAILURES THAT MUST NOT WEAR EACH OTHER'S SENTENCE.
       *
       * The `path` is what the banner branches on, so it is where the
       * difference has to survive. Collapsing these is not a wording problem:
       * each wrong sentence sends her to do a different wrong thing. Told her
       * question does not teach, she rewrites a question that was fine. Told
       * the server is down, she gives up instead of waiting a minute. Told to
       * wait, she waits for a server that is not coming back.
       */

      /* BUSY IS NOT BROKEN. A 429 means it answered, promptly, that it has too
         much on. The only useful thing to tell her is to come back. */
      if (response.status === 429) {
        return { ok: false, issues: [{ path: '(busy)', message: said }] }
      }

      /* THE GATE'S OWN REASONS WHERE IT GAVE THEM, NOT A SUMMARY OF THEM.
         `server/handler.ts` refuses with 502 and the issue list `validateLesson`
         produced. Those are the specific, per-rule sentences; replacing them
         with "the server said 502" would throw away the only description of
         what was actually wrong with the lesson. */
      const fromTheGate = Array.isArray((body as { issues?: unknown })?.issues)
        ? ((body as { issues?: Issue[] }).issues as Issue[])
        : []
      if (fromTheGate.length > 0) return { ok: false, issues: fromTheGate }

      return { ok: false, issues: [{ path: '(server)', message: said }] }
    }
  } catch (thrown) {
    return {
      ok: false,
      issues: [{
        path: '(server)',
        message: thrown instanceof Error ? thrown.message : String(thrown),
      }],
    }
  }

  /*
   * AT THE LEVEL THE SERVER ACTUALLY WROTE IT AT, WHICH IS NO LONGER ALWAYS
   * `'lesson'`.
   *
   * What this said before, and why it was right when it was written: a lesson
   * that is structurally perfect and all words -- one prose block, no
   * representation, no summary -- clears `'answer'` exactly because `'answer'`
   * turns the arc rules off (`validate.ts:240`), so judging a WHOLE LESSON at
   * `'answer'` would hand the learner a paragraph under a heading that promised
   * to teach. That argument stands, and it is why this is not simply pinned to
   * `'answer'`.
   *
   * ITS PREMISE STOPPED BEING TRUE. `/api/ask` was moved onto `authorConcept`
   * -- see `handler.ts`, `conceptFor` -- and a CONCEPT is one idea, not a
   * lesson. It owes no closing progression, and `authorConcept` says so by
   * validating at `'answer'` itself (`concept.ts:754`). So this line judged an
   * answer by a lesson's arc and refused every concept the server has written
   * since.
   *
   * MEASURED, in the browser, on this build: `/api/ask` answered 200 in 5.1s
   * with a real photosynthesis concept, and this gate refused it with "the
   * lesson stops rather than ending. After the full system, close with the
   * progression and the one sentence worth keeping" -- a rule about lessons,
   * applied to something that is not one. Every topic typed into the box died
   * here, after the model had already answered.
   *
   * `route` IS THE SIGNAL, NOT A NEW FLAG. Only `authorConcept` returns one, so
   * its presence is the server saying "this is a concept". Absent means the
   * whole-lesson path answered -- `handler.ts` still falls through to
   * `authorLesson` for a provider with no `chat` -- and that owes the full arc
   * and is still judged as one. `LearnView` reads exactly this signal for
   * exactly this reason, and `AskView` records paying for the same mistake.
   *
   * RETURNED, NOT JUST USED. `TeachView` re-validates whatever it is handed and
   * defaults to `'lesson'`, so a level decided here and forgotten would clear
   * this gate and be refused by the identical gate one component later. The
   * caller carries it through so the two gates are one gate.
   */
  const level: TeachingLevel =
    typeof body?.route === 'string' && body.route.trim() !== '' ? 'answer' : 'lesson'
  const checked = validateLesson(body?.lesson, { teaching: level })
  if (!checked.ok) return { ok: false, issues: [...checked.issues] }

  /* '' rather than a throw when the server did not name a route: an unnamed
     route simply cannot be excluded next time, which costs variety and not the
     lesson. Refusing a lesson she can read over a bookkeeping field would be
     the wrong trade. */
  return {
    ok: true,
    lesson: checked.lesson,
    route: typeof body?.route === 'string' ? body.route : '',
    teaching: level,
    turn: tutorTurnFrom(body),
  }
}

/**
 * WHAT THE TUTOR ASKS AFTER IT HAS EXPLAINED.
 *
 * `conceptIssues` refuses a concept with no `checkpoint` and no two named
 * branches -- "the step ends by asserting, not by asking", "only N branches
 * offered. Give at least two, so what comes next is a choice". Both were
 * therefore written on every request and REQUIRED by the gate, and then
 * dropped by `validateLesson`, which is right to: a `Lesson` has no such
 * fields. `handler.ts` now sends them beside the lesson instead of inside it.
 *
 * Without this the canvas explained and then stopped dead. A real tutor
 * finishes by finding out whether it landed and offering somewhere to go, and
 * the model had been writing exactly that, unread, all along.
 */
export interface TutorTurn {
  /** The question that finds out whether the idea landed. */
  readonly checkpoint: string
  /** Named ways on from here. At least two, or the gate refused the concept. */
  readonly next: readonly { readonly id: string; readonly label: string }[]
}

/**
 * Read the tutor turn off a reply, or decide there is not one.
 *
 * PARSED DEFENSIVELY AND NEVER THROWN OVER. This is the last thing on the page
 * and the lesson above it is already correct; a malformed `next` must cost the
 * follow-up question, never the explanation. A turn with no checkpoint and no
 * branches is `null` rather than an empty box.
 */
function tutorTurnFrom(body: { checkpoint?: unknown; next?: unknown } | undefined): TutorTurn | null {
  const checkpoint = typeof body?.checkpoint === 'string' ? body.checkpoint.trim() : ''
  const branches = Array.isArray(body?.next)
    ? body.next.flatMap((one) => {
        if (typeof one !== 'object' || one === null) return []
        const it = one as { id?: unknown; label?: unknown }
        if (typeof it.id !== 'string' || typeof it.label !== 'string') return []
        if (it.label.trim() === '') return []
        return [{ id: it.id, label: it.label.trim() }]
      })
    : []
  if (checkpoint === '' && branches.length === 0) return null
  return { checkpoint, next: branches }
}

function readEnv(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  return typeof v === 'string' ? v : ''
}

/**
 * The class the student is in and the entrance exam they picked, passed IN
 * rather than imported. Both come from onboarding.
 *
 * The EXAM says which subjects matter. The CLASS says how far along they are.
 * Neither alone is the level: a class 9 and a class 12 student both preparing
 * for JEE are years apart, and the same sources would fail one of them.
 *
 * `src/practice/examChoice.ts` owns the list and the storage. This file takes
 * the id as a prop for the same reason it takes `search` as a function:
 * `tsconfig.canvas.json` includes only `src/canvas`, so importing across drags
 * `src/practice` into a stricter project it was not written against.
 *
 * Optional, and an absent value is NOT an error. A student who never opened the
 * practice screen must still be taught -- refusing on missing configuration is
 * exactly the curriculum lock this product must not have. Unset means the
 * search is unscoped, which is how it behaved before this existed.
 */
export default function CanvasRoute({
  search,
  examId = null,
  classId = null,
}: { search?: WebSearch; examId?: string | null; classId?: string | null } = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const [lessonId, setLessonId] = useState<string>(LESSONS[0].id)
  /*
   * WHETHER SHE HAS ASKED FOR ANYTHING YET.
   *
   * The canvas opened straight into a logarithm lesson nobody had asked for.
   * `lessonId` has to default to something -- `chosen` is derived from it and a
   * lesson must be selected before one can be shown -- so the default read as a
   * CHOICE when it was only an initial value, and the first thing a learner saw
   * on a page that promises to teach anything was one particular topic in
   * maths.
   *
   * This separates "which lesson would be shown" from "has she asked for one",
   * which the code had no way to tell apart. Until she asks, the stage carries
   * the invitation instead.
   */
  const [opened, setOpened] = useState(false)

  /*
   * WHETHER THE THING ON THE STAGE IS HERS OR THE PICKER'S.
   *
   * `opened` was one flag doing two jobs and it could not tell these apart:
   * pressing "Teach me" set it BEFORE the await (correctly -- a refusal has to
   * land on the stage), and until the model answered `authored` was still
   * null, so `result` fell through to `picked` -- which is `LESSONS[0]`, the
   * logarithm lesson. A learner who typed "how photosynthesis works" watched a
   * maths lesson render while the button beside it said "Writing...", and the
   * only reading available to them was that the product had ignored them.
   *
   * The same hole swallowed refusals: on failure `authored` stays null, so the
   * logarithm lesson painted itself UNDER the banner explaining that their
   * lesson had been refused.
   *
   * True from the moment the learner asks until they pick a subject from the
   * bar. While it is true the stage shows THEIR lesson or nothing at all --
   * never a lesson nobody asked for.
   */
  const [askedForATopic, setAskedForATopic] = useState(false)

  /* A lesson written for THIS learner, on a topic nobody authored in advance.
     Null until they ask for one; once set it replaces the picked lesson, and
     clearing it hands the picker back. */
  const [topic, setTopic] = useState('')
  const [authored, setAuthored] = useState<Lesson | null>(null)
  /*
   * AT WHAT LEVEL THE AUTHORED LESSON WAS JUDGED, CARRIED RATHER THAN GUESSED.
   *
   * Both authoring paths end in `authorConcept` -- the server's through
   * `conceptFor`, this file's through `explainAgain` -- and `concept.ts:754`
   * validates at `'answer'`, because a concept is one idea and owes no closing
   * progression. `TeachView` re-validates whatever it is handed and defaults to
   * `'lesson'`, so a concept that cleared its own gate was refused by the next
   * one with a rule it was never written to meet.
   *
   * Stored rather than assumed because it is not always the same answer: with
   * no `chat` on the provider, `handler.ts` still falls through to
   * `authorLesson`, and THAT owes the full arc. `askTheServer` reads which one
   * answered off the presence of `route` and reports it here.
   */
  const [authoredLevel, setAuthoredLevel] = useState<TeachingLevel>('answer')

  /*
   * THE TUTOR'S FOLLOW-UP, HELD BESIDE THE LESSON.
   *
   * Not merged into the lesson: `validateLesson` is `.strict()` and a `Lesson`
   * has no `checkpoint` or `next`, so folding them in would mean loosening the
   * gate to let a tutor ask a question. See `TutorTurn`.
   */
  const [turn, setTurn] = useState<TutorTurn | null>(null)
  const [authoring, setAuthoring] = useState(false)
  const [authorFailed, setAuthorFailed] = useState<Issue[] | null>(null)

  /*
   * WHAT THIS LEARNER HAS ALREADY BEEN TOLD, PER TOPIC.
   *
   * "Never repeat yourself" is not a property of one lesson, so no gate can
   * hold it: it is a property of a PAIR, and something has to remember the
   * first half. Without this the call below passed no history, `alreadyUsed`
   * stayed empty, the seed came out of the same question every time, and asking
   * the same thing twice returned the same route and the same words.
   *
   * A REF, NOT STATE, because nothing on screen is derived from it -- writing
   * it through `setState` would re-render the canvas to change nothing. Keyed
   * by the topic so two subjects do not spend each other's routes, and cased
   * down so "Photosynthesis" and "photosynthesis" are one topic, not two.
   */
  const alreadyTaught = useRef(new Map<string, Remembered>())

  /*
   * WHETHER SHE HAS A MODEL OF HER OWN — WHICH IS NOT THE SAME AS WHETHER
   * THERE IS ANYTHING TO ASK.
   *
   * This used to be `hasModel`, and it disabled the box. The reasoning was
   * sound at the time: `chatOnce` threw "no model endpoint is configured", and
   * that arrived under "the model answered, and what it produced does not
   * teach" — blaming her question for a call nobody made. Checking up front was
   * the right correction to THAT.
   *
   * It was the wrong answer to the real question. There is no `.env` in this
   * repository and `readEnv` returns '' for anything unset, so for every person
   * who has ever cloned it this read '' — and the one control that promises to
   * teach anything was disabled, permanently, with the placeholder "No model
   * configured". The canvas looked dead because for them it WAS.
   *
   * And it could not be fixed by pasting in a key. `assertLocalOrKeyless`
   * refuses to send one from a browser to anything but localhost, and it is
   * right to: a `VITE_*` value is compiled into the bundle and a key in a bundle
   * is a published key. So the browser can only ever reach a model the learner
   * is running herself.
   *
   * The server can hold a key. It already writes lessons — `/api/ask` in
   * `server/handler.ts`, through `chooseProvider`, and `needNextPart` below has
   * been posting to it all along. So there is ALWAYS somewhere to ask, and the
   * variable below decides WHICH, never WHETHER.
   */
  const modelEndpoint = readEnv('VITE_TUTOR_ENDPOINT')
  const herOwnModel = modelEndpoint.trim() !== ''

  /*
   * The chain, in trust order: the page the learner is looking at first, then
   * anywhere else.
   *
   * The lesson always answers first when it can, because a block the author
   * wrote about the exact thing being asked beats a correct paragraph from
   * elsewhere — the learner is looking at that page and has to be able to
   * connect the answer to it. The web rung only exists when a search was
   * supplied; with none, this is exactly the single-resolver behaviour that
   * shipped before, and the refusal stays the honest one.
   */
  const resolvers = useMemo<readonly AnyResolver[]>(() => {
    const chain: AnyResolver[] = [lessonResolver]

    /*
     * The engine second. It is the only rung that can WRITE a new explanation
     * rather than find an existing one -- it knows the syllabus, this learner's
     * history, and which mechanisms have already failed on them. That beats a
     * correct paragraph written for nobody, so it goes ahead of the web.
     *
     * Included unconditionally: when the middleware is absent (a production
     * build, where it is deliberately not mounted) the POST fails and the chain
     * records `failed` and moves on. That costs one request and buys a learner
     * the engine's answer everywhere it IS running, which is the whole of
     * development.
     */
    chain.push(engineResolver())

    /*
     * THE MODEL THIRD, AND AHEAD OF THE WEB. This rung is where the judgements
     * live: whether the question belongs to this lesson, whether naming a thing
     * counted as explaining it, whether it knows the answer at all. Those were
     * four branches of code until now, and code cannot make them -- it compared
     * words, and refused fair questions while answering unfair ones. See
     * `server/prompt.ts`.
     *
     * Ahead of the web because a model that knows the subject can answer from
     * what it knows, and can decline in its own words. Going out to the open
     * web is what happens when that fails, not before it is tried.
     */
    /* Set by the model rung on every question, read by the web rung below.
     * Starts false: before anything has asked, nothing has judged. */
    let judgementRan = false
    chain.push(modelResolver({ onReached: (reached) => { judgementRan = reached } }))

    /*
     * THE WEB LAST, AND ONLY BEHIND THE MODEL.
     *
     * It used to carry a word-overlap gate: refuse any question with no
     * vocabulary in common with the lesson. That gate is gone, because it is
     * exactly the generic rule this reordering exists to remove -- it would
     * refuse "how do I bake a cake" inside a chemistry lesson on heat, which is
     * a fair question, and it was software deciding something only judgement
     * can decide.
     *
     * What replaces it is structural rather than generic: the web is reachable
     * only AFTER a rung that can judge has had the question and declined it.
     * The chain stops at the first answer, so a model that answers -- including
     * one that answers "that is not what we are doing here" -- means the web is
     * never asked. No topic filter, no word counting, and no way for a fetched
     * page to be the first thing a learner gets.
     */
    if (search) chain.push(webResolver({ search, judgementRan: () => judgementRan }))
    return chain
  }, [search])

  /**
   * Write a lesson for whatever the learner just asked about.
   *
   * THE REFUSAL IS SHOWN, NOT SWALLOWED. `authorLesson` returns the gate's
   * issues when the model's lesson does not teach, and those reach the screen
   * verbatim. A canvas that quietly fell back to a picked lesson would tell the
   * learner their question had been answered when it had not.
   */
  const askForALesson = async (asked?: string): Promise<void> => {
    /*
     * THE QUESTION IS A PARAMETER, AND `topic` IS ONLY THE DEFAULT.
     *
     * A `next` branch calls `setTopic(label)` and then asks, and `setTopic` is
     * asynchronous -- React batches it, so reading `topic` here would read the
     * value from BEFORE the click and re-teach the topic the learner just
     * finished. Passing the label explicitly makes the branch press and the
     * request name the same thing.
     */
    const question = (asked ?? topic).trim()
    if (question === '' || authoring) return

    setAuthoring(true)
    setAuthorFailed(null)
    /* The previous topic's follow-up must not sit under the next topic's
       lesson. Cleared as the question is asked, not when the answer lands. */
    setTurn(null)
    /*
     * THE LAST ANSWER GOES BEFORE THE NEXT QUESTION IS ASKED.
     *
     * This was left standing, and `authored` is what the stage renders. So
     * asking a SECOND topic showed the FIRST lesson for the whole of the write
     * -- photosynthesis still on screen while the button said "Writing..." and
     * the learner waited for logarithms -- and, if the second ask was refused,
     * left it there underneath a banner about a question it did not answer.
     *
     * The empty-stage branch below is written to catch exactly this and cannot
     * fire while a stale lesson is still held: its condition is
     * `authored === null`.
     */
    setAuthored(null)
    /* Set BEFORE the await, not after. A refusal is something she asked for and
       must land on the stage; leaving this until success would put the
       invitation back over the top of the reason her question failed. */
    setOpened(true)
    setAskedForATopic(true)
    try {
      /*
       * WHICH MODEL, NEVER WHETHER. See `herOwnModel` above for why this is not
       * a guard that disables the control.
       *
       * Her own model is tried first when she has one, because a browser can
       * only reach a model she is running herself -- `assertLocalOrKeyless`
       * refuses to send a key from a bundle, and it is right to, since a
       * `VITE_*` value is compiled in and a key in a bundle is a published key.
       * Everyone else reaches the server, which can hold a key safely.
       */
      if (!herOwnModel) {
        /*
         * THE SAME MEMORY THE DIRECT PATH KEEPS, FOR THE SAME REASON.
         *
         * `alreadyTaught` is not new and is not a second store: it is the map
         * `explainAgain` already reads and writes below, so a learner who asks
         * the same thing twice gets a different way in whichever model wrote
         * it. Without this the server is stateless, `nextRoute` is handed an
         * empty list every time, and the same question returns the same
         * explanation forever -- which is the one thing a second asking must
         * never do, because a message the receiver could have predicted teaches
         * nothing.
         */
        const key = question.toLowerCase()
        const before = alreadyTaught.current.get(key) ?? NOTHING_YET
        const written = await askTheServer(question, before.routes)
        if (written.ok) {
          alreadyTaught.current.set(key, {
            /* An unnamed route is not recorded. Storing '' would make the next
               request claim to have spent a route that does not exist, and
               `nextRoute` would rule out nothing while believing it had. */
            routes: written.route === '' ? before.routes : [...before.routes, written.route],
            shown: [...before.shown, written.lesson],
          })
          setAuthoredLevel(written.teaching)
          setTurn(written.turn)
          setAuthored(written.lesson)
        } else {
          setAuthored(null)
          setAuthorFailed(written.issues)
        }
        return
      }

      const chat = chatOnce({
        endpoint: readEnv('VITE_TUTOR_ENDPOINT'),
        model: readEnv('VITE_TUTOR_MODEL') || undefined,
        apiKey: readEnv('VITE_TUTOR_KEY') || undefined,
        /* A lesson is far longer than a chat reply, and the default 1024 tokens
           truncates the JSON mid-object — which arrives as "no JSON object at
           all" and reads as a model failure rather than a budget one. */
        maxTokens: 4000,
        timeoutMs: 240_000,
      })
      /*
       * SEARCH FIRST, THEN WRITE. The gate reads shape and has no opinion about
       * truth, so an invented lesson passes every check in this repository. The
       * only defence is giving the author real text to write from.
       *
       * FAILING TO FIND SOURCES IS NOT FAILING TO TEACH. A refused search, an
       * unconfigured provider, or a topic the web does not cover all end here
       * with an empty list, and `groundingPreamble([])` returns '' -- so the
       * lesson is written exactly as it was before this existed. Turning a
       * silent retrieval failure into a silent teaching failure would be worse
       * than being honestly ungrounded.
       */
      let sources: readonly Source[] = []
      if (search) {
        try {
          /*
           * SCOPED BY LEVEL, BEFORE THE SEARCH RUNS.
           *
           * `grounding.ts` states the principle for truth -- "the fix belongs
           * BEFORE the sentence exists" -- and it carries to level unchanged.
           * Checking a finished lesson's level would reject good lessons and
           * still pass a badly-pitched one that scored in band. Scoping the
           * query means wrong-level material never reaches the model at all.
           */
          sources = sourcesFrom(await search(scopedQuery(question, examId, classId), {}))
        } catch {
          /* The search layer's own failure is not this learner's problem, and
             it is already reported by the doubt chain when they ask one. */
          sources = []
        }
      }

      /*
       * ONE CONCEPT, NOT A WHOLE LESSON, AND THE NUMBERS ARE THE ARGUMENT.
       *
       * Same six questions across six subjects, temperature 0, every run:
       *
       *   authorLesson   whole lesson    qwen2.5:7b        0 of 6   223.5s
       *   authorConcept  per concept     qwen2.5:7b        2 of 6    58.5s
       *   authorConcept  per concept     gpt-oss-120b      5 of 6    22.0s
       *
       * The full table, including the four runs whose refusals turned out to be
       * defects in the measuring harness rather than the model, is in
       * `CONSTRAINTS.md` and `WORK.md`.
       *
       * WHY THIS LINE MATTERED MORE THAN ANY MODEL CHANGE. `authorConcept`
       * measured 5 of 6 while this call site went on invoking `authorLesson` at
       * 0 of 6 -- so the PRODUCT's score stayed zero no matter how good the
       * model got. `concept.ts` was imported by nothing that ships, which is
       * exactly the orphan pattern this repository built a reachability gate to
       * catch, and `src/canvas` is not in that gate's manifest, so nothing said
       * so.
       *
       * THE REFUSAL IS STILL SHOWN, NOT SWALLOWED. `authorConcept` returns the
       * gate's own issues, and they reach the screen verbatim through the same
       * path `authorLesson`'s did. A canvas that quietly fell back would tell a
       * learner their question had been answered when it had not.
       */
      /*
       * A DIFFERENT WAY IN EACH TIME, AND A CHECK THAT IT REALLY WAS ONE.
       *
       * `explainAgain` feeds the routes this learner has already spent back
       * into `authorConcept` so `nextRoute` picks a fresh one, and runs
       * `sameAgain` over what comes back so a model that ignored the reroute
       * and reprinted its last answer is asked once more rather than shipped.
       */
      const topicKey = question.toLowerCase()
      const remembered = alreadyTaught.current.get(topicKey) ?? NOTHING_YET
      const { written, memory } = await explainAgain(chat, question, sources, remembered)
      alreadyTaught.current.set(topicKey, memory)
      if (written.ok) {
        /* `explainAgain` calls `authorConcept`, which validates at `'answer'`.
           See `authoredLevel`. */
        setAuthoredLevel('answer')
        /*
         * THE SAME TURN THE SERVER PATH GIVES, FROM THE SAME PLACE.
         *
         * This threw the turn away, so a learner running their OWN model got
         * the lesson and then a dead end -- no checkpoint, no branches -- while
         * everybody on the server path got both. `explainAgain` returns the
         * whole `ConceptResult`, and `written.concept` carries exactly the
         * `checkpoint` and `next` that `handler.ts` forwards for the other
         * half of the product. Read through the same parser, so a malformed
         * branch list costs the turn and never the lesson.
         */
        setTurn(tutorTurnFrom({ checkpoint: written.concept.checkpoint, next: written.concept.next }))
        setAuthored(written.lesson)
      } else {
        setAuthored(null)
        setAuthorFailed(written.issues)
      }
    } catch (e) {
      setAuthored(null)
      setAuthorFailed([{ path: '(model)', message: e instanceof Error ? e.message : String(e) }])
    } finally {
      setAuthoring(false)
    }
  }

  const chosen = LESSONS.find((l) => l.id === lessonId) ?? LESSONS[0]

  /*
   * THE LESSON THE LEARNER IS ACTUALLY LOOKING AT — WHICH WAS NOT `chosen`.
   *
   * `chosen` is the PICKER's answer, and it always has one: `lessonId` has to
   * start somewhere and it starts at `LESSONS[0]`, logarithms. Everything below
   * used to be keyed to it, including the two places that decide what is on
   * screen after the model answers — so an authored lesson lived on the stage
   * while the merge, the validator and `needNextPart` all still believed the
   * subject was maths.
   *
   * That was not cosmetic. Pressing continue on a lesson about photosynthesis
   * sent `chosen.spec.question` ("What is a logarithm, and how do I use one?")
   * to `/api/ask`, filed the returned blocks under `logs`, and flipped `result`
   * to `picked` — replacing the learner's lesson with the logarithm one, mid
   * session, as the reward for asking to carry on.
   *
   * One value now names the lesson on the stage, and the merge, the validation
   * and the next-part request all read it. `teaching: 'lesson'` for an authored
   * one because `authorLesson` already held it to a lesson's arc to return ok.
   */
  const onStage: { id: string; spec: unknown; teaching: TeachingLevel } = useMemo(
    () =>
      askedForATopic && authored !== null
        ? { id: authored.id, spec: authored, teaching: authoredLevel }
        : chosen,
    [askedForATopic, authored, authoredLevel, chosen],
  )

  /*
   * Validated once per lesson, not per render.
   *
   * `validateLesson` walks every block and runs the shape invariants, and the
   * teaching view re-renders on every reveal and every doubt. Without the memo
   * the whole spec would be re-parsed each time a learner pressed continue —
   * work whose result cannot have changed, since the lesson is a module
   * constant.
   */
  /*
   * PARTS THE MODEL HAS WRITTEN SINCE THIS LESSON OPENED.
   *
   * The authored lesson is a module constant and stays one. What the model
   * adds lives here, beside it, and is thrown away when she switches lessons --
   * keyed by `chosen.id` so part three of physics can never appear inside
   * civics.
   */
  const [grown, setGrown] = useState<{ id: string; blocks: readonly unknown[] }>(
    { id: onStage.id, blocks: [] },
  )
  const added = grown.id === onStage.id ? grown.blocks : []

  const picked = useMemo(() => {
    const base = onStage.spec as { blocks: readonly unknown[] }
    /* Re-validated WITH the new blocks in place, by the same gate as everything
     * else. A part the model wrote is not trusted further than an authored one:
     * if it carries appearance, or a dangling relation, the whole thing is
     * refused and she is told, rather than a bad block being painted because it
     * arrived late. */
    return validateLesson(
      added.length === 0 ? onStage.spec : { ...base, blocks: [...base.blocks, ...added] },
      /* `{ teaching }` is main's, and it is not decoration: `validateLesson`
         applies a different shape to a lesson than to an answer, so validating
         without it judges an authored lesson by the wrong rules. */
      { teaching: onStage.teaching },
    )
  }, [onStage, added])

  /* An authored lesson has ALREADY been through `validateLesson` inside
     `authorLesson` -- that is what "ok" means there. Re-parsing it would be work
     whose answer cannot differ.

     THE `added.length > 0` HALF OF THIS CONDITION IS THE MERGE, AND WITHOUT IT
     THE SHORTCUT IS A BUG. main wrote this when the lesson on screen was always
     exactly the authored one. It is not any more: `grown` holds the parts the
     model has written since the lesson opened. Taking the shortcut once a part
     has arrived would hand back the ORIGINAL lesson and every grown block would
     vanish from the screen mid-session -- the shortcut has to yield the moment
     there is something it does not know about. */
  const result: typeof picked =
    authored === null || added.length > 0 || !askedForATopic
      ? picked
      : { ok: true, lesson: authored }

  /*
   * WRITE THE NEXT PART NOW, KNOWING WHAT SHE HAS READ AND JUST SAID.
   *
   * This is the injection point that stops the lecture being decided in
   * advance. `TeachView` calls it when she asks to carry on and no authored
   * beat is left; before it existed, that press did nothing at all.
   */
  const needNextPart = useCallback(
    async ({ taught, justSaid }: { taught: string; justSaid: string }): Promise<boolean> => {
      const asked = onStage.spec as { question?: string }
      try {
        const response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question: asked.question ?? 'this lesson',
            askedInside: asked.question ?? '',
            taught,
            justSaid,
          }),
        })
        if (!response.ok) return false
        const body = (await response.json()) as { lesson?: { blocks?: readonly unknown[] } }
        const blocks = body.lesson?.blocks
        if (!Array.isArray(blocks) || blocks.length === 0) return false
        setGrown((previous) => ({
          id: onStage.id,
          blocks: [...(previous.id === onStage.id ? previous.blocks : []), ...blocks],
        }))
        return true
      } catch {
        /* She is told by the caller. A thrown error here would take the whole
         * view down for a part that simply did not arrive. */
        return false
      }
    },
    [onStage],
  )

  /*
   * WHICH OF THE THREE SCREENS IS UP, AS ONE VALUE.
   *
   * The render branched on `opened`, `askedForATopic` and `authored` in
   * separate conditions, and the invariant that matters -- NEVER SHOW A PICKED
   * LESSON AFTER SOMEBODY HAS ASKED FOR ONE -- held only while all three stayed
   * in agreement across four call sites. It had already failed twice: once
   * while the model was writing, once after a refusal.
   *
   * Named here, the three screens are mutually exclusive by construction and a
   * reader checks one value instead of reconstructing an update order. The old
   * first branch also carried `authored === null`, which could never be false
   * where it was tested -- `setOpened(true)` runs before anything that can set
   * `authored` -- so it read as a condition and was dead weight.
   */
  const stage: 'inviting' | 'writing' | 'showing' =
    !opened ? 'inviting' : askedForATopic && authored === null ? 'writing' : 'showing'

  const askBox = (
  <form
            className="lc-ask-topic"
            onSubmit={(e) => {
              e.preventDefault()
              void askForALesson()
            }}
          >
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              /* ALWAYS THE INVITATION, BECAUSE THERE IS ALWAYS SOMEWHERE TO ASK.
                 This read 'No model configured' and the control was `disabled`
                 for every person who has ever cloned this repository, because
                 there is no `.env` in it and `readEnv` returns '' for anything
                 unset. The one control that promises to teach anything was dead
                 on arrival, and it looked like a product with nothing behind it.
                 `askForALesson` routes to the server when she has no model of her
                 own, so the only thing missing was ever the route, not the
                 ability. */
              placeholder="Teach me anything…"
              aria-label="A topic to be taught"
              /* Kept as a hint, not a blocker: it now says where lessons come
                 from and how to change that, rather than what is broken. */
              title={herOwnModel ? undefined : OWN_MODEL_NOTE}
              disabled={authoring}
            />
            <button type="submit" disabled={authoring || topic.trim() === ''}>
              {authoring ? 'Writing…' : 'Teach me'}
            </button>
          </form>
  )

  return (
    <div className="lc-root lc-route" style={cssVariables() as React.CSSProperties}>
      {/*
        THE LIVE REGION IS MOUNTED ONCE, AND THAT IS THE WHOLE POINT.
        It sat inside the writing branch, so the region and its text entered
        the DOM in the same commit -- and assistive technology only announces
        CHANGES to a region it was already watching. A screen-reader user
        pressed "Teach me" and got silence over a deliberately empty stage,
        with the only other cue being a button label they cannot see.
        Rendered here it exists from the first paint, so every later change to
        the sentence inside it is an announcement.
      */}
      <div className="lc-sr-only" role="status" aria-live="polite" aria-busy={authoring}>
        {authoring
          ? 'Writing your lesson.'
          : stage === 'writing'
            ? 'No lesson is being shown. See the reason above.'
            : ''}
      </div>

      <div className="lc-route-bar">
        <button type="button" className="lc-back" onClick={() => navigate('/today')}>
          Back
        </button>

        <div className="lc-toggle" role="group" aria-label="Lesson">
          {LESSONS.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              aria-pressed={opened && !askedForATopic && lessonId === lesson.id}
              onClick={() => {
                setAuthored(null)
                setAuthorFailed(null)
                setTurn(null)
                setLessonId(lesson.id)
                setOpened(true)
                /* Their question is over; this lesson IS the picker's, so the
                   stage is allowed to show a hand-authored one again. */
                setAskedForATopic(false)
              }}
            >
              {lesson.label}
            </button>
          ))}
        </div>

        {/*
          ANY SUBJECT, NOT A PICKED ONE.
          ------------------------------
          Every lesson above was written by hand, which means the canvas could
          only teach the things somebody had already sat down and authored. This
          asks the learner's own local model for a lesson on anything, and puts
          the answer through exactly the same gate the hand-written ones face —
          so a model that produces a wall of text is refused here as loudly as
          an author would be.
        */}
        {/* THE ASK BOX LIVES IN ONE PLACE AT A TIME, and which place is the
            whole point. In the bar it is a control beside other controls; on a
            blank canvas it IS the page. Rendered once either way, because two
            copies would be two inputs with the same label -- ambiguous to a
            screen reader, to a test, and to a person tabbing through. */}
        {opened && askBox}

        <div className="lc-route-end">
          {result.ok && result.lesson.subject && (
            <span className="lc-route-subject">{result.lesson.subject}</span>
          )}
          {/*
           * The 3D toggle lives here rather than in the teaching view because
           * it is a preference about how a figure is DRAWN, not a step in the
           * lesson. A learner switching to 3D mid-lesson must not lose their
           * place, and the only way to guarantee that is for the control to sit
           * outside the thing that holds the place.
           */}
          <div className="lc-toggle" role="group" aria-label="View mode">
            <button type="button" aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>
              2D
            </button>
            <button type="button" aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>
              3D
            </button>
          </div>
        </div>
      </div>

      {authorFailed !== null && (
        <div className="lc-refusal" role="alert">
          <h2>That lesson was refused</h2>
          <p className="lc-caption">
            {/* Two different failures wore one sentence. A model that was never
                reached did not "produce" anything, and saying it did sends the
                reader looking for a teaching problem that does not exist. */}
            {authorFailed.some((i) => i.path === '(busy)')
              ? 'Our server is busy right now, so the lesson was not written. Try again in a minute.'
              : authorFailed.some((i) => i.path === '(model)' || i.path === '(server)')
                ? 'The model could not be reached, so nothing was written.'
                : 'The model answered, and what it produced does not teach. It is not being shown.'}
          </p>
          <ul>
            {authorFailed.slice(0, 8).map((issue, i) => (
              <li key={i}>
                <code>{issue.path}</code> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        A MAIN LANDMARK, and it was missing entirely.
        `/canvas` returns before the app shell because it owns the whole
        window, and the shell is where `<main>` lived -- so this route rendered
        with zero landmarks. A page that owns the whole window is exactly when
        a landmark matters most: it is how a screen-reader user skips the
        toggle bar and reaches the lesson.
        Measured on the running page before the fix:
        `document.querySelectorAll('main').length` was 0.
        It also broke two e2e tests, which timed out waiting for `main` to
        exist and reported it as a 90s hang rather than as a missing element.
        The swap is semantic only. The class, and therefore every style rule,
        is unchanged, and `main` and `div` are both block boxes -- which is why
        the screenshot baselines taken before it are still valid.
      */}
      <main className="lc-stage">
        {stage === 'inviting' ? (
          /*
           * NOTHING, AND SAYING SO IN WORDS.
           *
           * Not an empty box: an empty box is indistinguishable from a page
           * that failed to load, which is the reading this project keeps
           * guarding against. It names the one thing to do and gets out of the
           * way. The control it points at is the topic box above, which is
           * enabled for everybody -- see `herOwnModel`.
           */
          <div className="lc-blank">
            <h2>What do you want to learn?</h2>
            {askBox}
            <p className="lc-caption">
              Anything at all — it is written for you when you ask, not chosen in advance.
            </p>
          </div>
        ) : stage === 'writing' ? (
          /*
           * THEY ASKED, AND THEIR LESSON IS NOT HERE YET. SHOW NOTHING.
           *
           * The stage is deliberately empty here, and this is the one place in
           * the canvas where that is right. Every other empty state in this
           * file is filled with words because an empty box reads as a page that
           * failed to load -- but the alternative here was not words, it was
           * THE WRONG LESSON: `result` falls back to `picked`, and `picked` is
           * `LESSONS[0]`, logarithms. A maths lesson appearing after a question
           * about photosynthesis is not a weaker answer than a blank stage, it
           * is a false one, and the learner has no way to tell it apart from a
           * product that ignored what they typed.
           *
           * Nothing is lost by being empty, because the state is already stated
           * somewhere the learner is looking: the button they just pressed says
           * "Writing..." while this branch is on screen, and if it ends in a
           * refusal the banner above says so in the model's own words. The live
           * region carries the same fact to a screen reader, which cannot see
           * the button change.
           */
          <div className="lc-writing" />
        ) : result.ok ? (
          /*
           * `key` on the lesson id, so switching subject starts the new lesson
           * at its beginning. Without it React reuses the component and the
           * learner lands three beats into a lesson they have not begun —
           * position is state, and state must not survive a change of subject.
           */
          <TeachView
            /* `onStage.id`, not `chosen.id`: asking a second question changed
               the lesson and not the key, so `TeachView` was reused and the new
               lesson opened at the beat the last one had reached. */
            key={onStage.id}
            lesson={result.lesson}
            /* THE LEVEL THIS ROUTE JUST JUDGED IT BY. `TeachView` re-validates
               and defaults to `'lesson'`, so without this a concept clears the
               gate above and is refused by the identical gate one component
               later, under "This lesson was refused". It also fixes the picked
               `by-hand` lesson, which is an ANSWER and was being re-judged as a
               lesson here. `AskView` and `LearnView` pass the same prop for the
               same reason. */
            teaching={onStage.teaching}
            mode={mode}
            resolvers={resolvers}
            onNeedNextPart={needNextPart}
          />
        ) : (
          <Refusal title="This lesson was refused" issues={result.issues} />
        )}

        {/*
          THE TUTOR ASKS BACK. See `TutorTurn`.

          Below the lesson and inside the stage, because it belongs to the
          explanation it followed: scrolling away from the lesson must take its
          follow-up with it. Rendered only when a lesson is actually showing --
          a checkpoint under a refusal would be asking whether something landed
          that was never shown.

          THE BRANCHES ARE THE ASK BOX, not new machinery. Pressing one puts its
          label in the topic box and asks, so the next explanation goes through
          the same authoring path, the same gate and the same history as
          anything typed by hand -- and the route it spends is recorded, so the
          branch cannot be answered the same way twice either.
        */}
        {turn !== null && result.ok && (askedForATopic ? authored !== null : opened) && (
          <section className="lc-turn" aria-label="What next">
            {turn.checkpoint !== '' && (
              <p className="lc-turn-check">{turn.checkpoint}</p>
            )}
            {turn.next.length > 0 && (
              <div className="lc-turn-next">
                <span className="lc-caption">Where next?</span>
                {turn.next.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    disabled={authoring}
                    onClick={() => {
                      setTopic(branch.label)
                      void askForALesson(branch.label)
                    }}
                  >
                    {branch.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

/**
 * Why a lesson is not being shown.
 *
 * The engine's standing rule is that a failing frame is never painted, because
 * a half-drawn lesson is indistinguishable from a design choice and a learner
 * has no way to tell one from the other. The corollary is this component: if
 * nothing is drawn, the reason has to be visible somewhere, and an empty page
 * is not a reason.
 */
function Refusal({ title, issues }: { title: string; issues: Issue[] }) {
  return (
    <div className="lc-refusal" role="alert">
      <h2>{title}</h2>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.path}</code> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}
