/**
 * WHAT SHOULD HAPPEN NEXT FOR THIS LEARNER.
 *
 * THE FRAME THIS BREAKS. Everything before it asked a smaller question --
 * "is this a question?", "is this a doubt?", "which of seven readings is it?"
 * -- and answered it with rules: a regex in `intent.ts`, then a menu of seven
 * shapes inside the authoring prompt. Both are intent CLASSIFICATION, and every
 * classifier has the same failure: a sentence nobody anticipated falls through
 * to a default, and the default is a lecture.
 *
 * A tutor does not classify a sentence. They decide what to DO next. So this
 * asks one question -- given where the learner is and what they just said, what
 * should happen? -- and that single question covers greetings, doubts,
 * questions, requests for practice, confusion, silence and off-topic messages
 * without any of them being enumerated anywhere.
 *
 * AUTONOMY FOR THE MODEL, CONTROL FOR THE APPLICATION. The model chooses freely
 * from five actions and names its target. It cannot make any of them happen:
 * `permitted` below is the application's veto, and it runs on every decision
 * before anything is executed. The model decides; this file decides what a
 * decision is allowed to mean.
 *
 * FIVE ACTIONS, NOT FIFTY CATEGORIES. A small vocabulary is what makes the
 * model generalise instead of pattern-match. "hi", "teach me logarithms" and
 * "shuru karo" are all START_LESSON without any of them being listed; "why did
 * you take x here", "I don't get it" and "samajh nahi aaya" are all EXPLAIN.
 * Adding a sixth action is a decision about what the product can DO, which is
 * exactly the kind of decision that belongs in code and not in a prompt.
 *
 * IT CANNOT REFUSE. Invariant R3 -- every input gets a reply. A model that is
 * unreachable, slow, or answers with something unreadable falls back to a
 * deterministic decision rather than an error, so a controller outage costs
 * judgement and never costs the learner an answer.
 */

/**
 * Everything the model may do. Deliberately five.
 *
 * Each is a thing the APPLICATION can actually execute. An action the product
 * cannot perform would be a promise the model is allowed to make and the app is
 * forced to break, so this list is the product's real capability, written down.
 */
export const ACTIONS = [
  /** Teach something new. The learner arrived, or asked for a topic. */
  'START_LESSON',
  /** Say it again differently. They have been told and it did not land. */
  'EXPLAIN',
  /** Answer the thing they asked, directly. Not a lesson: an answer. */
  'ANSWER',
  /** Give them something to do. Questions, not prose. */
  'PRACTICE',
  /** Ask them something back, because what they want is genuinely unclear. */
  'ASK_CLARIFICATION',
] as const

export type Action = (typeof ACTIONS)[number]

/**
 * What the model is shown. Its whole world, and no more of it than that.
 *
 * NOT THE WHOLE SYSTEM. The model does not need to understand the curriculum,
 * the schema, the gate or the store -- it needs to know where this learner is
 * and what they just said. Everything here is small, current, and about one
 * person, which is also why it costs a fraction of an authoring prompt.
 */
export interface Situation {
  /** What they just typed, exactly as typed. Never cleaned up first. */
  readonly said: string
  /** The lesson they are inside, if any. Absent means they are at the door. */
  readonly lesson?: string
  /** The concept currently on screen, if any. */
  readonly topic?: string
  /** Ways in already spent on this topic, so "again" means something. */
  readonly told: readonly string[]
  /** What the local source can actually teach, when the caller knows. */
  readonly available?: readonly string[]
}

