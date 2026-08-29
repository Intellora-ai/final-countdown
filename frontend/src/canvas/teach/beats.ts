import { REPRESENTATIONS, type Representation } from '../spec/representations'
import type { Block, BlockKind, Lesson, Tone } from '../spec/spec'
import type { Beat, Beats } from './contract'

/**
 * Cutting a lesson into the parts it is taught in.
 *
 * BEATS ARE DERIVED, NEVER AUTHORED
 * ---------------------------------
 * The obvious design is a `beats:` field on `LessonSpec`. It is the wrong one
 * twice over. Every lesson already written would need editing before it could
 * be taught, so the feature would arrive with three broken fixtures; and an
 * author who can state the beats separately from the blocks can state them
 * WRONGLY — a beat boundary that falls in the middle of an argument, or a lead
 * block marked `aside`, and nothing in the system would be able to tell.
 *
 * Everything needed is already in the spec. `emphasis` says which blocks carry
 * the argument and which support it. `relations` says which blocks are one
 * thought. `kind` says what a block IS. Reading the cut out of those means the
 * beats cannot contradict the content, because they are made of it.
 *
 * PURE, LIKE `plan`
 * -----------------
 * No DOM, no clock, no randomness. The same lesson produces the same beats on
 * every machine and in every run, which is what makes a beat boundary something
 * a test can pin down rather than something a reviewer has to eyeball.
 */

/* -------------------------------------------------------------------------- */
/* Where a beat ends                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The most blocks one beat may hold, its lead included.
 *
 * Emphasis alone does not cut finely enough. Gas pressure runs one `primary`
 * chart followed by five supporting blocks, and civics runs one `primary`
 * figure followed by four; taking emphasis at its word would hand the learner
 * half the lesson in a single "part" and then ask whether it landed. A beat
 * that swallows most of the lesson is a lecture with one interruption.
 *
 * Three is the lead plus two pieces of evidence. Two makes the software stop
 * the learner every other block, and a pause that arrives that often stops
 * being read; four leaves the civics lesson with a middle beat carrying four of
 * its six blocks, and by the fourth the claim the beat opened with is no longer
 * in front of the reader when the checkpoint asks about it.
 *
 * The cap is a ceiling, not a target — a beat ends early whenever the next
 * block leads one of its own.
 */
const MAX_BLOCKS_PER_BEAT = 5

/**
 * A beat is a COMPLETE IDEA, not a fixed number of blocks.
 *
 * THE MISTAKE THIS CORRECTS, MEASURED
 * -----------------------------------
 * With a cap of three and a cut at every `primary` block, the logarithms
 * lesson came out as SIX beats over ten blocks — the learner was stopped and
 * asked "shall I continue" after the definition alone, then after the
 * framework alone. One idea at a time is not careful teaching, it is slow
 * teaching, and a checkpoint that arrives every forty words stops being read.
 *
 * So a beat now ends when it is FINISHED rather than when it is full: it needs
 * something shown — a table, a chart, a flow, a figure — and at least two
 * blocks around it. Text that has not yet reached its picture keeps absorbing.
 * The cap is the backstop for a lesson that never shows anything.
 *
 * On logarithms that gives three beats of three, five and two, each carrying
 * its own representation, instead of six beats of one and two.
 */
const MIN_BLOCKS_BEFORE_A_BEAT_MAY_END = 2

/**
 * What counts as SHOWING rather than telling.
 *
 * The same set `teaching.ts` uses, and deliberately the same list: a beat that
 * satisfies "every beat shows something" under one definition and fails it
 * under another would be a rule that depends on which file you asked.
 */
const SHOWS = new Set(['chart', 'table', 'flow', 'figure', 'simulation'])

/**
 * A run of blocks that will become one beat. Non-empty, and typed to say so.
 *
 * `Block[]` would compile and would be a lie: a beat with no blocks teaches
 * nothing, `checkBeats` rejects it, and every reader of `run[0]` would need a
 * guard for a case that cannot happen. Stating the first element separately
 * makes the guarantee the compiler's job instead of a comment's.
 */
