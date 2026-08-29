import type {
  AnyResolver,
  Doubt,
  DoubtRefusal,
  Resolution,
  TriedResolver,
} from './contract'
import type { Lesson } from '../spec/spec'
import { resolutionBreach } from './contracts'

/**
 * Ask several resolvers in turn, and stop at the first one that can answer.
 *
 * WHAT THIS FIXES, PRECISELY
 * --------------------------
 * `lessonResolver` refusing was always correct — it answers only from material
 * the author wrote, so it cannot write a wrong sentence about the subject. What
 * was wrong is that the refusal was TERMINAL. A learner admitted confusion, was
 * told this page does not answer it, and nothing caught them. Two catches
 * already existed and neither could be reached: `websearch/` returns a promise,
 * and the engine's own `session/doubt.py` needs a network, while `resolve()` is
 * synchronous. The types made the wiring impossible, so nobody noticed the
 * wiring was missing.
 *
 * This is the doorway. A refusal is now a HANDOFF.
 *
 * WHAT IT REFUSES TO CHANGE
 * -------------------------
 * Adding answerers must not weaken the property everything else rests on: this
 * never invents. A chain that cannot answer still refuses. That is not a
 * fallback for when things go wrong — it is the correct output, and the tests
 * that pin it are the hardest ones in `chain.test.ts`.
 *
 * ORDER IS A TRUST RANKING, NOT A SPEED ONE
 * -----------------------------------------
 * The caller passes resolvers most-trusted first, and the intended order is:
 * the lesson in front of the learner, then the engine that knows the syllabus,
 * then the open web. That is deliberately the reverse of how much each one can
 * answer. A block the author wrote about the exact thing being asked beats a
 * correct paragraph from elsewhere, because the learner is looking at that page
 * and has to be able to connect the answer to it.
 *
 * WHY IT NEVER TOUCHES BEATS
 * --------------------------
 * The guarantee that answering cannot advance the lesson used to be enforced by
 * `resolve()` being synchronous. It is now enforced here, in one place: this
 * function takes a `Doubt` and a `Lesson` and returns a `Resolution`. There is
 * no beat in scope, so no resolver can move one however long it takes.
 */

export interface ChainOptions {
  /**
   * Called with a resolver's name immediately BEFORE it is asked.
   *
   * This is the explicit pending state `contract.ts` asks for. Without it a
   * slow resolver is indistinguishable from a frozen page. Called before rather
   * than after, because "asking the web" is only useful while the learner is
   * still waiting.
   */
  readonly onTry?: (name: string) => void
  /** Leaving the lesson stops the work. Checked before every resolver. */
  readonly signal?: AbortSignal
  /**
   * How long ONE rung may take before the chain moves on. Omitted means
   * unbounded, which is what every caller got before this existed.
   *
   * WHY PER-RUNG AND NOT PER-CHAIN. A whole-chain budget spent by a slow first
   * rung leaves nothing for the two behind it, so the offline answer -- the one
   * a learner can always be given -- becomes the first casualty of a slow
   * remote. Per-rung means a frozen web resolver costs its own budget and
   * nothing else.
   *
   * A REJECTION IS NOT A HANG. `TeachView` already catches a rejected promise
   * and tells the learner. A promise that never settles is not a rejection: it
   * stays pending, and the screen says "Working on it..." until the tab closes.
   * Waldo et al. state the general case -- a remote call fails in ways a local
   * call cannot, and you cannot paper over the difference.
   */
  readonly budgetMs?: number
}

export interface ChainResult {
  readonly resolution: Resolution
  /** Every resolver reached, in order, with what it did. */
  readonly tried: readonly TriedResolver[]
  /** The name of the resolver that answered, or null if none did. */
  readonly answeredBy: string | null
  /**
   * Failures raised by `onTry` itself, kept rather than discarded.
   *
   * A hook that throws means the pending state did not render, so a learner sat
   * in front of a page that looked frozen while work was happening. The chain
   * carries on — a UI callback must not decide whether somebody gets an answer
   * — but carrying on SILENTLY would mean nobody ever finds out that happened.
   * Continuing and keeping the evidence are different things, and this field is
   * the second one.
   */
  readonly hookErrors: readonly string[]
}

/**
 * What a learner is told when the whole chain came up empty.
 *
 * Two different sentences, because two different things happened and telling
 * them apart is the entire reason `TriedResolver` separates `failed` from
 * `refused`. A learner whose question went unanswered because a server is down
 * must not be left believing their question was the problem.
 */
function refusalFrom(
  tried: readonly TriedResolver[],
  first: DoubtRefusal | null,
): DoubtRefusal {
  const refused = tried.filter((t) => t.outcome === 'refused')
  const failed = tried.filter((t) => t.outcome === 'failed')

  /* The FIRST resolver's "did you mean" list is kept, not the last one's. Only
     the lesson resolver can point at blocks of the page the learner is actually
     looking at; a web refusal has no such list, and overwriting the useful one
     with an empty one throws away the only concrete help there is. */
  const nearest = first?.nearest ?? []

  if (tried.length === 0) {
    return {
      kind: 'refusal',
      reason: 'I have nothing set up to answer questions right now.',
      nearest,
    }
  }

  if (refused.length === 0 && failed.length > 0) {
    const names = failed.map((t) => t.name).join(', ')
    return {
      kind: 'refusal',
      reason:
        `I could not answer that because every source I can ask could not be reached ` +
        `(${names}). That is a problem on this end, not with your question — it is ` +
        `worth asking again in a moment.`,
      nearest,
    }
  }

  const asked = tried.map((t) => t.name).join(', ')
  const base = first?.reason ?? 'I could not find an answer to that.'
  const failedNote =
    failed.length > 0
      ? ` ${failed.map((t) => t.name).join(', ')} could not be reached, so there may be an answer I did not get to see.`
      : ''

  return {
    kind: 'refusal',
    reason: `${base} I asked: ${asked}.${failedNote}`,
    nearest,
  }
}