/** The model's decision. Structured, so the application can act on it. */
export interface Decision {
  readonly action: Action
  /** What the action is about, in the learner's own words where possible. */
  readonly target: string
  /** Why, in one clause. Recorded so a wrong decision can be read back. */
  readonly reason: string
  /** Whether executing it needs material from the local source. */
  readonly sourceNeeded: boolean
  /**
   * WHETHER THE LEARNER NAMED A SUBJECT AT ALL, AS THE MODEL READ IT.
   *
   * REPORTED, NOT INFERRED, AND THAT IS THE WHOLE POINT. The app used to decide
   * this by stripping a list of framing words and seeing what was left -- which
   * is the application judging MEANING, something it cannot do. The list grew
   * three times in one session and each round was found by a learner being
   * taught their own words: `vanakkam` as a subject, `aaya` leaking into a key,
   * `difference`/`between` polluting a comparison. It can never be finished,
   * because there is always another function word in another language, and
   * `goalz` or `fuzi` cannot be settled by any list at all -- one is a
   * misspelling of a subject and one is not, and only reading them tells you
   * which.
   *
   * The model is already reading the message. It knows. It was simply never
   * asked. So it answers, and the app enforces the consequence -- which is a
   * fact the app owns: no subject means ask, never guess.
   */
  readonly subjectNamed: boolean
  /**
   * TRUE WHEN NOTHING DECIDED THIS -- the controller was unreachable and the
   * app fell back. See `fallbackDecision`.
   *
   * The caller needs to know, because a fallback's `target` is the learner's
   * raw sentence rather than a subject, and the shared shelf is keyed by
   * target. Filing under `bhai yaar samajh nahi aaya photosynthesis` creates a
   * key no second learner will ever produce, so the cache quietly fills with
   * one-off entries exactly while the provider is struggling and the saving
   * matters most.
   */
  readonly guessed?: boolean
}

/**
 * THE DECISION IS ASKED FOR IN ONE SMALL CALL.
 *
 * MEASURED AGAINST WHAT IT REPLACES: an authoring prompt is ~1,420-1,780
 * tokens and reserves 1,000 more for the reply. This is about 250 in and 60
 * out. It is affordable precisely because it is not trying to teach anything --
 * and it can REMOVE an authoring call entirely when the answer is
 * ASK_CLARIFICATION, which costs nothing and is often the right move.
 */
/* EXPORTED so the alias memo can be stamped with it. A stored READING of a
   phrasing is only reusable while the prompt that produced the reading has not
   changed; see `memory/aliases.ts` and `index.ts`. */
export const CONTROLLER_SYSTEM = [
  'You are the controller for a tutoring app. You do not teach. You decide what',
  'should happen next for one learner, and the app carries it out.',
  '',
  'Reply with ONE JSON object and nothing else:',
  '{"action":"...","target":"...","reason":"...","source_needed":true,"subject_named":true}',
  '',
  `"action" is exactly one of: ${ACTIONS.join(' | ')}`,
  '  START_LESSON       teach something new; they arrived or named a topic',
  '  EXPLAIN            say it again differently; they have been told and it did not land',
  '  ANSWER             answer what they asked, directly — not a lesson',
  '  PRACTICE           give them problems to work, not prose to read',
  '  ASK_CLARIFICATION  ask them back; what they want is genuinely unclear',
  '',
  '"target" is what it is about, in their words where you can. If they named no',
  'topic and there is a current one, use that. If there is neither, use "".',
  '"reason" is one clause saying why.',
  '"source_needed" is true when carrying this out needs teaching material.',
  '',
  '"subject_named" is the important one. It is true only when THEY named a thing',
  'to be taught. A greeting, a bare request, a shrug or something you cannot read',
  'names nothing -- "hi", "shuru karo", "vanakkam", "solve this", "asdfgh" -- and',
  'is false. A misspelling of a real subject still names one: "fotosynthesis",',
  '"trignometry", "goalz" for goals are all true, because you can tell what they',
  'meant. When it is false, use ASK_CLARIFICATION and leave "target" empty.',
  '',
  'They may misspell, abbreviate ("diff b/w", "eg", "wat"), type phonetically, or',
  'mix in an Indian language written in Latin script ("samajh nahi aaya",',
  '"puriyala", "bujhi nai", "shuru karo"). Read what they MEAN.',
  '',
  'THE TARGET MUST BE A SUBJECT, NEVER THEIR GREETING OR THEIR REQUEST.',
  'A greeting is START_LESSON only when a LESSON or TOPIC is named above — that',
  'is the thing to start. With neither, there is nothing to start and nothing to',
  'name, so it is ASK_CLARIFICATION. Do NOT put "hi", "solve this" or "give me',
  'questions" in "target": those are what they SAID, not what they want taught,',
  'and a lesson written about them teaches the greeting instead of the subject.',
  '',
  'Someone saying they did not understand is EXPLAIN, in any language.',
  'Otherwise prefer a guess that gets them taught over a question that stalls',
  'them — but only when you have a real subject to teach.',
].join('\n')