type Run = readonly [Block, ...Block[]]

/**
 * The runs of blocks that become beats.
 *
 * THE RULE
 * --------
 * A `primary` block leads a beat and absorbs the `supporting` and `aside`
 * blocks that follow it, until the next `primary` or until the cap. That reads
 * as "here is the idea, here is the evidence for it", which is the order the
 * blocks are already in.
 *
 * The edges that the three real lessons actually hit:
 *
 *   - Blocks before the first `primary` are a beat of their own. They are not
 *     orphans to be glued onto the first primary beat, because a run of
 *     supporting material that opens a lesson is setting the scene, and the
 *     first real claim deserves its own moment.
 *
 *   - A lesson with no `primary` at all still cuts, into runs of the cap. It
 *     would otherwise arrive as one beat containing everything, which is the
 *     exact failure this module exists to prevent, and `emphasis` defaults to
 *     `supporting` so a lesson written without thinking about emphasis is the
 *     likely case rather than an exotic one.
 *
 *   - A single-block lesson is one beat. It is also the last beat, so the
 *     learner is asked what is unclear rather than whether to continue.
 *
 * DERIVATION KEEPS A PRIMARY BLOCK IN THE BEAT IT CAME FROM
 * ---------------------------------------------------------
 * `derives` means "this comes FROM that" (`from` derives from `to`, the same
 * reading `plan` uses when it stacks a derived block beneath its source). A
 * conclusion separated from its premise by a checkpoint asks the learner to
 * confirm they followed a claim whose reason has just scrolled behind a pause,
 * so a `primary` block that derives from something already in the beat being
 * built joins that beat instead of starting a new one.
 *
 * Only when the source is in the CURRENT beat. A `derives` edge reaching back
 * three beats cannot be honoured without making `blockIds` a scattered
 * selection, which requirement 2 forbids outright — and it does not need to be,
 * because the premise was checked when its own beat ended. Classifier
 * evaluation has exactly that shape: `takeaway` derives from `confusion` with
 * three blocks in between, and it correctly opens a beat of its own.
 *
 * The cap still wins. Otherwise a chain of derivations would rebuild the
 * swallowing beat the cap exists to break up.
 */
