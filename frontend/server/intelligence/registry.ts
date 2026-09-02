/**
 * CAPABILITY CONTRACTS -- every capability the fabric can compose, described
 * the same way, and honest about whether it is available on THIS server.
 *
 * The contract is what the reasoner reads at the `reason` seam, and what the
 * report shows a person. It does not run anything: the live path runs these
 * functions where it always did, and the candidate loop runs its own. What a
 * contract adds is the description the brief asks for -- purpose, inputs,
 * outputs, guarantees, cost, risk, side effects, failure modes -- and one
 * honest `available()`.
 *
 * COST IS 'unknown' UNTIL MEASURED. M5 measures. A number written here would
 * be a guess dressed as a fact.
 */
import type { MeasuredCost } from './cost.ts'

/** What this server has. The handler fills it in from its options. */
export interface Has {
  readonly model: 'none' | 'chat' | 'decide' | 'chat-and-decide'
  readonly search: boolean
  readonly aliases: boolean
  readonly lessons: boolean
  readonly evidence: boolean
  readonly misconceptions: boolean
  readonly concepts: boolean
  readonly verifiedTopics: number
}

export type Need = keyof Has

export interface Contract {
  readonly name: string
  readonly purpose: string
  readonly inputs: string
  readonly outputs: string
  readonly guarantees: readonly string[]
  /** Measured by recorded runs (see `cost.ts`); 'unknown' until one did. */
  readonly cost: MeasuredCost | 'unknown'
  readonly risk: 0 | 1 | 2
  readonly sideEffects: 'none' | 'writes memory' | 'network' | 'model'
  readonly failureModes: readonly string[]
  /** Which parts of `Has` this contract cannot do without. */
  readonly needs: readonly Need[]
  available(): { ok: true } | { ok: false; because: string }
}

export interface Registry {
  list(): readonly Contract[]
  get(name: string): Contract | undefined
}

type Described = Omit<Contract, 'available' | 'cost'>

