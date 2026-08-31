import type { AsyncDoubtResolver, Doubt, Resolution } from './contract'
import { contentTokens, HALF } from './doubt'
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

/**
 * What claim checking decided, as four words a learner can act on.
 *
 * DECLARED HERE, NOT IMPORTED, for the same layering reason as the shapes
 * above: `src/websearch/verify.ts` owns the real type and
 * `src/websearch/canvasContract.test.ts` asserts the two agree, so a change
 * there fails a test rather than a browser.
 */
export type ClaimStatus = 'supported' | 'conflicting' | 'single-source' | 'unknown'

export interface ClaimCheck {
  readonly status: ClaimStatus
  readonly supportingEvidenceIds: readonly string[]
  readonly conflictingEvidenceIds: readonly string[]
}

/**
 * The one span that will be shown, and where it came from.
 *
 * `text` is copied out of a page byte for byte. Nothing in this file or the one
 * that produced it may rewrite, trim or summarise it, and
 * `displayedAnswer === selectedEvidence.text` is asserted rather than intended.
 */
export interface SelectedEvidence {
  readonly text: string
  readonly sourceUrl: string
}

/**
 * Where the evidence came from, and whether it may be called current. §32.
 *
 * Declared here rather than imported, like every other shape in this file;
 * `src/websearch/provenance.ts` owns the real one and
 * `src/websearch/canvasContract.test.ts` asserts the two agree.
 *
 * `live` is true only when EVERY contributing source was read during this
 * search. Never a majority, never a ratio — one saved page is enough to make
 * the whole answer not-live, because a learner cannot tell which sentence came
 * from which page.
 */
export type Origin = 'live' | 'recent-cache' | 'precomputed'

export interface Freshness {
  readonly live: boolean
  /**
   * Declared as the same union the real type uses, not as `string[]`.
   *
   * A looser copy would absorb a rename silently — `recent-cache` becoming
   * `cached` upstream would still typecheck here and simply stop matching.
   * The contract test can only pin what this side is strict enough to refuse.
   */
  readonly origins: readonly Origin[]
  readonly usableSources: number
  readonly oldestAgeMs?: number
}

