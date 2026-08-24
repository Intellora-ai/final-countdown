/**
 * FINDINGS IN, AN ANSWER OUT — AND THE ANSWER IS ASSEMBLED, NEVER WRITTEN.
 *
 * §20, §21, §34, §35, §43, and the §45 invariants made executable.
 *
 * WHY THERE IS NO PROSE FIELD, AND WHY THAT IS THE DESIGN
 * ------------------------------------------------------
 * An `Answer` here is findings, citations, gaps and contradictions. It holds no
 * `text`, `summary` or `prose`, and a test asserts their absence. That is not
 * an omission waiting to be filled: this package has no model, so any prose
 * this file produced would be prose it invented, and a fabricated sentence with
 * a real URL attached is the most credible possible lie — strictly worse than
 * no answer, because it survives review.
 *
 * A string field would also be an invitation. Someone adds a model later, fills
 * it in, and every guarantee below still passes because nothing tests the field
 * that did not exist when the tests were written. Leaving the field out is the
 * only version of this that cannot rot.
 *
 * WHY `finalCheck` TAKES AN ANSWER RATHER THAN BUILDING ONE
 * ---------------------------------------------------------
 * A checker that only ever sees output its own module built is satisfied by
 * `return []`. This one is handed deliberately corrupted answers — a citation
 * no claim supports, an `answered` hiding a contradiction, a refusal that still
 * cites — and required to catch each. §45 is a list of invariants; a list
 * nothing evaluates is a comment.
 *
 * WHY A CONTRADICTION CANNOT BE ANSWERED AROUND
 * ---------------------------------------------
 * Invariant 7. More retrieval does not resolve a disagreement, so the tempting
 * move is to call it settled and pick a side. `sufficient()` returns false on
 * any contradiction — not because more searching will help, but because
 * returning true would let the loop stop and report a confident wrong answer,
 * which is the outcome the whole pipeline exists to avoid.
 */

import type { Contradiction, Finding } from './crosscheck'
import type { SearchRequirements } from './interpret'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type AnswerStatus =
  /** Every aspect covered, corroborated as the question required, no dissent. */
  | 'answered'
  /** Real evidence, and a named gap. */
  | 'partial'
  /** Nothing usable. Always carries a reason. */
  | 'refused'

/**
 * §35 — a citation is traceable back to the exact bytes.
 *
 * URL, offset and length, not a page reference. "Reuters said so" cannot be
 * checked; "these 61 characters at offset 4012 of this URL, retrieved at this
 * time" can.
 */
export interface Citation {
  text: string
  sourceUrl: string
  offset: number
  length: number
  retrievedAt: string
}

export interface Answer {
  query: string
  status: AnswerStatus
  /** Present exactly when status is `refused`. */
  refusalReason?: string
  findings: readonly Finding[]
  citations: readonly Citation[]
  /** Aspects with no usable support. Named, never dropped. */
  unresolved: readonly string[]
  contradictions: readonly Contradiction[]
}

export interface AnswerInput {
  engineFailed: boolean
  engineError?: string
}

/* -------------------------------------------------------------------------- */
/* §43 — sufficiency                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Whether more retrieval would be wasted effort.
 *
 * False on ANY contradiction. That looks wrong at first — searching will not
 * un-disagree two sources — but `sufficient` gates the refinement loop, and the
 * loop's own ceiling stops it regardless. Returning true here would instead let
 * the caller treat contested evidence as finished business.
 */
export function sufficient(findings: readonly Finding[], req: SearchRequirements): boolean {
  if (!req.shouldSearch) return true
  if (findings.length === 0) return false
  return findings.every((f) => {
    if (f.contradictions.length > 0) return false
    if (f.claims.length === 0) return false
    return f.independentSources >= req.minSources
  })
}

/* -------------------------------------------------------------------------- */
/* buildAnswer                                                                */
/* -------------------------------------------------------------------------- */

