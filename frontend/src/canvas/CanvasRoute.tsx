import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { AnyResolver } from './teach/contract'
import { lessonResolver } from './teach/doubt'
import { engineResolver } from './teach/engineResolver'
import { webResolver, type SearchResult } from './teach/webResolver'
import { fetchOpenLoops, situationClient, type OpenLoop } from './teach/situation'
import { modelResolver } from './teach/modelResolver'
import { cssVariables } from './design/tokens'
/* Engine output, not hand-authored. `learning-os` generates these from two
   learners with IDENTICAL knowledge and different histories — see
   `learning_os/api/demo.py`, whose `--check` keeps them from drifting. The
   picker shows the ENGINE choosing differently, not a human writing twice. */
/* NOT engine output. Prose written by hand to the same contract, because the
   fake model writes badly on purpose (see `llm/client.py`) and thin skeletons
   cannot show what the contract does to real sentences. Labelled as
   hand-written wherever it appears, so nobody reads it as a model's work. */
import { validateLesson, type Issue, type TeachingLevel } from './spec/validate'
import { appendToCanvas, bringForwardTheOldCanvas, readCanvas } from './api/memoryClient'
import { CanvasEntry } from './learn/CanvasEntry'
import { TopicScope } from './learn/TopicScope'
import { useZoom } from './learn/useZoom'
import { chatOnce } from '../agent/ports/httpModel'
import { groundingFrom, howWellSourcesAgree } from './teach/researched'
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
/* NOTHING IS WRITTEN IN ADVANCE. This was `LESSONS`: eight built-in lessons
 * -- Maths, English, Physics, Civics, Machine learning, two engine fixtures
 * and one written by hand -- offered as a row of buttons, and the flagship
 * law drove them. The owner's decision (2026-09-02): a student types anything
 * and it is written for them; nothing else is offered. What remains is the
 * stand-in the stage holds before anything has been asked, and it is never
 * rendered: every screen with nothing authored is `inviting`, `writing`,
 * `asking` or `refused`, none of which shows a lesson. */
/* THERE IS NO CAP, AND THERE MUST NOT BE ONE.
 *
 * This was `MOST_ENTRIES_KEPT = 40`, applied with `.slice(-40)` on every
 * append, and it did not merely hide lesson one -- the shortened array was
 * then saved over the canvas, so lesson forty-one DELETED lesson one from the
 * database. A student's first day of a topic was destroyed by her forty-first
 * question, silently, with no way back.
 *
 * A display bound is a fine thing and this was not one. If a page cannot show
 * a thousand lessons at once it loads them as she scrolls; it does not throw
 * them away. Law E in `src/laws/canvasDurability.test.ts` pins the number 40
 * by name so the regression cannot return quietly. */

/**
 * ONE THING ON THIS TOPIC'S CANVAS.
 *
 * `seq` is the server's, not this page's: it is the artifact's permanent place
 * in the canvas, so two tabs appending at once cannot land on one position and
 * a reload cannot renumber anything.
 *
 * `lesson` is `null` for an artifact this build cannot draw -- a payload from a
 * newer version, a half-written row. It is still HER work and it still shows,
 * with a line saying what happened. The shipped canvas dropped such entries
 * and saved the shortened list, which made the loss permanent.
 */
interface OnCanvas {
  readonly seq: number
  readonly question: string
  readonly teaching: TeachingLevel
  readonly lesson: Lesson | null
  /** Why it could not be drawn, when it could not. Shown, not swallowed. */
  readonly why?: string
}

const NOTHING_ON_STAGE = { id: 'nothing-yet', spec: {}, teaching: 'lesson' as TeachingLevel }

/**
 * Three ordinary topics, offered ONLY to a learner the tutor has asked back
 * twice running.
 *
 * NOT A MENU, AND THE DIFFERENCE MATTERS. Nothing here is authored in advance:
 * each one is written by the model when it is pressed, exactly as anything
 * typed into the box is. They exist because a learner who has been asked the
 * same question twice needs a door rather than a third sentence -- and they are
 * deliberately from three unrelated subjects, so the screen cannot be read as
 * "these are the things it knows".
 */
const EXAMPLE_TOPICS = ['photosynthesis', 'quadratic equations', 'the French Revolution'] as const

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
/**
 * ONE REQUEST TO /api/ask, ANSWERED EITHER AS A DOCUMENT OR AS A STREAM.
 *
 * With `onText`, the request asks for an event stream and the words of the
 * first block are handed over as the server writes them; the stream's last
 * event carries exactly the reply the plain route would have sent, so what
 * follows this function is the same either way. Without `onText` -- or from
 * a server that answers plain JSON, which is every fake in the tests and
 * every server without a streaming model -- it is the one JSON reply it has
 * always been. Transport failures throw, for the caller's own catch.
 */