/** The result of one search. Mirrors `SearchOutcome`. */
export interface SearchResult {
  readonly results: readonly RetrievedPage[]
  /** True only when the provider itself failed, never when it found nothing. */
  readonly engineFailed: boolean
  readonly engineError?: string
  /**
   * Present when the search layer verified its own results.
   *
   * OPTIONAL, AND THAT IS A DELIBERATE CHOICE WITH A STATED COST. A search
   * that supplies no check still answers, quoting relevant pages exactly as
   * before — it simply shows no status. It cannot claim `supported` without a
   * check, because the label comes FROM the check; the failure mode of a
   * missing one is a weaker answer, never a false one. Making it required
   * instead would fail closed harder and would also mean rewriting every test
   * that predates verification, which buys a stricter type at the cost of the
   * evidence those tests carry.
   */
  readonly check?: ClaimCheck
  /** The span to display, when the search layer chose one. */
  readonly evidence?: SelectedEvidence
  /**
   * How old the evidence is, when the search layer said.
   *
   * OPTIONAL, AND ABSENT MEANS ABSENT. A missing value is never defaulted to
   * `live` downstream: "we did not measure" and "we read it just now" are
   * different claims, and quietly promoting the first to the second is exactly
   * how a saved answer starts calling itself current.
   */
  readonly freshness?: Freshness
  /** Refinement rounds the search ran. 0 means the first pass was enough. */
  readonly rounds?: number
  /**
   * True when the main search was unreachable and a keyless backup answered.
   *
   * The learner is told. An answer from a narrower source that does not say so
   * is worse than no answer, because it looks exactly like the good one.
   */
  readonly fallback?: boolean
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
 * Is this page about the question, or is it merely what the engine returned?
 *
 * THE HOLE THIS CLOSES
 * --------------------
 * Every other guard in this file asks whether a page is SAFE, or whether it
 * FETCHED. Not one of them asked whether it was about anything the learner
 * typed — so that question was answered by the search engine, and a search
 * engine RANKS. It never abstains. Asked something it has nothing for, it
 * returns its best guess anyway. Measured, both rendered to a learner with an
 * address underneath: an article about CRICKET, and the book LIES MY TEACHER
 * TOLD ME.
 *
 * A citation printed under a paragraph is a claim that the paragraph answers
 * the question. Printing one over an unrelated page is the exact failure
 * `lessonResolver` refuses on the lesson side, arriving through a different
 * door. A refusal is a weaker answer and an honest one; a cricket article
 * under a citation is neither.
 *
 * THE RULE, AND WHERE IT COMES FROM
 * ---------------------------------
 * Half of the question's content words must appear in the page — its title and
 * its text together. `HALF` is imported from `doubt.ts` rather than written
 * again here for the same reason `contentTokens` is: two copies of one decision
 * drift, and drift here surfaces as wrong answers wearing citations.
 *
 * WHAT IS DELIBERATELY NOT SHARED, AND WHY
 * ----------------------------------------
 * `doubt.ts` also requires TWO words to match before the fraction counts. That
 * clause is right in its direction and wrong in this one. There, the thing
 * being covered is a NAME an author wrote, and every word of it is subject.
 * Here it is a QUESTION, and a question carries words that are not subject at
 * all: in "what does precision mean", `mean` survives the stopword list ON
 * PURPOSE, because lessons teach "Mean particle speed". Demanding two matches
 * would require a page to contain `precision` AND `mean` — and, measured
 * against the live API, all three articles that query returns (Evaluation
 * measures, Accuracy and precision, Precision and recall) carry only the
 * first. Every "what does X mean" would refuse, which is a worse feature than
 * the bug it was closing.
 *
 * THE ENGINE RUNG ALREADY DECIDED THIS, THE SAME WAY
 * --------------------------------------------------
 * `learning-os/.../session/doubt.py` maps a doubt to a skill with
 * `MATCH_STRENGTH = 0.5` scored as `len(hit) / len(asked)` — the fraction OF
 * THE QUESTION, not of the thing being matched — and its own comment says the
 * first version scored it the other way round and refused everything. So all
 * three rungs now agree on the threshold, and two of the three agree on the
 * direction; this one was simply not asking the question at all.
 *
 * It also carries `MIN_OVERLAP = 2`, the clause dropped here — and it can,
 * because `mean` is in its `_NOISE` list. `contentTokens` cannot drop `mean`,
 * for the reason above. The asymmetry is real, deliberate, and the thing most
 * likely to be "harmonised" into a bug by someone tidying the three of them
 * into one. It should be measured before it is unified, never assumed.
 *
 * THE TITLE IS READ, NOT ONLY THE BODY
 * ------------------------------------
 * What a page is CALLED is the strongest statement it makes about its own
 * subject, and a lead paragraph routinely opens "It is..." rather than
 * repeating the name. Comparing against the body alone would refuse pages
 * titled with the exact thing that was asked about.
 *
 * WHAT THIS STILL DOES NOT CATCH, STATED RATHER THAN IMPLIED
 * ----------------------------------------------------------
 * A long page that happens to mention half the question's words in passing
 * clears this. Nothing here measures whether a page is ABOUT those words or
 * merely SAYS them. That is survivable rather than ignored because the one
 * retrieval source wired today hands over a lead extract of a few sentences,
 * where incidental half-coverage is rare. A general engine returning whole
 * pages needs a stronger test than word presence, and this paragraph is where
 * whoever adds one should start.
 */
export function isAbout(page: RetrievedPage, asked: readonly string[]): boolean {
  /* `hit.title` as well as `title` because `buildAnswer` already falls back to
     it — a page whose title arrives empty is a real case, and the name a page
     is going to be DISPLAYED under is the name it should be judged by. */
  const found = new Set(contentTokens(`${page.title} ${page.hit.title} ${page.readerText}`))

  let matched = 0
  for (const token of asked) if (found.has(token)) matched += 1

  /*
   * THIS LINE IS THE WHOLE RULE. THE TWO GUARDS THAT USED TO SIT ABOVE IT ARE
   * GONE BECAUSE MUTATION TESTING PROVED THEM DEAD.
   *
   * `if (matched === 0) return false` and `if (asked.length === 0) return false`
   * were both written here first. Deleting either, and deleting both, left
   * every test green — so neither could ever fail, and code no test can defend
   * is code the next reader has to reason about for nothing.
   *
   * The comparison already covers both:
   *   nothing matched   -> 0 / n   is 0,   and 0 >= 0.5 is false
   *   nothing was asked -> 0 / 0   is NaN, and NaN >= 0.5 is false
   *
   * The NaN is written down rather than left to be discovered, because it is
   * the one line here somebody could "fix" into a bug. It is also unreachable
   * from the only caller: `resolve` refuses a question with no content words
   * before any page is looked at, pinned by "a question that is ALL filler is
   * refused without searching".
   */
  return matched / asked.length >= HALF
}

/** The same treatment as `readableSource`, for a bare url string. */
function readableAddress(raw: string): string {
  try {
    const url = new URL(raw)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return raw
  }
}

/**
 * Which pages may be shown, and why the others may not.
 *
 * Returns the usable pages AND a count for each reason one was dropped, because
 * the caller has to tell three different facts apart: "nothing was found",
 * "everything found was trying to manipulate this system", and "everything
 * found was about something else". A learner told the wrong one of those
 * changes the wrong thing about how they ask next time — or stops asking.
 */
function usablePages(
  results: readonly RetrievedPage[],
  asked: readonly string[],
): {
  usable: RetrievedPage[]
  droppedUnsafe: number
  droppedOffTopic: number
} {
  let droppedUnsafe = 0
  let droppedOffTopic = 0
  const usable: RetrievedPage[] = []

  for (const page of results) {
    /* Safety is counted FIRST and unconditionally. A page carrying text aimed
       at this software is an event somebody needs to see in a log, and letting
       an aboutness check reclassify it as "off topic" would file an attack
       under housekeeping. */
    if (page.suspicious) {
      droppedUnsafe += 1
      continue
    }
    if (!page.ok) continue
    if (page.readerText.trim().length === 0) continue
    if (!isAbout(page, asked)) {
      droppedOffTopic += 1
      continue
    }
    usable.push(page)
  }

  return { usable, droppedUnsafe, droppedOffTopic }
}

function refuse(reason: string): Resolution {
  return { kind: 'refusal', reason, nearest: [] }
}

/**
 * The two reasons a page was withheld, each written once.
 *
 * Once, because when both happened the learner has to be told both, and a
 * sentence assembled from two copies of this wording is how one of them
 * quietly stops matching the other.
 */
function unsafeClause(n: number): string {
  return (
    `${n} page${n === 1 ? '' : 's'} that could not be trusted — ` +
    `${n === 1 ? 'it contained' : 'they contained'} text aimed at this software ` +
    `rather than at you`
  )
}

function offTopicClause(n: number): string {
  return `${n} page${n === 1 ? '' : 's'} that ${n === 1 ? 'was' : 'were'} not about what you asked`
}

/**
 * How well checked this is, in words a learner can act on.
 *
 * PLAIN, AND NEVER FLATTERING. `single-source` is the one that matters: it is
 * the status a system is most tempted to round up to "verified", and rounding
 * it up is how one website's mistake becomes a fact a learner repeats. The
 * sentence says the number out loud instead.
 */
/**
 * One sentence about the age of the evidence, or nothing at all.
 *
 * NOTHING AT ALL IS A REAL OPTION HERE. A search layer that reported no
 * freshness gets no sentence, rather than a reassuring default. The whole
 * point is that a learner can trust the sentence when it appears.
 */
function fallbackNote(fallback: boolean | undefined): string {
  return fallback
    ? ' The main search was not available, so this came from only Wikipedia.'
    : ''
}

function freshnessNote(freshness: Freshness | undefined): string {
  if (!freshness) return ''
  /* The not-live sentence deliberately does NOT contain the words "just now".
     Its first draft read "saved earlier, not just now", and a test caught it:
     a learner skimming sees the phrase and takes the opposite meaning. A
     negation is the weakest way to say something a reader might skim. */
  return freshness.live ? ' Read just now.' : ' Read earlier and saved earlier.'
}

const STATUS_NOTE: Record<'supported' | 'single-source' | 'conflicting', string> = {
  supported:
    'Two different websites say this, so it has been checked against more than one source.',
  'single-source':
    'Only one website said this. Nothing else was found to check it against, so treat it carefully.',
  conflicting:
    'Websites disagree about this. Both answers are shown, because picking one for you would hide that.',
}

/** The addresses that earned the verdict, listed so a learner can go and look. */
function sourceList(ids: readonly string[]): string {
  return ids.join('\n')
}

/**
 * The checked answer: one span, copied, with the verdict beside it.
 *
 * THE BODY OF `web-answer` IS `evidence.text` AND NOTHING ELSE. Not trimmed,
 * not suffixed with an address, not joined to a second sentence. The address
 * goes in the TITLE, where it cannot corrupt the quotation, and
 * `displayedAnswer === selectedEvidence.text` is asserted in the tests rather
 * than intended here. The moment that has to be loosened, something in this
 * path has started writing.
 */
function buildCheckedAnswer(
  doubt: Doubt,
  check: ClaimCheck,
  evidence: SelectedEvidence,
  freshness: Freshness | undefined,
  fallback: boolean | undefined,
): Lesson | null {
  const status = check.status === 'conflicting' ? 'conflicting' : check.status
  const blocks: Record<string, unknown>[] = [
    {
      id: 'web-note',
      kind: 'callout',
      body:
        `This is not from this lesson. It is quoted from a page found on the web. ` +
        `${STATUS_NOTE[status as 'supported' | 'single-source']}${freshnessNote(freshness)}` +
        `${fallbackNote(fallback)}`,
      emphasis: 'aside',
      tone: check.status === 'supported' ? 'insight' : 'warning',
    },
    {
      id: 'web-answer',
      kind: 'prose',
      title: clamp(readableAddress(evidence.sourceUrl), MAX_TITLE),
      body: evidence.text,
      emphasis: 'primary',
      tone: 'neutral',
    },
  ]

  const ids = [...check.supportingEvidenceIds]
  if (ids.length > 0) {
    blocks.push({
      id: 'web-sources',
      kind: 'prose',
      title: 'Where this came from',
      body: sourceList(ids.map(readableAddress)),
      emphasis: 'supporting',
      tone: 'neutral',
    })
  }

  const result = validateLesson({
    id: clamp('doubt-web', MAX_ID),
    question: clamp(doubt.text.trim(), 200),
    blocks,
    relations: [],
  })
  return result.ok ? result.lesson : null
}

/**
 * Both sides of a disagreement, quoted, with neither called the answer.
 *
 * NO `web-answer` BLOCK EXISTS ON THIS PATH, and that absence is the point. A
 * contested figure has no single answer to display, and rendering one anyway
 * would be choosing for the learner while looking like a fact.
 */
function buildConflictAnswer(
  doubt: Doubt,
  check: ClaimCheck,
  pages: readonly RetrievedPage[],
  freshness: Freshness | undefined,
  fallback: boolean | undefined,
): Lesson | null {
  const named = new Set(check.conflictingEvidenceIds)
  const sides = pages.filter((p) => named.has(p.finalUrl) || named.has(p.hit.url))
  const shown = sides.length > 0 ? sides : pages

  const blocks: Record<string, unknown>[] = [
    {
      id: 'web-note',
      kind: 'callout',
      body:
        `This is not from this lesson. ${STATUS_NOTE.conflicting}` +
        `${freshnessNote(freshness)}${fallbackNote(fallback)}`,
      emphasis: 'aside',
      tone: 'warning',
    },
  ]

  shown.slice(0, MAX_SOURCES).forEach((page, index) => {
    blocks.push({
      id: `web-conflict-${index}`,
      kind: 'prose',
      title: clamp(readableSource(page), MAX_TITLE),
      body: clamp(page.readerText.trim(), MAX_EVIDENCE_CHARS),
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

export function webResolver(
  deps: WebResolverDeps & {
    /**
     * Whether anything that can JUDGE has seen this question first.
     *
     * WHY THIS IS NOT THE WORD-OVERLAP GATE COMING BACK. That gate asked "does
     * this question share vocabulary with the lesson" -- a rule about the
     * TOPIC, applied by software that cannot judge topics, and it refused fair
     * questions like "how do i bake a cake" inside a chemistry lesson on heat.
     *
     * This asks something structural instead: has a rung that can judge already
     * had this question and declined it? If the model was unreachable, nothing
     * has judged anything, and fetching a stranger's page is then the FIRST
     * thing a learner gets rather than the last. That is how a physics lesson
     * answered a baking question with an article on Malaysian fridge cake.
     *
     * No topic is examined here. Absent, it defaults to allowing the search, so
     * a caller that has no model in the chain behaves exactly as before.
     */
    judgementRan?: () => boolean
  },
): AsyncDoubtResolver {
  return {
    name: 'web',

    async resolve(doubt: Doubt, lesson: Lesson, signal?: AbortSignal): Promise<Resolution> {
      if (signal?.aborted) {
        return refuse('The search was stopped before it started.')
      }

      if (deps.judgementRan !== undefined && !deps.judgementRan()) {
        return refuse(
          `I could not reach the part of me that answers questions beyond this ` +
          `lesson, so I am not going to go looking things up on my own. Ask me ` +
          `again in a moment.`,
        )
      }

      /* THE TOPIC GATE THAT USED TO BE HERE IS GONE, AND ITS REMOVAL IS THE POINT.
       *
       * For one afternoon this rung refused any question with no word in
       * common with the lesson. It did stop a physics lesson answering "how do
       * i bake a chocolate cake?" with a Wikipedia article on Malaysian fridge
       * cake, which was real. But it was software deciding a thing only
       * judgement can decide, and the same rule refuses "how do i bake a cake"
       * inside a chemistry lesson about heat, where the question is a good one.
       *
       * The judgement moved to the model rung, which now runs BEFORE this one
       * and answers -- or declines in its own words -- first. The chain stops
       * at the first answer, so a fetched page can no longer be the first
       * thing a learner sees. The protection is the ORDER, not a word count.
       *
       * `lesson` stays named rather than `_lesson` because it is used below.
       */

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

      const { usable, droppedUnsafe, droppedOffTopic } = usablePages(outcome.results, terms)

      if (usable.length === 0) {
        /* Three outcomes that look identical from outside and mean opposite
           things inside. Named separately, and never collapsed:

             the search is down          -> wait, retry, tell somebody
             the web has nothing on this -> the question may be unanswerable
             what came back was elsewhere-> name the thing more exactly

           The middle one is the flattering lie. Reporting a page that was
           about cricket as "nothing was found" hides both a bad search and,
           when the dropped page was hostile, an attack. */
        if (droppedUnsafe > 0 && droppedOffTopic > 0) {
          return refuse(
            `I found ${unsafeClause(droppedUnsafe)}, and ${offTopicClause(droppedOffTopic)}. ` +
              `I did not show you either kind.`,
          )
        }
        if (droppedUnsafe > 0) {
          return refuse(
            `I found ${unsafeClause(droppedUnsafe)}, so I did not show ` +
              `${droppedUnsafe === 1 ? 'it' : 'them'}.`,
          )
        }
        if (droppedOffTopic > 0) {
          return refuse(
            `I searched the web for that and found ${offTopicClause(droppedOffTopic)}. ` +
              `Try naming the thing you mean — one or two words is enough.`,
          )
        }
        return refuse('I searched the web for that and found nothing usable.')
      }

      /*
       * THE VERDICT, WHEN THE SEARCH LAYER SUPPLIED ONE.
       *
       * Relevance asked whether a page was ABOUT the question. It could not ask
       * whether the page was RIGHT, and a search engine returns its best guess
       * first whether or not it has one — so position is not proof either. This
       * is where "several pages agree" is separated from "one page said so",
       * and where neither is separated from "nothing could be compared".
       *
       * `unknown` REFUSES. Insufficient evidence fails closed: the honest
       * output is that nothing could be checked, not a page shown as though it
       * had been.
       */
      const check = outcome.check
      if (check) {
        if (check.status === 'unknown') {
          return refuse(
            'I found pages about that, but I could not check them against each other, ' +
              'so I am not going to show you something I cannot stand behind.',
          )
        }

        if (check.status === 'conflicting') {
          const both = buildConflictAnswer(doubt, check, usable, outcome.freshness, outcome.fallback)
          if (!both) return refuse('I found sources that disagree but could not render them safely.')
          return { kind: 'answer', lesson: both, drawnFrom: [] }
        }

        if (!outcome.evidence) {
          /* A verdict with nothing selected to quote. Inventing a sentence here
             is exactly what this whole path exists to prevent, so it refuses. */
          return refuse('I checked what came back but could not find a line worth quoting.')
        }

        const verified = buildCheckedAnswer(
          doubt,
          check,
          outcome.evidence,
          outcome.freshness,
          outcome.fallback,
        )
        if (!verified) return refuse('I found sources for that but could not render them safely.')
        return { kind: 'answer', lesson: verified, drawnFrom: [] }
      }

      const answerLesson = buildAnswer(doubt, usable.slice(0, MAX_SOURCES))
      if (!answerLesson) {
        return refuse('I found sources for that but could not render them safely.')
      }

      /* Empty on purpose: this answer drew on nothing in the lesson the learner
         is looking at, and claiming otherwise would point them at a block that
         has nothing to do with it. */
      return { kind: 'answer', lesson: answerLesson, drawnFrom: [] }
    },
  }
}