/** Deduplicated, in finding order, so the same span is cited once. */
function citationsFrom(findings: readonly Finding[]): Citation[] {
  const seen = new Set<string>()
  const out: Citation[] = []
  for (const f of findings) {
    for (const c of f.claims) {
      /* A tainted claim is reported inside the finding but never CITED. A
         citation is an assertion that this text supports the answer, and this
         page tried to instruct us. */
      if (c.tainted) continue
      const key = `${c.sourceUrl}|${c.offset}|${c.text}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        text: c.text,
        sourceUrl: c.sourceUrl,
        offset: c.offset,
        length: c.length,
        retrievedAt: c.retrievedAt,
      })
    }
  }
  return out
}

export function buildAnswer(
  req: SearchRequirements,
  findings: readonly Finding[],
  input: AnswerInput,
): Answer {
  const base = { query: req.query, findings, contradictions: findings.flatMap((f) => f.contradictions) }

  /* §42 first: a question we declined to search was never an outage, and
     reporting it as one would send someone looking for a broken engine. */
  if (!req.shouldSearch) {
    return {
      ...base,
      status: 'refused',
      refusalReason: `not searched: ${req.noSearchReason ?? 'unknown'}`,
      citations: [],
      unresolved: [...req.aspects],
    }
  }

  /* §17 — the engine breaking and the world having no answer are opposite
     facts, and only one of them is our fault. */
  if (input.engineFailed) {
    return {
      ...base,
      status: 'refused',
      refusalReason: `search engine failed: ${input.engineError ?? 'unknown error'}`,
      citations: [],
      unresolved: [...req.aspects],
    }
  }

  const citations = citationsFrom(findings)
  const unresolved = findings
    .filter((f) => f.claims.length === 0 || f.independentSources === 0)
    .map((f) => f.aspect)

  if (citations.length === 0) {
    return {
      ...base,
      status: 'refused',
      refusalReason: 'no usable evidence was retrieved',
      citations: [],
      unresolved: unresolved.length > 0 ? unresolved : [...req.aspects],
    }
  }

  /* `answered` is the strong claim and every condition must hold: nothing
     contested, nothing missing, and every covered aspect corroborated to the
     depth §10 said this question needs. Anything less is `partial`, which is
     an honest answer rather than a failed one. */
  const contested = base.contradictions.length > 0
  const underSourced = findings.some(
    (f) => f.claims.length > 0 && f.independentSources < req.minSources,
  )
  const status: AnswerStatus =
    contested || unresolved.length > 0 || underSourced ? 'partial' : 'answered'

  return { ...base, status, citations, unresolved }
}

/* -------------------------------------------------------------------------- */
/* finalCheck — §45 as code                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every violated invariant, by name. Empty means the answer is internally
 * consistent — NOT that it is true, which is not a property this or any code
 * can establish.
 *
 * Runs against an Answer from anywhere, including one that has been modified
 * after construction. That is the point: the builder and the checker must be
 * able to disagree, or the checker is testing the builder's intentions rather
 * than its output.
 */
export function finalCheck(answer: Answer): string[] {
  const violations: string[] = []

  const claimKeys = new Set(
    answer.findings.flatMap((f) => f.claims.map((c) => `${c.sourceUrl}|${c.offset}|${c.text}`)),
  )
  for (const cite of answer.citations) {
    if (!claimKeys.has(`${cite.sourceUrl}|${cite.offset}|${cite.text}`)) {
      /* Invariant 3: a citation must actually support the associated claim.
         A citation with no claim behind it is generated text wearing a URL. */
      violations.push(`citation-without-claim:${cite.sourceUrl}`)
    }
  }

  if (answer.status === 'refused') {
    if (answer.citations.length > 0) violations.push('refusal-with-citations')
    if (!answer.refusalReason) violations.push('refusal-without-reason')
  } else if (answer.refusalReason) {
    violations.push('reason-without-refusal')
  }

  if (answer.status === 'answered') {
    if (answer.contradictions.length > 0) violations.push('answered-with-contradictions')
    if (answer.unresolved.length > 0) violations.push('answered-with-unresolved-aspects')
    if (answer.citations.length === 0) violations.push('answered-without-citations')
  }

  return violations
}
