import type {
  Claim,
  Understanding,
  Verification,
  VerificationKind,
} from '../kernel/contracts'
import { evaluate } from '../tools/tools'
import { overlap, tokens } from '../kernel/text'

/**
 * CHECKING, AND KNOWING WHEN NOT TO ANSWER --- Capabilities 23, 24, 31.
 *
 * THE RULE THAT MAKES THIS WORTH HAVING
 * -------------------------------------
 * A verification that cannot fail is not a verification. Every check below can
 * return `passed: false` for some real input, and each one names WHAT it
 * checked in `detail` --- because a `Verification` with an empty detail is
 * indistinguishable from a claim that verification happened, and that is the
 * exact shape of the dishonesty this layer exists to prevent.
 *
 * So there is no `verifyGenerally()`. Verification is a set of specific checks
 * that apply when the answer has a specific checkable property, and an answer
 * with none of those properties gets NO verifications rather than a
 * reassuring empty pass.
 *
 * UNCERTAINTY IS AN ACTION SELECTOR, NOT A CONFIDENCE NUMBER
 * ----------------------------------------------------------
 * "Do not optimize for always answering. Optimize for correct action
 * selection." A system that reports 0.4 confidence and answers anyway has not
 * followed that instruction --- it has decorated the failure. `decide` returns
 * one of six ACTIONS, and `answer` is only one of them.
 */

/* -------------------------------------------------------------------------- */
/* Individual checks --- Capability 24                                        */
/* -------------------------------------------------------------------------- */

function check(kind: VerificationKind, passed: boolean, detail: string): Verification {
  return { kind, passed, detail }
}

/**
 * Recompute the arithmetic and compare.
 *
 * THE MOST VALUABLE CHECK IN THE FILE, because a wrong number is the failure
 * users are least able to catch. Prose that is subtly wrong reads as odd;
 * "17.5% of 2400 = 380" reads as authoritative.
 */
export function verifyArithmetic(expression: string, stated: number, tolerance = 1e-9): Verification {
  let actual: number
  try {
    actual = evaluate(expression)
  } catch (e) {
    return check('arithmetic', false, `could not evaluate "${expression}": ${e instanceof Error ? e.message : e}`)
  }
  const ok = Math.abs(actual - stated) <= Math.max(tolerance, Math.abs(actual) * 1e-9)
  return check(
    'arithmetic',
    ok,
    ok ? `${expression} = ${actual}, matches` : `${expression} = ${actual}, but the answer said ${stated}`,
  )
}

/**
 * Does every claim that needs a source have one?
 *
 * Model knowledge is allowed to stand unsourced; a WEB claim that lost its
 * citation is not. That asymmetry is the point --- an uncited sentence sitting
 * beside cited ones inherits their authority without earning it.
 */
export function verifySources(claims: readonly Claim[]): Verification {
  const naked = claims.filter((c) => c.sources.length === 0)
  const webOnly = claims.filter((c) => c.sources.every((s) => s.kind === 'model'))
  const bad = [...new Set([...naked, ...webOnly.filter((c) => c.confidence > 0.7)])]
  return check(
    'source',
    naked.length === 0,
    naked.length === 0
      ? `${claims.length} claims, all attributed${bad.length > 0 ? `; ${bad.length} rest on model knowledge alone` : ''}`
      : `${naked.length} of ${claims.length} claims have no source`,
  )
}

/**
 * Did the answer honour what the user asked for?
 *
 * Only constraints that can be MECHANICALLY checked are checked. "Explain it
 * simply" is a real constraint and this cannot verify it; claiming otherwise
 * would be the empty-pass failure. Length limits and prohibitions can be, and
 * are.
 */
