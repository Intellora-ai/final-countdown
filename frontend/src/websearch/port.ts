/**
 * THE SEAM. Mirrored, not imported — and the reason for that has now expired.
 *
 * `SearchPort` and `SearchHit` are owned by `src/agent/knowledge/knowledge.ts`.
 * The intended shape of this file is a type-only re-export of those two. It was
 * not that, for a reason that was mechanical rather than architectural: that
 * module was UNTRACKED, so it existed in the primary working tree and in no
 * other. This package is built in a separate worktree, where the path did not
 * resolve at all, and `tsc -p tsconfig.json` covers `src` — so an `import type`
 * from it failed the typecheck here rather than merely looking untidy.
 *
 * THAT IS NO LONGER TRUE. `src/agent/**` is tracked, on this branch and on
 * `main` (27 files, landed in #66), so the stated precondition is met and the
 * mirror is now a leftover rather than a workaround. It is left in place only
 * because removing it is a change to what this module depends on, and that is
 * a decision to take deliberately rather than as a side effect of noticing.
 * The declarations below are, at the time of writing, character-for-character
 * identical to `knowledge.ts:127-137`.
 *
 * Mirroring is safe in a way that duplicating an implementation would not be.
 * TypeScript's structural typing means a fetcher satisfying the declaration
 * below satisfies the real interface too, without either side knowing about
 * the other; there is no runtime coupling to get out of step, and no second
 * copy of any BEHAVIOUR. What can drift is the declaration, which is why the
 * exact source text is pinned in the test rather than trusted to stay put.
 *
 * The remaining edit is one line, and no consumer below changes:
 *
 *     export type { SearchHit, SearchPort } from '../agent/knowledge/knowledge'
 */

/** One result from a search engine, before anything has been fetched. */
export interface SearchHit {
  url: string
  title: string
  snippet: string
  /** ISO date the PAGE was published, when the engine reports one. */
  publishedAt?: string
}

/** The injection seam every retrieval backend implements. */
export interface SearchPort {
  search(query: string): Promise<readonly SearchHit[]>
}