const CONTRACTS: readonly Described[] = [
  { name: 'candidate-agent', purpose: 'understand a request, choose capabilities, answer, verify, and say what it turned down', inputs: 'the question, as typed', outputs: 'a proposal: actions, unknowns, the plan with its rejections, a trace', guarantees: ['every capability decision carries a reason', 'a blocking ambiguity becomes a question, never a guess'], risk: 1, sideEffects: 'model', failureModes: ['no reasoner: nothing is proposed and the Unknown says so', 'a JSON-mode reply without the agreed key: no answer, an Unknown'], needs: ['model'] },
  { name: 'legacy-decision', purpose: 'the live five-action chooser and its veto, as one signal', inputs: 'what she said, the lesson she is in, what she was already shown', outputs: 'one of five actions with a reason; a veto in its own words', guarantees: ['a veto is never a dead end: what the app would do instead is named'], risk: 0, sideEffects: 'model', failureModes: ['no chooser model: an Unknown, no decision invented', 'an unparseable reply falls back to the rule-based decision'], needs: ['model'] },
  { name: 'reason', purpose: 'when the rules read a request as unclear, name which capabilities to compose and why', inputs: 'the question, the rules\' reading, these contracts', outputs: 'a composition with a reason per capability, or Unknowns', guarantees: ['asked only when the reading is unclear by the router\'s own rule', 'a capability that does not exist or is unavailable is an Unknown, never composed'], risk: 0, sideEffects: 'model', failureModes: ['a reply that is not the agreed shape: an Unknown in its own words'], needs: ['model'] },
  { name: 'diagnose', purpose: 'turn a plea into competing hypotheses about WHY it did not land', inputs: 'the concept, her evidence, beliefs she may hold, what was taught, attempts, moves already used', outputs: 'ranked hypotheses with confidence and the words that raised them', guarantees: ['never certain: competing hypotheses, never one verdict', 'a learner who is answering is diagnosed with nothing'], risk: 0, sideEffects: 'none', failureModes: ['when nothing points anywhere, the two failures re-explaining cannot fix are named at guess confidence'], needs: [] },
  { name: 'teaching-strategy', purpose: 'choose the next teaching move from the diagnosis and the moves already spent', inputs: 'the teaching state', outputs: 'one of the strategies, and its instruction for the writer', guarantees: ['a move already spent on this learner is never served again'], risk: 0, sideEffects: 'none', failureModes: ['every move spent: the ladder falls back to its last rung'], needs: [] },
  { name: 'arithmetic-check', purpose: 'recompute every sum a lesson states', inputs: 'the lesson\'s blocks', outputs: 'the wrong sums, each with the right answer', guarantees: ['what it cannot read it leaves alone rather than guessing'], risk: 0, sideEffects: 'none', failureModes: ['a formula with letters, a rounded answer or a date range is not checked'], needs: [] },
  { name: 'claim-check', purpose: 'do two INDEPENDENT sources agree on a claim', inputs: 'a claim and the sources read', outputs: 'agreement in words; a single-source claim says so', guarantees: ['agreement needs two different domains, never one page twice'], risk: 0, sideEffects: 'none', failureModes: ['no sources read: could-not-check, which is not agreement'], needs: [] },
  { name: 'assurance', purpose: 'after a lesson is shown, the evidence that says look at it again', inputs: 'what is on the canvas and what she has said', outputs: 'suspicions, each naming its signal', guarantees: ['evidence-driven, never a timer', 'a lesson already questioned or corrected is never queued again'], risk: 0, sideEffects: 'none', failureModes: ['a source that changed is reported only when a caller re-fetched it'], needs: [] },
  { name: 'prerequisites', purpose: 'does THIS learner lack a listed prerequisite, from what she observably did', inputs: 'the listed prerequisites and her evidence', outputs: 'the blockers, ranked', guarantees: ['subject-scoped', 'answered-on is never retaught'], risk: 0, sideEffects: 'none', failureModes: ['no evidence store: nothing is known, nothing is blocked'], needs: ['evidence'] },
  { name: 'priority', purpose: 'what she should do NEXT, from the curriculum graph and her evidence, with the reason', inputs: 'the syllabus and her evidence', outputs: 'the next best topic and one sentence why', guarantees: ['derived every time, never stored', 'no mastery number is invented'], risk: 0, sideEffects: 'none', failureModes: ['no evidence store: the curriculum order alone'], needs: ['evidence'] },
  { name: 'misconceptions', purpose: 'beliefs she may hold, as revisable hypotheses carried across topics', inputs: 'a concept and what was observed', outputs: 'the hypotheses with confidence, status and interventions tried', guarantees: ['the same belief seen again gains evidence, never a second record'], risk: 0, sideEffects: 'writes memory', failureModes: ['no store: nothing is remembered and the brief says so'], needs: ['misconceptions'] },
  { name: 'evidence', purpose: 'what she typed, when, as what it observably is', inputs: 'a statement and its place', outputs: 'the record', guarantees: ['never a mark, never a score'], risk: 0, sideEffects: 'writes memory', failureModes: ['no store: nothing is filed'], needs: ['evidence'] },
  { name: 'concept-identity', purpose: 'two wordings of one concept resolve to one concept', inputs: 'what she said', outputs: 'the concept id and how near it was', guarantees: ['two measured bands; below them, new ground'], risk: 0, sideEffects: 'network', failureModes: ['Ollama absent: every question is new ground, and nothing else changes'], needs: ['concepts'] },
  { name: 'search', purpose: 'pages from the open web about the subject, at her level', inputs: 'the question and its scope', outputs: 'pages judged on their own text, with agreement across domains', guarantees: ['a bot wall is marked, never cited', 'a page that says nothing about the subject is never fetched'], risk: 1, sideEffects: 'network', failureModes: ['the engine is down or past its deadline: ungrounded, and the lesson says so', 'one engine answering is not the web'], needs: ['search'] },
  { name: 'knowledge', purpose: 'what is inside a topic, verified against the locked syllabus', inputs: 'a topic id', outputs: 'the knowledge model, or nothing', guarantees: ['a candidate model is never served', 'an atomic topic has no invented parts'], risk: 0, sideEffects: 'none', failureModes: ['no verified model for the topic: nothing, not a placeholder'], needs: ['verifiedTopics'] },
  { name: 'alias-shelf', purpose: 'what a phrasing was already decided to mean', inputs: 'the context and what she said', outputs: 'the subject, or nothing', guarantees: ['learned only from a decision that was made'], risk: 0, sideEffects: 'writes memory', failureModes: ['no shelf: every phrasing is undecided'], needs: ['aliases'] },
  { name: 'lesson-shelf', purpose: 'a lesson already written for a subject, not yet seen by her', inputs: 'the subject and what she was shown', outputs: 'a written lesson, or nothing', guarantees: ['a salvaged lesson is never put on the shared shelf'], risk: 0, sideEffects: 'writes memory', failureModes: ['no shelf: every lesson is written afresh'], needs: ['lessons'] },
]

function missing(has: Has, need: Need): string | null {
  switch (need) {
    case 'model': return has.model === 'none' ? 'no model with chat or decide is configured on this server' : null
    case 'search': return has.search ? null : 'no search endpoint is configured'
    case 'aliases': return has.aliases ? null : 'the alias shelf store is not configured'
    case 'lessons': return has.lessons ? null : 'the lesson shelf store is not configured'
    case 'evidence': return has.evidence ? null : 'the evidence store is not configured'
    case 'misconceptions': return has.misconceptions ? null : 'the misconceptions store is not configured'
    case 'concepts': return has.concepts ? null : 'the concept index (ollama embeddings) is not configured'
    case 'verifiedTopics': return has.verifiedTopics > 0 ? null : 'no verified knowledge model is loaded for any topic'
  }
}

export function capabilityRegistry(has: Has, measured: () => ReadonlyMap<string, MeasuredCost> = () => new Map()): Registry {
  /* A LIVE VIEW: costs are read when the registry is read, so a contract's
     cost is whatever the runs have measured by then. */
  const contracts = (): readonly Contract[] => CONTRACTS.map((c) => ({
    ...c,
    cost: measured().get(c.name) ?? 'unknown',
    available() {
      const gaps = c.needs.map((n) => missing(has, n)).filter((m): m is string => m !== null)
      return gaps.length === 0 ? { ok: true } : { ok: false, because: gaps.join('; ') }
    },
  }))
  return { list: contracts, get: (name) => contracts().find((c) => c.name === name) }
}
