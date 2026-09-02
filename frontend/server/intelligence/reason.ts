/**
 * THE `reason` SEAM -- what `understand.ts` documents as "the seam where a
 * model refines a reading the rules found genuinely unclear", never built
 * until now, and built here beside the agent rather than inside it.
 *
 * "The reasoner decides what intelligence is necessary." Given the question,
 * the rules' reading, and the registry's contracts, it names which
 * capabilities to compose and why. It is asked ONLY when the reading is
 * unclear BY THE ROUTER'S OWN RULE (a blocking ambiguity, or ambiguities with
 * a shaky top intent); a clear reading costs no model call. Its reply is
 * JSON-mode and read by one key. A capability it names that does not exist,
 * or is not available here, is an Unknown -- never composed, never dropped
 * in silence.
 */
import type { Understanding } from '../../src/agent/kernel/contracts.ts'
import type { Experience } from './experience.ts'
import type { Unknown } from './LearningIntelligence.ts'
import type { Registry } from './registry.ts'

/** Pinned to `SHAKY` in `src/agent/kernel/router.ts`; a test reads that file and fails the day they drift. */
export const UNCLEAR_BELOW = 0.5

export function isUnclear(u: Understanding): boolean {
  if (u.ambiguities.some((a) => a.blocking)) return true
  const top = u.intents[0]
  return u.ambiguities.length > 0 && (top === undefined || top.confidence < UNCLEAR_BELOW)
}

export interface Composed {
  readonly capability: string
  readonly because: string
}

export interface Reasoned {
  readonly asked: boolean
  readonly compose: readonly Composed[]
  readonly unknowns: readonly Unknown[]
  readonly modelCalls: number
}

export interface ReasonInput {
  readonly question: string
  readonly understanding: Understanding
  readonly registry: Registry
  readonly chat: (system: string, user: string) => Promise<string>
  /** What followed earlier teaching on the topic, when there was any. */
  readonly experience?: Experience
}

const NOT_ASKED: Reasoned = { asked: false, compose: [], unknowns: [], modelCalls: 0 }

export async function reasonAbout(input: ReasonInput): Promise<Reasoned> {
  if (!isUnclear(input.understanding)) return NOT_ASKED

  const offered = input.registry.list().map((c) => {
    const a = c.available()
    const cost = c.cost === 'unknown' ? 'Cost unmeasured.' : `Costs about ${c.cost.ms} ms and ${c.cost.modelCalls} model call(s), measured over ${c.cost.samples} run(s).`
    return `- ${c.name}: ${c.purpose}. ${a.ok ? 'Available.' : `NOT available here: ${a.because}.`} ${cost}`
  })
  const system = [
    'You decide which capabilities a learning system should compose for one request. You choose only from this list; you invent nothing.',
    '',
    ...offered,
    '',
    'Reply as a JSON object with exactly one key, "compose": an array of objects, each with "capability" (a name from the list) and "because" (one sentence).',
  ].join('\n')
  const reading = input.understanding
  const user = [
    `Request: ${input.question}`,
    `The rules read it as: ${reading.intents.map((i) => `${i.kind} (${i.confidence.toFixed(2)}, ${i.because})`).join('; ') || 'nothing certain'}`,
    reading.ambiguities.length > 0 ? `Unclear: ${reading.ambiguities.map((a) => `${a.what}${a.blocking ? ' (blocking)' : ''}`).join('; ')}` : '',
    experienceLine(input.experience),
  ].filter((line) => line.length > 0).join('\n')

  const reply = await input.chat(system, user)
  const read = composeIn(reply)
  if (!read.ok) return { asked: true, compose: [], unknowns: [{ what: 'the reasoner\'s plan', because: read.because, blocking: false }], modelCalls: 1 }

  const compose: Composed[] = []
  const unknowns: Unknown[] = []
  for (const c of read.compose) {
    const contract = input.registry.get(c.capability)
    if (contract === undefined) {
      unknowns.push({ what: `the reasoner named "${c.capability}"`, because: 'no such capability exists in the registry', blocking: false })
      continue
    }
    const a = contract.available()
    if (!a.ok) {
      unknowns.push({ what: `the reasoner wanted ${c.capability}`, because: a.because, blocking: false })
      continue
    }
    compose.push({ capability: c.capability, because: c.because })
  }
  return { asked: true, compose, unknowns, modelCalls: 1 }
}

function composeIn(reply: string): { ok: true; compose: readonly Composed[] } | { ok: false; because: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(reply)
  } catch {
    return { ok: false, because: `the reply is not JSON: ${reply.slice(0, 60)}` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, because: 'the reply is JSON but not an object' }
  const compose = (parsed as Record<string, unknown>)['compose']
  if (!Array.isArray(compose)) return { ok: false, because: `the reply has keys ${Object.keys(parsed).join(', ') || '(none)'} and no "compose" array` }
  const items: Composed[] = []
  for (const item of compose) {
    if (typeof item !== 'object' || item === null) continue
    const it = item as Record<string, unknown>
    if (typeof it['capability'] === 'string' && typeof it['because'] === 'string') items.push({ capability: it['capability'], because: it['because'] })
  }
  return { ok: true, compose: items }
}

function experienceLine(experience: Experience | undefined): string {
  if (experience === undefined || experience.artifacts.length === 0) return ''
  const pleaded = experience.artifacts.filter((a) => a.outcome === 'pleaded')
  const moves = [...new Set(experience.artifacts.flatMap((a) => a.movesSpent))]
  return `Earlier teaching on this topic: ${experience.artifacts.length} earlier lesson(s), ${pleaded.length} followed by a plea${moves.length > 0 ? `; moves already spent: ${moves.join(', ')}` : ''}.`
}
