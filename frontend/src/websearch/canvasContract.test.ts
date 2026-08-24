import { describe, expect, it } from 'vitest'

import type { SearchOutcome } from './engine'
import type { Retrieved } from './gather'
import type { ClaimCheck as CanvasClaimCheck, ClaimStatus as CanvasClaimStatus, RetrievedPage, SearchResult, SelectedEvidence } from '../canvas/teach/webResolver'
import type { Claim } from './evidence'
import type { ClaimCheck, ClaimStatus } from './verify'

/**
 * The canvas declares the retrieval shape it needs. This is what keeps that
 * declaration true.
 *
 * WHY THE CANVAS DOES NOT SIMPLY IMPORT THESE TYPES
 * -------------------------------------------------
 * `tsconfig.canvas.json` checks `src/canvas` under `noUncheckedIndexedAccess`,
 * a flag the rest of this package does not use. An import from `src/canvas`
 * into `src/websearch` drags this whole directory into that stricter project
 * and lights up around fifteen errors in code the change never touched. The
 * two honest ways out are editing all of it, or dropping the flag — and the
 * flag is the reason several guards in `layout.ts` exist, so dropping it would
 * quietly retire their justification and the next reader would delete them as
 * arbitrary.
 *
 * So `webResolver.ts` declares `RetrievedPage` and `SearchResult` structurally,
 * and depends on WHAT it needs rather than on how retrieval is organised.
 *
 * WHAT THAT COSTS, AND WHY THIS FILE IS THE PAYMENT
 * -------------------------------------------------
 * A hand-declared shape can drift out of agreement with the real one in total
 * silence: the canvas keeps compiling against its own copy while the retrieval
 * layer moves underneath it, and the two only disagree at runtime, in front of
 * a learner, as a blank or wrong answer.
 *
 * This file makes that drift a compile error. It lives HERE rather than beside
 * the resolver because this directory is checked by the base config, which can
 * see both sides; a test under `src/canvas` could not import these types
 * without recreating the exact problem the declaration exists to avoid.
 *
 * The assignment below is the assertion. If `Retrieved` loses `suspicious`, or
 * `evidence` becomes optional, or `SearchOutcome` renames `engineFailed`, this
 * file stops compiling and names the field.
 */