export function verifyConstraints(answer: string, constraints: readonly string[]): Verification[] {
  const out: Verification[] = []

  for (const c of constraints) {
    const limit = c.match(/\b(\d+)\s*(words|sentences|lines|bullets)\b/i)
    if (limit) {
      const n = Number(limit[1])
      const unit = (limit[2] ?? '').toLowerCase()
      const actual =
        unit === 'words' ? (answer.trim().match(/\S+/g) ?? []).length
          : unit === 'sentences' ? (answer.match(/[.!?](\s|$)/g) ?? []).length
            : unit === 'lines' ? answer.trim().split('\n').length
              : (answer.match(/^\s*[-*•]/gm) ?? []).length
      out.push(
        check('constraint', actual <= n, `asked for at most ${n} ${unit}; produced ${actual}`),
      )
      continue
    }

    const banned = c.match(/\b(?:don'?t|do not|without|avoid|no)\s+(?:use\s+|using\s+|mention(?:ing)?\s+)?([a-z][a-z ]{2,30})/i)
    if (banned?.[1]) {
      const word = banned[1].trim().split(/\s+/)[0] as string
      const present = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(answer)
      out.push(check('constraint', !present, present ? `answer contains "${word}", which was excluded` : `"${word}" correctly absent`))
    }
  }
  return out
}

/**
 * Does the answer actually address the goal?
 *
 * Lexical overlap is a weak signal and is treated as one --- the threshold is
 * low, and this is here to catch the gross failure (an answer about a
 * different subject entirely) rather than to grade relevance. Setting it high
 * would fail correct answers that use different vocabulary, which is most good
 * explanations.
 */
export function verifyAddressesGoal(answer: string, goal: string): Verification {
  const score = overlap(tokens(goal), tokens(answer))
  return check(
    'logical',
    score > 0.15,
    score > 0.15
      ? `answer shares subject vocabulary with the request (${score.toFixed(2)})`
      : `answer does not appear to be about the request (${score.toFixed(2)})`,
  )
}

/** Does the answer contradict something the user already corrected? */
export function verifyNoContradiction(answer: string, corrections: readonly string[]): Verification {
  const hit = corrections.find((c) => overlap(tokens(c), tokens(answer)) > 0.6)
  return check(
    'cross-check',
    hit === undefined,
    hit === undefined
      ? `no overlap with ${corrections.length} recorded corrections`
      : `answer repeats something the user corrected: "${hit}"`,
  )
}

/* -------------------------------------------------------------------------- */
/* The repair loop                                                            */
/* -------------------------------------------------------------------------- */

export interface Repairable {
  answer: string
  claims: readonly Claim[]
}

export type Repair = (subject: Repairable, failures: readonly Verification[]) => Promise<Repairable>

export interface VerifyResult {
  subject: Repairable
  verifications: readonly Verification[]
  passed: boolean
  rounds: number
}

/**
 * GENERATE -> CHECK -> DETECT -> REPAIR -> CHECK AGAIN.
 *
 * Bounded, and it reports the round count. An unbounded repair loop against a
 * check the repairer cannot satisfy runs forever; one that hides the round
 * count makes "it took four attempts" invisible, and four attempts is exactly
 * the signal that the approach is wrong rather than the output.
 *
 * On giving up it returns the LAST attempt with its failures still attached,
 * not the original. The partially repaired answer is usually better, and the
 * failures travel with it so nothing downstream can mistake it for verified.
 */
export async function verifyAndRepair(
  subject: Repairable,
  checks: (s: Repairable) => readonly Verification[],
  repair: Repair,
  maxRounds = 2,
): Promise<VerifyResult> {
  let current = subject
  let verifications = checks(current)
  let rounds = 0

  while (verifications.some((v) => !v.passed) && rounds < maxRounds) {
    rounds++
    const failures = verifications.filter((v) => !v.passed)
    try {
      current = await repair(current, failures)
    } catch {
      /* A repairer that throws leaves the last good attempt standing. Losing
         the answer entirely because the fixer broke is strictly worse than
         returning an unrepaired answer with honest failures attached. */
      break
    }
    verifications = checks(current).map((v) => (v.passed ? { ...v, repaired: true } : v))
  }

  return {
    subject: current,
    verifications,
    passed: verifications.every((v) => v.passed),
    rounds,
  }
}

/* -------------------------------------------------------------------------- */
/* Uncertainty --- Capability 23                                              */
/* -------------------------------------------------------------------------- */

export type Action = 'answer' | 'search' | 'calculate' | 'ask' | 'qualify' | 'decline'

export interface Situation {
  /** A blocking ambiguity means we do not know what is being asked about. */
  understanding: Understanding
  /** Evidence gathered so far. Empty is meaningful, not neutral. */
  claims: readonly Claim[]
  /** True when research ran and reported thin or split evidence. */
  evidenceInsufficient: boolean
  /** True when the question is about the current world. */
  timeSensitive: boolean
  /** True when a search has already been attempted. */
  searched: boolean
  /** True when arithmetic is present and has not been executed. */
  uncomputed: boolean
  /** Knowledge cutoff vs. the question's period, when both are known. */
  beyondKnowledge?: boolean
}

export interface Decision {
  action: Action
  because: string
}

/**
 * What to DO about not being sure.
 *
 * Ordered by how badly the alternative fails. Asking beats searching for the
 * wrong thing; searching beats asserting stale facts; qualifying beats a bare
 * confident claim on split evidence; declining beats inventing.
 */
export function decide(s: Situation): Decision {
  const blocking = s.understanding.ambiguities.find((a) => a.blocking)
  if (blocking) {
    return { action: 'ask', because: `we do not know what is being referred to: ${blocking.what}` }
  }

  if (s.uncomputed) {
    return { action: 'calculate', because: 'there is arithmetic here and a computed number beats a recalled one' }
  }

  if ((s.timeSensitive || s.beyondKnowledge) && !s.searched) {
    return {
      action: 'search',
      because: s.beyondKnowledge
        ? 'the question is about a period after what the model reliably knows'
        : 'the answer depends on the current state of the world',
    }
  }

  const conflicted = s.claims.find((c) => c.conflict)
  if (conflicted) {
    /* QUALIFY, NOT ANSWER. The disagreement reaches the user. Picking the
       better-sourced number and presenting it alone is the laundering this
       whole path exists to prevent. */
    return { action: 'qualify', because: `sources disagree: ${conflicted.conflict}` }
  }

  if (s.searched && s.claims.length === 0) {
    /* We looked and found nothing. Falling back to model knowledge here is
       the worst option available: it answers a question we just established
       we have no current information about, in the confident voice of
       something that did research. */
    return { action: 'decline', because: 'a search was run and returned nothing usable' }
  }

  if (s.evidenceInsufficient) {
    return { action: 'qualify', because: 'the evidence is too thin to state flatly' }
  }

  const top = s.understanding.intents[0]
  if (top && top.confidence < 0.35) {
    return { action: 'ask', because: 'no reading of the request is confident enough to act on' }
  }

  return { action: 'answer', because: 'the request is clear and the evidence supports an answer' }
}

/* -------------------------------------------------------------------------- */
/* Self-monitoring --- Capability 31                                          */
/* -------------------------------------------------------------------------- */

export interface SelfCheck {
  question: string
  ok: boolean
  detail: string
}

/**
 * The brief's own self-inspection list, run as checks rather than recited.
 *
 * Each entry is a question from section 32 that can be answered from the
 * artifacts actually present. Questions that CANNOT be answered mechanically
 * ("did I over-explain?") are answered from measurable proxies, and the proxy
 * is named in `detail` so nobody mistakes it for a judgement about quality.
 */
export function selfCheck(input: {
  understanding: Understanding
  answer: string
  claims: readonly Claim[]
  verifications: readonly Verification[]
  capabilitiesUsed: readonly string[]
  corrections: readonly string[]
}): SelfCheck[] {
  const { understanding: u, answer, claims, verifications } = input
  const words = (answer.trim().match(/\S+/g) ?? []).length

  const out: SelfCheck[] = [
    {
      question: 'Did I answer the actual question?',
      ...bool(
        verifyAddressesGoal(answer, u.goal).passed,
        'answer shares the request’s subject vocabulary',
        'answer does not appear to be about the request',
      ),
    },
    {
      question: 'Did I obey the stated constraints?',
      ...(() => {
        const cs = verifyConstraints(answer, u.constraints)
        const failed = cs.filter((c) => !c.passed)
        return bool(
          failed.length === 0,
          cs.length === 0 ? 'no mechanically checkable constraints were given' : `${cs.length} checked, all held`,
          failed.map((f) => f.detail).join('; '),
        )
      })(),
    },
    {
      question: 'Did I contradict prior context?',
      ...bool(
        verifyNoContradiction(answer, input.corrections).passed,
        'no overlap with recorded corrections',
        'answer repeats something the user corrected',
      ),
    },
    {
      question: 'Did I make unsupported claims?',
      ...bool(
        claims.every((c) => c.sources.length > 0),
        `${claims.length} claims, all attributed`,
        `${claims.filter((c) => c.sources.length === 0).length} claims have no source`,
      ),
    },
    {
      question: 'Did I verify what could be verified?',
      ...(() => {
        /* The check that catches the empty pass: an answer containing a number
           with no arithmetic verification has skipped the one check that
           mattered most. */
        const hasNumber = /\b\d+(\.\d+)?\b/.test(answer)
        const checkedArithmetic = verifications.some((v) => v.kind === 'arithmetic')
        return bool(
          !hasNumber || checkedArithmetic,
          verifications.length === 0 ? 'nothing here had a verification path' : `${verifications.length} checks ran`,
          'the answer states a number that was never recomputed',
        )
      })(),
    },
    {
      question: 'Did I over-explain?',
      ...bool(
        !(u.intents[0]?.kind === 'conversation' && words > 80),
        `${words} words`,
        `${words} words for what was read as ordinary conversation`,
      ),
    },
    {
      question: 'Did I under-explain?',
      ...bool(
        !(u.intents[0]?.kind === 'explanation' && words < 15),
        `${words} words`,
        `${words} words for a request to explain something`,
      ),
    },
  ]

  return out
}

function bool(ok: boolean, whenOk: string, whenNot: string): { ok: boolean; detail: string } {
  return { ok, detail: ok ? whenOk : whenNot }
}
