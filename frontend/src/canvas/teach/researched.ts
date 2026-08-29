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
import type { SearchResult } from './webResolver'

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
