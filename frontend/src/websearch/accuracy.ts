/**
 * §24 — ANSWER ACCURACY, MEASURED PER ANSWER TYPE.
 *
 * The benchmark corpus scored RETRIEVAL and reported it as quality. That gap
 * was found by reading the corpus, not by a failing test, which is the worst
 * way to find anything: every number it produced was true and none of them was
 * about whether the answer was right.
 *
 * WHY THERE IS NO SINGLE SCORE, AND WHY THAT IS ENFORCED
 * -----------------------------------------------------
 * §24 ends with "There is no single universal accuracy score", and §44 says
 * quality must not be optimised with one number. Those are the same rule twice.
 * A composite invites optimising it, and every per-type signal that disagrees
 * with the composite gets tuned away — the disagreement being exactly the
 * information the composite was hiding.
 *
 * So this module exports no `score`, `overall` or `total`, and a test asserts
 * their ABSENCE. Without that assertion a helper added next month passes every
 * other test in the file, because nothing tests a function that does not exist.
 *
 * WHY DISTORTION IS THE MOST VALUABLE THING HERE
 * ----------------------------------------------
 * Invariant 3: a citation must actually support the associated claim. An answer
 * that reports 7.8 while citing a span reading 2.1 is not a wrong answer — it
 * is a wrong answer wearing a real source, and it survives review precisely
 * because the URL resolves and the page is real. Every citation is therefore
 * matched back to a claim by url+offset+text, and a citation with no claim
 * behind it is reported as a distortion rather than scored.
 *
 * WHY A REFUSAL NEEDS TWO OUTCOMES
 * --------------------------------
 * Refusing a question that has no answer is CORRECT. Refusing one that does is
 * a miss. Collapsing them scores a system that refuses everything as perfect on
 * the unanswerable half and invisible on the rest — the cheapest possible way
 * to look good.
 */

import type { Answer } from './answer'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type AnswerType = 'factual' | 'numeric' | 'list' | 'comparative' | 'summary'

export interface Relationship {
  subject: string
  relation: string
  object: string
}

export interface Expectation {
  type: AnswerType
  /** The true value, for numeric answers. */
  value?: number
  /** What a correct answer must contain, for factual, list and summary answers. */
  facts?: readonly string[]
  relationships?: readonly Relationship[]
  /** True when the question genuinely has no answer. */
  unanswerable?: boolean
}

export type Outcome =
  /** Scored normally. */
  | 'graded'
  /** Refused, and there was nothing to find. Correct. */
  | 'correct-refusal'
  /** Refused, but an answer existed. A miss. */
  | 'missed-answerable'
  /** Answered a question with no answer. Worse than a miss. */
  | 'answered-unanswerable'
  /** Answered, but only a flagged source carried it. Invariant 5. */
  | 'unsupported'

export interface NumericAccuracy {
  absoluteError: number
  /** Absent when the true value is zero — see below. */
  relativeError?: number
}

export interface ListAccuracy {
  precision?: number
  recall?: number
  coverage?: number
}

export interface FactualAccuracy {
  correct: number
  evaluated: number
  ratio?: number
}

export interface ComparativeAccuracy {
  correct: number
  total: number
}

export interface SummaryAccuracy {
  supported: number
  total: number
  omissionRate?: number
  distortionRate?: number
}

