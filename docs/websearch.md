# Web search

`frontend/src/websearch/` — a query goes in, checked evidence comes out.

Built against a 47-section requirement. This file is the map: what exists, what
does not, and where each thing lives. It is written down because the requirement
otherwise survives only in a chat transcript, and a transcript gets compacted.

---

## The one thing to read first

**There is no model in this package, so nothing here generates text.**

That is not a gap waiting to be filled. It is the design, and most of the rest
follows from it.

- A **claim is a span**, carrying `offset` and `length` into the source text:

  ```
  source.text.slice(offset, offset + length) === claim.text
  ```

  asserted over 150 generated inputs in `evidence.test.ts`. If that ever fails,
  the claim did not come from the page and every citation above it is decoration.

- An **`Answer` has no `text`, `summary` or `prose` field**, and a test asserts
  their absence. A generator with no model would not be a partial implementation
  of synthesis — it would be §21 and invariant 4 with a nicer interface, and a
  fabricated sentence carrying a real URL is the most credible possible lie.

  The field is left **out** rather than left empty on purpose. An empty string
  field is an invitation: someone adds a model later, fills it in, and every
  guarantee still passes because nothing tests a field that did not exist.

---

## The pipeline (§46)

```
USER QUERY
    |
QUERY INTERPRETER  ......... interpret.ts
SEARCH REQUIREMENTS ........ interpret.ts   -> SearchRequirements
    |
LOCAL / CACHE + LIVE ....... gather.ts (MemoryCache) + engine.ts
QUERY STRATEGY ............. strategy.ts    -> planQueries / refine
PARALLEL RETRIEVAL ......... gather.ts
SOURCE FILTERING ........... select.ts      -> classify / rankHits
CONTENT EXTRACTION ......... extract.ts + guard.ts
    |
EVIDENCE RANKING ........... evidence.ts    -> rankEvidence
CLAIM EXTRACTION ........... evidence.ts    -> extractClaims
CROSS-SOURCE CHECK ......... crosscheck.ts  -> crossCheck
VERIFICATION ............... crosscheck.ts + quality.ts
ANSWER BUILD ............... answer.ts      -> buildAnswer
FINAL CHECK ................ answer.ts      -> finalCheck
    |
RESPONSE                     pipeline.ts    -> ask()
```

`pipeline.ts` is only the ORDER, the stop condition, and the fact that the
result carries every intermediate stage. A wrong answer from an opaque pipeline
is unactionable — "was that retrieval, extraction or cross-checking?" has no
answer and the only move is to re-run and squint.

**Source filtering sits between retrieval and fetch**, and that ordering is the
point rather than an implementation detail: ranking after fetching means a
hostile page has already been fetched, redirected through and parsed before
anything judged whether it was worth reading.

---

## All 47 sections