/** The port. The same shape `authorConcept` takes, so one model serves both. */
export type ChatPort = (system: string, user: string, priorAssistant?: string) => Promise<string>

/**
 * WHAT THE MODEL IS TOLD ABOUT WHERE THEY ARE.
 *
 * Compact on purpose. Every line is a fact the model cannot derive and would
 * otherwise have to be given as prose; anything it can infer from the message
 * itself is left out.
 */
function situationText(situation: Situation): string {
  /*
   * A FIELD HOLDS A VALUE OR IT IS ABSENT. IT NEVER HOLDS PROSE.
   *
   * This wrote `LESSON: none — they are at the door` when there was no lesson,
   * and a model copied that sentence verbatim into `target`. MEASURED:
   *
   *   [controller] START_LESSON target="none - they are at the door"
   *
   * which passed the veto (it contains real words) and produced a lesson about
   * the phrase. The model was not being stupid: it was handed something in the
   * shape of a value and used it as one.
   *
   * So an absent lesson is an ABSENT LINE. There is nothing to copy, and the
   * absence says exactly what the sentence was trying to say -- the prompt
   * already tells it what to do when no lesson is named.
   */
  const lines: string[] = []
  if (situation.lesson !== undefined) lines.push(`LESSON: ${situation.lesson}`)
  if (situation.topic !== undefined) lines.push(`TOPIC ON SCREEN: ${situation.topic}`)
  if (situation.told.length > 0) {
    lines.push(`ALREADY EXPLAINED THIS TOPIC ${situation.told.length} TIME(S)`)
  }
  if (situation.available !== undefined && situation.available.length > 0) {
    /* Capped: the model needs to know roughly what exists, not to read a
       syllabus. A long list here is prompt budget spent on recall. */
    lines.push(`SOURCE HAS: ${situation.available.slice(0, 12).join(', ')}`)
  }
  lines.push('', `STUDENT SAID: ${situation.said}`)
  return lines.join('\n')
}

