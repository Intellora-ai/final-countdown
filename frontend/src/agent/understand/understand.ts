import type { Ambiguity, Entity, Intent, IntentKind, Turn, Understanding } from '../kernel/contracts'
import type { RouteContext } from '../kernel/router'
import { mergeEntities } from '../kernel/entities'
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
  /* The plain request forms. Their absence was a real hole rather than a
     stylistic gap: "give me short answers about inflation" matched nothing at
     all, fell to the `conversation` default at 0.15 confidence, and the
     uncertainty layer correctly refused to answer a request it could not
     read. The refusal was right; not being able to read it was not. */
  { kind: 'information', weight: 3, because: 'a plain request for something', test: /\b(give me|show me|list|what are|i (?:want|need) (?:to know|a|an|the))\b/i },
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
  /* NAVIGATION VERBS ARE NOT SUBJECTS, and admitting them broke continuation.
     Measured, on a conversation already about quadratics:

         "continue"    -> entities [quadratics, continue]  topicShift = true
         "keep going"  -> entities [quadratics, keep, going]  topicShift = true
         "next"        -> entities [quadratics, next]  topicShift = true
         "go on"       -> entities [quadratics]  topicShift = false

     `topicShift` was reading what it was given: a fresh entity, no overlap
     with the carried topic, no pronoun. The defect is upstream --- the word
     whose whole meaning is "do not change the subject" was being offered as a
     new subject. `go on` escaped only because both its words are shorter than
     the term pattern's four-character floor, which is luck, not a rule.

     They are here rather than in `text.ts` for the reason the header already
     gives about `explain`: these are useful content words for relevance
     ranking and useless as entities, so they belong to the extractor and not
     to the shared set. */
  'continue', 'continues', 'continuing', 'carry', 'keep', 'keeps', 'going',
  'next', 'proceed', 'onwards', 'onward', 'ahead', 'further', 'resume',
  'along', 'finish', 'finished', 'move', 'press',
  /* `right` and `alright` came from the GENERATOR, not from anyone's
     imagination --- see `continuation.enumerated.test.ts`. Crossing the
     navigation verbs with openers and closers produced 238 leaking phrasings on
     its first run, of which these two were the whole cause. Neither would have
     occurred to me; "alright continue" is not a phrase you sit down and think
     of, it is a phrase people say. */
  'right', 'alright',
  /* INSTRUCTION VERBS, for the reason `explain` is already here and the
     inconsistency that revealed the rest of the family:

         "explain exponents"    -> [exponents]              `explain` listed
         "define a polynomial"  -> [define, polynomial]     `define` was not
         "describe a radical"   -> [describe, radical]       nor was `describe`

     The consequence is not cosmetic. `topicShift` requires ZERO overlap with
     the carried entities, so two consecutive "define X" turns share the entity
     `define`, the overlap is one, and the second question does not register as
     a change of subject at all. It was found by a nested-detour test that
     pushed eight interruptions and got seven --- the eighth reused a word from
     the fourth. */
  'define', 'defines', 'describe', 'describes', 'clarify', 'elaborate',
  'summarise', 'summarize', 'compare', 'list', 'outline', 'derive', 'prove',
])