/**
 * Run one rung under a deadline, and abort it when the deadline passes.
 *
 * THE TIMER IS ALWAYS CLEARED. A pending `setTimeout` keeps the event loop
 * alive, so a chain that answered on its first rung would otherwise hold a
 * test runner open for the whole budget and look like a hang while being the
 * opposite of one.
 *
 * The rung is also told: the controller aborts, so a resolver that honours a
 * signal stops working rather than finishing into a result nobody will read.
 * `webResolver` already honours one. A rung that ignores it keeps running in
 * the background -- unavoidable without threads -- but it can no longer hold
 * the learner, which is the property that matters.
 */
async function withBudget(
  name: string,
  budgetMs: number | undefined,
  outer: AbortSignal | undefined,
  run: (signal: AbortSignal | undefined) => Resolution | Promise<Resolution>,
): Promise<Resolution> {
  if (budgetMs === undefined) return await run(outer)

  const controller = new AbortController()
  /* The caller leaving must still stop the work, so both reasons abort the same
     controller -- otherwise a budget would REPLACE the existing cancellation
     rather than adding to it. */
  const onOuterAbort = (): void => {
    controller.abort()
  }
  outer?.addEventListener('abort', onOuterAbort, { once: true })

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<Resolution>((resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`${name} timed out after ${String(budgetMs)}ms`))
      }, budgetMs)
      Promise.resolve(run(controller.signal)).then(resolve, reject)
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}

export async function askChain(
  doubt: Doubt,
  lesson: Lesson,
  resolvers: readonly AnyResolver[],
  options: ChainOptions = {},
): Promise<ChainResult> {
  const tried: TriedResolver[] = []
  const hookErrors: string[] = []
  let firstRefusal: DoubtRefusal | null = null

  /* Computed once. `drawnFrom` points back at the ORIGINAL lesson, so this is
     the set an answer's citations must be drawn from -- an id outside it points
     the interface at nothing. */
  const originalIds = new Set(lesson.blocks.map((block) => block.id))

  for (const resolver of resolvers) {
    if (options.signal?.aborted) break

    if (options.onTry) {
      try {
        options.onTry(resolver.name)
      } catch (error) {
        /* Recorded, not discarded. The chain continues because a render bug
           must not cost a learner their answer, but the failure survives into
           `hookErrors` so it is findable afterwards. */
        const detail = error instanceof Error ? error.message : String(error)
        hookErrors.push(`onTry(${resolver.name}) threw: ${detail}`)
      }
    }

    let resolution: Resolution
    try {
      /* `await` on a synchronous return costs one microtask, and it is what lets
         both signatures share one loop. Two branches would mean two places for
         the refusal logic to drift apart. */
      resolution = await withBudget(
        resolver.name,
        options.budgetMs,
        options.signal,
        (signal) => resolver.resolve(doubt, lesson, signal),
      )
    } catch (error) {
      /* A resolver that throws must not take the chain down with it. The offline
         answer is the one a learner can always be given, and a broken remote
         must never be able to prevent it. The error is kept on the rung, so
         "the web is down" stays distinguishable from "the web has no answer". */
      tried.push({
        name: resolver.name,
        outcome: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if (resolution.kind === 'answer') {
      /*
       * THE POSTCONDITION, CHECKED AT THE BOUNDARY THAT CROSSES.
       *
       * `contract.ts` promises of `DoubtAnswer.lesson` that it is "Already
       * validated. Renderers can trust every field." Nothing enforced that: a
       * rung answering with a document it had not filled in was handed straight
       * to the renderer, three layers from the rung that produced it, where the
       * stack trace names the wrong component.
       *
       * A BREACH IS `failed`, NEVER `refused`, and the difference reaches the
       * learner. `refusalFrom` writes one sentence when the rungs had nothing
       * to say and a different one when a rung broke. A rung that returned a
       * malformed answer did not decline the question, and recording it as
       * `refused` would tell a learner their question was the problem.
       */
      const breach = resolutionBreach(resolver.name, resolution, originalIds)
      if (breach !== null) {
        tried.push({ name: resolver.name, outcome: 'failed', error: breach })
        continue
      }
      tried.push({ name: resolver.name, outcome: 'answered' })
      return { resolution, tried, answeredBy: resolver.name, hookErrors }
    }

    tried.push({ name: resolver.name, outcome: 'refused' })
    if (firstRefusal === null) firstRefusal = resolution
  }

  return {
    resolution: refusalFrom(tried, firstRefusal),
    tried,
    answeredBy: null,
    hookErrors,
  }
}