/** Read a decision out of a reply, or decide there is not one. */
function decisionFrom(reply: string, situation: Situation): Decision | null {
  const open = reply.indexOf('{')
  const close = reply.lastIndexOf('}')
  if (open < 0 || close <= open) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.slice(open, close + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const it = parsed as Record<string, unknown>
  const action = typeof it['action'] === 'string' ? it['action'].trim().toUpperCase() : ''
  if (!(ACTIONS as readonly string[]).includes(action)) return null
  return {
    action: action as Action,
    /*
     * THE TOPIC ON SCREEN, OR NOTHING. NEVER THEIR RAW MESSAGE.
     *
     * This fell back to `situation.said`, and that is how "hi" became a lesson
     * titled "How do you say 'hi'?" -- the controller named no subject, the app
     * substituted the greeting, and the tutor dutifully taught it. MEASURED on a
     * local model: "hi", "solve this" and "give me questions" each produced a
     * lesson about the phrase itself.
     *
     * An empty target is not a problem: `permitted` turns it into a question,
     * which is the honest reply to someone who has not named anything.
     */
    target:
      typeof it['target'] === 'string' && it['target'].trim() !== ''
        ? it['target'].trim()
        : (situation.topic ?? ''),
    reason: typeof it['reason'] === 'string' ? it['reason'].trim() : '',
    sourceNeeded: it['source_needed'] !== false,
    /*
     * ABSENT IS NOT "NO". Small models drop optional keys routinely, and
     * reading a missing field as "they named nothing" turned a perfectly good
     * decision -- `{action:'START_LESSON', target:'photosynthesis'}` -- into a
     * clarifying question. Explicit `false` is still believed; silence falls
     * back to the strip, which is the same second opinion the fallback uses.
     */
    subjectNamed:
      it['subject_named'] === true
        ? true
        : it['subject_named'] === false
          ? false
          : namesASubject(situation.said),
  }
}

/**
 * WHAT TO DO WHEN THE CONTROLLER CANNOT ANSWER.
 *
 * Not an error, and not a refusal. `handler.ts` must still teach, so an
 * unreachable or unreadable controller falls back to the decision that is right
 * in the largest number of cases: teach them the thing they typed, or carry on
 * with what is on screen.
 *
 * DELIBERATELY NOT A CLASSIFIER. A fallback that tried to be clever would be a
 * second implementation of the thing this file exists to replace, and it would
 * be the one running whenever the first was unavailable -- so the quality of a
 * bad minute would be decided by the code path nobody tests.
 */
export function fallbackDecision(situation: Situation): Decision {
  const said = situation.said.trim()
  const insideALesson = situation.topic !== undefined
  return {
    action: insideALesson && said !== '' ? 'EXPLAIN' : 'START_LESSON',
    /* Their own words. The tutor reads them well -- that is measured -- but it
       is a sentence, not a subject, which is why `guessed` is set. */
    target: said !== '' ? said : (situation.topic ?? ''),
    reason: 'the controller could not be reached, so the app chose',
    sourceNeeded: true,
    guessed: true,
    /*
     * NOTHING READ THE MESSAGE, SO THE ONLY OPINION AVAILABLE IS THE STRIP'S.
     *
     * This claimed `said !== ''` -- every non-empty message names a subject --
     * which is the strongest assertion in the file made on the one path where
     * nothing actually read anything. During a rate-limit outage a learner
     * typing `hi` would pass the veto's primary check on the strength of having
     * typed something.
     */
    subjectNamed: namesASubject(said),
  }
}

/**
 * Decide what happens next. Never throws, never refuses.
 */
export async function decideNext(chat: ChatPort, situation: Situation): Promise<Decision> {
  let reply: string
  try {
    reply = await chat(CONTROLLER_SYSTEM, situationText(situation))
  } catch {
    return fallbackDecision(situation)
  }
  return decisionFrom(reply, situation) ?? fallbackDecision(situation)
}

/**
 * IS THERE A SUBJECT IN HERE AT ALL?
 *
 * THE DEFECT THIS EXISTS TO STOP, MEASURED AGAINST A REAL MODEL:
 *
 *   "hi"                 -> lesson titled "How do you say 'hi'?"
 *   "solve this"         -> lesson titled "How do you find the atomic number..."
 *   "give me questions"  -> lesson titled "How can you tell if a question is..."
 *
 * Each one taught the learner their own phrasing. The controller had named the
 * message itself as the target, `permitted` only refused an EMPTY target, and
 * the tutor dutifully wrote a lesson about a greeting.
 *
 * WHY THIS IS CODE AND NOT ANOTHER PROMPT LINE. The prompt already says, in
 * capitals, not to put "hi" in the target. A capable model obeys; the local
 * 7B did not. An instruction a model may ignore is not a control -- and the
 * goal is explicit that the model has autonomy while the APPLICATION decides
 * what is allowed to happen. So this is the application deciding.
 *
 * IT IS NOT INTENT CLASSIFICATION. It answers one mechanical question -- after
 * removing the words people wrap a request in, is any subject left? -- and it
 * has no opinion about WHICH action is right. That stays the model's.
 *
 *   "hi"                          -> nothing left  -> no subject
 *   "solve this"                  -> nothing left  -> no subject
 *   "teach me logarithms"         -> "logarithms"  -> a subject
 *   "photosynthesis"              -> "photosynthesis"
 *   "samajh nahi aaya about x"    -> "x"
 */
/*
 * A SECOND OPINION, NO LONGER A JUDGE.
 *
 * This list decided two things and was wrong to decide either: whether a
 * message named a subject, and what the shelf key should be. It grew three
 * times in one session -- English, then Hindi, then greetings and connectives
 * -- and every round was found by a learner being taught their own words. It
 * can never be finished: there is always another function word in another
 * language, and `goalz` versus `fuzi` cannot be settled by any list, only by
 * reading them.
 *
 * Both jobs have moved to the thing that can read. The model reports
 * `subject_named`, and the shelf is keyed by the model's own `target`. What is
 * left here is a cheap fallback used only when nothing has reported anything --
 * a blank target, or a decision the app had to guess. Being incomplete is
 * survivable in that role: the worst case is one extra clarifying question,
 * not a lesson about a greeting.
 */
const FRAMING =
  /\b(hi|hey|hello|hola|namaste|yo|sup|ok|okay|thanks|please|start|begin|shuru|karo|batao|teach|tell|show|explain|describe|give|get|want|need|help|solve|answer|do|make|me|my|i|we|us|you|a|an|the|this|that|these|those|it|some|any|more|about|on|of|for|to|with|and|or|question|questions|problem|problems|exercise|exercises|practice|practise|quiz|test|lesson|topic|thing|stuff|something|anything|now|next|again|pls|plz|there|here|up|good|morning|afternoon|evening|sir|maam|madam|bhai|yaar|namaskar|namaskaram|vanakkam|sat|sri|akal|adaab|salaam|assalam|walaikum|kemcho|kem|cho|nomoskar|nomoshkar|khodabhai|vandanam|namaskara|hallo|samajh|samjha|samjhao|bujhi|bujhaye|puriyala|purinjila|artha|arth|kya|kaise|kaisa|kyu|kyun|kyon|hai|hain|nahi|nahin|mujhe|mera|meri|aap|tum|karo|kar|kare|do|dijiye|chahiye|padhna|padhao|sikhao|sikha|batao|bata|aaya|aa|raha|rha|rahi|kuch|thoda|zara|jara|acha|accha|theek|thik|difference|differences|between|versus|vs|compare|compared|contrast|what|why|how|when|where|which|who|whom|whose|can|could|would|should|will)\b/gi

export function namesASubject(text: string): boolean {
  /*
   * ITS OWN FILTER, BECAUSE THE TWO CALLERS WANT DIFFERENT THINGS.
   *
   * This was briefly `subjectWords(text).length > 0`, to remove a duplicated
   * strip. That made the veto adopt the KEY path's `length > 2` filter, which
   * exists there because a two-letter fragment is noise in an identifier -- and
   * is exactly wrong here, where two letters can be the whole subject:
   *
   *   "pi"          -> []  -> refused
   *   "what is pi"  -> []  -> refused
   *   "pH"          -> []  -> refused
   *
   * A learner asking about pi was asked what they meant. One strip cannot serve
   * both callers; what they share is the framing list, and that is what is
   * shared. The length rule belongs to whichever caller needs it.
   */
  return stripped(text).length > 0
}

/** The substantive words of a message: everything left after the framing. */
/** The shared half: everything both callers agree on. */
function stripped(text: string): string[] {
  return text
    .toLowerCase()
    .replace(FRAMING, ' ')
    /* Punctuation and digits are not a subject on their own. A bare "7x8" is
       handled by the tutor, not here, because it is an ANSWER not a lesson. */
    .replace(/[^a-z\u0080-\uffff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '')
}

/**
 * The words of a subject, for use as an identifier.
 *
 * DROPS ONE- AND TWO-LETTER WORDS, which is right for a key -- a stray `a` or
 * `of` that survived the framing strip is noise in an identifier -- and wrong
 * for the veto, which is why `namesASubject` does not use this.
 */
export function subjectWords(text: string): string[] {
  return stripped(text).filter((w) => w.length > 2)
}

/**
 * IS THIS TARGET THE LEARNER'S, OR ONE THE MODEL INVENTED?
 *
 * THE DEFECT, MEASURED THROUGH THE REAL UI. A learner typed
 *
 *   "bhai yaar mujhe kuch samajh nahi aa raha photosynthesis mein"
 *
 * and the controller answered
 *
 *   START_LESSON target="introduction to algebra" (student needs an entry point)
 *
 * The word `photosynthesis` was in the message. The model invented a different
 * subject entirely, and the app approved it, because `namesASubject` only asks
 * whether the target IS a subject -- never whether it is THEIRS.
 *
 * THE CHECK IS SHARED VOCABULARY, NOT EQUALITY. A model may legitimately
 * rephrase: "teach me logarithms" -> "logarithms", "diff b/w mass n weight" ->
 * "mass and weight". Those share words with the message and pass. A target that
 * shares NOTHING with either the message or the topic on screen was not derived
 * from anything the learner said, and that is the only case this refuses.
 *
 * WHEN IT REFUSES, THE MESSAGE ITSELF IS USED. Handing the tutor the raw words
 * is not a fallback of last resort -- it is the behaviour that was MEASURED
 * working: "sir mujhe samajh nahi aaya about photosynthesis" passed straight to
 * the tutor produced a correct photosynthesis lesson with a chart in 1.84s. The
 * tutor reads Hinglish perfectly well. The controller is there to choose the
 * ACTION; it is not needed to extract the noun.
 */
/**
 * How far apart two words are, capped so a long pair cannot run away.
 *
 * Levenshtein, iterative, one row at a time -- the standard cheap version.
 * Nothing here needs a library: the words are short and there are a handful.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = row
  }
  return previous[b.length] ?? 0
}

/**
 * IS THIS THE SAME WORD, ALLOWING FOR HOW PEOPLE ACTUALLY TYPE?
 *
 * Exact matching broke the feature it was written to protect. MEASURED:
 *
 *   typed     "wat is fotosynthesis"
 *   decided   ANSWER target="photosynthesis"      <- the model corrected it
 *   refused   "photosynthesis appears nowhere"    <- and this threw it away
 *   result    a lesson titled "wat is fotosynthesis"
 *
 * The model did the one thing this product exists to do -- read a misspelling
 * -- and an exact string comparison overruled it. A learner who cannot spell
 * the word is exactly the learner who needs the correction kept.
 *
 * ONE EDIT PER FOUR CHARACTERS, roughly: enough for a dropped letter, a swapped
 * pair, a phonetic spelling ("fotosynthesis", "trignometry", "algibra"), and
 * not enough to make two different subjects look alike -- "algebra" and
 * "geometry" are nowhere near.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const longest = Math.max(a.length, b.length)
  /* Short words are not fuzzy-matched: at three letters almost everything is
     within one edit of everything else. */
  if (longest < 5) return false
  /*
   * A PROPORTION OF THE WORD, NOT A FIXED SLICE OF IT.
   *
   * One-edit-per-four let two real words collide: `physics` (7) and `physical`
   * (8) are two edits apart and two were allowed, so a learner asking about
   * physics could be handed "physical". One-per-five fixes that and breaks the
   * case this exists for -- `fotosynthasis` against `photosynthesis` is THREE
   * edits (a missing `p`, an inserted `h`, an `a` for an `e`) across fourteen
   * characters, and a real learner typed exactly that.
   *
   * Neither is a rounding problem; the two cases sit either side of any fixed
   * ratio of the form 1/n. What separates them is the proportion of the word
   * that differs:
   *
   *   fotosynthasis / photosynthesis   3 of 14  = 0.21   a typo
   *   physics       / physical         2 of  8  = 0.25   two words
   *   trignometry   / trigonometry     1 of 12  = 0.08   a typo
   *   algibra       / algebra          1 of  7  = 0.14   a typo
   *
   * 0.22 is the line those measurements draw. The floor of one keeps a single
   * slip in a short word matchable.
   */
  return editDistance(a, b) <= Math.max(1, Math.floor(longest * 0.22))
}

function grounded(target: string, situation: Situation): boolean {
  const theirs = [...subjectWords(situation.said), ...subjectWords(situation.topic ?? '')]
  /* Nothing to be grounded in -- a bare greeting -- so any target the model
     names is its own suggestion and that is allowed. `namesASubject` has
     already refused the empty and the contentless ones. */
  if (theirs.length === 0) return true
  return subjectWords(target).some((word) => theirs.some((mine) => sameWord(word, mine)))
}

/** The application's answer to a decision. */
export type Verdict =
  | { readonly ok: true; readonly decision: Decision }
  /** Refused, with what the app will do instead. Never a dead end. */
  | { readonly ok: false; readonly why: string; readonly instead: Decision }

/**
 * WHETHER THAT DECISION IS ALLOWED TO HAPPEN.
 *
 * THE MODEL HAS AUTONOMY; THIS FILE HAS CONTROL. Every rule below is about what
 * the APPLICATION can actually do, not about what a good tutor would do -- the
 * second kind of rule belongs to the model, and putting it here would re-create
 * the hardcoded frame this replaces.
 *
 * IT NEVER RETURNS A DEAD END. A refusal always carries `instead`, so the caller
 * has something to execute either way. That is invariant R3 expressed at the
 * level of actions rather than replies: every decision leads somewhere.
 */
export function permitted(decision: Decision, situation: Situation): Verdict {
  /*
   * NOTHING TO ACT ON -- EMPTY, OR NAMING NO SUBJECT.
   *
   * The empty case is obvious. The second is the one that shipped a lesson
   * about the word "hi": a target that is non-empty and still names nothing
   * teachable. See `namesASubject`.
   *
   * ONLY WHEN THERE IS NO LESSON TO FALL BACK ON. Inside a lesson, "solve this"
   * has an obvious subject -- the thing on screen -- and the topic is used
   * instead of interrogating somebody who is plainly mid-flow.
   */
  if (decision.action !== 'ASK_CLARIFICATION') {
    const named = decision.target.trim()
    /*
     * THE MODEL'S REPORT, NOT THE APP'S GUESS. See `Decision.subjectNamed`.
     * `namesASubject` is kept as a second opinion for a target that is blank or
     * that the model claimed while naming nothing, but the primary answer to
     * "did they name a subject" now comes from the only thing that can read the
     * message.
     */
    if (named === '' || !decision.subjectNamed) {
      const onScreen = situation.topic ?? ''
      if (onScreen !== '' && namesASubject(onScreen)) {
        return {
          ok: false,
          why: 'the target named no subject, so the topic on screen is used',
          instead: { ...decision, target: onScreen },
        }
      }
      return {
        ok: false,
        why: 'the action names nothing teachable to act on',
        instead: { ...decision, action: 'ASK_CLARIFICATION', sourceNeeded: false },
      }
    }
  }

  /*
   * EXPLAIN MEANS AGAIN, AND THERE HAS TO BE A FIRST TIME.
   *
   * A model reading "I don't get it" from someone who has been told nothing has
   * read the sentence correctly and reached for the wrong action: there is no
   * previous explanation to vary from. The app knows this and the model cannot
   * -- `told` is ours -- so the correction belongs here.
   */
  if (decision.action === 'EXPLAIN' && situation.told.length === 0) {
    return {
      ok: false,
      why: 'nothing has been explained yet, so there is nothing to explain again',
      instead: { ...decision, action: 'START_LESSON' },
    }
  }

  /*
   * A CLARIFICATION IS ONLY WORTH ASKING ONCE.
   *
   * Two in a row is a loop the learner cannot escape: they answered, and were
   * asked again. If they have said anything at all, teach the thing they said
   * rather than interrogate them.
   */
  if (
    decision.action === 'ASK_CLARIFICATION' &&
    situation.said.trim() !== '' &&
    situation.told.length > 0
  ) {
    return {
      ok: false,
      why: 'they have already been asked once; teach what they said instead',
      instead: { ...decision, action: 'EXPLAIN', target: situation.said.trim() },
    }
  }

  /*
   * LAST, AND THE ORDER IS THE POINT. The rules above decide whether an action
   * can happen at all -- there is nothing to explain again, there is nothing to
   * act on. Only once the action stands is it worth asking whether its subject
   * is the learner's. Checked first, this rewrote the target of an EXPLAIN that
   * should have become a START_LESSON.
   */
  /*
   * A SUBJECT THE LEARNER NEVER MENTIONED IS NOT THEIR SUBJECT. See `grounded`.
   * The action the model chose stands -- that is its job -- but the thing to
   * teach comes back to what they actually said.
   */
  const named = decision.target.trim()
  if (decision.action !== 'ASK_CLARIFICATION' && !grounded(named, situation)) {
    return {
      ok: false,
      why: `the target "${named}" appears nowhere in what they said`,
      instead: { ...decision, target: situation.said.trim() },
    }
  }

  return { ok: true, decision }
}