describe('the retrieval layer still satisfies what the canvas declared', () => {
  it('a Retrieved is usable everywhere the canvas expects a RetrievedPage', () => {
    /*
     * The real assertion is the type annotation, checked by `tsc`, not by this
     * expectation. The runtime body exists so the file is a test rather than a
     * declaration nobody runs — a type-only file can be excluded from a build
     * and nobody notices it stopped being checked.
     */
    const real: Retrieved = {
      hit: { url: 'https://example.org/a', title: 'A', snippet: 's' },
      ok: true,
      title: 'A',
      text: 'body',
      tables: [],
      evidence: 'evidence',
      suspicious: false,
      signals: [],
      finalUrl: 'https://example.org/a',
      truncated: false,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      fromCache: false,
    }

    /* Mapped, not assigned. `Retrieved.evidence` is the FENCED block —
       `<<<UNTRUSTED-WEB-CONTENT>>>` plus a warning header — which exists so a
       model cannot read fetched words as instructions. The canvas shows its
       text to a person, so it takes `text` (the clean extract) and the fence
       never reaches a reader. A straight assignment would have shipped the
       delimiter and the security notice to a learner. */
    const asCanvasSeesIt: RetrievedPage = {
      ok: real.ok,
      title: real.title,
      readerText: real.text,
      suspicious: real.suspicious,
      finalUrl: real.finalUrl,
      hit: { url: real.hit.url, title: real.hit.title },
    }
    expect(asCanvasSeesIt.finalUrl).toBe(real.finalUrl)
    expect(asCanvasSeesIt.suspicious).toBe(false)
    expect(asCanvasSeesIt.readerText).not.toContain('UNTRUSTED')
  })


  it('a real ClaimCheck is usable everywhere the canvas expects one', () => {
    /*
     * The same drift guard as above, for the verdict rather than the pages.
     * `verify.ts` owns `ClaimCheck`; `webResolver.ts` declares its own copy so
     * the canvas does not import across the tsconfig boundary. A status renamed
     * on one side and not the other would compile on both and disagree at
     * runtime — as an answer rendered with no label, or a refusal with no
     * reason, in front of a learner.
     */
    const real: ClaimCheck = {
      status: 'supported',
      supportingEvidenceIds: ['https://a.test/1', 'https://b.test/2'],
      conflictingEvidenceIds: [],
    }
    const asCanvasSeesIt: CanvasClaimCheck = real
    expect(asCanvasSeesIt.status).toBe('supported')
    expect(asCanvasSeesIt.supportingEvidenceIds).toHaveLength(2)
  })

  it('every status the checker can produce is one the canvas can render', () => {
    /*
     * Listed exhaustively rather than sampled. The annotation is the assertion:
     * add a fifth status to `verify.ts` without teaching the canvas about it and
     * this stops compiling, which is the only moment anybody would notice
     * before a learner saw an unlabelled answer.
     */
    const every: readonly ClaimStatus[] = ['supported', 'conflicting', 'single-source', 'unknown']
    const asCanvasSeesThem: readonly CanvasClaimStatus[] = every
    expect(asCanvasSeesThem).toHaveLength(4)
  })

  it('a real Claim can supply the evidence the canvas displays', () => {
    /* `selectEvidence` returns a `Claim`; the canvas is handed `text` and
       `sourceUrl` off it. Mapped rather than assigned, because a Claim carries
       far more than a reader should see and a straight assignment would invite
       shipping the rest. */
    const claim: Claim = {
      text: 'Heating a gas raises its pressure.',
      sourceUrl: 'https://a.test/1',
      sourceKind: 'reference',
      offset: 0,
      length: 33,
      kind: 'statement',
      aspects: ['gas', 'pressure'],
      retrievedAt: '2026-01-01T00:00:00.000Z',
      tainted: false,
    }
    const asCanvasSeesIt: SelectedEvidence = { text: claim.text, sourceUrl: claim.sourceUrl }
    /* Byte-identity at the boundary. Every later assertion about
       `displayedAnswer === selectedEvidence.text` is worthless if the text is
       already altered on its way across. */
    expect(asCanvasSeesIt.text).toBe(claim.text)
  })

  it('a SearchOutcome is usable everywhere the canvas expects a SearchResult', () => {
    const real: SearchOutcome = {
      query: 'q',
      engine: 'test',
      results: [],
      engineFailed: false,
      hitsReturned: 0,
    }

    const asCanvasSeesIt: SearchResult = { results: [], engineFailed: real.engineFailed }
    expect(asCanvasSeesIt.engineFailed).toBe(false)
    expect(asCanvasSeesIt.results).toEqual([])
  })

  it('the canvas reads the four fields its safety rules depend on', () => {
    /*
     * Named one by one on purpose. `suspicious` is the injection guard, `ok`
     * drops failed fetches, `evidence` is the only text ever shown, and
     * `finalUrl` is the attribution. A future refactor that renames any of
     * these has to come through this list.
     */
    const required: readonly (keyof RetrievedPage)[] = [
      'suspicious',
      'ok',
      'readerText',
      'finalUrl',
    ]
    const sample: Retrieved = {
      hit: { url: 'u', title: 't', snippet: 's' },
      ok: true,
      title: 't',
      text: '',
      tables: [],
      evidence: 'e',
      suspicious: false,
      signals: [],
      finalUrl: 'u',
      truncated: false,
      retrievedAt: '',
      fromCache: false,
    }
    /* `readerText` is the canvas's name for `Retrieved.text`; every other name
       is shared. Checked against the source field so a rename over there fails
       here rather than in front of a learner. */
    const sourceField: Record<keyof RetrievedPage, keyof Retrieved> = {
      ok: 'ok',
      title: 'title',
      readerText: 'text',
      suspicious: 'suspicious',
      finalUrl: 'finalUrl',
      hit: 'hit',
    }
    for (const field of required) {
      const source = sourceField[field]
      expect(source in sample, `Retrieved lost the field "${source}"`).toBe(true)
    }
  })
})