/*
 * IS "WAS A SUBJECT NAMED" A PROPERTY, OR ONLY A MEMBERSHIP TEST?
 *
 * Short answer: not with this function's current shape, and the reason is not
 * that the list is incomplete. It is that ONE FUNCTION IS DOING TWO JOBS AND IS
 * WRONG IN BOTH DIRECTIONS AT ONCE.
 *
 * Written down because a list somebody chose deliberately is a different
 * artifact from a list somebody accumulated, and from the outside they are
 * indistinguishable.
 *
 * THE TWO FAILURE DIRECTIONS, BOTH MEASURED.
 *
 * ADMITS WHAT IS NOT AN ENTITY. On a conversation about quadratics, `continue`
 * came back as a `term`, so `topicShift` fired on the word whose entire meaning
 * is "do not change the subject". Crossing navigation verbs with openers and
 * closers produced 238 leaking phrasings and exposed `right`, `alright`, `move`
 * and `press`, none of which anyone had thought of.
 *
 * FAILS TO ADMIT WHAT IS. Compound nouns are split into their parts:
 *
 *     "what is a transformation graph"  ->  ["transformation", "graph"]
 *     "explain the quadratic formula"   ->  ["quadratic", "formula"]
 *     "what is machine learning"        ->  ["machine", "learning"]
 *     "explain natural selection"       ->  ["natural", "selection"]
 *
 * Downstream, `reason` is handed two unrelated nouns, finds no relation between
 * them, and reports itself selected-but-unmet on the most ordinary question
 * shape there is. `reason` is not broken; its input is.
 *
 * AND THE TWO DIRECTIONS COLLIDE ON A SINGLE WORD, which is the thing that
 * settles the question:
 *
 *     "right, continue"           ->  `right` is filler
 *     "what is a right triangle"  ->  `right` is half the name of the subject
 *
 * Adding `right` to this list fixed the first and broke the second: that phrase
 * now yields ["triangle"], and the qualifier that distinguishes a right
 * triangle from any other is gone. NO LIST CAN FIX THAT, because the categories
 * are not disjoint --- the same token is filler in one position and domain
 * vocabulary in another. A better list is not a smaller version of the right
 * answer; it is the wrong shape of answer.
 *
 * SO WHAT IS THE RIGHT SHAPE. Two steps, currently fused into one:
 *
 *   1. A TOKENISER that segments the turn into candidate spans, including
 *      multi-word ones, using position and adjacency rather than a vocabulary.
 *      This is the half that would keep `transformation graph` and `right
 *      triangle` intact, and it is the half that cannot be a word list at all.
 *
 *   2. A DOMAIN-VOCABULARY step that decides which spans are subjects. Here a
 *      list is legitimate --- but as one input among several, and applied to a
 *      span in context rather than to a bare token. `right` before a noun and
 *      `right` before a navigation verb are different spans, and step 1 is what
 *      makes them distinguishable.
 *
 * The concept graph on `Ports.concepts` is the obvious source for step 2 and it
 * is not sufficient alone. A learner names subjects the curriculum has never
 * heard of --- "what is a tensor" during an algebra lesson is a real detour
 * about a real subject --- and under a graph whitelist it names nothing, so no
 * interruption is pushed and there is nothing to come back to. The lesson
 * drifts and NOTHING NOTICES. The graph is positive evidence, never a filter.
 *
 * WHY THE LIST STAYS FOR NOW, AND WHICH WAY IT ERRS. A missing stopword
 * mistakes a continuation for a new subject: a detour is pushed that did not
 * happen, "continue" pops it, and the cost is a spurious log entry. A missing
 * subject is not pushed at all, and the position the student needed to return
 * to was never recorded. The first is noisy and recoverable; the second is
 * silent and is exactly what the teaching ledger exists to prevent. Given an
 * incomplete answer either way, take the one that errs loudly. The `right
 * triangle` regression is the price, it is bounded --- the turn still names
 * `triangle`, so the shift is still detected and only the precision of the
 * entity is lost --- and it is pinned by a test rather than left to be
 * rediscovered.
 *
 * WHAT WOULD EXPOSE THE NEXT FAILURE, in the order I would add the axes:
 *
 *   - compound nouns crossed with the navigation space, which is where the two
 *     directions meet and where a naive fix to either one breaks the other
 *   - contractions and elisions: "let's go on", "k continue"
 *   - Hinglish and Hindi, which `Understanding.language` already claims to
 *     support: "aage badho", "theek hai continue karo". This list is
 *     English-only, so every navigation word in the other two languages this
 *     product targets is missing right now. Largest known hole, and it is a
 *     hole in the list rather than in the mechanism.
 *   - multi-clause turns: "ok that makes sense, carry on"
 *   - typos and voice-transcription artifacts, which is where a real
 *     deployment finds them first.
 */

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

/* `mergeEntities` lived here AND in memory.ts, identically, and both copies
   grew mentions quadratically. It is now in kernel/entities.ts, imported by
   both --- see that file for the measurement. */

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