/**
 * WHICH CANVAS A REQUEST BELONGS TO.
 *
 * MEASURED 2026-09-03: `/api/ask` was sent `{question, alreadyUsed}` and
 * nothing else. The topic id and name that `App.tsx` had already resolved, and
 * the class the student is in, never left the browser. So the server could not
 * scope a search to her class, could not file what it learnt against the topic
 * she was actually on, and had no way to tell one canvas from another. The
 * plea path sent `topicId` already, which made the gap worse rather than
 * better: it looked wired.
 *
 * EVERY FIELD IS OPTIONAL AND ABSENT MEANS ABSENT. A canvas opened with no
 * topic -- typed straight into the box -- sends no topic, rather than an empty
 * string. The server records evidence under what it is given, and `''` is a
 * key that quietly collects everybody's stray questions in one place.
 */
export interface WhichCanvas {
  readonly topicId?: string
  readonly topicName?: string
  readonly classId?: string
  readonly examId?: string
}

async function fetchAsk(
  question: string,
  alreadyUsed: readonly string[],
  where: WhichCanvas,
  onText?: (blockIndex: number, text: string) => void,
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const response = await fetch('/api/ask', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(onText === undefined ? {} : { accept: 'text/event-stream' }),
    },
    body: JSON.stringify({ question, alreadyUsed, ...where }),
  })
  const type = response.headers?.get?.('content-type') ?? ''
  const reader = /text\/event-stream/i.test(type) ? response.body?.getReader() : undefined
  if (onText === undefined || reader === undefined) {
    return { status: response.status, ok: response.ok, body: await response.json() }
  }
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    let cut = pending.indexOf('\n\n')
    while (cut >= 0) {
      const frame = pending.slice(0, cut)
      pending = pending.slice(cut + 2)
      cut = pending.indexOf('\n\n')
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (data === '') continue
      const event = JSON.parse(data) as {
        type: string
        blockIndex?: number
        text?: string
        reply?: { status: number; body: unknown }
      }
      if (event.type === 'text' && typeof event.text === 'string') onText(event.blockIndex ?? 0, event.text)
      if (event.type === 'done' && event.reply !== undefined) {
        return { status: event.reply.status, ok: event.reply.status >= 200 && event.reply.status < 300, body: event.reply.body }
      }
    }
  }
  throw new Error('the stream ended before the lesson did')
}

async function askTheServer(
  question: string,
  /** Routes already spent on this topic, so the server can pick a fresh one. */
  alreadyUsed: readonly string[],
  /** Which canvas this is. See `WhichCanvas`. */
  where: WhichCanvas,
  /** Where the words go as they are written; absent means one JSON reply. */
  onText?: (blockIndex: number, text: string) => void,
): Promise<
  | {
      ok: true
      lesson: Lesson
      route: string
      teaching: TeachingLevel
      /** See `TutorTurn`. Absent when the whole-lesson path answered. */
      turn: TutorTurn | null
    }
  /**
   * THE SERVER ASKED A QUESTION BACK, WHICH IS NOT A FAILURE.
   *
   * `controller.ts` may answer ASK_CLARIFICATION -- it genuinely could not tell
   * what was wanted -- and the server replies with a question instead of a
   * lesson. That reply had no branch here, so `isLessonShaped` rejected it and
   * the learner was told "the server returned something that is not a lesson":
   * a tutor asking what they meant, rendered as a fault.
   *
   * Carried as its own case rather than folded into `issues`, because the
   * banner that renders issues says "This lesson was refused" and nothing was
   * refused. It is a turn in a conversation.
   */
  | { ok: false; clarify: string }
  /**
   * `unreachable` marks the one refusal that is not the server's: nothing
   * answered at all. The banner does not branch on it -- the '(server)' issue
   * already carries the sentence she reads -- but the open-loop ledger does,
   * because `chain.ts`'s own two words are 'refused' and 'failed', and a dead
   * server is the second one. Recording it as the first would tell her, on
   * her return, that her question was judged when nothing ever read it.
   */
  | { ok: false; issues: Issue[]; unreachable?: true }
