import { crossCheck, type Finding } from './crosscheck'
import { extractClaims, rankEvidence, type Claim } from './evidence'
import type { Retrieved } from './gather'
import { interpret, type SearchRequirements } from './interpret'

/**
 * CLAIM CHECKING. The step that decides whether an answer may be shown at all.
 *
 * WHAT THIS IS NOT, AND THE WHOLE DESIGN FOLLOWS FROM IT
 * ------------------------------------------------------
 * It is not a writer. Nothing here composes, summarises or paraphrases a
 * sentence about the subject. It reads the pages that came back, compares what
 * they say about the question's aspects, and returns a LABEL plus the ids of
 * the pages that earned it. The words a learner finally reads are copied out of
 * one page byte for byte, and this module's only job is deciding whether that
 * is allowed and which page it comes from.
 *
 * That boundary is the safety argument, and it is the same one `doubt.ts` and
 * `webResolver.ts` rest on: something that cannot write a sentence about the
 * subject cannot write a wrong one. A verifier that could rephrase would be
 * able to introduce a claim no source made, which is precisely the failure
 * verification exists to prevent.
 *
 * WHY RANKING IS NOT VERIFICATION
 * -------------------------------
 * A search engine returns its best guess first whether or not it has one. "The
 * top result said so" is therefore not evidence, and a system that treats
 * position as truth repeats whatever is best at SEO with total confidence.
 * Two INDEPENDENT publishers agreeing is evidence. One publisher is a single
 * source, and it is labelled as one rather than promoted.
 *
 * WHY THIS FILE IS THIN
 * ---------------------
 * `interpret`, `evidence` and `crosscheck` already did all of this and were
 * reached by nothing that ships. What is genuinely only here is the ORDER, and
 * the translation of `Agreement` into the four words the canvas renders.
 */

export type ClaimStatus =
  /** Relevant evidence from at least two independent publishers. */
  | 'supported'
  /** Relevant sources say materially inconsistent things. Outranks agreement. */
  | 'conflicting'
  /** Exactly one independent, untainted voice. Never shown as verified. */
  | 'single-source'
  /** Nothing comparable came back. NOT proof the claim is false. */
  | 'unknown'

export interface ClaimCheck {
  readonly status: ClaimStatus
  /** Page urls whose claims earned the label. Never invented. */
  readonly supportingEvidenceIds: readonly string[]
  /** Page urls on either side of a disagreement. */
  readonly conflictingEvidenceIds: readonly string[]
}

interface Checked {
  readonly req: SearchRequirements
  readonly claims: readonly Claim[]
  readonly findings: readonly Finding[]
}

function analyse(pages: readonly Retrieved[], query: string): Checked {
  const req = interpret(query)
  /*
   * NO `ok` / EMPTY-TEXT FILTER HERE, AND ITS ABSENCE IS DELIBERATE.
   *
   * One was written first: `pages.filter((p) => p.ok && p.text.trim())`. It was
   * removed after mutation testing showed deleting it changed nothing — every
   * test still passed. `extractClaims` opens with exactly those two guards, for
   * exactly the stated reason ("a failed fetch has an empty text, and mining it
   * would report zero claims, which is what a page with nothing to say also
   * reports"). Two copies of one rule is one rule and one decoration, and the
   * decoration is what the next reader wastes time on.
   */
  const claims = rankEvidence(
    pages.flatMap((p) => extractClaims(p, req)),
    req,
  )
  return { req, claims, findings: crossCheck(claims, req) }
}

/** Distinct source urls behind a set of claims, tainted ones excluded. */
function idsOf(claims: readonly Claim[]): string[] {
  return [...new Set(claims.filter((c) => !c.tainted).map((c) => c.sourceUrl))]
}

/**
 * Which of the four words describes what came back.
 *
 * ORDER IS THE POLICY, AND CONTRADICTION COMES FIRST UNCONDITIONALLY. A figure
 * two sources support and a third denies is CONTESTED. Reporting it as
 * supported would be true about the majority and useless to the learner, who
 * would have no way to know a disagreement existed.
 *
 * `unknown` is last and it means "nothing here could be compared". It is not a
 * claim that the answer is false, and nothing downstream may present it as one.
 */
export function checkClaims(pages: readonly Retrieved[], query: string): ClaimCheck {
  const { findings } = analyse(pages, query)

  const contradicted = findings.filter((f) => f.agreement === 'contradicted')
  if (contradicted.length > 0) {
    const sides = contradicted.flatMap((f) =>
      f.contradictions.flatMap((c) => [c.a.sourceUrl, c.b.sourceUrl]),
    )
    return {
      status: 'conflicting',
      supportingEvidenceIds: [],
      conflictingEvidenceIds: [...new Set(sides)],
    }
  }

  const corroborated = findings.filter((f) => f.agreement === 'corroborated')
  if (corroborated.length > 0) {
    return {
      status: 'supported',
      supportingEvidenceIds: idsOf(corroborated.flatMap((f) => [...f.claims])),
      conflictingEvidenceIds: [],
    }
  }

  const single = findings.filter((f) => f.agreement === 'single')
  if (single.length > 0) {
    return {
      status: 'single-source',
      supportingEvidenceIds: idsOf(single.flatMap((f) => [...f.claims])),
      conflictingEvidenceIds: [],
    }
  }

  return { status: 'unknown', supportingEvidenceIds: [], conflictingEvidenceIds: [] }
}

/**
 * The one span that will be shown, copied out of one page.
 *
 * A SPAN, NOT THE PAGE. The alternative — quote the first N characters of the
 * best page — makes the answer a function of where the page happens to start,
 * and forces a truncation that breaks byte-identity with the source. A claim is
 * already a whole sentence that mentions the question's aspects, so quoting one
 * is both more useful and exactly copyable.
 *
 * TAINTED CLAIMS ARE NEVER ELIGIBLE. A page carrying text aimed at this
 * software may not become the sentence a learner reads, however well it matches.
 */
export function selectEvidence(pages: readonly Retrieved[], query: string): Claim | null {
  const { claims } = analyse(pages, query)
  return claims.find((c) => !c.tainted) ?? null
}
