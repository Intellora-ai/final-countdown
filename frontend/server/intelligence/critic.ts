/**
 * THE CRITIC -- the reasoner in its second mode: not writing, judging. Asked
 * only about an accepted risk-2 artifact, in shadow, off the request path.
 * JSON-mode, read by two keys. A reply that is not the agreed shape, or a
 * chat that throws, is could-not-check in its own words -- never sound.
 */
import type { Critic, Verdict } from './risk.ts'

const VERDICTS: readonly Verdict[] = ['sound', 'unsound', 'could-not-check']

export function criticOn(chat: (system: string, user: string) => Promise<string>): Critic {
  return async (answer, context) => {
    const level = context.classId === null ? 'a school student' : `a class ${context.classId} student`
    const system = [
      `You check one explanation written for ${level}. Judge only whether every statement in it is correct and nothing in it misleads.`,
      'Reply as a JSON object with exactly two keys: "verdict", one of "sound", "unsound", "could-not-check"; and "because", one sentence.',
      'If you are not certain, say could-not-check. Never say sound to be kind.',
    ].join('\n')
    let reply: string
    try {
      reply = await chat(system, answer)
    } catch (error: unknown) {
      return { verdict: 'could-not-check', because: error instanceof Error ? error.message : String(error) }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(reply)
    } catch {
      return { verdict: 'could-not-check', because: `the critic's reply was not JSON: ${reply.slice(0, 60)}` }
    }
    if (typeof parsed !== 'object' || parsed === null) return { verdict: 'could-not-check', because: 'the critic\'s reply was not an object' }
    const it = parsed as Record<string, unknown>
    const verdict = it['verdict']
    const because = it['because']
    if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) {
      return { verdict: 'could-not-check', because: `the critic's verdict was ${JSON.stringify(verdict)}, not one of ${VERDICTS.join(', ')}` }
    }
    return { verdict: verdict as Verdict, because: typeof because === 'string' && because.length > 0 ? because : 'the critic gave no reason' }
  }
}