| § | Requirement | Status | Where |
|---|---|---|---|
| 0 | Define the claim precisely | done | this file |
| 1 | What must be true for web search to exist | done | the ten stages below |
| 2 | Query understanding must be correct | **built** | `interpret.ts` |
| 3 | Every search must have a search specification | **built** | `interpret.ts` → `SearchRequirements` |
| 4 | Speed must be defined | **built** | `latency.ts` — separate local/cached/live paths |
| 5 | The sub-millisecond requirement defined correctly | **built** | `latency.ts` — the three paths are never averaged together |
| 6 | Fast search requires parallelism | **built** | `gather.ts` worker pool |
| 7 | Optimize for information, not URL collection | **built** | `gather.ts` returns extracted text and evidence, not links |
| 8 | Source quality must be computable | **built** | `select.ts` → `classify`, `QualityFactors` |
| 9 | Primary sources preferred when appropriate | **built** | `select.ts` → `tierOf`, `requirePrimary` |
| 10 | Multiple sources when one is insufficient | **built** | `interpret.ts` → `minSources`; enforced in `answer.ts` |
| 11 | Source independence matters | **built** | `crosscheck.ts` → `countVoices` (by publisher) |
| 12 | Freshness must be explicit | **built** | `gather.ts` `retrievedAt`; `select.ts` freshness |
| 13 | Time-sensitive claims require time verification | **built** | `interpret.ts` → `requireFresh` |
| 14 | Retrieval must be query-adaptive | **built** | `strategy.ts` → `fetchDepth` |
| 15 | Search must support query refinement | **built** | `strategy.ts` → `refine`, bounded |
| 16 | Retrieval quality must be measured | **built** | `quality.ts` → `retrievalReport` |
| 17 | Distinguish search failure from answer failure | **built** | `engine.ts` `engineFailed`; `answer.ts` refusal reasons |
| 18 | Content extraction must preserve evidence | **built** | `extract.ts` + `guard.ts` |
| 19 | Structured data handled differently | **built** | `extract.ts` tables |
| 20 | Answers must be evidence-grounded | **built** | `answer.ts` — citations only, no prose |
| 21 | Must not invent missing evidence | **built** | the span guarantee; `unresolved` named, never dropped |
| 22 | Contradictions must be detected | **built** | `crosscheck.ts` → `Contradiction` |
| 23 | Claim granularity must be controlled | **built** | `evidence.ts` → `ClaimKind`, `MAX_CLAIMS_PER_SOURCE` |
| 24 | Answer accuracy must be measured | **built** | `accuracy.ts` — per type, no composite |
| 25 | Reliability defined separately from accuracy | **built** | `latency.ts` outcomes vs `accuracy.ts` |
| 26 | Failure must not cascade | **built** | `gather.ts` — failure is per source |
| 27 | Fallbacks preserve semantic correctness | **built** | `gather.ts` — a throwing cache degrades to a miss |
| 28 | Caching must be semantically safe | **built** | `gather.ts` — only successes cached |
| 29 | Cache must not cause stale answers | **built** | `maxAgeMs`, `requireFresh` |
| 30 | Localization / edge placement | **built** | `hops.ts` — measured, not assumed from geography |
| 31 | Connection reuse | **built** | `hops.ts` — `fetch` already pools; what was missing was the measurement |
| 32 | Precomputation where valid | **built** | `provenance.ts` — origins recorded, one stale source makes the answer not-live |
| 33 | Search result ranking | **built** | `select.ts` → `rankHits` |
| 34 | Answer generation after evidence acquisition | **built** | `pipeline.ts` ordering; `buildAnswer` takes findings |
| 35 | Citations must be traceable | **built** | `answer.ts` → `Citation` = url + offset + length + retrievedAt |
| 36 | Security requirements | **built** | `fetchPage.ts` SSRF guard; `guard.ts` injection quarantine |
| 37 | Resource limits | **built** | `fetchPage.ts` `DEFAULTS` — bytes, timeouts, redirects, retries |
| 38 | Observability | **built** | `latency.ts` — nearest-rank percentiles, per stage |
| 39 | Benchmarking | **built** | `corpus.ts` — 10 cases by failure mode |
| 40 | Adversarial testing | **built** | `adversarial.test.ts` |
| 41 | Speed requirement must have a budget | **built** | `fetchPage.ts` `totalBudgetMs` |
| 42 | The system must know when not to search | **built** | `interpret.ts` → `shouldSearch` / `NoSearchReason` |
| 43 | Stop when evidence is sufficient | **built** | `answer.ts` → `sufficient`; `MAX_REFINEMENTS` |
| 44 | Quality must not be optimized with one number | **built** | no composite anywhere; asserted absent in `accuracy.test.ts` |
| 45 | Fundamental invariants | **built** | `answer.ts` → `finalCheck` (see below) |
| 46 | The fundamental search pipeline | **built** | `pipeline.ts` |
| 47 | Definition of excellent web search | partial | fast ✓ reliable ✓ accurate — measurable now, not yet measured end to end |

**45 built, 0 not built.** Counting the 45 numbered requirements (§2-§46), all
45 are implemented. §0 and §1 are framing and §47 is the definition of done, so
they are not counted as build items.

§30, §31 and §32 were the last three, and they read as MEASUREMENT requirements
rather than machinery ones. §31 is the trap: `fetch` already pools connections,
so hand-rolling a pool underneath it would be slower and would have to
reimplement TLS session reuse and HTTP/2 multiplexing to break even. What was
missing was never the pooling. It was the number proving it happens.

### Modules that are not one numbered section

Six files carry no § of their own. They are listed because a module this
document does not name is a module nobody is tracking.

