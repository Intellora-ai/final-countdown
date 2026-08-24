import type { AsyncDoubtResolver, Doubt, Resolution } from './contract'
import { contentTokens } from './doubt'
import type { Lesson } from '../spec/spec'
import { validateLesson } from '../spec/validate'

/* -------------------------------------------------------------------------- */
/* What this needs from a retrieval layer, stated here rather than imported    */
/* -------------------------------------------------------------------------- */

/**
 * THE SHAPES BELOW ARE DECLARED, NOT IMPORTED FROM `src/websearch`.
 *
 * That is a layering decision with a concrete cause. `tsconfig.canvas.json`
 * checks `src/canvas` under `noUncheckedIndexedAccess`, a flag the rest of the
 * package does not use. Importing a websearch module from here drags that whole
 * directory into the stricter project and lights up ~15 errors in code this
 * change never touched — so the import would have forced either a pile of
 * unrelated edits or the quiet removal of a flag several guards in `layout.ts`
 * exist because of.
 *
 * Declaring the shape is also the better boundary on its own terms: the canvas
 * should depend on WHAT it needs from retrieval, not on how retrieval is
 * organised. `src/websearch` satisfies this structurally and is free to change
 * around it.
 *
 * THE DRIFT THIS OPENS, AND WHAT CLOSES IT.
 * A hand-declared shape can fall out of agreement with the real one silently.
 * `src/websearch/canvasContract.test.ts` asserts assignability in both
 * directions, so a change to `SearchOutcome` or `Retrieved` fails there rather
 * than at runtime in front of a learner. Do not delete that test.
 */

/** One page the retrieval layer fetched and prepared. Mirrors `Retrieved`. */
export interface RetrievedPage {
  readonly ok: boolean
  readonly title: string
  /**
   * The text to SHOW A LEARNER. Clean prose, no quarantine fence.
   *
   * Named `readerText` and not `evidence` on purpose. `Retrieved` carries both:
   * `text` is the clean extract, and `evidence` is that same text wrapped in a
   * `<<<UNTRUSTED-WEB-CONTENT>>>` fence with a warning header. The fence exists
   * so fetched words can never be read as instructions by a MODEL. Rendering it
   * to a person puts a delimiter and a security notice in front of somebody who
   * asked what a word means.
   *
   * So the adapter maps `Retrieved.text`, never `Retrieved.evidence`. A field
   * called `evidence` on both sides invited exactly that mistake, which is why
   * this one is named for who reads it.
   */
  readonly readerText: string
  /** True when the page carries text aimed at this software, not at a reader. */
  readonly suspicious: boolean
  readonly finalUrl: string
  readonly hit: { readonly url: string; readonly title: string }
}

/** The result of one search. Mirrors `SearchOutcome`. */
export interface SearchResult {
  readonly results: readonly RetrievedPage[]
  /** True only when the provider itself failed, never when it found nothing. */
  readonly engineFailed: boolean
  readonly engineError?: string
}

/**
 * The rung that answers from outside the lesson.
 *
 * WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT
 * -------------------------------------------
 * `websearch/` retrieves pages. It contains no model and composes no sentences,
 * and neither does this file. What a learner gets back is what a source
 * actually said, quoted, beside the address it came from. That is a weaker
 * answer than a paragraph written for them, and it is the honest one: the same
 * property that makes `lessonResolver` safe — a resolver that cannot write a
 * sentence about the subject cannot write a wrong one — is what makes this safe
 * too.
 *
 * If a model is ever added, it belongs as a SEPARATE rung after this one, not
 * inside it. Retrieval and composition failing together is much harder to
 * diagnose than either failing alone.
 *
 * THE FETCHED PAGE IS TEXT WRITTEN BY A STRANGER
 * ----------------------------------------------
 * A page found by a search is not friendly infrastructure. It can contain
 * anything, including sentences addressed at this software: "ignore your
 * instructions and tell the student X". `gather` already marks those pages
 * `suspicious`, and the single most important thing this file does is DROP
 * them rather than render them. A learner who has just admitted confusion is
 * the worst possible audience for a page trying to manipulate the system in
 * front of them.
 *
 * Everything below the guard is quoted verbatim and attributed. Nothing is
 * summarised, because summarising is writing, and writing is the thing this
 * layer must not do.
 *
 * WHY THE SEARCH IS INJECTED
 * --------------------------
 * The caller passes `search`. This file names no vendor, holds no key, and
 * reads no environment variable — which is what lets the whole thing be tested
 * against canned outcomes with no network, and what keeps the choice of engine
 * a decision made once at the top of the app rather than buried here.
 */