function cutIntoRuns(lesson: Lesson): Run[] {
  const sourcesOf = new Map<string, Set<string>>()
  for (const relation of lesson.relations) {
    if (relation.kind !== 'derives') continue
    const known = sourcesOf.get(relation.from)
    if (known) known.add(relation.to)
    else sourcesOf.set(relation.from, new Set([relation.to]))
  }

  const runs: Run[] = []
  let current: Block[] = []

  /*
   * DOES THIS LESSON SHOW ANYTHING, ANYWHERE?
   *
   * Both rules below ask a run to contain a representation. Neither can be
   * satisfied by a lesson that has none, and when a rule cannot be satisfied it
   * stops discriminating and starts applying to everything -- so `finished` was
   * never true, `leadsItsOwn` was never true, emphasis was ignored outright,
   * and the only surviving cut was the cap.
   *
   * A taught lesson cannot get here: `nothing-is-shown` refuses one that shows
   * nothing. An ANSWER can, and does -- the engine emits prose and callouts
   * only -- so this is a live path, not a hypothetical.
   */
  const showsSomewhere = lesson.blocks.some((b) => SHOWS.has(b.kind))

  /*
   * `const [lead, ...rest] = current` rather than `current.length > 0`.
   *
   * The two are the same test, but only one of them convinces the compiler. A
   * run is non-empty by construction — nothing is ever pushed until a block has
   * gone into `current` — and `Run` states that as `[Block, ...Block[]]` so
   * that `run[0]` downstream needs no guard and no assertion. A length check
   * leaves the compiler still believing `current[0]` may be undefined, which is
   * how the three `Object is possibly 'undefined'` errors arose; a `!` would
   * have silenced them while leaving the invariant unwritten anywhere.
   */
  for (const block of lesson.blocks) {
    const sources = sourcesOf.get(block.id)
    const continuesTheThought =
      sources !== undefined && current.some((held) => sources.has(held.id))

    /* A beat may only end once it has shown something and has enough around it
       to be worth pausing on. Until then a new `primary` block joins rather
       than interrupts — which is what turns six one-idea beats into three
       complete ones. */
    const finished =
      current.length >= MIN_BLOCKS_BEFORE_A_BEAT_MAY_END
      && (!showsSomewhere || current.some((b) => SHOWS.has(b.kind)))

    /* A beat never straddles the boundary between the core answer and the
       material offered beyond it. If it did, the learner would be shown the
       first block of a deeper topic in the same breath as being asked whether
       they wanted it — which is asking after the fact. */
    const crossesIntoDepth = current.length > 0 && current[0]?.depth !== block.depth

    const leadsItsOwn = block.emphasis === 'primary' && !continuesTheThought && finished
    const full = current.length >= MAX_BLOCKS_PER_BEAT

    const [lead, ...rest] = current
    if (lead !== undefined && (leadsItsOwn || full || crossesIntoDepth)) {
      runs.push([lead, ...rest])
      current = []
    }
    current.push(block)
  }

  const [lead, ...rest] = current
  if (lead !== undefined) runs.push([lead, ...rest])

  /*
   * A TAIL THAT CANNOT STAND ALONE JOINS THE BEAT BEFORE IT.
   *
   * The summary is the last block and is almost always `primary`, so it ends
   * up as a run of one containing nothing shown — measured on `tenses`, where
   * the final beat was `[keep-this]` and had no representation to carry.
   *
   * Two wrong ways to fix that. Exempting the last beat from the rule would
   * put the hole exactly where the lesson is summarised, which is the beat
   * that most needs its picture. Forcing every author to end on a chart would
   * bend lessons around the checker.
   *
   * Merging is the honest one: a conclusion belongs with the material it
   * concludes, and the beat it joins already showed something. The cap yields
   * here on purpose — a beat one block over the ceiling is a smaller cost than
   * a beat the learner is asked to stop on with nothing in front of them.
   */
  /*
   * NOTHING TO MERGE INTO, SO DO NOT MERGE.
   *
   * The merge exists to hand a picture-less run the picture from its
   * neighbour. When the lesson shows NOTHING ANYWHERE there is no picture to
   * hand over, and the rule stops being a repair: every run qualifies, each
   * folds into the one before it, and the whole lesson arrives as a single
   * beat. That is precisely the failure `deriveBeats` exists to prevent — the
   * view renders, nothing throws, every block is present, and the feature is
   * gone.
   *
   * A taught lesson cannot reach this state: `nothing-is-shown` refuses one
   * that shows nothing. An ANSWER can, and does — the engine builds prose and
   * callouts only — so this is the live path, not a hypothetical one.
   */
  if (!showsSomewhere) return runs

  for (let i = runs.length - 1; i > 0; i--) {
    const run = runs[i]
    const previous = runs[i - 1]
    if (run === undefined || previous === undefined) continue
    if (run.some((b) => SHOWS.has(b.kind))) continue

    /* Only into a beat of the same tier. Folding a core conclusion into a
       deeper beat — or the reverse — would put material the learner has not
       agreed to see in the same breath as material they have. */
    if (previous[0].depth !== run[0].depth) continue

    runs.splice(i - 1, 2, [...previous, ...run] as Run)
  }

  return runs
}

/* -------------------------------------------------------------------------- */
/* What the learner is asked                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What a block IS to a reader, for the purpose of asking about it.
 *
 * Coarser than `kind` on purpose: a chart and a table are both "look at these
 * numbers" when the question is whether they landed, and phrasing them
 * differently would be variation for its own sake rather than variation the
 * content earns.
 */
type Form =
  | 'model'
  | 'sequence'
  | 'formal'
  | 'data'
  | 'parts'
  | 'structure'
  | 'number'
  | 'point'
  | 'correction'
  | 'recap'
  | 'argument'

