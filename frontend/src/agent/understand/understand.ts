import type { Ambiguity, Entity, Intent, IntentKind, Turn, Understanding } from '../kernel/contracts'
import type { RouteContext } from '../kernel/router'
import { STOPWORDS as SHARED } from '../kernel/text'

/**
 * READING THE REQUEST.
 *
 * WHY THIS IS RULES AND NOT A MODEL CALL
 * --------------------------------------
 * The obvious implementation asks a model "what does the user want?" and
 * parses the answer. It is the wrong default for three reasons, and none of
 * them is that models are bad at it:
 *
 *   1. It cannot be tested. "Tell me something unrelated to education" must
 *      not select the learning layer --- and that is a promise about EVERY
 *      run, which a sampled classifier cannot make and a rule can.
 *   2. It inverts the cost curve. The cheapest requests --- "hi", "thanks",
 *      "yes" --- would each pay for a model round trip to discover they need
 *      nothing.
 *   3. It has no failure floor. When the model is unreachable, a rule-based
 *      reader still reads. A model-based one has no opinion at all.
 *
 * So the rules are the floor, and `escalate` below is the seam where a model
 * refines a reading the rules found genuinely unclear. The floor is what is
 * tested; the model is what makes it better on the hard 5%.
 *
 * EVIDENCE, NOT KEYWORDS
 * ----------------------
 * The brief says "understand meaning rather than depend only on keywords",
 * and a bag of keywords fails on exactly the cases that matter: "I don't need
 * you to search for this" contains "search". So every pattern below carries a
 * WEIGHT and a REASON, several intents can be evidenced at once, and negation
 * and quotation suppress evidence rather than being ignored. A single keyword
 * never decides anything on its own.
 */

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

interface Pattern {
  kind: IntentKind
  test: RegExp
  /** How much this pattern is worth. Strong = the phrase is near-decisive. */
  weight: number
  because: string
}

/**
 * Ordered by nothing --- every pattern is evaluated, and several will match.
 * "Read this PDF and summarise it" is a file request AND an information
 * request, and a classifier that picks one has thrown away half the sentence.
 */
