/**
 * THE SEAM. Mirrored, not imported — and that is a temporary state.
 *
 * `SearchPort` and `SearchHit` are owned by `src/agent/knowledge/knowledge.ts`.
 * The intended shape of this file is a type-only re-export of those two. It is
 * not that yet for a reason that is mechanical rather than architectural: that
 * module is currently UNTRACKED, so it exists in the primary working tree and
 * in no other. This package is built in a separate worktree, where the path
 * does not resolve at all, and `tsc -p tsconfig.json` covers `src` — so an
 * `import type` from it fails the typecheck here rather than merely looking
 * untidy.
 *
 * Mirroring is safe in a way that duplicating an implementation would not be.
 * TypeScript's structural typing means a fetcher satisfying the declaration
 * below satisfies the real interface too, without either side knowing about
 * the other; there is no runtime coupling to get out of step, and no second
 * copy of any BEHAVIOUR. What can drift is the declaration, which is why the
 * exact source text is pinned in the test rather than trusted to stay put.
 *
 * When `src/agent/**` is committed, this file becomes:
 *
 *     export type { SearchHit, SearchPort } from '../agent/knowledge/knowledge'
 *
 * and every consumer below is unchanged.
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