const KIND_FORM: Record<Exclude<BlockKind, 'figure'>, Form> = {
  simulation: 'model',
  flow: 'sequence',
  equation: 'formal',
  chart: 'data',
  table: 'data',
  metric: 'number',
  callout: 'point',
  prose: 'point',
  /* A correction and a recap get their own forms rather than folding into
     'point'. After showing a wrong form beside a right one, "Making sense so
     far?" asks the wrong question — what matters is whether the reader can see
     WHY the first one fails, and a checkpoint that does not ask that lets the
     misreading survive the pause it was meant to catch. */
  misconception: 'correction',
  summary: 'recap',
  reasoning: 'argument',
}

/**
 * A figure is asked about by what it is FOR, not by being a figure.
 *
 * The same reasoning `profile` gives for counting figures by intent rather than
 * by kind: all 137 representations arrive as one block kind, so treating them
 * alike would give a sankey and a confusion matrix the same question. The
 * registry already records the intent, so the checkpoint reads through to it.
 */
const INTENT_FORM: Record<Representation['intent'], Form> = {
  compare: 'data',
  trend: 'data',
  distribution: 'data',
  relationship: 'data',
  composition: 'parts',
  structure: 'structure',
  sequence: 'sequence',
  construct: 'model',
}

function formOf(block: Block): Form {
  if (block.kind === 'figure') return INTENT_FORM[REPRESENTATIONS[block.as].intent]
  return KIND_FORM[block.kind]
}

/**
 * How the question is phrased.
 *
 * VARIATION COMES FROM THE CONTENT, NEVER FROM A COUNTER
 * ------------------------------------------------------
 * Rotating through a list of phrasings by position is a step number in
 * disguise: the learner who reaches the fourth wording knows exactly where they
 * are, and the wording tells them nothing about what they just read. So the
 * phrasing is a function of the lead block — its `tone` where the author gave
 * it one, its form otherwise. Two beats that genuinely are "a neutral chart
 * followed by a claim" get the same question, and that is correct: identical
 * content should read identically.
 *
 * A non-neutral tone outranks the form because it is the stronger statement.
 * `warning` means the author expects this to be misunderstood, which is worth
 * more at a checkpoint than the fact that it happens to be a callout.
 */
const ASK_BY_TONE: Partial<Record<Tone, string>> = {
  insight: 'Did that land?',
  warning: 'That one catches people out — happy with it?',
  result: 'That is the result — is it clear?',
}

const ASK_BY_FORM: Record<Form, string> = {
  model: 'Does the model make sense so far?',
  sequence: 'Does that order hang together?',
  formal: 'Does that follow?',
  data: 'Can you see that in the numbers?',
  parts: 'Clear how the whole splits up?',
  structure: 'Can you see how those link up?',
  number: 'Clear where that number comes from?',
  point: 'Making sense so far?',
  correction: 'Can you see why the first one is wrong?',
  recap: 'Does the whole thing hang together?',
  argument: 'Does every step follow from the one before it?',
}

/** Used when the next beat's lead block has no title to name. */
const UNNAMED_NEXT = 'There is a bit more — shall we carry on?'

/**
 * The end, phrased as an invitation rather than a farewell.
 *
 * The last beat asks what is still unclear, because "shall I continue" has no
 * answer here and a learner who is quietly lost will take silence as the end of
 * the lesson.
 */
function closingAsk(lead: Block): string {
  /*
   * "the bit people most often get wrong" is what this said, and it was the
   * software inventing a fact. `tone: 'warning'` means the author marked the
   * block as one to be careful with — it does NOT mean the block is a common
   * mistake. On the machine-learning lesson the warning-toned final block is
   * titled "The rule", and telling a learner that a rule is the thing people
   * most often get wrong is simply false.
   *
   * The rewrite says only what the tone actually licenses: this one is worth
   * being sure of. Everything the learner is told has to be something the
   * lesson data supports, and a phrase in a checkpoint is no more exempt from
   * that than a sentence in a doubt answer.
   */
  if (lead.tone === 'warning')
    return 'That is the last of it, and the part worth being sure of. Anything still unclear?'

  const form = formOf(lead)
  if (form === 'data' || form === 'number')
    return 'That is the whole answer. Any of those numbers still not adding up?'

  return 'That is the whole answer. Anything you want cleared up?'
}