| Module | What it is |
|---|---|
| `index.ts` | The single doorway. The app imports this file and nothing else here, so the twelve modules underneath it can be rearranged without the app noticing |
| `verify.ts` | Claim checking — decides whether an answer may be shown at all. Not a writer: it returns a label plus the ids of the pages that earned it |
| `webSearchClient.ts` | The browser half. Holds no key and no vendor name; posts to a route on its own origin, because a credential in a browser is a credential you have published |
| `wikipedia.ts` | A retrieval source that needs no key, no server and no billing decision |
| `evalReport.ts` | The gate that turns benchmark numbers into a pass or a fail |
| `bench.ts` | The benchmark's doorway, deliberately a command and not a bundle — wiring `corpus.ts`, `quality.ts` and `accuracy.ts` into `index.ts` would ship an evaluation harness to every student's browser |

---

## §45 invariants, and what enforces each

`finalCheck(answer)` returns every violated invariant by name. It is handed
**deliberately corrupted answers** and required to catch each one — a checker
that only ever sees output its own module built is satisfied by `return []`.

| Invariant | Enforced by |
|---|---|
| 3 — a citation must actually support its claim | `finalCheck` → `citation-without-claim`; `accuracy.ts` → `distortions` |
| 4 — search failure must not become fabrication | `buildAnswer` refuses; refusals carry a reason and cite nothing |
| 5 — page instructions must never override system instructions | `guard.ts` signals → `Claim.tainted` → cannot corroborate, never cited |
| 6 — material ambiguity must not be silently assumed | `interpret.ts` → `Ambiguity` |
| 7 — contradictory evidence must not be collapsed | `crossCheck` — ANY contradiction wins, however outnumbered |
| 8 — cached information must carry freshness metadata | `CachedPage.retrievedAt` |
| 9 — external content is untrusted | `guard.ts` quarantine with a content-chosen fence |
| 10 — latency measured end to end | `latency.ts` |
| 11/12 — reliability and accuracy measured independently | `latency.ts` vs `accuracy.ts` |
| 14 — evidence provenance preserved | `Claim.sourceUrl` is `finalUrl`, after redirects |

### Mutants that prove the grader can fail

Six live in `frontend/scripts/mutation-gate.mjs`, all killed. The one worth
naming is `silence-grades-as-a-perfect-answer`: if a missing figure left the
error at zero, **a system that never answers would top the benchmark**.

---

## Known gaps, stated rather than hidden

- **This is reached now, and that sentence used to say the opposite.** For a
  time `src/websearch` had zero references from outside itself. `TutorView.tsx`
  imports `../websearch`, `island.test.ts` was rewritten to assert the module
  IS reached, and this bullet still claimed isolation — with the same
  `island.test.ts` cited as the thing keeping it true. The test and the
  document disagreed, and only the document could not fail. That is what
  `specStatus.test.ts` now closes.
- **`npm run gate:reachability` prints PASS and does not contradict that.** It
  scans within `src/agent`'s declared area; `src/websearch` is not a declared
  area at all, so the gate never looks here. Read the PASS as "no orphans inside
  the scanned area".
- **CI does lint this directory**, and this bullet said it did not. `npm run
  lint` covers `src/canvas src/practice src/agent src/websearch`,
  `eslint.config.js` carries the matching `files: ['src/websearch/**/*.{ts,tsx}']`
  block, and the workflow runs the script rather than a hand-written `eslint`
  invocation. Both halves are required: flat config lints only paths with a
  matching `files:` entry, so adding a directory to the script alone changes
  nothing.
- **DNS rebinding is uncovered** and documented at `fetchPage.ts` — a NAME that
  RESOLVES to an internal address is the one address-guard fault class no
  URL-text check can catch.

---

## How to wire it in

This is now a real option. `src/agent` ships (`App.tsx` → `TutorView` →
`createAgent`), and the seam already exists on both sides:

```ts
// src/agent/index.ts already accepts it
createAgent({ model, search: jsonProvider({ name, endpoint, map, apiKey }) })
```

`SearchProvider extends SearchPort`, and the declarations in `port.ts` are
character-identical to `src/agent/knowledge/knowledge.ts`. The remaining work is
one argument plus a decision about which engine and whose billing account.

---

## Verification

```bash
cd frontend
npm run typecheck && npm run lint && npm run build
npm test && npm run test:mutation
npm run gate:reachability && npm run budget
```

All seven must exit 0.
