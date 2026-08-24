import type {
  CommunicationPlan,
  MemoryRecord,
  Personalization,
  Representation,
  Understanding,
  UserState,
} from '../kernel/contracts'
import { overlap, tokens } from '../kernel/text'

/**
 * HOW TO SAY IT --- Capabilities 17, 18, 19, 26, 27.
 *
 * WHY THIS IS A SEPARATE LAYER AND NOT PART OF THE ANSWER
 * -------------------------------------------------------
 * The brief is explicit that this "should remain conceptually separate from
 * knowledge", and the reason is that the two vary independently. The same fact
 * about inflation is one sentence for someone who asked in passing, a
 * comparison table for someone weighing two countries, and a worked example
 * for someone who just got a percentage question wrong. If communication lives
 * inside the answer generator, that variation has to be re-derived every time
 * and will quietly collapse into one house style --- which is the single
 * most common way an assistant becomes tiring to use.
 *
 * WHAT DECIDES THE SHAPE
 * ----------------------
 * Two inputs, and both are required:
 *
 *   CONCEPT STRUCTURE   Does this content have parallel dimensions? A
 *                       sequence? A causal chain? A quantity over time?
 *                       Structure suggests a representation.
 *
 *   USER NEED           What do they already know, how much do they want,
 *                       are they confused, is this the third time they have
 *                       asked?
 *
 * Structure alone gives you a table nobody wanted. User need alone gives you
 * the right length in the wrong form.
 *
 * WHAT THIS LAYER MAY NEVER DO
 * ----------------------------
 * Choose a colour, a size, a spacing value or a position. It chooses WHICH
 * REPRESENTATION; the design system decides what that looks like and the
 * layout grammar decides where it goes. There is no field below in which a
 * pixel could be expressed, and that is deliberate --- see the Four Laws.
 */

/* -------------------------------------------------------------------------- */
/* Concept structure --- Capability 18                                        */
/* -------------------------------------------------------------------------- */

/**
 * The shape of what is being said, read from the content and the request.
 *
 * Deliberately about STRUCTURE, not about topic. "Is this chemistry?" is the
 * wrong question and leads straight back to a subject-specific template.
 * "Does this have two things being held against each other?" is the right one,
 * and it is equally true of LIFO vs FIFO, of two countries' inflation, and of
 * two sorting algorithms.
 */
export interface Structure {
  /** Two or more things held against each other on shared dimensions. */
  comparative: boolean
  /** Ordered stages where the order carries meaning. */
  sequential: boolean
  /** A causes B. Mechanism matters. */
  causal: boolean
  /** A quantity that varies over something. */
  quantitative: boolean
  /** A relationship expressible in symbols. */
  formal: boolean
  /** A rule with branches. */
  conditional: boolean
  /** Nesting: parts of parts. */
  hierarchical: boolean
  /** Runnable or inspectable code. */
  procedural: boolean
  /** How many distinct things are on the table. */
  cardinality: number
}