export interface Grade {
  outcome: Outcome
  numeric?: NumericAccuracy
  list?: ListAccuracy
  factual?: FactualAccuracy
  comparative?: ComparativeAccuracy
  summary?: SummaryAccuracy
  /** Citations no claim supports. Invariant 3. */
  distortions: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const YEAR = /\b(1[0-9]{3}|20[0-9]{2})\b/g
const NUMBER = /-?\d+(?:\.\d+)?/g

/** Figures, excluding years — a date is not a quantity. */
function figuresIn(text: string): number[] {
  return (text.replace(YEAR, ' ').match(NUMBER) ?? []).map(Number).filter(Number.isFinite)
}

const norm = (s: string) => s.toLowerCase()

/* -------------------------------------------------------------------------- */
/* grade                                                                      */
/* -------------------------------------------------------------------------- */

export function grade(answer: Answer, expectation: Expectation): Grade {
  /* Invariant 3 first, because a distorted citation must be reported whatever
     else the grade says about the figures. */
  const claimKeys = new Set(
    answer.findings.flatMap((f) => f.claims.map((c) => `${c.sourceUrl}|${c.offset}|${c.text}`)),
  )
  const distortions = answer.citations
    .filter((c) => !claimKeys.has(`${c.sourceUrl}|${c.offset}|${c.text}`))
    .map((c) => `${c.sourceUrl}@${c.offset}`)

  if (answer.status === 'refused') {
    return {
      outcome: expectation.unanswerable ? 'correct-refusal' : 'missed-answerable',
      distortions,
    }
  }

  if (expectation.unanswerable) {
    return { outcome: 'answered-unanswerable', distortions }
  }

  /* Invariant 5 — a fact only a flagged page carries is not supported evidence,
     however correct it happens to be. */
  const allClaims = answer.findings.flatMap((f) => f.claims)
  const untainted = allClaims.filter((c) => !c.tainted)
  if (allClaims.length > 0 && untainted.length === 0) {
    return { outcome: 'unsupported', distortions }
  }

  const citedText = answer.citations.map((c) => norm(c.text))
  const base: Grade = { outcome: 'graded', distortions }

  switch (expectation.type) {
    case 'numeric': {
      const truth = expectation.value ?? 0
      const figures = citedText.flatMap((t) => figuresIn(t))
      /* No figure is NOT a perfect score. The obvious implementation leaves the
         error at zero when nothing was found, so a silent answer grades better
         than a wrong one — a system that says nothing would top the benchmark. */
      const closest =
        figures.length === 0
          ? undefined
          : figures.reduce((best, f) =>
              Math.abs(f - truth) < Math.abs(best - truth) ? f : best,
            )
      const absoluteError = closest === undefined ? Number.POSITIVE_INFINITY : Math.abs(closest - truth)
      /* Dividing by the truth produces Infinity or NaN exactly when the true
         value is zero, and that number then poisons every average computed
         downstream. Absent is the honest value. */
      const relativeError =
        truth === 0 || closest === undefined ? undefined : Math.abs(closest - truth) / Math.abs(truth)
      return {
        ...base,
        numeric: { absoluteError, ...(relativeError === undefined ? {} : { relativeError }) },
      }
    }

    case 'list': {
      const facts = (expectation.facts ?? []).map(norm)
      const items = citedText
      const matched = items.filter((i) => facts.some((f) => i.includes(f)))
      const found = facts.filter((f) => items.some((i) => i.includes(f)))
      return {
        ...base,
        list: {
          ...(items.length === 0 ? {} : { precision: matched.length / items.length }),
          ...(facts.length === 0 ? {} : { recall: found.length / facts.length }),
          ...(facts.length === 0 ? {} : { coverage: found.length / facts.length }),
        },
      }
    }

    case 'comparative': {
      const rels = expectation.relationships ?? []
      /* The RELATIONSHIP is what is graded, not the vocabulary. Both directions
         mention every word; only the ORDER distinguishes "LIFO is higher than
         FIFO" from its reverse, so a bag-of-words check would score a
         backwards answer as correct. */
      const correct = rels.filter((r) =>
        citedText.some((t) => {
          const s = t.indexOf(norm(r.subject))
          const rel = t.indexOf(norm(r.relation))
          const o = t.indexOf(norm(r.object))
          return s >= 0 && rel > s && o > rel
        }),
      ).length
      return { ...base, comparative: { correct, total: rels.length } }
    }

    case 'summary': {
      const facts = (expectation.facts ?? []).map(norm)
      const supported = facts.filter((f) => citedText.some((t) => t.includes(f))).length
      return {
        ...base,
        summary: {
          supported,
          total: facts.length,
          /* Omission and distortion are separate numbers because they are
             separate failures: one leaves the reader without a fact, the other
             gives them a false one. An average of the two hides which. */
          ...(facts.length === 0 ? {} : { omissionRate: 1 - supported / facts.length }),
          ...(answer.citations.length === 0
            ? {}
            : { distortionRate: distortions.length / answer.citations.length }),
        },
      }
    }

    default: {
      const facts = (expectation.facts ?? []).map(norm)
      const correct = facts.filter((f) => citedText.some((t) => t.includes(f))).length
      return {
        ...base,
        factual: {
          correct,
          evaluated: facts.length,
          ...(facts.length === 0 ? {} : { ratio: correct / facts.length }),
        },
      }
    }
  }
}