> {
  let body: {
    lesson?: unknown
    error?: unknown
    route?: unknown
    checkpoint?: unknown
    next?: unknown
    clarify?: unknown
    question?: unknown
  }
  try {
    const answered = await fetchAsk(question, alreadyUsed, where, onText)
    body = answered.body as { lesson?: unknown; error?: unknown }
    if (!answered.ok) {
      /* The server's own words where it gave them. Replacing them with a status
         code would throw away the only description of what went wrong. */
      const said = typeof body?.error === 'string' && body.error.trim() !== ''
        ? body.error
        : `the server answered ${answered.status} and said nothing more`

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
      if (answered.status === 429) {
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
      unreachable: true,
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
  /* See the `clarify` case above: a question back, not a failed lesson. */
  if (body?.clarify === true) {
    const asked = body.question
    return {
      ok: false,
      clarify:
        typeof asked === 'string' && asked.trim() !== ''
          ? asked.trim()
          : 'What would you like me to do — teach something new, go over it again, or set you some practice?',
    }
  }

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
  /* `topic` is already this component's STATE -- the question she typed. The
     prop keeps the public name; inside it is the topic the canvas is FOR. */
  topic: forTopic = null,
  prerequisites = [],
}: {
  search?: WebSearch
  examId?: string | null
  classId?: string | null
  /** The topic this canvas is FOR, when it is one topic's canvas: its id and
      its curriculum name -- or a `null` name for an id this device does not
      know, which the canvas says out loud rather than rendering nothing. */
  topic?: { readonly id: string; readonly name: string | null } | null
  /** D3: what the curriculum lists before this topic, from `prerequisitesOf`.
      The server checks them against what she has actually done. */
  prerequisites?: readonly { readonly id: string; readonly name: string }[]
} = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  /* The words of the lesson being written, per block, as they arrive. Shown
     on the writing screen and cleared the moment the lesson lands or fails --
     they are the first thing she reads, never the thing she keeps. */
  const [streamed, setStreamed] = useState<readonly string[]>([])
  /* THE CANVAS BUILDS UP. Everything learned on this topic, in order, oldest
     first; the last entry is the lesson `TeachView` is showing. Kept on the
     server under `<topic>#canvas` and brought back on return, exactly as it
     was left, with nothing added. Decided 2026-09-02. */
  const [entries, setEntries] = useState<readonly OnCanvas[]>([])
  /* WHICH ARTIFACT IS ON STAGE, BY ITS OWN NUMBER.
     This used to be "the last one", expressed as `entries.slice(0, -1)`. It
     stopped being true when the stage began showing the last DRAWABLE lesson:
     a damaged artifact at the end was then sliced off the list AND absent from
     the stage, so it appeared nowhere at all. Naming the one on stage is the
     only way the list can leave out exactly that one and nothing else. */
  const [stagedSeq, setStagedSeq] = useState<number | null>(null)
  /* Lessons of hers that something real has put in question. Marked, never
     hidden and never rewritten: see `server/assurance.ts`. */
  const [questioned, setQuestioned] = useState<ReadonlyMap<number, string>>(new Map())
  /* HOW FAR OUT SHE IS LOOKING. A transform over blocks that are already drawn
     and already checked -- see `useZoom`, which states the rule it keeps. */
  const { scale } = useZoom(forTopic?.id ?? null)
  /* NUMBERS FOR LESSONS THE SERVER HAS NOT ACCEPTED YET.
     Negative, counting down, so they can never collide with a server `seq`
     (always 1 or more) or with each other. A single shared stand-in was tried
     and it was worse than the bug it replaced: two lessons that both failed to
     save shared one number, and the one on stage took the other off the screen
     with it. A thing on her canvas needs its own name even when the save that
     would have given it one did not happen. */
  const unsavedSeq = useRef(0)
  /* Said out loud when a save or a read did not work. The shipped canvas never
     looked at either result, so past the old size ceiling every save failed
     forever and nothing on screen ever said a word about it. */
  const [memoryTrouble, setMemoryTrouble] = useState<string | null>(null)
  const topicId = forTopic === null ? null : forTopic.id

  /* WHO THIS CANVAS IS, sent with every teaching request. Built once here so
     there is one answer rather than four call sites each deciding. A field is
     left OUT when it is not known -- never sent as an empty string, because
     the server files evidence under whatever key it is handed. */
  const whichCanvas = useMemo(
    () => ({
      ...(forTopic === null ? {} : { topicId: forTopic.id }),
      ...(forTopic?.name == null ? {} : { topicName: forTopic.name }),
      ...(classId == null || classId === '' ? {} : { classId }),
      ...(examId == null || examId === '' ? {} : { examId }),
    }),
    [forTopic, classId, examId],
  )
  /* What the server already holds. Entries that came FROM it are never sent
     back: coming back to a canvas changes nothing, so it writes nothing. */
  const alreadyKept = useRef<readonly unknown[] | null>(null)
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

  /* THE OPEN LOOPS THIS STUDENT HOLDS, fetched once on arrival. The ledger is
     a courtesy: every failure shape (no server, 503, junk) arrives as []. */
  const situation = useMemo(() => situationClient(), [])
  const [openLoops, setOpenLoops] = useState<readonly OpenLoop[]>([])
  useEffect(() => {
    let mounted = true
    void fetchOpenLoops().then((loops) => {
      if (mounted) setOpenLoops(loops)
    })
    return () => {
      mounted = false
    }
  }, [])
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

  /*
   * THE QUESTION THE TUTOR ASKED BACK, IF IT ASKED ONE.
   *
   * Apart from `authorFailed` because it is not a failure. Cleared when they
   * ask again, so an answered question does not sit above the lesson that
   * answered it.
   */
  const [askedBack, setAskedBack] = useState<string | null>(null)
  /*
   * HOW MANY TIMES IN A ROW IT HAS ASKED BACK, AND WHY THAT IS COUNTED.
   *
   * MEASURED, on a real machine, by a person trying to use this: eleven
   * consecutive `ASK_CLARIFICATION` in the server log, each rendering the SAME
   * sentence with no control on the screen for any of the four things it
   * offers to do. From the chair it is indistinguishable from a frozen page --
   * he typed "hi", then "no", then gave up and reported the product broken.
   *
   * The veto itself is right: a tutor must not teach "hi". What was missing is
   * that the second refusal looked exactly like the first, so nothing on the
   * screen proved his words had even arrived.
   */
  const [askedBackTimes, setAskedBackTimes] = useState(0)
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
    setStreamed([])
    /* The previous topic's follow-up must not sit under the next topic's
       lesson. Cleared as the question is asked, not when the answer lands. */
    setTurn(null)
    setAskedBack(null)
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
        const written = await askTheServer(question, before.routes, whichCanvas, (index, text) =>
          setStreamed((prev) => {
            const next = [...prev]
            next[index] = (next[index] ?? '') + text
            return next
          }),
        )
        setStreamed([])
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
          /* APPENDED, HERE, EXPLICITLY. This used to set state and let an
             effect PUT the whole array back; that whole-array save is the
             single defect the durability laws exist to make impossible. One
             lesson is now one row, and the server gives it its place. */
          void appendToCanvas(topicId ?? '', {
            kind: 'lesson',
            question,
            payload: written.lesson,
            teaching: written.teaching,
          }).then((saved) => {
            const seq = saved.ok ? saved.seq : (unsavedSeq.current -= 1)
            setEntries((previous) => [
              ...previous,
              { seq, question, lesson: written.lesson, teaching: written.teaching },
            ])
            setStagedSeq(seq)
            setMemoryTrouble(saved.ok ? null : `${saved.reason}. It is on this screen, not yet on the server.`)
          })
          /* A lesson arrived, so the run of unanswered asks is over. */
          setAskedBackTimes(0)
          /* The debt for this question, if any, is settled by a real lesson. */
          situation.resolved(question)
        } else if ('clarify' in written) {
          /* A QUESTION BACK IS NOT A REFUSAL. `controller.ts` chose
             ASK_CLARIFICATION -- it could not tell what was wanted and said so.
             Rendering that under "This lesson was refused" would turn a tutor's
             question into an error message. */
          setAuthored(null)
          setAuthorFailed(null)
          setAskedBack(written.clarify)
          /* Counted, not reset: two in a row is the state the screen has to
             look different in. See `askedBackTimes`. */
          setAskedBackTimes((times) => times + 1)
          /* BUT HER QUESTION IS STILL UNANSWERED, so the debt is recorded the
             same as a refusal's. This was the one ending of an ask that left
             no trace, and it is the ending every off-curriculum question meets
             when no model is reachable: the veto answers with a question back,
             she closes the laptop, and the product used to forget -- Law G
             measured exactly that, in all four browsers. If this sitting goes
             on to answer her, `resolved` settles it; if she leaves instead,
             the question is waiting on her return, which is the promise. */
          situation.opened({ question, lesson: '', stalled: 'refused' })
        } else {
          setAuthored(null)
          setAuthorFailed(written.issues)
          /* A refusal is a non-answer too. MEASURED by Law H on run eb0edcee,
             in all four browsers: with no model reachable, "hi" and then "no"
             met two refusals, not two questions back, and the door only
             opened for questions -- so the child with no model got the same
             dead end the door was built to end. */
          setAskedBackTimes((times) => times + 1)
          /* She asked and was not answered: the product owes her. WHICH word
             is `chain.ts`'s distinction, kept: a server that read her question
             and refused is 'refused'; a server nothing could reach is 'failed'.
             The card she sees on return is the same either way -- the word is
             for whoever reads the ledger and asks why. */
          situation.opened({
            question,
            lesson: '',
            stalled: 'unreachable' in written && written.unreachable ? 'failed' : 'refused',
          })
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
          /* F2: the sources AND how well they agree. The verdict used to be
             dropped here, so a lesson from one shaky page was written exactly
             like one from two independent sources that agree. */
          const grounded = groundingFrom(await search(scopedQuery(question, examId, classId), {}))
          sources = grounded.sources
          /* F2: the verdict rides into the author's own sources on the server
             (`groundingPort`), which is where the lesson's grounding happens.
             Here it is added to the page the answerer quotes, so an in-lesson
             answer resting on one source says so too. */
          const agreement = howWellSourcesAgree(grounded.check)
          if (agreement !== '') {
            sources = sources.map((one, index) => (index === 0 ? { ...one, text: `${one.text}\n\n[${agreement}]` } : one))
          }
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
        situation.resolved(question)
      } else {
        setAuthored(null)
        setAuthorFailed(written.issues)
        setAskedBackTimes((times) => times + 1)
        situation.opened({ question, lesson: '', stalled: 'refused' })
      }
    } catch (e) {
      setAuthored(null)
      setAuthorFailed([{ path: '(model)', message: e instanceof Error ? e.message : String(e) }])
      setAskedBackTimes((times) => times + 1)
      /* Nothing could be reached; `chain.ts`'s own distinction, kept here. */
      situation.opened({ question, lesson: '', stalled: 'failed' })
    } finally {
      setAuthoring(false)
    }
  }

  /* `NOTHING_YET` is already the name of an EMPTY MEMORY (`teach/again`); the
     empty STAGE is named apart so the two can never be handed to each other. */
  const chosen = NOTHING_ON_STAGE

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
  const [grown, setGrown] = useState<{ id: string; parts: readonly { after: string | null; blocks: readonly unknown[] }[] }>(
    { id: onStage.id, parts: [] },
  )
  /* A PART KNOWS WHERE IT GOES. "More" is appended at the end. The tutor's
     answer to a plea goes right after the beat she was on -- she pleaded at
     beat two of four, so the other way of saying it comes next, before the
     lesson's own closing summary; appended after the summary it would be
     "core material after the end", which the gate refuses, and rightly. */
  const parts = grown.id === onStage.id ? grown.parts : []
  const added = parts.flatMap((part) => part.blocks)

  const picked = useMemo(() => {
    const base = onStage.spec as { blocks: readonly unknown[] }
    let merged: readonly unknown[] = base.blocks
    const isSummary = (block: unknown): boolean => {
      const b = block as { kind?: unknown; role?: unknown }
      return b.kind === 'summary' || b.role === 'summary'
    }
    for (const part of parts) {
      let at = part.after === null ? -1 : merged.findIndex((block) => (block as { id?: unknown }).id === part.after)
      if (at === -1) {
        merged = [...merged, ...part.blocks]
        continue
      }
      /* Never after a summary: a short lesson is one beat, and that beat's
         last block IS the summary. The other way of saying it goes before it. */
      while (at >= 0 && isSummary(merged[at])) at -= 1
      merged = [...merged.slice(0, at + 1), ...part.blocks, ...merged.slice(at + 1)]
    }
    /* Re-validated WITH the new blocks in place, by the same gate as everything
     * else. A part the model wrote is not trusted further than an authored one:
     * if it carries appearance, or a dangling relation, the whole thing is
     * refused and she is told, rather than a bad block being painted because it
     * arrived late. */
    return validateLesson(
      added.length === 0 ? onStage.spec : { ...base, blocks: merged },
      /* `{ teaching }` is main's, and it is not decoration: `validateLesson`
         applies a different shape to a lesson than to an answer, so validating
         without it judges an authored lesson by the wrong rules. */
      { teaching: onStage.teaching },
    )
  }, [onStage, parts, added.length])

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
  /* C3: WHAT SHE TYPES INSIDE A LESSON IS EVIDENCE, FILED UNDER THE TOPIC.
     A statement goes to `/api/evidence` and the lesson goes on. A plea goes to
     the tutor with everything already taught; whatever comes back grows the
     lesson, and the ONE question the tutor ended with is shown below it, as
     words, never a button. On the free canvas the lesson stands in for the
     topic. Decided 2026-09-02. */
  const topicForEvidence = forTopic === null ? onStage.id : forTopic.id
  const said = useCallback(
    ({ said, beat }: { said: string; beat: string }): void => {
      void fetch('/api/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* `artifactSeq` says WHICH lesson she was reading. Without it, three
           pleas about one lesson and three pleas spread across three lessons
           are indistinguishable -- and the first questions the teaching while
           the second is an ordinary hard week. See `server/assurance.ts`. */
        body: JSON.stringify({ topicId: topicForEvidence, said, beat, ...(stagedSeq === null ? {} : { artifactSeq: stagedSeq }) }),
      }).catch(() => undefined)
    },
    [topicForEvidence],
  )
  const notUnderstood = useCallback(
    async ({ taught, justSaid, beat, afterBlock, beatTitles, suspects }: { taught: string; justSaid: string; beat: string; afterBlock: string; beatTitles: readonly string[]; suspects: readonly string[] }): Promise<{ grown: boolean; question: string | null }> => {
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
            topicId: topicForEvidence,
            beat,
            suspects,
            prerequisites,
          }),
        })
        if (!response.ok) return { grown: false, question: null }
        const body = (await response.json()) as { lesson?: { blocks?: readonly unknown[] }; checkpoint?: string }
        const blocks = body.lesson?.blocks
        const grown = Array.isArray(blocks) && blocks.length > 0
        if (grown) {
          setGrown((previous) => ({
            id: onStage.id,
            parts: [...(previous.id === onStage.id ? previous.parts : []), { after: afterBlock, blocks }],
          }))
        }
        /* A QUESTION IS THE SOFTWARE'S GUARANTEE when she pleaded. The tutor's
           own is preferred; when it wrote none (measured live: the laptop
           model did), the canvas asks which of the parts she was reading did
           not land -- by their names, so it is about her lesson and nothing
           else. Decided 2026-09-02: questions are rare, and this is the case. */
        const written = typeof body.checkpoint === 'string' && body.checkpoint.trim() !== '' ? body.checkpoint.trim() : null
        const names = beatTitles.filter((name) => name.trim() !== '')
        const question =
          written ??
          (names.length > 1
            ? `Which of these did not land: ${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}?`
            : names.length === 1
              ? `What about "${names[0]}" did not land -- the words, or the idea?`
              : 'Which sentence of the last part did not land?')
        setTurn(question === null ? null : { checkpoint: question, next: [] })
        return { grown, question }
      } catch {
        return { grown: false, question: null }
      }
    },
    [onStage.id, onStage.spec, topicForEvidence, prerequisites],
  )
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
          parts: [...(previous.id === onStage.id ? previous.parts : []), { after: null, blocks }],
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
  /* `asking` is the controller's ASK_CLARIFICATION reaching the screen. It sits
     above `writing` because a question that has arrived is not a lesson still
     being written -- and below `inviting`, because someone who has not opened
     anything has not been asked anything either. */
  /* `refused` sits above `writing`: an ask that has FAILED is not a lesson
     still being written, and reading `authored === null` alone could not tell
     the two apart. MEASURED in a real browser on 2026-09-02: the server
     answered 502, the refusal banner rendered, and this value stayed 'writing'
     -- so the moving bar and "Writing this for you now" sat under the refusal,
     permanently, and `result` fell through to the picker's logarithms. The
     screen-reader region below already said "No lesson is being shown"; the
     sighted learner was the only one not told. */
  /* BROUGHT BACK AS IT WAS LEFT. On a topic canvas, what the server kept is
     read once; every entry is re-checked by the same gate that let it on
     the canvas the first time, and the last one becomes the lesson on stage.
     Nothing is asked, nothing is added. */
  useEffect(() => {
    /* THE FREE CANVAS IS A CANVAS. This began `if (topicId === null) return`,
       and `topicId` is null for exactly the surface the front door opens onto
       -- the box that says "What do you want to learn?". Every lesson written
       there was still SENT: the append below uses `topicId ?? ''`, so it was
       stored under `#canvas` and the server answered with the row. Nothing ever
       read it back, so the product saved her work correctly and then refused to
       look for it.

       MEASURED in a real browser 2026-09-04: two lessons taught on `/canvas`,
       both on screen, `location.reload()` -- and the page returned to "What do
       you want to learn?" with both gone while the rows sat on the server.

       One expression, used by the read and the write, cannot disagree with
       itself; that is the same reason the append spells it `topicId ?? ''`. The
       decision this restores is the one already written at the top of this
       file: kept under `<topic>#canvas` and brought back on return, exactly as
       it was left. */
    const canvasId = topicId ?? ''
    let live = true
    /* THE OLD CANVAS IS BROUGHT FORWARD FIRST, and only when the new one is
       genuinely empty. A student who was learning yesterday must not open a
       topic today and find it blank because the storage underneath it
       changed. `bringForwardTheOldCanvas` returns 0 both for "there was
       nothing" and for "it could not be read", and both mean the same next
       step: read the artifacts and show whatever is there. */
    void (async () => {
      const first = await readCanvas(canvasId)
      if (!live) return
      if (first.ok && first.artifacts.length === 0) {
        const moved = await bringForwardTheOldCanvas(canvasId)
        if (!live) return
        if (moved > 0) return show(await readCanvas(canvasId))
      }
      show(first)
    })()

    function show(read: Awaited<ReturnType<typeof readCanvas>>): void {
      if (!live) return

      /* A READ THAT FAILED IS NOT AN EMPTY CANVAS, and this branch is the
         whole of Law A on the page. The shipped client answered `[]` to an
         outage; the next lesson then replaced a term of work with one entry.
         Here nothing is set, nothing is written, and she is told. */
      if (!read.ok) {
        setMemoryTrouble(`${read.reason}. Nothing is lost. It is on the server, and this page will show it as soon as it can reach it.`)
        return
      }
      /* A READ THAT SUCCEEDED DOES NOT CLEAR A SAVE THAT FAILED. This read
         starts at mount; a lesson can be asked for and fail to save before it
         resolves -- a slow network, or just a slow read -- and clearing here
         then wiped "not yet on the server" from a lesson that still is not.
         Found when the read path gained one more tick and the existing test
         for that message went red: the defect was always there, the timing
         just stopped hiding it. `unsavedSeq` goes below zero once for every
         lesson this screen holds that the server does not. */
      if (unsavedSeq.current === 0) setMemoryTrouble(null)
      setQuestioned(new Map(read.questioned.map((q) => [q.artifactSeq, q.why])))
      if (read.artifacts.length === 0) return

      const brought = read.artifacts.map((artifact): OnCanvas => {
        const teaching: TeachingLevel = artifact.teaching === 'answer' ? 'answer' : 'lesson'
        const result = validateLesson(artifact.payload, { teaching })
        /* A LESSON THAT WILL NOT VALIDATE IS KEPT, NOT DROPPED. It used to be
           silently removed from the list AND the shortened list saved back, so
           one bad row erased itself permanently. It is hers; it stays, and the
           page says which one it could not draw. */
        if (result.ok) return { seq: artifact.seq, question: artifact.question, teaching, lesson: result.lesson }
        /* THE REASON IS KEPT AND SHOWN. A page that says only "could not draw
           this" gives nobody anything to act on -- found live, where twelve
           saved lessons each said exactly that and nothing said why. */
        const first = result.issues[0]
        return {
          seq: artifact.seq,
          question: artifact.question,
          teaching,
          lesson: null,
          why: first === undefined ? 'it did not pass this build\u2019s checks' : `${first.path}: ${first.message}`,
        }
      })
      alreadyKept.current = brought
      setEntries(brought)

      /* The last one that can actually be drawn becomes the lesson on stage.
         If none can, the canvas still opens and still shows what it has. */
      const last = [...brought].reverse().find((entry) => entry.lesson !== null)

      /* FOUND LIVE: opening a canvas whose lessons this build cannot draw left
         `authored` null while `askedForATopic` was true, which is the state
         called 'writing' -- so the moving bar and "writing this for you now"
         sat over a canvas that was not writing anything and never would. That
         is the same dead end A4 removed from the refusal path, reintroduced
         here. The canvas is only "opened" when there is something on stage;
         with nothing drawable it stays inviting, with her saved work above the
         box and the reason under each one. */
      if (last?.lesson == null) {
        setStagedSeq(null)
        setOpened(false)
        setAskedForATopic(false)
        return
      }
      setStagedSeq(last.seq)
      setOpened(true)
      setAskedForATopic(true)
      setAuthoredLevel(last.teaching)
      setTurn(null)
      setAuthored(last.lesson)
    }

    return () => {
      live = false
    }
  }, [topicId])

  /* THE WHOLE-CANVAS SAVE IS GONE, and its absence is the fix.
   *
   * It read: if the entries changed, PUT all of them. Every save was therefore
   * able to destroy every lesson -- and a client that had read badly wrote the
   * damage back. Appending happens at the one place a lesson is actually
   * written, above, one row at a time. There is no code here, and there is not
   * going to be any. */

  const stage: 'inviting' | 'asking' | 'refused' | 'writing' | 'showing' =
    !opened
      ? 'inviting'
      : askedBack !== null
        ? 'asking'
        : authorFailed !== null
          ? 'refused'
          : askedForATopic && authored === null
            ? 'writing'
            : 'showing'

  /*
   * ASKED BACK OR REFUSED TWICE RUNNING: SAY THE ONE MISSING THING, AND SHOW
   * A WAY THROUGH THAT CANNOT FAIL.
   *
   * The tutor's own sentence stays above, verbatim. This adds what it never
   * says: that a SUBJECT is the thing it is waiting for. Without it the second
   * non-answer is character-for-character the first, and a learner reasonably
   * reads a frozen page.
   *
   * The examples are pressable because a stuck learner needs a door, not more
   * prose -- and they are ordinary topics, not a menu the canvas is limited
   * to. Anything typed in the box is written the same way these are. One
   * element, rendered under a question back and under a refusal alike.
   */
  const stuckDoor =
    askedBackTimes > 1 ? (
      <div className="lc-blank__stuck">
        <p className="lc-caption">
          It is waiting for a subject — a thing to be taught. Type any topic at all
          above, or start with one of these.
        </p>
        <div className="lc-ask-examples">
          {EXAMPLE_TOPICS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={authoring}
              onClick={() => {
                setTopic(example)
                void askForALesson(example)
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    ) : null

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
          : stage === 'refused'
            ? 'No lesson is being shown. See the reason above.'
            : ''}
      </div>

      <div className="lc-route-bar">
        <button type="button" className="lc-back" onClick={() => navigate('/today')}>
          Back
        </button>


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

      {/*
        THE RETURN CARD: one unfinished question, waiting where she left it.

        `askChain` ends some questions with an honest refusal and the product
        used to forget them on the next visit. The server now remembers
        (`/api/situation`), and this is the whole of how that memory reaches
        her: ONE quiet card, on arrival, showing HER OWN words, with one
        button that asks the question again through the same authoring path,
        the same gate and the same history as anything typed by hand. Nothing
        pings, nothing nags — resolved, it never returns; unresolved, it waits
        for her NEXT arrival, not her next click.

        Hidden while she is authoring or once she has begun asking, because a
        card about yesterday's question must never sit on top of today's.
      */}
      {openLoops.length > 0 && openLoops[0] !== undefined && !authoring && !askedForATopic && (
        <div className="lc-return-card">
          <p className="lc-return-card__note">
            Last time, this question was left without an answer:
          </p>
          <p className="lc-return-card__question">{openLoops[0].question}</p>
          <button
            type="button"
            onClick={() => {
              const owed = openLoops[0]
              if (owed === undefined) return
              /* Cleared for THIS visit before asking: if the ask fails again
                 the server re-records it and the card returns next arrival —
                 "never nags twice" is a promise about a sitting, kept here. */
              setOpenLoops([])
              /* HER WORDS GO INTO THE BOX, not only into the request. The
                 writing header renders the topic, refusals deliberately never
                 echo her words (M7), and the box is hers to edit and resend —
                 so the box is the one honest place her question stays visible
                 while it is being asked again. */
              setTopic(owed.question)
              void askForALesson(owed.question)
            }}
          >
            Ask it again
          </button>
        </div>
      )}

      {/* WHAT HAPPENED TO HER WORK, SAID OUT LOUD.
           The shipped canvas answered an outage with a blank page that looked
           exactly like a topic she had never opened, and answered a failed
           save with nothing at all. Both are states a person can act on -- wait
           a minute, check the server, do not close the tab -- and neither can
           be acted on by somebody who is not told. `role="status"` rather than
           `alert`: it is news, not a refusal, and the lesson beside it is
           still perfectly good. */}
      {memoryTrouble !== null && (
        <p className="lc-memory-trouble" role="status">{memoryTrouble}</p>
      )}

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
          {stuckDoor}
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
        {/* THE ZOOM WRAPPER. Everything she can read sits inside it, so one
            transform moves the whole column and nothing inside is re-rendered
            or re-measured. `transform-origin` is the top so zooming out pulls
            the canvas up towards what she was reading rather than away. */}
        <div className="lc-zoom" style={scale === 1 ? undefined : { transform: `scale(${scale})` }}>
        {/* WHAT THIS TOPIC IS ABOUT, and it stays: it is the canvas's heading,
            not a splash screen that a first lesson replaces. Renders nothing at
            all for a topic no checked model describes. */}
        <TopicScope topicId={topicId} topicName={forTopic?.name ?? null} />
        {/* Everything already learned on this topic, oldest first, above the
            lesson being read. While something is being written or was
            refused, the last entry is still on the canvas too. */}
        {(stage === 'showing' ? entries.filter((entry) => entry.seq !== stagedSeq) : entries).map((entry) =>
          entry.lesson === null ? (
            /* Kept, named, and honest about what happened to it. Removing it
               would be the silent deletion Law C forbids. */
            <section className="lc-entry" key={entry.seq} aria-label={entry.question}>
              <h2 className="lc-entry__question">{entry.question}</h2>
              <p className="lc-caption">This lesson is saved, and this page could not draw it. {entry.why}</p>
            </section>
          ) : (
            <div key={entry.seq}>
              <CanvasEntry question={entry.question} lesson={entry.lesson} mode={mode} />
              {questioned.has(entry.seq) && (
                /* QUIET, AND ON THE LESSON ITSELF. Not an alert: the lesson may
                   well be right, and telling her in red that her own work is
                   suspect would be worse than the doubt it reports. */
                <p className="lc-questioned" role="status">
                  Looking at this one again — {questioned.get(entry.seq)}
                </p>
              )}
            </div>
          ),
        )}
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
            {forTopic === null ? (
              <h2>What do you want to learn?</h2>
            ) : forTopic.name === null ? (
              /* SAID, NOT BLANKED. An address this device cannot name is a
                 sentence she can act on; `ChapterView`'s `return null` for the
                 same case was the truly empty page a learner reported. */
              <h2>This device does not know a topic called {forTopic.id}.</h2>
            ) : (
              <h2 className="lc-writing-topic">{forTopic.name}</h2>
            )}
            {askBox}
            <p className="lc-caption">
              {forTopic === null || forTopic.name === null
                ? 'Anything at all — it is written for you when you ask, not chosen in advance.'
                : 'Ask anything about it — it is written for you when you ask, not chosen in advance.'}
            </p>
          </div>
        ) : stage === 'asking' ? (
          /*
           * THE TUTOR ASKED SOMETHING BACK.
           *
           * The same shape as the invitation, because it is the same moment:
           * a question on the stage and the box to answer it in directly
           * below. `askedBack` is the controller's own words, never ours.
           */
          <div className="lc-blank">
            <h2>{askedBack}</h2>
            {askBox}
            {stuckDoor}
          </div>
        ) : stage === 'refused' ? (
          /* The refusal itself is rendered above the stage, with the reason and
             the door out, and the box to ask again is in the route bar. The
             stage carries nothing, because the two things it could carry are
             both wrong: the writing screen reports work that is not happening,
             and `result` would fall through to the picker's logarithms. */
          null
        ) : stage === 'writing' ? (
          /*
           * WAITING IS NOT NOTHING, AND A BLANK SCREEN SAYS NOTHING.
           *
           * This branch deliberately rendered an empty stage, on the argument
           * that showing the WRONG lesson -- the picker's logarithms -- was
           * worse than showing nothing. That argument was right about the
           * logarithms and wrong about the conclusion: blank was never the only
           * alternative to wrong.
           *
           * A learner who presses Teach me and sees an empty page has no way to
           * tell it apart from a page that failed to load, and on a local model
           * they can sit there for thirty seconds. What is shown here is
           * neither a lesson nor a guess: it is THEIR OWN QUESTION, which is the
           * one thing that is certainly true, and a plain statement of what is
           * happening to it.
           */
          <div className="lc-blank">
            <h2 className="lc-writing-topic">{topic.trim() === '' ? 'Writing your lesson' : topic}</h2>
            <p className="lc-caption">
              Writing this for you now. It is being written from scratch, so it takes a few
              seconds.
            </p>
            {streamed.some((text) => text !== undefined && text !== '') && (
              /* THE FIRST WORDS, AS THEY ARRIVE. Prose is text: it is shown the
                 moment it exists, and replaced by the checked lesson when that
                 lands. Nothing structured is drawn here -- a table or a figure
                 waits for its own check. */
              <div className="lc-streamed" aria-live="polite">
                {streamed.map((text, index) => (text ? <p key={index}>{text}</p> : null))}
              </div>
            )}
            <div className="lc-writing-bar" aria-hidden="true">
              <span />
            </div>
          </div>
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
            {...(forTopic === null ? {} : { memoryKey: forTopic.id })}
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
            situation={situation}
            onNeedNextPart={needNextPart}
            onNotUnderstood={notUnderstood}
            onSaid={said}
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
              <p className="lc-turn-next">
                <span className="lc-caption">You could ask: </span>
                {turn.next.map((branch) => branch.label).join(' · ')}
              </p>
            )}
          </section>
        )}
        </div>
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