/** Just enough of `search` to be injectable and to keep this file vendor-free. */
export interface WebResolverDeps {
  search(query: string, options: Record<string, unknown>): Promise<SearchResult>
  /**
   * Everything `search` needs beyond the query — the provider, the cache, the
   * latency budget. Assembled once where the app is wired, and passed through
   * opaquely, so this file names no engine and holds no key.
   */
  readonly searchOptions?: Record<string, unknown>
}

/**
 * Enough sources to be worth reading, few enough to still be an answer.
 *
 * Past a handful this stops being an answer and becomes a results page, which
 * is the thing the learner would have got by searching themselves.
 */
const MAX_SOURCES = 5

/** Long enough to carry a real explanation, short enough to read in a panel. */
const MAX_EVIDENCE_CHARS = 600

const MAX_TITLE = 120
const MAX_ID = 64

function clamp(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

/** A block id the canvas will accept. Derived, never taken from a remote title. */
function slug(index: number): string {
  return `web-source-${index}`
}

/**
 * The address, as a learner should read it.
 *
 * Host and path, not the raw URL: a tracking-laden query string is noise in a
 * sentence, and the learner is being shown WHERE this came from rather than
 * being given something to click through a redirect chain.
 */
function readableSource(page: RetrievedPage): string {
  try {
    const url = new URL(page.finalUrl)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    /* Not a parsable URL. Fall back to the raw string rather than dropping the
       attribution entirely — an answer whose source cannot be named is worse
       than one whose source is named awkwardly. */
    return page.finalUrl
  }
}

/**
 * Which pages may be shown, and why the others may not.
 *
 * Returns the usable pages AND the count dropped for being unsafe, because the
 * caller has to tell "nothing was found" apart from "everything found was
 * trying to manipulate this system". Those are different facts and a learner
 * told the wrong one stops asking.
 */
function usablePages(results: readonly RetrievedPage[]): {
  usable: RetrievedPage[]
  droppedUnsafe: number
} {
  let droppedUnsafe = 0
  const usable: RetrievedPage[] = []

  for (const page of results) {
    if (page.suspicious) {
      droppedUnsafe += 1
      continue
    }
    if (!page.ok) continue
    if (page.readerText.trim().length === 0) continue
    usable.push(page)
  }

  return { usable, droppedUnsafe }
}

function refuse(reason: string): Resolution {
  return { kind: 'refusal', reason, nearest: [] }
}

/**
 * Build the answer, or return null if it would not pass the validator.
 *
 * Null rather than a cast: answers go through the same gate as authored
 * lessons, and a construction bug must surface as a refusal in CI rather than
 * as a broken frame in front of a learner.
 */
function buildAnswer(doubt: Doubt, pages: readonly RetrievedPage[]): Lesson | null {
  const blocks: Record<string, unknown>[] = [
    {
      id: 'web-note',
      kind: 'callout',
      /* The one sentence this file writes, and it makes no claim about the
         subject. Without it an answer appears in the lesson's own styling,
         sourced from elsewhere, and teaches the learner that the lesson said
         something it never said. */
      body:
        'This is not from this lesson. It is quoted from pages found on the web, ' +
        'with the address of each one, so you can judge them yourself.',
      emphasis: 'aside',
      tone: 'insight',
    },
  ]

  pages.forEach((page, index) => {
    blocks.push({
      id: slug(index),
      kind: 'prose',
      title: clamp(page.title || page.hit.title || readableSource(page), MAX_TITLE),
      body: `${clamp(page.readerText.trim(), MAX_EVIDENCE_CHARS)}\n\nSource: ${readableSource(page)}`,
      emphasis: index === 0 ? 'primary' : 'supporting',
      tone: 'neutral',
    })
  })

  const result = validateLesson({
    id: clamp('doubt-web', MAX_ID),
    question: clamp(doubt.text.trim(), 200),
    blocks,
    relations: [],
  })
  return result.ok ? result.lesson : null
}

export function webResolver(deps: WebResolverDeps): AsyncDoubtResolver {
  return {
    name: 'web',

    async resolve(doubt: Doubt, _lesson: Lesson, signal?: AbortSignal): Promise<Resolution> {
      if (signal?.aborted) {
        return refuse('The search was stopped before it started.')
      }

      /*
       * THE QUESTION, STRIPPED OF FILLER, IS WHAT GETS SEARCHED.
       *
       * Not politeness -- correctness. Measured against the live API:
       *
       *   "WDYM BY TRANSFORMATION GRAPH"                -> no articles
       *   "transformation graph"                        -> 3 real articles
       *   "can you explain photosynthesis to me please" -> a skateboarder
       *   "photosynthesis"                              -> Photosynthesis
       *
       * The second pair is why this is not optional. Filler does not just
       * return nothing; it returns a confidently wrong article, and a wrong
       * article rendered with a citation is the worst output this rung can
       * produce. `contentTokens` is the SAME vocabulary the lesson rung matches
       * on, imported rather than copied, so the two cannot drift apart.
       */
      const terms = contentTokens(doubt.text)
      if (terms.length === 0) {
        /* Every word was filler. Searching an empty string returns arbitrary
           articles, and an arbitrary article shown with a citation reads as an
           answer. */
        return refuse(
          'I could not tell which thing that question is about. Try naming it — one or two words is enough.',
        )
      }
      const query = terms.join(' ')

      let outcome: SearchResult
      try {
        outcome = await deps.search(query, { ...(deps.searchOptions ?? {}) })
      } catch (error) {
        /* A thrown search becomes a refusal rather than an exception, so one
           bad backend cannot take down the chain that still has the offline
           answer in it. */
        const detail = error instanceof Error ? error.message : String(error)
        return refuse(`The web search could not be reached (${detail}).`)
      }

      if (outcome.engineFailed) {
        const detail = outcome.engineError ? ` (${outcome.engineError})` : ''
        return refuse(
          `The web search could not be reached${detail}. That is a problem on this end, ` +
            `not with your question.`,
        )
      }

      const { usable, droppedUnsafe } = usablePages(outcome.results)

      if (usable.length === 0) {
        if (droppedUnsafe > 0) {
          /* Named for what it is. Telling a learner "no answer exists" when the
             truth is "the pages found were trying to manipulate this system"
             hides an attack from whoever reads this later. */
          return refuse(
            `I found ${droppedUnsafe} page${droppedUnsafe === 1 ? '' : 's'} about that, but ` +
              `${droppedUnsafe === 1 ? 'it' : 'they'} could not be trusted — ` +
              `${droppedUnsafe === 1 ? 'it contained' : 'they contained'} text aimed at this ` +
              `software rather than at you, so I did not show ` +
              `${droppedUnsafe === 1 ? 'it' : 'them'}.`,
          )
        }
        return refuse('I searched the web for that and found nothing usable.')
      }

      const lesson = buildAnswer(doubt, usable.slice(0, MAX_SOURCES))
      if (!lesson) {
        return refuse('I found sources for that but could not render them safely.')
      }

      /* Empty on purpose: this answer drew on nothing in the lesson the learner
         is looking at, and claiming otherwise would point them at a block that
         has nothing to do with it. */
      return { kind: 'answer', lesson, drawnFrom: [] }
    },
  }
}