const STRUCTURE_MARKERS: readonly { key: keyof Structure; test: RegExp }[] = [
  { key: 'comparative', test: /\b(compare|versus|vs\.?|difference|differ|whereas|on the other hand|both|either|rather than|instead of|better|worse)\b/i },
  { key: 'sequential', test: /\b(first|second|third|then|next|after that|finally|step \d|stage|begins?|followed by|before|process)\b/i },
  { key: 'causal', test: /\b(because|therefore|so that|causes?|leads? to|results? in|due to|hence|as a result|why|drives?)\b/i },
  { key: 'quantitative', test: /\b\d+(\.\d+)?\s*(%|percent|million|billion|crore|lakh|kg|km|years?)\b|\bover time\b|\btrend\b|\bgrew\b|\brose\b|\bfell\b/i },
  { key: 'formal', test: /[=∑∫√±≤≥]|\b(equation|formula|derive|theorem|proof|solve for)\b/i },
  { key: 'conditional', test: /\b(if|unless|when .* then|otherwise|depends on|in case|provided that|either .* or)\b/i },
  { key: 'hierarchical', test: /\b(consists? of|made up of|comprises?|categor|types? of|subclass|parent|child|branch)\b/i },
  { key: 'procedural', test: /```|\b(function|class|def |import |return|npm|pip|install|run the)\b/i },
]

export function readStructure(content: string, u: Understanding): Structure {
  const s: Structure = {
    comparative: false,
    sequential: false,
    causal: false,
    quantitative: false,
    formal: false,
    conditional: false,
    hierarchical: false,
    procedural: false,
    cardinality: 0,
  }
  const text = `${u.goal}\n${content}`
  for (const m of STRUCTURE_MARKERS) {
    if (m.test.test(text)) (s as unknown as Record<string, boolean>)[m.key] = true
  }

  /* Intent is structural evidence in its own right. "Compare X and Y" is
     comparative even when the content has not been written yet, which is
     exactly the moment the representation has to be chosen. */
  const kinds = new Set(u.intents.map((i) => i.kind))
  if (kinds.has('comparison')) s.comparative = true
  if (kinds.has('planning')) s.sequential = true
  if (kinds.has('troubleshooting')) s.causal = true
  if (kinds.has('coding')) s.procedural = true
  if (kinds.has('calculation')) s.quantitative = true

  s.cardinality = countSubjects(u, content)
  return s
}

function countSubjects(u: Understanding, content: string): number {
  const named = u.entities.filter((e) => e.kind === 'named' || e.kind === 'quoted').length
  const listed = (content.match(/^\s*[-*•]\s+/gm) ?? []).length
  return Math.max(named, listed)
}

/* -------------------------------------------------------------------------- */
/* Representation --- Capability 18                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which forms genuinely express this structure, best first.
 *
 * ORDERED BY HOW MUCH OF THE STRUCTURE THE FORM PRESERVES, not by how
 * impressive it looks. A comparison rendered as prose forces the reader to
 * hold both sides in their head and do the alignment themselves; a table does
 * that work for them. That is the entire argument for choosing a table, and it
 * is also why a table is WRONG for a single fact --- there is no alignment to
 * do, and the grid is scaffolding around one number.
 *
 * `prose` is always in the list, always last, and is never removed. Every
 * other form needs enough structure to justify itself; prose is what is left
 * when nothing does, and it is a legitimate answer rather than a fallback.
 */
export function chooseRepresentations(
  s: Structure,
  u: Understanding,
  prefs?: Personalization,
): Representation[] {
  const picks: Representation[] = []
  const add = (r: Representation) => {
    if (!picks.includes(r)) picks.push(r)
  }

  /* A single item has no structure to express however many markers fired. The
     cardinality gate is what stops "what is inflation" becoming a
     one-row comparison table. */
  const plural = s.cardinality >= 2

  if (s.comparative && plural) add('comparison')
  if (s.formal) add('equation')
  if (s.procedural) add('code')
  if (s.quantitative && (s.sequential || /over time|trend|grew|rose|fell|history/i.test(u.goal))) add('chart')
  if (s.sequential && s.causal) add('flow')
  else if (s.sequential) add('sequence')
  if (s.conditional && plural) add('decision-tree')
  if (s.hierarchical && plural) add('tree')
  if (s.comparative && plural && s.cardinality >= 3) add('matrix')
  if (s.quantitative && !s.sequential && plural) add('table')

  /* A worked example earns its place when someone is learning or has got
     something wrong --- it shows the mechanism running, which is what a
     description of the mechanism cannot do. */
  if (u.intents.some((i) => i.kind === 'learning' || i.kind === 'troubleshooting')) add('worked-example')

  /* Stated preference reorders, never overrides. A user who likes tables still
     should not get a table for a single fact --- honouring a preference into
     nonsense is not personalisation. */
  if (prefs) {
    picks.sort((a, b) => rankPref(b, prefs) - rankPref(a, prefs))
  }

  add('prose')
  return picks
}

function rankPref(r: Representation, prefs: Personalization): number {
  const i = prefs.preferredRepresentations.indexOf(r)
  return i === -1 ? 0 : prefs.preferredRepresentations.length - i
}

/* -------------------------------------------------------------------------- */
/* User state --- Capability 27                                               */
/* -------------------------------------------------------------------------- */

const CONFUSION = /\b(confused|don'?t (get|understand)|lost|no idea|what do you mean|makes no sense|still (don'?t|not)|huh)\b/i
const FRUSTRATION = /\b(again|already (said|told)|stop|no+[,!.]|wrong|not what i|you keep|forget it|ugh)\b|[A-Z]{6,}|!{2,}/
const URGENCY = /\b(urgent|asap|quickly|right now|deadline|due (today|tomorrow)|hurry|fast)\b/i

/**
 * Read the interaction conditions.
 *
 * `repeats` is the strongest single signal in this system and it comes from
 * history, not from wording: a user asking substantially the same thing a
 * third time is telling you the previous two answers did not work, whatever
 * politeness the third one is wrapped in.
 */
export function readUserState(text: string, recentGoals: readonly string[]): UserState {
  const repeats = recentGoals.filter((g) => overlap(tokens(g), tokens(text)) > 0.6).length
  return {
    confusion: CONFUSION.test(text) ? 0.8 : repeats > 0 ? 0.5 : 0,
    frustration: FRUSTRATION.test(text) ? 0.7 : repeats >= 2 ? 0.6 : 0,
    urgency: URGENCY.test(text) ? 0.8 : 0,
    repeats,
  }
}

/* -------------------------------------------------------------------------- */
/* Personalization --- Capability 26                                          */
/* -------------------------------------------------------------------------- */

export const DEFAULT_PERSONALIZATION: Personalization = {
  language: 'en',
  technicalLevel: 'intermediate',
  density: 'standard',
  preferredRepresentations: [],
}

/**
 * How to behave for THIS user, derived from memory.
 *
 * Separate from memory itself, exactly as the brief separates them: memory
 * answers "what do I know about them", this answers "how should I act". The
 * same memory --- "I struggle with percentages" --- means different things to
 * each: memory stores a fact, personalization turns it into "define
 * percentage terms before using them".
 */
export function personalize(
  memories: readonly MemoryRecord[],
  language: string,
): Personalization {
  let density: Personalization['density'] = 'standard'
  let technicalLevel: Personalization['technicalLevel'] = 'intermediate'
  const reps: Representation[] = []

  for (const m of memories) {
    const c = m.content.toLowerCase()
    if (/\b(short|brief|concise|less detail|to the point|tl;?dr)\b/.test(c)) density = 'brief'
    if (/\b(detailed|thorough|in depth|more detail|explain fully)\b/.test(c)) density = 'thorough'
    if (/\b(new to|beginner|never (done|used|studied)|no background|struggle)\b/.test(c)) technicalLevel = 'novice'
    if (/\b(expert|experienced|professional|advanced|i already know)\b/.test(c)) technicalLevel = 'expert'
    if (/\btables?\b/.test(c)) reps.push('table')
    if (/\bdiagrams?\b|\bvisual/.test(c)) reps.push('flow')
    if (/\bexamples?\b/.test(c)) reps.push('worked-example')
    if (/\bcode\b/.test(c)) reps.push('code')
  }

  return { language, technicalLevel, density, preferredRepresentations: [...new Set(reps)] }
}

/* -------------------------------------------------------------------------- */
/* Jargon --- what needs defining                                             */
/* -------------------------------------------------------------------------- */

/**
 * Terms this user will need defined.
 *
 * Candidates are terms the ANSWER uses that the REQUEST did not --- a word the
 * user typed is a word they have; a word only we introduced is one we owe them.
 * Then filtered by level, because defining "inflation" for an economist is as
 * annoying as not defining it for a newcomer.
 */
export function needsDefining(
  answer: string,
  u: Understanding,
  level: Personalization['technicalLevel'],
  known: readonly string[] = [],
): string[] {
  if (level === 'expert') return []
  const asked = tokens(u.goal)
  const familiar = new Set(known.flatMap((k) => [...tokens(k)]))

  const candidates = new Set<string>()
  for (const m of answer.matchAll(/\b([a-z]{7,})\b/gi)) {
    const w = (m[1] ?? '').toLowerCase()
    if (asked.has(w) || familiar.has(w)) continue
    candidates.add(w)
  }
  /* Multi-word technical phrases and acronyms are the ones that actually trip
     people, so they are collected separately rather than lost to the
     single-word scan. */
  for (const m of answer.matchAll(/\b([A-Z]{2,6})\b/g)) {
    const a = m[1] ?? ''
    if (!asked.has(a.toLowerCase())) candidates.add(a)
  }

  const limit = level === 'novice' ? 5 : 2
  return [...candidates].slice(0, limit)
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

export interface CommunicationInput {
  understanding: Understanding
  /** Draft or subject matter. May be empty when planning before generating. */
  content: string
  personalization: Personalization
  userState: UserState
  /** Concepts memory says they already hold, so we do not re-teach them. */
  known?: readonly string[]
  /** True when the learning layer is active --- see `learn/`. */
  teaching?: boolean
}

export function planCommunication(input: CommunicationInput): CommunicationPlan {
  const { understanding: u, content, personalization: p, userState: state } = input
  const structure = readStructure(content, u)
  const kinds = new Set(u.intents.map((i) => i.kind))

  /* ----- depth ----- */
  let depth: CommunicationPlan['depth'] = p.density
  const reasons: string[] = []

  /* ORDER MATTERS HERE, AND IT IS NOT ARBITRARY.
     Observed user state outranks the intent read, because the intent read is
     the thing most likely to be wrong. "I'm confused, I don't get it" matches
     no intent pattern and so falls to the `conversation` default --- and an
     earlier ordering let the conversation-is-brief rule fire first, handing a
     confused user a short answer BECAUSE we had failed to parse them. That is
     the worst possible pairing of a signal with a response.

     Urgency is checked before confusion, and the two do not actually collide:
     urgency wins on LENGTH (they need it now), confusion wins on FRAMING
     (`leadWith`, below). Someone who is both confused and in a hurry needs a
     short answer that comes at it differently, not a long one. */
  if (state.urgency > 0.5) {
    depth = 'brief'
    reasons.push('the user signalled time pressure')
  } else if (state.confusion > 0.5 || input.teaching) {
    depth = 'thorough'
    reasons.push(state.confusion > 0.5 ? 'the user signalled confusion' : 'the user asked to be taught')
  } else if (kinds.has('conversation') && kinds.size === 1) {
    depth = 'brief'
    reasons.push('ordinary conversation deserves a short reply, not an essay')
  } else if (kinds.has('information') && !structure.causal && !structure.comparative) {
    depth = 'brief'
    reasons.push('a bare fact was asked for')
  } else if (kinds.has('explanation') && structure.causal) {
    depth = p.density === 'brief' ? 'standard' : 'thorough'
    reasons.push('the mechanism is the answer, and mechanisms need room')
  }

  /* ----- what to lead with ----- */
  let leadWith: string
  if (state.repeats >= 2) {
    /* THE MOST IMPORTANT BRANCH HERE. Two failed explanations means the
       framing was wrong, not that it was too short. Repeating it longer is
       the classic failure --- the third attempt must come at it differently
       and say so, so the user knows they were heard. */
    leadWith = 'a different framing from the previous attempts, stated as such'
    reasons.push(`asked ${state.repeats} times; the earlier framings did not land`)
  } else if (kinds.has('troubleshooting')) {
    leadWith = 'the cause, then the fix'
  } else if (kinds.has('comparison')) {
    leadWith = 'the dimension that actually separates them'
  } else if (kinds.has('recommendation')) {
    leadWith = 'the recommendation, then why'
  } else if (structure.causal) {
    leadWith = 'the mechanism'
  } else {
    leadWith = 'the direct answer'
  }

  /* ----- what to leave out ----- */
  const omit: string[] = []
  if (depth === 'brief') {
    omit.push('background the user did not ask for', 'caveats that do not change the answer')
  }
  if (p.technicalLevel === 'expert') omit.push('definitions of standard terms')
  if (state.urgency > 0.5) omit.push('alternatives not being recommended')
  if (kinds.has('conversation')) omit.push('the offer of further help')

  /* ----- progressive ----- */
  /* Progressive disclosure is for content with genuine internal structure and
     a reader who wants to be walked through it. Applying it to a one-line
     answer turns a reply into a wizard. */
  const progressive =
    (input.teaching === true || state.confusion > 0.5) &&
    (structure.sequential || structure.causal || structure.cardinality >= 3) &&
    depth !== 'brief'

  const representations = chooseRepresentations(structure, u, p)
  const define = needsDefining(content, u, p.technicalLevel, input.known ?? [])

  return {
    depth,
    leadWith,
    define,
    omit,
    representations,
    progressive,
    /* MIRROR THE USER unless memory says otherwise. Answering Hinglish in
       English is a small rudeness that compounds; answering English in
       Hinglish because a preference was stored once is a larger one. */
    language: u.language === 'en' ? p.language : u.language,
    because: reasons.join('; ') || 'a straightforward request answered directly',
  }
}