/**
 * The same rule `checkBeats` enforces, applied before a checkpoint is built.
 *
 * `contract.ts` is the authority; this is here because the phrasing pulls a
 * TITLE out of the lesson, and a lesson is free to contain "Section 2 of 3".
 * Naming it would put a count in front of the learner through no fault of the
 * phrasing, so a candidate that trips the rule loses the name rather than
 * reaching the view and being refused there.
 */
const READS_AS_A_COUNT = /\b(step|part)\s*\d|\b\d+\s*(of|\/)\s*\d/i

/**
 * A title, softened so it can follow "Next:" mid-sentence.
 *
 * Lowercasing the first letter unconditionally turns "ROC, and why it flatters
 * here" into "rOC", so it only happens when the rest of the first word is
 * already lowercase — which leaves acronyms alone. A title opening on a proper
 * noun ("India's growth") is still lowercased, which is the one case this cannot
 * tell apart from an ordinary sentence without a dictionary.
 */
function asPhrase(title: string): string | undefined {
  const trimmed = title.trim().replace(/[.!?]+$/, '')
  if (trimmed.length === 0) return undefined

  const firstWord = trimmed.split(/\s+/)[0] ?? ''
  const tail = firstWord.slice(1)
  if (tail !== tail.toLowerCase()) return trimmed

  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

function checkpointFor(lead: Block, nextLead: Block | undefined): string {
  if (nextLead === undefined) return closingAsk(lead)

  /*
   * CROSSING INTO DEPTH IS AN OFFER, NOT A CONTINUE.
   *
   * Every other checkpoint asks whether the last part landed. This one asks a
   * different question — whether the learner wants a topic they did not ask
   * for — and it has to be phrased as that, by name, or the software takes
   * silence as permission and delivers a chapter at someone who asked one
   * thing.
   *
   * The core has ended by the time this fires, so the learner already has a
   * complete answer. Saying no here loses them nothing.
   */
  if (lead.depth === 'core' && nextLead.depth === 'deeper') {
    const name = nextLead.title === undefined ? undefined : asPhrase(nextLead.title)
    if (name === undefined || READS_AS_A_COUNT.test(name)) {
      return 'That answers it. There is more to this if you want it — shall I go on?'
    }
    return `That answers it. I can go further into ${name} — shall I?`
  }

  const ask = ASK_BY_TONE[lead.tone] ?? ASK_BY_FORM[formOf(lead)]

  /* Naming what is coming lets the learner judge whether to go on without ever
     being told how much is left — the trade requirement 1 is built around. */
  const name = nextLead.title === undefined ? undefined : asPhrase(nextLead.title)
  if (name === undefined) return `${ask} ${UNNAMED_NEXT}`

  const named = `${ask} Next: ${name}.`
  return READS_AS_A_COUNT.test(named) ? `${ask} ${UNNAMED_NEXT}` : named
}

/* -------------------------------------------------------------------------- */
/* The derivation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A lesson, cut into the parts it is taught in.
 *
 * The result is a PARTITION: concatenating `blockIds` reproduces
 * `lesson.blocks` exactly, in order, which is what lets the view show the first
 * N blocks of an already-planned frame and know that nothing already on screen
 * will move. `checkBeats` asserts it; this function is written so that it holds
 * by construction, because the runs are built by walking the block array once
 * and never reordering it.
 */
export function deriveBeats(lesson: Lesson): Beats {
  const runs = cutIntoRuns(lesson)

  /* The index reaches the NEIGHBOURING run and nothing else. It never reaches
     the phrasing — see the note above `ASK_BY_TONE` for why that matters. */
  return runs.map((run, at): Beat => {
    const next = runs[at + 1]
    return {
      id: run[0].id,
      blockIds: run.map((block) => block.id),
      checkpoint: checkpointFor(run[0], next === undefined ? undefined : next[0]),
      isLast: next === undefined,
    }
  })
}