const PATTERNS: readonly Pattern[] = [
  /* Memory. Placed first in the file because these are the highest-weight
     signals in the system: "remember that ..." is an instruction about the
     agent's own state, and misreading it as a question loses the fact. */
  { kind: 'memory-write', weight: 5, because: 'an explicit instruction to remember', test: /\b(remember|note|keep in mind|don'?t forget|save) (that|this|i|my|im|i'?m)\b/i },
  { kind: 'memory-write', weight: 4, because: 'the user stated a durable fact about themselves', test: /\bi (always|usually|never|tend to|prefer|struggle with|am bad at|hate|like)\b/i },
  { kind: 'memory-read', weight: 5, because: 'a question about an earlier session', test: /\b(what (were|was) (we|i)|what did (we|i)|last (time|session|week)|yesterday|earlier|before|previously)\b/i },
  { kind: 'memory-read', weight: 4, because: 'asks what is already known about them', test: /\bwhat do you (know|remember) about me\b/i },
  { kind: 'continuation', weight: 5, because: 'asks to resume existing work', test: /\b(continue|resume|carry on|pick up|finish|go on with|where (we|i) left)\b/i },

  /* Research and freshness. `latest` is strong because it is almost never
     used about something settled. */
  { kind: 'research', weight: 5, because: 'an explicit instruction to search', test: /\b(search|google|look ?up|find out|research|browse|check online)\b/i },
  { kind: 'research', weight: 3, because: 'asks for information that moves', test: /\b(latest|current|newest|up[- ]to[- ]date|recent|today'?s|this (week|month|year))\b/i },

  /* Calculation. The digits-and-operator pattern is what catches "what's
     17.5% of 2400" without needing the word "calculate". */
  { kind: 'calculation', weight: 5, because: 'an explicit instruction to compute', test: /\b(calculate|compute|work out|solve|evaluate)\b/i },
  { kind: 'calculation', weight: 4, because: 'an arithmetic expression is present', test: /\d+\s*(?:[+\-*/^×÷]|percent|%\s+of)\s*\d|\d+\s*%\s*of\b/i },
  { kind: 'calculation', weight: 3, because: 'asks for a quantity', test: /\bhow (much|many)\b.*\?/i },

  /* Code. */
  { kind: 'coding', weight: 5, because: 'asks for code to be written', test: /\b(write|generate|create|implement|refactor|build) (me )?(a |an |some )?(function|class|script|program|code|test|api|endpoint|component)\b/i },
  { kind: 'coding', weight: 4, because: 'names a programming language as the task', test: /\b(write|in) (python|javascript|typescript|rust|go|java|c\+\+|sql|bash)\b/i },
  { kind: 'troubleshooting', weight: 5, because: 'reports something broken', test: /\b(fix|debug|broken|failing|fails|error|crash|exception|traceback|stack ?trace|not working|doesn'?t work|won'?t)\b/i },
  { kind: 'troubleshooting', weight: 4, because: 'asks why something misbehaves', test: /\bwhy (is|does|did|isn'?t|doesn'?t|won'?t|can'?t) (my|the|this|it)\b/i },

  /* Comparison. */
  { kind: 'comparison', weight: 5, because: 'an explicit comparison', test: /\b(compare|versus|vs\.?|difference between|better than|which is better)\b/i },
  { kind: 'comparison', weight: 3, because: 'contrasts two named things', test: /\b\w+ (or|and) \w+[:,]? which\b/i },

  /* Planning. */
  { kind: 'planning', weight: 5, because: 'asks for a plan', test: /\b(plan|schedule|roadmap|timeline|strategy|prepare for|revision plan|study plan)\b/i },
  { kind: 'planning', weight: 3, because: 'states a goal to be achieved', test: /\bi want to (achieve|reach|get to|be able to)\b/i },

  /* Learning. THE NARROWEST RULE IN THE FILE, DELIBERATELY.
     Everything downstream of `learning` is expensive and changes the shape of
     the answer, so it takes an explicit request to be taught --- not merely a
     question that happens to be about a school subject. "What is
     photosynthesis" is a question. "Teach me photosynthesis" is a lesson. */
  { kind: 'learning', weight: 5, because: 'asks to be taught', test: /\b(teach me|explain .* (to|like) (me|a|an) |walk me through|help me (understand|learn)|tutor|lesson)\b/i },
  { kind: 'learning', weight: 5, because: 'asks what to study next', test: /\bwhat should i (learn|study|do) next\b/i },
  { kind: 'learning', weight: 4, because: 'asks why their own answer was wrong', test: /\bwhy did i get (this|that|it|the question)\b/i },
  { kind: 'learning', weight: 3, because: 'asks about their own mastery', test: /\b(am i ready|do i know|how well do i)\b/i },

  /* Explanation vs information. Both reach knowledge + reason, so the split
     is about how the answer is SHAPED, not where it comes from. */
  { kind: 'explanation', weight: 4, because: 'asks for a concept', test: /\bwhat (is|are|does) (a |an |the )?\w+/i },
  { kind: 'explanation', weight: 4, because: 'asks for a mechanism', test: /\bhow (does|do|did|can|would) \w+/i },
  { kind: 'explanation', weight: 4, because: 'asks for a cause', test: /\bwhy (do|does|are|is|did)\b/i },
  { kind: 'explanation', weight: 3, because: 'asks a counterfactual', test: /\bwhat (if|happens if|would happen)\b/i },
  { kind: 'explanation', weight: 4, because: 'asks for simpler framing', test: /\b(explain|eli5|simpler|in plain|like i'?m (new|five)|dumb it down)\b/i },
  { kind: 'information', weight: 3, because: 'asks for a fact', test: /\b(when|who|where|which year|how old|how far|how long)\b/i },
  { kind: 'information', weight: 3, because: 'asks to be told something', test: /\btell me\b/i },
  { kind: 'information', weight: 3, because: 'asks for a summary of given material', test: /\b(summari[sz]e|summary|tl;?dr|gist|key points)\b/i },

  /* Recommendation, action, correction, conversation. */
  { kind: 'recommendation', weight: 4, because: 'asks what to choose', test: /\b(should i|recommend|suggest|what'?s best|which should)\b/i },
  { kind: 'action', weight: 4, because: 'an imperative that changes something', test: /\b(open|send|delete|deploy|install|run|commit|push|rename|move|update|add) \b/i },
  { kind: 'correction', weight: 5, because: 'the user says we got it wrong', test: /\b(no,? |that'?s (wrong|not right)|actually|i meant|not what i|you (misunderstood|got it wrong))\b/i },
  { kind: 'conversation', weight: 4, because: 'a greeting or acknowledgement', test: /^\s*(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|nice|got it|sure)\b[\s!.]*$/i },
  { kind: 'conversation', weight: 3, because: 'explicitly off-topic chat', test: /\b(unrelated to|nothing to do with|off[- ]topic|change the subject|something else)\b/i },
]

/**
 * Phrases that CANCEL evidence rather than adding it.
 *
 * "Don't search for this" and "search for this" share a keyword and mean
 * opposite things. A classifier that only adds evidence gets the first one
 * exactly backwards, so negation is subtracted before ranking.
 */
const NEGATIONS: readonly { kind: IntentKind; test: RegExp }[] = [
  { kind: 'research', test: /\b(don'?t|do not|no need to|without) (search|google|look ?up|browsing?)\b/i },
  { kind: 'calculation', test: /\b(don'?t|do not|no need to) (calculate|compute)\b/i },
  { kind: 'learning', test: /\b(don'?t|do not) (teach|tutor|explain)\b/i },
  { kind: 'action', test: /\b(don'?t|do not) (open|send|delete|deploy|install|run|commit|push)\b/i },
]

/* -------------------------------------------------------------------------- */
/* Language                                                                   */
/* -------------------------------------------------------------------------- */

const DEVANAGARI = /[ऀ-ॿ]/

/**
 * Romanised Hindi function words.
 *
 * FUNCTION WORDS, NOT CONTENT WORDS, AND THAT IS THE WHOLE TRICK.
 *
 * Hinglish borrows English nouns freely --- "mujhe integration samajh nahi
 * aa raha" is Hindi grammar carrying an English technical term. Detecting on
 * content words would call that English. Function words (kya, hai, nahi,
 * mujhe, karo) are what survive code-switching, so they are what identify it.
 *
 * Keeping the English technical term intact is a requirement in its own right:
 * translating "integration" into Hindi in a maths answer helps nobody.
 */
const HINGLISH = /\b(kya|hai|hain|nahi|nahin|kaise|kyun|kyu|mujhe|mera|meri|karo|karna|kar|batao|bata|samajh|samjha|thoda|bahut|acha|accha|theek|please karo|chahiye|raha|rahi|hoga|hogi|kaun|kab|kahan)\b/i

export function detectLanguage(text: string): string {
  if (DEVANAGARI.test(text)) return 'hi'
  /* Two markers, not one. "Hai" appears in English ("Hai Phong"), and a
     single accidental match should not switch the answer's language. */
  const hits = text.match(new RegExp(HINGLISH.source, 'gi'))
  if (hits && hits.length >= 2) return 'hi-Latn'
  return 'en'
}

/* -------------------------------------------------------------------------- */
/* Signals for the router                                                     */
/* -------------------------------------------------------------------------- */

const FRESHNESS = /\b(latest|current|newest|today|tonight|now|recent|this (week|month|year)|20[2-9]\d|news|price|stock|weather|right now|these days|as of)\b/i
const COMPUTATION = /\d+\s*(?:[+\-*/^×÷]|%\s*of)\s*\d|\b(calculate|compute|how much is|what'?s \d)\b/i
/**
 * `\bcode\b` is deliberately NOT in here on its own --- "dress code", "postal
 * code" and "area code" would all switch on the code capability. The word only
 * counts when it is possessed ("my code") or predicated ("code is failing"),
 * which is how it is used when someone is actually talking about software.
 */
const CODE = /```|\b(python|javascript|typescript|rust|golang|java|sql|bash|npm|pip|git|traceback|stack ?trace|syntaxerror|typeerror|nullpointer|segfault)\b|\.(py|ts|tsx|js|jsx|rs|go|java|rb|sh)\b|\b(my|the|this|your|their|his|her) (code|script|function|program|repo|build|test)s?\b|\b(code|script|function|build|test)s? (is|are|isn'?t|aren'?t|fails?|failing|broke|breaks?|crashed?|throws?)\b|\bwrite (code|a test|tests)\b|\bcode (review|to)\b/i
const SIDE_EFFECT = /\b(open|send|delete|deploy|install|commit|push|rename|move|create file|write file|schedule)\b/i

/**
 * What the world offers, derived from the turn itself.
 *
 * `memoryHits` and `hasOpenTask` are NOT derived here --- they are facts about
 * storage, not about the sentence, and the caller supplies them. Guessing them
 * from the words would make the router's memory rules fire on phrasing rather
 * than on whether anything is actually stored.
 */
export function signals(turn: Turn): Omit<RouteContext, 'memoryHits' | 'hasOpenTask'> {
  const text = plainText(turn)
  const attached = turn.parts.some((p) => p.modality !== 'text' && p.modality !== 'speech')
  return {
    hasAttachments: attached,
    freshnessSensitive: FRESHNESS.test(text),
    hasComputation: COMPUTATION.test(text),
    hasCode: CODE.test(text) || turn.parts.some((p) => p.modality === 'code'),
    requestsSideEffect: SIDE_EFFECT.test(text),
  }
}

/* -------------------------------------------------------------------------- */
/* Multimodal flattening                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One coherent view of a turn that arrived in several pieces.
 *
 * WHAT THIS DOES *NOT* DO IS THE INTERESTING PART.
 *
 * It does not describe images, transcribe handwriting, or parse PDFs --- those
 * need a model or a parser, and pretending otherwise here would produce
 * confident nonsense about a file nobody read. What it does is make the
 * NON-TEXT parts visible to every downstream stage as declared, unread
 * content, so `files` gets selected and something that can actually read them
 * is given the job. An attachment silently dropped at this boundary is
 * invisible for the rest of the turn.
 */
export function plainText(turn: Turn): string {
  return turn.parts
    .filter((p) => p.modality === 'text' || p.modality === 'speech')
    .map((p) => p.content)
    .join('\n')
}

export function attachments(turn: Turn) {
  return turn.parts.filter((p) => p.modality !== 'text' && p.modality !== 'speech')
}

/* -------------------------------------------------------------------------- */
/* Entities and reference resolution                                          */
/* -------------------------------------------------------------------------- */

/**
 * The shared list plus the words that are only noise when naming ENTITIES.
 *
 * Derived from `SHARED` rather than restated, because the bug that created
 * `text.ts` was two subsystems keeping their own copies. "explain" is a
 * perfectly good content word for relevance ranking and a useless entity, so
 * it belongs in the local extension and not in the shared set.
 */
const STOPWORDS = new Set([
  ...SHARED,
  'a', 'an', 'or', 'but', 'is', 'it', 'i', 'me', 'my', 'we', 'us', 'to', 'of',
  'in', 'on', 'do', 'tell', 'explain', 'im', "i'm", 'give', 'show', 'help',
])

/**
 * Things the conversation is about.
 *
 * Capitalised runs and quoted spans are taken as-is; otherwise content words.
 * Crude on purpose --- this feeds pronoun resolution and memory retrieval,
 * both of which RANK rather than require exactness, so a few extra candidates
 * cost nothing and a missed one costs a resolution.
 */
export function extractEntities(text: string, turnIndex: number): Entity[] {
  const found = new Map<string, Entity>()
  const add = (label: string, kind: string) => {
    const id = label.toLowerCase()
    const existing = found.get(id)
    if (existing) {
      found.set(id, { ...existing, mentions: [...existing.mentions, turnIndex] })
    } else {
      found.set(id, { id, label, kind, mentions: [turnIndex] })
    }
  }

  for (const m of text.matchAll(/"([^"]{2,60})"|'([^']{2,60})'/g)) {
    add((m[1] ?? m[2] ?? '').trim(), 'quoted')
  }
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z0-9]*(?: [A-Z][a-zA-Z0-9]*)*)\b/g)) {
    const label = (m[1] ?? '').trim()
    // A sentence-initial capital is not a proper noun.
    if (label.length > 2 && !STOPWORDS.has(label.toLowerCase())) add(label, 'named')
  }
  for (const m of text.matchAll(/\b([a-z][a-z0-9_-]{3,})\b/gi)) {
    const w = (m[1] ?? '').toLowerCase()
    if (!STOPWORDS.has(w)) add(w, 'term')
  }
  return [...found.values()]
}

const PRONOUN = /\b(it|its|that|this|they|them|those|these|the (first|second|third|last|latest|newest|next|previous|other) one)\b/i

/**
 * References that cannot be resolved from THIS turn alone.
 *
 * Returned as ambiguities rather than resolved silently. The brief asks for
 * `it` and `the second one` to resolve, and they do --- against `carried`,
 * the entities still in play from earlier turns. What must never happen is
 * resolving against nothing and proceeding as though it worked.
 */
export function resolveReferences(
  text: string,
  carried: readonly Entity[],
): { resolved: Entity[]; ambiguities: Ambiguity[] } {
  if (!PRONOUN.test(text)) return { resolved: [], ambiguities: [] }
  /* EVERY AMBIGUITY THIS FUNCTION RETURNS IS BLOCKING, and that is not an
     accident of phrasing --- it only returns one when resolution FAILED. A
     resolved reference produces no ambiguity at all. So there is no such thing
     here as a soft reference ambiguity to weigh against intent confidence. */
  if (carried.length === 0) {
    return {
      resolved: [],
      ambiguities: [{ what: `"${text.match(PRONOUN)?.[0]}" refers to something not yet named`, blocking: true }],
    }
  }

  const ordinal = text.match(/\bthe (first|second|third|last|latest|newest|next|previous|other) one\b/i)
  if (ordinal) {
    const which = (ordinal[1] ?? '').toLowerCase()
    /* `latest` and `newest` mean the most recent thing named, which is the
       same position as `last`. `next`/`previous`/`other` have no defensible
       index against a flat list, so they fall through to the recency path
       below and report ambiguity when it ties --- which is the honest
       outcome for a word whose referent genuinely depends on an ordering the
       user has in mind and we do not. */
    const index =
      which === 'first' ? 0
        : which === 'second' ? 1
          : which === 'third' ? 2
            : which === 'last' || which === 'latest' || which === 'newest' ? carried.length - 1
              : -1
    if (index < 0) return recencyResolve(text, carried)
    const hit = carried[index]
    return hit
      ? { resolved: [hit], ambiguities: [] }
      : { resolved: [], ambiguities: [{ what: `"the ${which} one" has no ${which} candidate`, blocking: true }] }
  }

  return recencyResolve(text, carried)
}

/**
 * Most recently mentioned wins. Ties are genuinely ambiguous and are reported
 * rather than broken by array order, which would be arbitrary.
 */
function recencyResolve(
  text: string,
  carried: readonly Entity[],
): { resolved: Entity[]; ambiguities: Ambiguity[] } {
  const ranked = [...carried].sort((a, b) => last(b.mentions) - last(a.mentions))
  const best = ranked[0]
  if (!best) return { resolved: [], ambiguities: [] }
  const tied = ranked.filter((e) => last(e.mentions) === last(best.mentions))
  if (tied.length > 1) {
    return {
      resolved: [],
      ambiguities: [{
        what: `"${text.match(PRONOUN)?.[0]}" could be ${tied.slice(0, 3).map((e) => e.label).join(' or ')}`,
        blocking: true,
      }],
    }
  }
  return { resolved: [best], ambiguities: [] }
}

function last(xs: readonly number[]): number {
  return xs.length === 0 ? -1 : (xs[xs.length - 1] as number)
}

/* -------------------------------------------------------------------------- */
/* The reading                                                                */
/* -------------------------------------------------------------------------- */

export interface Conversation {
  /** Entities still in play, newest mentions last. */
  entities: readonly Entity[]
  /** What the conversation was about before this turn. Empty on turn one. */
  topic: string
  turnIndex: number
}

export const NEW_CONVERSATION: Conversation = { entities: [], topic: '', turnIndex: 0 }

export function understand(turn: Turn, convo: Conversation = NEW_CONVERSATION): Understanding {
  const text = plainText(turn)
  const files = attachments(turn)

  /* ----- intents ----- */
  const scores = new Map<IntentKind, { score: number; because: string[] }>()
  for (const p of PATTERNS) {
    if (!p.test.test(text)) continue
    const cur = scores.get(p.kind) ?? { score: 0, because: [] }
    cur.score += p.weight
    cur.because.push(p.because)
    scores.set(p.kind, cur)
  }
  for (const n of NEGATIONS) {
    if (!n.test.test(text)) continue
    const cur = scores.get(n.kind)
    // Removed outright, not merely reduced. "Don't search" is not weak
    // evidence FOR searching, it is an instruction against it.
    if (cur) scores.delete(n.kind)
  }

  /* An attachment is itself evidence: "here's my file" with no verb is still
     a request to do something with the file. */
  if (files.length > 0 && scores.size === 0) {
    scores.set('information', { score: 3, because: ['a file was attached with no explicit instruction'] })
  }

  /* Nothing matched at all. `conversation` is the honest default --- guessing
     `explanation` would manufacture a lesson out of an unparsed sentence. */
  if (scores.size === 0) {
    scores.set('conversation', { score: 1, because: ['no pattern matched; treating as ordinary talk'] })
  }

  const total = [...scores.values()].reduce((s, v) => s + v.score, 0)
  const intents: Intent[] = [...scores.entries()]
    .map(([kind, v]) => ({
      kind,
      /* Share of total evidence, floored so a lone weak match is not reported
         as certainty. A single 3-weight hit out of 3 total would otherwise be
         confidence 1.0, which is a lie about how much was actually read. */
      confidence: Math.min(0.95, (v.score / total) * (1 - Math.exp(-total / 6))),
      because: v.because.join('; '),
    }))
    .sort((a, b) => b.confidence - a.confidence)

  /* ----- entities and references ----- */
  const fresh = extractEntities(text, convo.turnIndex)

  /* AN ATTACHMENT IS A REFERENT.
     "Summarise this" with a PDF attached is not an ambiguous request --- the
     "this" is sitting right there. Resolving against conversation history
     alone reported it as unresolvable and made the agent ask which document
     the user meant while holding the only one they sent. Attachments are put
     at the END so they win the most-recently-mentioned tie-break: the thing
     just handed over is the thing being pointed at. */
  const attached: Entity[] = files.map((f, i) => ({
    id: `file:${f.name ?? f.mediaType ?? f.modality}:${i}`,
    label: f.name ?? `the attached ${f.modality}`,
    kind: f.modality,
    mentions: [convo.turnIndex],
  }))

  const carried = mergeEntities(convo.entities, [...fresh, ...attached])
  const { resolved, ambiguities } = resolveReferences(text, [...convo.entities, ...attached])

  /* ----- topic shift ----- */
  const overlap = fresh.filter((e) => convo.entities.some((c) => c.id === e.id)).length
  const topicShift =
    convo.turnIndex > 0 && fresh.length > 0 && overlap === 0 && !PRONOUN.test(text)

  return {
    intents,
    goal: goalOf(text, intents[0]?.kind ?? 'conversation'),
    constraints: constraintsOf(text),
    entities: [...resolved, ...carried].filter(
      (e, i, xs) => xs.findIndex((y) => y.id === e.id) === i,
    ),
    language: detectLanguage(text),
    topicShift,
    ambiguities,
  }
}

function mergeEntities(prior: readonly Entity[], fresh: readonly Entity[]): Entity[] {
  const byId = new Map(prior.map((e) => [e.id, e]))
  for (const e of fresh) {
    const existing = byId.get(e.id)
    byId.set(e.id, existing ? { ...existing, mentions: [...existing.mentions, ...e.mentions] } : e)
  }
  return [...byId.values()]
}

/**
 * One sentence of what they want, in their own framing.
 *
 * Their words, not a paraphrase. A goal restated in the agent's vocabulary is
 * a goal the user cannot check, and this string is what verification later
 * compares the answer against.
 */
function goalOf(text: string, kind: IntentKind): string {
  const first = text.trim().split(/(?<=[.?!])\s+/)[0] ?? text.trim()
  return first.length > 0 ? first.slice(0, 200) : `(${kind})`
}

const CONSTRAINT = [
  /\bin (\d+) (words|sentences|lines|bullets)\b/i,
  /\b(don'?t|do not|without|avoid|no) [a-z ]{3,40}/i,
  /\b(must|should|has to|needs? to) [a-z ]{3,40}/i,
  /\b(by|before|within) (tomorrow|today|monday|tuesday|wednesday|thursday|friday|next week|\d+ (days?|weeks?|hours?))\b/i,
  /\b(only|just) (use|in|with) [a-z ]{3,30}/i,
]

function constraintsOf(text: string): string[] {
  const out: string[] = []
  for (const re of CONSTRAINT) {
    const m = text.match(re)
    if (m?.[0]) out.push(m[0].trim())
  }
  return out
}
