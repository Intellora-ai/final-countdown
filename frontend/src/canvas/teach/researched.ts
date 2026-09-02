/*
 * THE ADAPTER THAT MAKES GROUNDING REAL.
 *
 * `groundingPreamble` was built with its seam proved and nothing ever called it
 * with a source, so every lesson the canvas wrote was still written from the
 * model's memory. `checkTeaching` cannot notice: its twenty-eight rules read
 * SHAPE, and a confidently-worded invention has the same shape as the truth.
 *
 * Everything here is a refusal. A page that did not load, a page the injection
 * guard flagged, and a page with nothing readable are each worse than no source
 * at all -- grounding a lesson in an error page teaches the error, and a lesson
 * with no sources is at least honestly ungrounded.
 */
import type { Source } from './grounding'
import type { SearchResult, ClaimCheck, SelectedEvidence } from './webResolver'

/** The usable pages from one search, as sources an author may write from. */
export function sourcesFrom(result: SearchResult): readonly Source[] {
  /* `engineFailed` means the provider broke, not that the topic has no
     sources. Whatever came back is not a sample of the web and cannot ground
     anything. */
  if (result.engineFailed) return []

  const out: Source[] = []
  for (const page of result.results) {
    if (!page.ok) continue
    /* The guard already decided this page tries to instruct a model.
       `groundingPreamble` fences every source, but a fence is the second line;
       this is the first, and a page known to be hostile is not handed over. */
    if (page.suspicious) continue
    const text = page.readerText.trim()
    if (text === '') continue
    out.push({
      /* The final url, so a redirect is cited where it landed rather than
         where it was asked for. A citation nobody can follow is not one. */
      url: page.finalUrl || page.hit.url,
      title: page.title || page.hit.title,
      text,
    })
  }
  return out
}

/**
 * F2 — THE CLAIM CHECK IS CARRIED, NOT DROPPED.
 *
 * The search pipeline reads the pages, works out whether two INDEPENDENT
 * domains agree
 * on the answer, and hands back a verdict with the sentence it rests on.
 * `sourcesFrom` kept the pages and threw both away, so a lesson written from
 * one shaky page was indistinguishable from one written from two agreeing
 * sources -- to the author writing it, and to the learner reading it.
 *
 * This keeps them together. The author is told, in one sentence, how well the
 * sources agree; what it does with that is its own business, but it can no
 * longer be unaware.
 */
export interface Grounding {
  readonly sources: readonly Source[]
  readonly check?: ClaimCheck
  readonly evidence?: SelectedEvidence
}

export function groundingFrom(result: SearchResult): Grounding {
  return {
    sources: sourcesFrom(result),
    ...(result.check === undefined ? {} : { check: result.check }),
    ...(result.evidence === undefined ? {} : { evidence: result.evidence }),
  }
}

/** How well the sources agree, in words the author can act on. */
export function howWellSourcesAgree(check: ClaimCheck | undefined): string {
  switch (check?.status) {
    case 'supported':
      return 'Two independent sources agree on this. State it plainly.'
    case 'single-source':
      return 'Only one source says this. Say it, and say that it rests on one source.'
    case 'conflicting':
      return 'The sources disagree. Say what each says and that they disagree; do not pick one silently.'
    default:
      return ''
  }
}
