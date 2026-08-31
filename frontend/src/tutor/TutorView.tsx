/**
 * The surface that makes `src/agent` reachable.
 *
 * Until this file existed, eleven thousand lines of agent were an island:
 * complete, tested, and imported by nothing the product loads. `/quick-question`
 * rendered a placeholder reading "Not designed yet." This replaces it.
 *
 * IT SHOWS THE TRACE, AND THAT IS THE POINT, NOT A DEBUG AFFORDANCE.
 *
 * The loop reports which capabilities RAN and which were selected but could
 * not, and it sets `degraded` when a port failed. A chat window that renders
 * only the prose throws that away, and the student cannot tell an answer
 * grounded in sources from one the model produced with the search port down.
 * Every answer here carries what was actually done to produce it.
 *
 * WHAT IT DOES NOT DO. It does not retry silently, it does not fill a gap with
 * a cheerful apology, and it does not claim the student has learned anything.
 * When there is no model configured, the loop's own degraded path says so in
 * words and this renders those words rather than an empty bubble.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAgent, escapeHatchKey, type Agent, type AskResult } from '../agent'
import { backendModel } from './backendModel'
import { researchPort, searchPort } from '../websearch'
import './tutor.css'

/** One exchange, kept with the evidence that produced it. */
interface Exchange {
  readonly id: number
  readonly question: string
  readonly answer: string
  readonly executed: readonly string[]
  readonly unmet: readonly string[]
  readonly degraded?: string
  readonly replayed: boolean
}

/**
 * Where a suspended lesson lives between visits.
 *
 * The agent serialises itself to a string precisely so this can be one
 * `localStorage` key rather than a schema. A failed restore is REPORTED, never
 * swallowed: continuing from a corrupt blob would mean teaching the first
 * concept to somebody who finished it last week.
 */
const SAVE_KEY = 'tutor-session-v1'

function readEnv(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  return typeof v === 'string' ? v : ''
}

export default function TutorView(): JSX.Element {
  const [exchanges, setExchanges] = useState<readonly Exchange[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)
  const nextId = useRef(0)
  /* Synchronous re-entrancy latch. See the note in `send` — `busy` is state
   * and updates too late to stop the second click of a double-click. */
  const inFlight = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  const searchEndpoint = readEnv('VITE_SEARCH_ENDPOINT')
  const deepSearch = readEnv('VITE_SEARCH_DEPTH') === 'research'

  /* THE SEARCH DOORWAY. One import, one type, and the app knows nothing about
     what is behind it --- not the engine, not the fetcher, not the extractor.
     `researchPort` reads the pages it finds and hands back text that has been
     through the injection guard; `searchPort` is the engine alone. Both are a
     `SearchPort`, so `createAgent` cannot tell which it received. */
  const build = useMemo(
    () => {
      const cfg = {
        endpoint: searchEndpoint,
        apiKey: readEnv('VITE_SEARCH_KEY') || undefined,
      }
      return deepSearch ? researchPort(cfg) : searchPort(cfg)
    },
    [searchEndpoint, deepSearch],
  )

  /* One agent for the life of the view. Rebuilding it per turn would discard
     the conversation, the working memory and the teaching position — which is
     the whole thing this engine exists to keep. */
  const agent: Agent = useMemo(
    () =>
      createAgent({
        /* THE BACKEND, ALWAYS. The browser has no key and needs none: the
           server holds it. Anyone who still has `VITE_TUTOR_KEY` in a `.env` is
           told on the console that they have published it — the value is read
           only to warn about it, and goes nowhere near the wire. */
        model: backendModel({}),
        /* SPREAD, NOT `search: maybeNull`. `AgentOptions.search` is optional,
           and an EXPLICIT `undefined` is not the same as absent to the agent:
           absent means the capability is reported UNMET ("I cannot look things
           up"), which is the honest state when no engine is configured. The
           websearch doorway returns `null` for exactly this reason, so the
           distinction has to survive the last three lines that carry it. */
        ...(build ? { search: build } : {}),
      }),
    [build],
  )

  /* Once per mount, not once per question: a warning repeated on every turn is
     a warning nobody reads. */
  useEffect(() => {
    escapeHatchKey(import.meta.env as unknown as Record<string, string | undefined>, console.warn)
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem(SAVE_KEY)
    if (!saved) return
    const out = agent.restore(saved)
    /* A refusal is shown, not logged and forgotten. The student is about to be
       taught from whatever state this left behind. */
    if (!out.ok) setRestoreNote(`Could not restore the last session: ${out.why}. Starting fresh.`)
  }, [agent])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [exchanges])

  const send = useCallback(async () => {
    const question = draft.trim()
    /* THE LATCH IS A REF, NOT `busy`, AND THAT IS THE WHOLE POINT.
     *
     * `busy` is React state, so `setBusy(true)` does not take effect until a
     * re-render. A synchronous burst of clicks — a double-click, a trackpad
     * stutter, a rage-click — all run against the same closure, all read
     * `busy === false`, and all proceed; `disabled={busy}` is not on the
     * button yet either, for the identical reason. Measured in a browser on
     * 2026-08-25: 1 click asked once, 2 clicks asked twice, 8 clicks asked
     * eight times. An asynchronous flag cannot be a mutual-exclusion latch.
     *
     * A ref is assigned synchronously, so the second click of a double-click
     * sees it. `busy` stays exactly as it was — it drives the label and the
     * disabled attribute, which is a rendering concern and correct as state.
     *
     * Today each duplicate is a local no-op. The moment `VITE_TUTOR_ENDPOINT`
     * is set, each one is a real paid model call. */
    if (!question || inFlight.current) return
    inFlight.current = true
    setDraft('')
    setBusy(true)
    try {
      const r: AskResult = await agent.ask(question)
      const id = nextId.current++
      setExchanges((prev) => [
        ...prev,
        {
          id,
          question,
          answer: r.result.answer,
          executed: [...r.trace.executed],
          unmet: Object.keys(r.trace.unmet ?? {}),
          ...(r.trace.degraded ? { degraded: r.trace.degraded } : {}),
          replayed: r.replayed,
        },
      ])
      const blob = agent.suspend()
      if (blob) window.localStorage.setItem(SAVE_KEY, blob)
    } catch (e) {
      /* `loop.ts` degrades rather than throwing for a failed model call, so
         reaching here means something outside that boundary broke. Showing it
         verbatim beats a generic apology: the message names the cause. */
      const why = e instanceof Error ? e.message : String(e)
      const id = nextId.current++
      setExchanges((prev) => [
        ...prev,
        { id, question, answer: `That turn failed before an answer existed: ${why}`, executed: [], unmet: [], replayed: false },
      ])
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [agent, draft])

  return (
    <div className="tutor">
      <header className="tutor-head">
        <div className="tutor-eyebrow">Tutor</div>
        {restoreNote && <p className="tutor-warn" role="status">{restoreNote}</p>}
      </header>

      <div className="tutor-thread">
        {exchanges.length === 0 && (
          <p className="tutor-empty">Ask anything. The answer will show what it actually did to produce it.</p>
        )}
        {exchanges.map((x) => (
          <article key={x.id} className="tutor-turn">
            <p className="tutor-q">{x.question}</p>
            <p className="tutor-a">{x.answer}</p>
            <dl className="tutor-trace">
              <div><dt>did</dt><dd>{x.executed.length ? x.executed.join(', ') : 'nothing'}</dd></div>
              {x.unmet.length > 0 && <div><dt>could not</dt><dd>{x.unmet.join(', ')}</dd></div>}
              {x.degraded && <div><dt>degraded</dt><dd>{x.degraded}</dd></div>}
              {x.replayed && <div><dt>note</dt><dd>this exact question was already answered; the stored answer was returned</dd></div>}
            </dl>
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="tutor-compose"
        onSubmit={(e) => { e.preventDefault(); void send() }}
      >
        <label className="sr-only" htmlFor="tutor-input">Ask the tutor</label>
        <input
          id="tutor-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question"
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || draft.trim() === ''}>
          {busy ? 'Thinking' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
