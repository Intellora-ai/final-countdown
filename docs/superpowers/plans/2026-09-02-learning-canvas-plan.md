# The Learning Canvas: make PR 172 work, then make it intelligent

## Context

Two things at once, in this order:

1. **Everything in PR 172 must work locally, A to Z.** Right now most of it does
   not, and the reasons are specific and small.
2. **The canvas must become an intelligent learning environment** — diagnosis
   before explanation, real learner memory, selective representation, fast — not
   a chatbot with a nicer skin.

Branch: `codex`, 121 commits ahead of `main`, HEAD `e3a94ffa` == `origin/codex`,
1551 files. GitHub is unreachable from my sandbox
(`tls: failed to verify certificate: x509: OSStatus -26276`), so I read the
branch instead of the PR. Say so if `codex` is the wrong branch.

Research done: a 9-agent read-only audit over 8 subsystems, 1.85M tokens, every
claim carrying a file:line or a command's output.

---

## The one sentence

> **Every adaptive signal this system computes is thrown away before it reaches
> a model or a saved file. There is exactly one exception: not repeating itself.**

The teaching strategy is chosen on every lesson — eleven strategies that escalate
as a student struggles — and lands **only in the reply JSON, never in a prompt**
(`handler.ts:1881` computes it; only `:569`, `:907`, `:1212` carry it, all reply
spreads). So a student meeting an idea for the first time and one who has failed
it three times receive the identical lesson.

That is the shape of nearly every problem below.

---

## What the audit found

### Built, good, and working
Validated rendering (zod → 12 block kinds → deterministic layout → refuse rather
than draw). The 137-representation registry with exact shape coverage (33/33
series plans, 14/14 hierarchy strategies, 10/10 geometry families). A **zero-model
fast path** (alias shelf → unseen-lesson shelf, fingerprinted so a prompt edit
retires the cache). A deterministic in-lesson answerer, 9 ordered strategies, no
model call. **Real arithmetic checking** (`agent/tools/tools.ts evaluate`,
`verify.ts verifyArithmetic`). Cross-source claim checking and provenance. A
daily planner. A spaced-repetition engine.

### Built and connected to nothing
| Thing | Proof |
|---|---|
| The whole teaching policy | computed, never enters a prompt |
| Grounding | `index.ts:376` — `async search() { throw }`. **Every lesson is ungrounded, always.** |
| Server learner progress | `/api/memory` — zero browser callers, **and not even in the dev proxy** (`vite.config.ts:55` lists 6 routes; `handler.ts:315` has 8) |
| Spaced repetition | fed by `recordAttempt`, which has zero non-test callers |
| The claim-check verdict | computed by `websearch`, dropped by `researched.ts sourcesFrom` |
| The application veto | `permitted` is bypassable by one field from the model it exists to overrule |
| `/api/memory`'s whole guarantee stack | `key.ts`, `record.ts` (256KB ceiling), `progress.ts` (monotonic, 409 on violation) — protect zero production writes |
| **The canvas itself** | `grep -rn "/canvas" frontend/src` outside `src/canvas/` → only `App.tsx`, `main.tsx`, a test. **Not linked from anywhere. Reachable only by typing the URL.** |

### Genuinely missing
A learner model on the server. Misconception memory (a route is reserved,
`App.tsx:277` renders a stub). Any evidence-based progress signal — the only
"done" in the product is a self-report button. Goal memory. **Semantic retrieval
of any kind** — every lookup is an exact key match, so a rephrased question is a
full-price miss. Truth-checking of a lesson (`grounding.ts:4-9` says it outright:
28 rules, none about truth). **Streaming.** **Prompt caching** — 8737 + 2534 +
2322 characters re-sent verbatim on every request against an allowance already
exhausted. Spend accounting. In-flight coalescing. An overall deadline on the
path `/api/ask` actually takes. **One** intent system instead of two.

### Broken right now, with the exact words
```
POST /api/ask    → 502  "the model could not be reached
                         (429 tokens/rate_limit_exceeded — the daily token
                          budget is spent, try again in 3m9.216s.)"
POST /api/search → 503  "WEB_SEARCH_API_KEY is not set"
POST /api/doubt  → 200  {"provider":"fake"}   ← the Python engine is a stub
#/quick-question → "httpModel: no model endpoint is configured"
```
And on failure the canvas **keeps the "Writing this for you now…" screen up
forever** — confirmed on all three failure endings. `stage` is
`askedForATopic && authored === null ? 'writing' : 'showing'`
([CanvasRoute.tsx:1024](frontend/src/canvas/CanvasRoute.tsx:1024)); nothing
clears it. The code already knows: `CanvasRoute.tsx:1118` tells a **screen reader**
"No lesson is being shown. See the reason above." The sighted student is told
nothing. Worse, in that state the canvas silently falls back to showing the
logarithm demo lesson.

---

## The architecture

### Core rule
> **Hard-code guarantees. Let the LLM reason.**
> Deterministic: state, evidence, schema, rendering, correctness checks, gates.
> LLM: interpretation, diagnosis, strategy, depth, representation, what is next.

### 1. Failure is diagnosed, not re-explained

```
FAILURE → DIAGNOSIS → HYPOTHESES → INTERVENTION → EXPERIENCE
        → EVIDENCE → LEARNER-STATE UPDATE → NEXT DECISION
```

Eight failure kinds the system must tell apart, because "explain it again" is
useless for seven of them:

| Diagnosis | Would re-explaining help? |
|---|---|
| Doesn't know it | Yes |
| Holds a misconception | No — attack the misconception |
| Can't retrieve | No — retrieval practice |
| Can't apply | No — application task |
| Can't transfer | No — transfer task |
| Representation was wrong | Change the form, not the words |
| Prerequisite missing | No — explaining this concept cannot work |
| Request misread | No — answer the real question |

Diagnosis stays uncertain: competing hypotheses with confidence
(`prerequisite 0.55 / representation 0.30 / misconception 0.15`). An intervention
may be chosen **because it best separates the hypotheses** — teaching and
diagnosis in one move.

**"Different" means structurally different.** Today `variation.ts noveltyAgainst`
compares *wording*, which is the wrong axis entirely.

**The student sees none of this.** No confidence numbers, no "let me check".
Just confident teaching, like a good human tutor.

### 2. Evidence: questions are rare, and diagnostic

**Questions are rare on the canvas.** The canvas is for understanding, not for
being tested. Teaching does **not** end with a question by default.

A question is asked when **the student did not understand** — and then its job is
to work out *what exactly* did not land, so the eight-way diagnosis below has
something to go on. That makes each question a diagnostic instrument rather than
a quiz: it is chosen to separate the competing hypotheses.

No buttons anywhere. The student types in the sidebar bar and nothing else. Most
evidence therefore comes from reading what they choose to type; a question is the
system's move only when reading is not enough.

This still overturns `explanations.ts:32-36`, which refuses to record
understanding at all: *"No mastery, no confidence, no 'how well she understood'."*

### 3. Misconceptions are hypotheses, not verdicts

```
Concept:                Free fall
Observed misconception: heavier objects fall faster
Evidence:               predicted the 10 kg ball lands first, in a vacuum
Confidence:             high
Status:                 active
Interventions tried:    concrete demonstration → counterexample
Outcome:                partially resolved
Last observed:          <when>
Next action:            reassess with a novel scenario
```

Revisable, evidence-backed, and carried across topics.

### 4. Prerequisites: the curriculum is a prior, never the truth

Three questions that must never collapse into one boolean:

1. Does the curriculum say A → B?
2. Is A **actually** necessary for B?
3. Does **this learner** lack A?

```
CURRICULUM PRIOR → VERIFY against knowledge model → CHECK learner evidence
                 → is A actually blocking B? → INTERVENTION
```

Factorisation is listed as a prerequisite for quadratics. If this learner's
factorisation mastery is 0.92, do **not** reteach it — look for another
hypothesis. If it is 0.31, repair the missing part, not the whole chapter.

Curriculum is **subject-scoped**: `Subject → Curriculum → Chapters → Topics →
Concepts → Dependencies`. A prerequisite relation in physics never applies to
biology. Cheap signals first (curriculum graph → learner state → knowledge
graph); the LLM is spent only where the signals conflict.

### 5. Reuse is learning-aware, not a response cache

```
REQUEST → INTENT → CONCEPT → LEARNING OBJECTIVE → LEARNER STATE
        → PRIOR EXPERIENCE → DECISION
          (reuse | adapt | extend | diagnose | generate | practice | represent | retrieve)
```

"What is photosynthesis?" and "How do plants make food?" are the **same concept,
different objective**. Reuse the knowledge, the learner context, the prerequisite
analysis and the explanation history; generate only what is new.

Four kinds of reuse, never conflated — **knowledge**, **context**,
**experience**, and **negative memory**: *this explanation failed for this
student, so never serve it again under different wording.*

Embeddings, concept ids and thresholds do the cheap work.
**`nomic-embed-text` is already installed in Ollama here** — free, local, no key.

### 6. Representation earns its place

The decision is **whether**, before **which**. "No representation" is a valid,
intelligent answer. All 137 get fixed, because the registry and the renderers
already exist — what is missing is the contract with the model:

- The prompt teaches **illegal values**: `tone: success` (schema is
  `neutral|insight|warning|result`), `relations[].kind: leads-to` (not in the
  schema). The model is refused for obeying its instructions.
- **`derives` is never mentioned**, so `layout.ts:332-440`'s derivation stacking
  and `beats.ts:119-136`'s grouping can never fire on a real lesson.
- `emphasis: aside` is never offered.
- **No prompt describes the figure payload shapes at all** — 12 strict payloads
  exist and the model is told only "match that name's payload shape".
- echarts registers **12 chart types against 137 names**; an unregistered one
  draws **an empty box with no error**.

### 7. The Learning Priority Engine

Classes 9–12 × ~12 subjects × 4 exams × thousands of topics is not a scheduling
problem to be written down. **The curriculum is a graph, not a playlist.**

The question is never *"what topic comes next in the book?"* It is:

> Given this learner, their goal, their mastery, the prerequisites, the exam
> blueprint, the deadline and the time they have — what should they do next?

**Two orders, kept strictly separate:**

- **Canonical curriculum order** — what the subject says exists and how its
  concepts depend on each other. Subject-scoped, never cross-applied.
- **Adaptive learner order** — what *this* student should do next. Derived, never
  stored as a schedule.

The loop:

```
ALL CURRICULUM
  → filter by prerequisites satisfied
  → filter by learner state
  → filter by goal / exam
  → rank by learning value
  → NEXT-BEST ACTION
  → learn → collect evidence → update learner model → recalculate
```

Ranking answers seven questions, not one: what is *learnable* now; what is
*blocking*; what has the highest *goal value*; where is the learner *weak*; what
*unlocks the most* downstream (graph leverage); what is *time-sensitive*; and
what should **not** be studied now (mastered, premature, low-value, blocked).

Deterministic software enforces the hard constraints — prerequisites, deadlines,
time budget, graph integrity. The LLM reasons over the ambiguous trade-offs. And
the engine must be able to **explain its choice**: *"Newton's Laws next — you are
at 82% on its prerequisites, it unlocks three downstream concepts, and it is
heavily weighted in your target exam."* A syllabus checklist cannot say that.

**Exams are not four more subjects.** Each carries its own syllabus, subject
mapping, topic weighting, question patterns, difficulty, prerequisites and
deadline, so the chain is `EXAM → required knowledge → concepts → prerequisites →
this learner's gaps → priority`.

**What exists already:** `server/almanac/plan.ts planDay` — pure, deterministic,
carry-over, one concept per subject, a minutes budget. That is a good daily
budgeter and it is *not* a priority engine: it has no mastery input, no
prerequisite check, no graph leverage and no exam weighting. It becomes the time
budgeter that the priority engine feeds.

**Onboarding decides the universe.** The student picks a **CBSE class and an
entrance exam**. Both are then presented in the sidebar in the **same
`Subject → Chapter → Topic` structure**, and every topic in either opens its own
canvas. `examChoice.ts` already stores the choice; nothing routes it into
learning.

### 8. Two brains become one
`server/controller.ts` (5 actions + veto, drives the canvas) stays the
decision-maker. `src/agent/kernel/router.ts`'s tools, arithmetic checking and
spaced repetition get plugged into it. `App.tsx:254-268` documents the overlap
and declines to resolve it; we resolve it.

---

## Product decisions you have made

- **One canvas per TOPIC**, not per chapter. `Subject → Chapter → Topic`, each
  topic its own blank canvas at `#/canvas/<topicId>`. The sidebar goes one level
  deeper than it does today.
- **The canvas replaces** the chapter concept-map and the ready-made lesson.
- **No pre-made lessons anywhere.** The 8 built-in demo lessons come off.
- **Blank means blank** — topic name, type bar, and a few things they could ask,
  drawn **from this topic** (today `EXAMPLE_TOPICS` is hardcoded to
  photosynthesis / quadratics / the French Revolution).
- **The canvas builds up.** Everything learned on a topic stays and accumulates.
  Never regenerated per answer. This is the moat.
- **Save everything.** Come back to it exactly as left — **nothing added**, no
  summary, no suggestion.
- **It streams.** First words on screen **inside 1 second**, then it keeps
  writing. Never all at once.
- **Memory in both places, server is the truth.**
- **Local model answers when the cloud is down**, silently. (Flagged once:
  `provider.ts` argues against a silent fallback. Your call — I will expose the
  answering vendor in `/api/health` so it is always checkable.)
- **Check and verify everything** — no number, equation or step shown unchecked.
- **Free web search, many sources, no key.**
- **Scope: every CBSE class, and every entrance exam** — JEE Main, NEET UG,
  CLAT, IPMAT. The data already exists and is substantial: classes 9–12 with
  9–12 subjects each (639 / 727 / 1592 / 1631 named items), plus four generated
  exam files traced to official PDFs. **The problem is routing, not data:** the
  exam curricula are loaded only by `src/practice/mapSource.ts`, and the canvas
  only ever sees `loadPlannedSubjects(cls)`. An entrance-exam student has no way
  into learning at all today.
- **Off-syllabus questions get taught, stay on the same canvas, and nothing is
  ever deleted.** A Class 10 student asking about black holes is taught properly,
  on the canvas they were already on, and it stays there. The separation is in
  the **backend**, not on screen: an off-syllabus answer is tagged so it never
  enters mastery, prerequisites, exam weighting or the learner model for the
  syllabus — mixing them would corrupt both the progress picture and the model's
  reasoning about what the student is ready for. The student sees one continuous
  canvas and never a refusal.
- **Out of scope: the practice screen.** Not our work.

---

## The plan

Every step: **write the test, watch it fail, fix the product, watch it pass.**
Never weaken a test.

### Stage A — It runs, and it never lies

**A1. A brain that cannot run out.**
Test: with every cloud key blank and only the local model set, a typed topic
comes back as a lesson. Then commit a run configuration that starts the API
server with `OLLAMA_FALLBACK_MODEL`, and set `LEARNING_OS_LLM_PROVIDER` to
something real so `/api/doubt` stops answering `"provider":"fake"`.
Proof: an ask answered with the cloud budget deliberately exhausted.

**A2. Free web search.**
`openweb.ts:415` demands a key before it even reads the endpoint — that one check
is the whole blocker. Make it conditional on the endpoint template containing
`{key}`. Add SearxNG to the compose file: no key, returns `{results:[...]}` which
the parser at `openweb.ts:266` already understands, and queries dozens of engines.
Tests: keyless endpoint searches; `{key}` endpoint with no key still refuses with
the same sentence; search off entirely still produces an honestly ungrounded lesson.

**A3. Wire grounding.** `index.ts:376`'s `throw` becomes the real port, so
`sources` stops being permanently empty.
Test: a lesson written with search on cites ≥5 pages from >1 domain.

**A4. No dead ends.**
Test: a canvas whose ask fails shows the refusal, **no** moving bar, and **no**
logarithm lesson. Fix `stage` to leave `'writing'` when `authorFailed` is set.
Then sweep every waiting screen so each ends in an answer or a sentence.
Point `/quick-question` at the server that already has a model.

**A5. The canvas becomes reachable.** Sidebar goes `Subject → Chapter → Topic`;
a topic opens `#/canvas/<topicId>`. Today's Start opens the same. Remove the
`/chapter` and `/learn` routes and delete `ChapterView.tsx`, `LearnView.tsx` and
their tests. Add `/api/memory` and `/api/search` to the dev proxy.
Test: clicking a topic in the sidebar lands on that topic's blank canvas.

**Stage A proof:** you open localhost, click a topic, type, and are taught —
with no cloud key at all.

#### Stage A — measured (2026-09-02, this machine)

| Step | Proof |
|---|---|
| A1 keyless | Server started with every `*_API_KEY` unset and `OLLAMA_FALLBACK_MODEL=qwen2.5:7b`: `/api/health` → `vendors:["ollama (qwen2.5:7b)"]`; `POST /api/ask` "surface area of a cylinder" → **200 in 24.7 s**, `lesson` present (a salvaged partial — the 7b's first draft failed the representation gate, Stage E's problem). `chooseProvider` now takes `OLLAMA_FALLBACK_MODEL` as the only resort: provider + health tests 51/51. |
| A1 keyed | Same build with your shell keys: `vendors:["gemini","groq","ollama (qwen2.5:7b)"]`; logs show **gemini 429 ×2 → failover → groq answered in 5.6 s**. Later both cloud budgets 429'd and the laptop answered. |
| A2 free search | `openweb.ts` key check now conditional on `{key}`: search tests 34/34. Live, keyless, through a local SearxNG: `POST /api/search` "photosynthesis" → **200 in 3.2 s, 4 pages from 4 domains** (noaa.gov, ncbi.nlm.nih.gov, asu.edu, si.edu), freshness live. `docker-compose.search.yml` + `searxng/settings.yml` added; secrets gate PASS. |
| A2 engines | SearxNG's default engine set died within minutes on a home network: Google CSE, Brave, Startpage and Qwant CAPTCHA-suspended, DuckDuckGo and Wikidata timing out — and `use_default_settings.engines.keep_only` *keeps* engines without *enabling* ones SearxNG ships disabled (measured on `/config`: only 4 of 10 enabled). Fixed by enabling by name (`bing` + the Wikimedia family + arXiv); forced `engines=bing` → 10 results. After: `/api/search` "how does gravity work" → **3 live pages, 3 domains** (nasa.gov, wikipedia, physicsfundamentals) in 2.8 s; "mitochondria" → 3 (genome.gov, wikipedia, biochemden). |
| A3 grounding | `index.ts`'s `throw` replaced by `groundingPort.ts` (port tests 4/4, concept-grounding 3/3); the port logs *why* when empty. **Live:** `[grounding] 3 source(s) from 3 domain(s) for "how does gravity work"` on the keyless server — real pages in the author's prompt. The 7b's lesson was then refused (`all words`, a dangling relation): Stage E, not grounding. |
| A4 no dead ends | `stage` gains `'refused'`: CanvasRoute tests 18/18 (red first). **New:** the ErrorBoundary was sticky — one crashed screen showed "Something went wrong" on every address until a reload. It now recovers on `hashchange`: boundary tests 18/18 (red first). |
| A5 canvas reachable | `#/canvas/<topicId>` route (App test 3/3), `topicNamed` resolver (3/3), Sidebar `Subject → Chapter → Topic` (2/2), Today's Start → canvas (17/17, journey 32/32). **Live on your dev server:** Mathematics → Real Numbers → topic → `#/canvas/real-numbers--fundamental-theorem-…`, heading is the topic's name, type box present. `/api/memory` added to the dev proxy (guard 3/3). |
| The blank page | **Root cause:** `ChapterView.tsx:81 return null` sat before later hooks (`useMemo` at :115); React threw *"Rendered fewer hooks than expected"* and the boundary swallowed the whole app. Reproduced at `#/chapter/science/life-processes` (a subject not in the plan). `ChapterView`, `LearnView`, the pre-made-lesson fallback `almanac/lesson.ts` and the visit counter `attempts.ts` are deleted; the old address now lands on `/today`. |

| No pre-made lessons | The 8-lesson picker and its fixture imports are out of `CanvasRoute` (tests 12/12, red first; the eight fixture files stay in `src/canvas/lessons/` **only as test fixtures** — ten test files use them, nothing in production imports them). **Consequence:** Laws A and B drive the picker through `person.ts choicesSheIsOffered` and are red until F4 rewrites them around a typed topic. `EXAMPLE_TOPICS` (the three fixed suggestions under a stuck learner) is still hardcoded — it becomes topic-derived in Stage C. |

#### Stage B — measured so far

| Step | Proof |
|---|---|
| B1 streaming, server | A string-aware scanner (`server/lessonStream.ts`, 6/6) turns the model's JSON into `text` deltas per prose body and `block` events per validated block (`validateBlock` lifted out of `validate.ts`); Ollama `chatStream` reads NDJSON (4/4); failover forwards it **in vendor order** — a non-streaming vendor still answers first, whole, as one piece (26/26); `/api/ask` with `accept: text/event-stream` streams the **first attempt only** through an `AsyncLocalStorage` seam and ends with `done` carrying the plain reply (3/3); `index.ts` writes SSE. |
| B1, hosted vendors | Streaming is implemented for the local model only. Failover hands a hosted vendor's whole reply over as one piece, so nothing breaks — but whether Groq accepts `stream: true` together with JSON mode is **unprobed**: it needs a real request with your key, which I do not handle. One command for you when you want it, then a `chatStream` on `groq.ts` mirroring Ollama's. |
| B1 streaming, client | `askTheServer` asks for the stream when given `onText` and falls back to JSON for any server that answers JSON (every existing test unchanged); the writing screen shows the words as they arrive (CanvasRoute 13/13, red first). |
| B1 live | On the keyless 7b: `content-type: text/event-stream`, **109 word-events**, block 0 validated live at 22.6 s, `done` at 57.6 s. **First word at 22.1 s** — the controller decision, the search, and the model's own JSON preamble all precede it. That is the gap to the 1 s target, and it is the next thing to move (run the controller and the authoring in parallel; time each stage in the log). |
| A3 again | `[grounding] 5 source(s) from 5 domain(s) for "how does a magnet work"`. |
| Stage E evidence | The 7b's lesson was refused twice: `blocks.1.columns.0.key: Required`, `columns.0.label: Required`, `rows.*.cells: Invalid input`, `blocks.2.role: … received 'checkpoint'`. Exactly the audit's finding — the prompt never describes the table column shape and offers values the schema rejects. |
| B3 fast path | `smallTalk.ts`: "hi", "thanks", "ok" (and Hinglish forms) answer with **zero model calls**, only when no lesson is on screen — inside a lesson "ok" is evidence and goes to the model. **Live:** "hi" → 200 `clarify` in **8 ms**, "thanks" 3 ms, "namaste" 1 ms; no `[controller]` line. |
| B2 prefix | `concept.prefix.test.ts` (2/2) guards that every rule of the system prompt sits in one byte-identical prefix across questions, sources, routes and history, and that the first per-request line (the grounding preamble) comes after the last rule. On Ollama and Groq that identity *is* the prompt cache. |
| **Grounding budget** | `searchPortFrom(openWeb, { budgetMs: 4000 })` races the web against four seconds and writes without it past that (port tests 6/6, red first); SearxNG's own engine timeouts trimmed to 4 s / 6 s. **Live, same 7b, next ask:** first byte **8.1 s** (was 22.5 s), block 0 validated at 8.6 s, `done` at 18.7 s with **200** — the first fully validated live lesson from the laptop model in this session. |
| **Where the 8 s goes** | `[timing]` on the budgeted run: controller **1.4 s** (in parallel with the search), grounding **gave up at 4.0 s** (SearxNG had just restarted), first streamed *token* **5.1 s**, first *prose* in the browser **8.1 s**. The 3 s between token and prose is the model writing `id`, `question` and `technicalTerms` before the first block's `body` — the prompt's example puts them first. **Lever:** put `blocks` first in the example (Stage E touches that prompt anyway). |
| B4 rate limits | `groq.ts` now reads `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens` on every **successful** reply and exposes `budgetLeft()`; `failover.order()` asks a vendor below one concept's worth of tokens **last** until its reset — the 429 that took the product down today is answered before it happens (groq-budget + failover tests, red first). |
| **Where the 22 s goes** | `[timing]` lines on the second streamed ask: **controller decided in 1,596 ms → grounding searched in 19,697 ms → first streamed word after 22,529 ms.** The first word waits for the web, not for the model: the search + five page reads took 19.7 s and authoring only starts after it. Without that wait the 7b's first word is ~3 s. **Next lever: a short grounding deadline** (author with whatever pages arrived in ~3 s), then running the controller and the authoring in parallel. |

#### Stage C — measured so far

| Step | Proof |
|---|---|
| C1 local copy | `teachStore` keeps a record **per lesson** (was one key for all), capped at the 40 most recent, with a v1→v2 migration (per-lesson tests 3/3, red first). Two `m10` tests that had deliberately *pinned* the single-key defect — "the gap is CLOSED, rewrite this test" was their own failure text — now assert the conversation, the place and the answer survive a visit to another lesson (53/53). |
| C1 server truth | `src/canvas/api/memoryClient.ts` (7/7): a per-**browser** id in localStorage (decided: a per-tab id would lose memory on close), `readProgress` on open, `writeProgress` after each change; never throws. `TeachView` gains `memoryKey` (a topic canvas files under the **topic** id), adopts a further-along server record on open, and writes 600 ms after a change settles (3 new tests, red first). Consumers: 40 files / 607 tests, `tsc` 0, lint 0. |
| C1 live | On **your** dev server: sidebar → Polynomials → "Zeros of a polynomial" → `#/canvas/polynomials--zeros-of-a-polynomial`, a lesson written, then `GET /api/memory?tabId=<browserId>&lessonId=<topicId>` through the proxy → **200 JSON** `{record:{lessonId:"polynomials--zeros-of-a-polynomial", revealed:1, …}}`. The server memory, built weeks ago and never called, now holds a record a browser wrote. Local store is v2 with `byLesson` keys for two topics. |
| C2 builds up | `CanvasRoute` keeps `entries` (question + validated lesson + level, oldest first, 40 kept); a new lesson is **appended**, never replaces; `CanvasEntry` renders the earlier ones read-only above the live `TeachView`, headed by what she *typed*. Persisted under `<topic>#canvas` through `readCanvas`/`writeCanvas`; on return every entry is re-checked by the same gate and the last becomes the lesson on stage — nothing asked, nothing added. `<CanvasRoute key={topic.id}>` so one topic's state never leaks into another's. Tests red first: "keeps the first lesson on the canvas when a second is asked for", "comes back exactly as it was left, with nothing added" — CanvasRoute 15/15, canvas suites 113/113, `tsc` 0, lint 0. |
| C2 live | Through 5176 → my new-build API → the local 7b, topic canvas `polynomials--zeros-of-a-polynomial`: ask 1 **taught** (first words on screen 12.6 s, no refusal, no buttons, no question). Ask 2 was refused (below) and **the first lesson stayed on the canvas through the refusal** (`.lc-entry` = 1, headed by what she typed). Full page reload: `GET /api/memory …#canvas` → `entries: ["what is a zero of a polynomial"]`, and the page came back with that lesson on stage, nothing added. The two-lessons-on-one-canvas case is proven by the tests and by the refusal case live; a second *accepted* live lesson is still owed. |
| **C2 live, complete** | Same canvas, proof API on gemma3:12b with the E1b mends: "how many zeros can a quadratic have" **taught** (first words 16.5 s, no refusal, no button, no question) **under** the 7b's earlier lesson — two lessons on one canvas. Full page reload: one `.lc-entry` above, the second lesson on stage, both bodies present; `GET /api/memory …#canvas` → `entries: ["what is a zero of a polynomial", "how many zeros can a quadratic have"]`. Nothing asked, nothing added. |
| E1b, second pass | Red first: a lesson that forgot `id`/`question` is filed under the question asked (never overwriting one the model wrote); `relations` written inside a block are hoisted to the lesson `from` that block; a malformed one is left for the gate; `asId` capped at the schema's 64. `judge` now receives the asked question. mend 10/10, teach suites 32/32 (540). The gemma lesson above went through on the first attempt because of these. |
| E1b mend | `mend.ts`: a table column key that is not an id is spelled to one and its rows re-keyed; a `role` the schema never had is dropped so the default applies; anything ambiguous (two keys spelling to one id) is left for the gate; a lesson with nothing to mend comes back as the same object. Hooked before `judge`. **Red with the hook off** — the whole-turn test failed on exactly the live faults (`blocks.1.role: checkpoint`, `columns.0.key`) — green with it on: 6/6. |
| C3 questions rare | `checkpoint` optional (must ask when present), the two-branch rule removed, branches shown as words never buttons (CanvasRoute test red → green, 16/16), the five prompt examples ask nothing, the prompt says a question is for when the learner did not understand. Two pinned tests moved to the decided requirement (an asserting checkpoint is still refused; the repair-turn test now uses that flaw). Teach suites 32/32 (536), typecheck (3 projects) 0, lint 0. |
| Blocks first, measured | Second live ask: first words on screen **7.2 s** (was 10.8 s and 12.6 s on the same machine, same model). Still not 1 s: controller ≈1.4 s and the search ≈3.6 s run first, then the model's own preamble. |
| Still refused live | Ask 2: `blocks.1.kind — Invalid discriminator value` (a block kind that does not exist — meaning, not spelling, so not mendable), plus `all words` and `2 definitions`. Two attempts were not enough for the 7b. Levers, in order: a larger local model if one is installed; the repair turn's feedback; the server-side salvage (`repair.ts`) for the two teaching-rule faults. |
| Bigger local models | Ollama here holds `gemma3:12b`, `qwen3:8b`, `gpt-oss:20b` (and `nomic-embed-text` for D4). **gemma3:12b, cold, same question:** controller 9.9 s, first words on screen 18.8 s, refused — `id: Required`, `question: Required`, `relations` written inside three blocks. Different faults, not fewer. Both are mendable without touching meaning (E1b, second pass). Warm numbers still owed before any verdict on speed. |
| gemma3:12b, warm | Second and third asks on the same server: controller **11.4 s** (the 7b: 1.4–5 s), first prose on screen 16.5 s and 39 s, both lessons accepted on the first attempt with the mends; the third was still being written at 98 s. Verdict so far: gemma is refused less and is 3–8× slower per turn; the controller call alone costs more than the 7b's whole first-words time. The likely shape is **two models** — the 7b for the controller decision, the 12b for the writing — which is a decision for you. SearxNG missed the 4 s budget on all three gemma asks (0 sources), so those lessons were ungrounded. |
| Two models, built and measured | `OLLAMA_CONTROLLER_MODEL` names a model for the decision alone: `ModelPort.decide`, `controllerModel(env)`, wired in `index.ts`, named in `/api/health` (`controller: ollama (qwen2.5:7b)`). Red first (speed.test: the verdict went through the writing model) → green; speed/provider/health 62/62, typecheck 0. **Live: no gain on this laptop** — the 7b's decision took 4.7 s (1.4 s when it is the only model) because Ollama keeps one model resident and swaps them on every call; first words 18.2 s. The option stays for a machine with room for both (`OLLAMA_MAX_LOADED_MODELS=2`); the recommendation here is one model. The lesson was refused for an invented chart `data.shape` — gemma invents vocabulary too, when it chooses a figure. |
| **Defect found** | During the third lesson's streaming the server logged `memory written …#canvas` about **five times a second** (≈30 PUTs of 2154 bytes in 25 s) and the progress record every ~1 s. A save effect re-fires on every streamed word. Red test next: a streamed lesson writes the canvas memory once. |
| Defect, measured | Two measurements disagreed with the guess: a test streaming 30 words wrote the canvas **once**, and a live hook on the page's `fetch` saw **zero** saves in 60 s of streaming. The burst's timestamps matched the moment my batch *reloaded* the page. A live hook after a reload then saw exactly two saves: the canvas record (my restore path) and the progress record (TeachView on mount) — both writing back what the server had just handed over. The thirty-write burst itself was seen once and not reproduced; both paths are now bounded by tests. |
| Fix | Red first: "coming back writes nothing" (restoring two lessons sends no PUT) and "a streamed lesson writes the canvas memory once". Restored entries are exempt from the canvas write; TeachView sends only a change she made (the last agreed record is remembered, and an adopted server record counts as agreed). CanvasRoute 18/18, canvas suites 138/138. |
| Free search, measured again | SearxNG answers in 0.3–1.9 s; the 4 s "web had not answered" on every ask was the **page reads** of junk hits. **Bing lies on long questions:** for "relation between zeros and coefficients of a polynomial" it returned Bohemian Rhapsody lyrics, then Vietnamese dishes, then LibreOffice downloads, then YouTube help — ten hits sharing not one word with the question — and the pipeline demoted them, fetched them, and would have cited them. Brave, wikibooks, wikisource, wikiversity: "Suspended: too many requests"; yahoo "HTTP protocol error"; mojeek enabled but silent. One engine answering, and it lies. |
| A source must mention the subject | `rankHits` now excludes a hit whose title and snippet carry none of the question's words (three letters or more, small words removed), with the reason on the hit — nothing silently dropped, nothing off-topic fetched or cited. Red first (the Vietnamese-food hit was still a candidate for a polynomial question) → green. Six older tests ranked fixture hits that said nothing about their own question; a real engine's snippet is matched on the question's words, so those fixtures now name their subject (and "GDP" set the floor at three letters). |
| The guard, placed | It lives in the pipeline's pre-fetch selection (both search rounds), not in `rankHits`: the client re-ranks pages already read, whose *text* says the subject. Words come from the question itself (three letters up; "gdp" set the floor). Twenty-odd older tests ranked fixture hits titled `'t'`, `'g'`, `'A'`, `'Dead'` — titles no engine returns for a question; they now name their question (SEO spam names it too, and is still read and scored irrelevant). Red → green in `pipeline.test`: the food page is marked and never fetched. |
| The deadline | Measured twice: with the reads bounded, every lesson was still ungrounded, because the four planned queries wait for the slowest engine. Now `gather` keeps what arrived by `deadlineAt` and marks the late read; `runQueries` leaves out a query that has not answered (not an outage); the pipeline searches no further round past it; `searchTheOpenWeb` reads `deadlineAt` from the request body; the grounding port sends its budget minus 0.5 s. Three red tests first (gather, pipeline search phase, port body). SearxNG engine timeout 4 s → 2 s (its engines measured 0.3–1.9 s). |
| **Grounded, live** | Same question that had 0 sources five times today: `[timing] grounding searched in 3535ms` → `[grounding] 5 source(s) from 4 domain(s)` — inside the 4 s budget, on-topic, the first grounded lesson of the day. (Controller 17 s and first word 28 s on that run: gemma cold-loading after my restart, every restart costs it; warm, the 7b decides in 1.4 s.) |
| **Your own page** | The 8787 API turned out to be preview-managed by this session, so I restarted it on the new build (launch entry `api`: your keys kept, `OLLAMA_FALLBACK_MODEL=qwen2.5:7b`, `WEB_SEARCH_ENDPOINT` → SearxNG). Through `localhost:5173`: `/api/health` → `vendors: ["gemini","groq","ollama (qwen2.5:7b)"]`; "what is a zero of a polynomial" on the topic canvas → **taught**, no refusal, no buttons, within 50 s. Its log: controller **1.07 s** (gemini), grounding **2.4 s → 3 sources from 2 domains**, `[failover] gemini could not answer (429)`, **first streamed word 4.3 s**, `memory written … #canvas 951 bytes`. Every piece built today, in one request, on the address you use. |
| Checkpoint, idle | Full suite minus the 14 socket files, model idle: **235/235 files, 9314 passed, 0 failed.** (A run made while gemma was generating showed 7 flakes in canvas/practice files; alone they pass 69/69 — load, not code, as [flake-rate-needs-load-check] warned.) Typecheck (3 projects) 0, lint 0. |
| Stray file | `src/canvas/learn/LearnView.tsx` reappeared in the working tree as an **older** copy than HEAD (mtime 2026-08-25, 187 lines short), importing modules deleted in A5, and broke `tsc`. Not written by this session; nothing imports it (mentions are in comments). Removed again. If it comes back, something else is writing into this checkout. |
| Checkpoint (no sockets) | Full suite minus the socket-bound files: **234/237 files, 9301 passed, 1 failed, 17 skipped, 24 s.** The one failure was `server/speed.test.ts`: it asserted a greeting reaches the controller twice; under B3 a greeting reaches no model at all. Rewritten to its own stated requirement and made stronger — both greetings answered with zero model calls and no lesson, and the next real question still reaches the controller — 9/9. The other two "failed" files, `src/websearch/fetchPage.loopback` and `gather.loopback`, bind a loopback port (`listen EPERM`): socket-bound, yours to run — fourteen files now. |
| Second dev server | `vite.config.ts` proxy target now honours `API_TARGET`; launch entry `canvas-new` = port 5176 → API 8790. Proven: `/api/health` through 5176 → `vendors:["ollama (qwen2.5:7b)"]`. |
| The alone rerun | The 7 files that timed out in the full run were rerun alone: 107 failed / 45 passed, **every** failure "Test timed out" or "Operation not permitted" (197 + 214 lines, zero other error kinds). They are socket-bound like the original five: `server/m7-control`, `m8-response`, `m9-truth`, `server/memory/m2-isolation`, `m3-retrieval`, `m4-consistency`, `m5-correctness`. You run them; I cannot. |

| **C3 evidence, built** | A plea is heard wherever it sits ("i still dont get why there are two" was read as an *answer* and advanced the lesson): `isPlea`, 21/21 red→green. `server/memory/evidence.ts` on the same memory box as explanations — what she typed, when, as what it observably is (`plea`/`answer`/`question`/`empty`), never a mark; 4/4. `POST /api/evidence` files a statement; inside a lesson a plea goes to the tutor with everything taught, the brief says "she has NOT understood… END with a checkpoint: ONE short question that finds out what exactly did not land", the model's `checkpoint` goes out **only when she pleaded** (the software's rule, not the model's), and the evidence is filed under the topic; 5/5. Client: TeachView hands a plea to the tutor (not the in-lesson answerer) and files a statement at its beat; CanvasRoute sends the topic, shows the returned question as words (no button), and puts the tutor's part **right after the beat she was on, never after the summary** — the gate refused "core material after the summary" until it did; TeachView 39/39, CanvasRoute 20/20. Two real bugs found by the tests on the way: a plea was sent twice (the end-of-lesson "more" request still carried it) and a short lesson is one beat whose last block is its summary. |
| **C3 live, your page** | On `localhost:5173`: fresh lesson from the shelf (no model call), plea typed in the lesson box → `/api/ask` carried `justSaid`, `topicId`, `beat: "zero-def"`; server: `[evidence] plea filed under polynomials--zeros-of-a-polynomial`; the tutor's part was added ("The next part has been added"); the statement went to `/api/evidence` with topic and beat. **No question came back**: gemini 429 ×3, groq's daily budget spent, and the laptop 7b ignored "END with a checkpoint". So the question became the software's guarantee: when the tutor writes none, the canvas asks which of the parts she was reading did not land, by their names (a title, or the part's opening words) — red → green, TeachView 40/40, CanvasRoute 21/21. |
| **Identity defect, measured** | After my restart of 8787, your browser became a **new student** (`d953fa…` → `ec2769…`) and every record written before it went invisible — the canvas came back empty. The secret file was reused and the token is `id + HMAC(secret)` with a one-year cookie, so a restart with the same secret *must* verify; a controlled experiment (read id → restart → read id) is running to pin it. |
| Identity experiment | Read `ec2769…` → stop 8787 → start → read `ec2769…` again, and `GET /api/memory …#canvas` returned the entry. **A restart keeps the student.** The one switch (`d953fa…` → `ec2769…`) happened once, during the window in which `vite.config.ts` was edited and the dev server restarted itself, and did not reproduce; recorded as seen once. The secret file `data/identity-secret` (22:52:57, reused since) is one file for one machine — `ALMANAC_IDENTITY_SECRET` is the shared-server setting, already supported. |

| **C4 misconceptions** | `server/memory/misconceptions.ts`: a hypothesis is `{concept, observed, evidence[], confidence, status, interventions[], outcome, lastObserved, nextAction}` — one record per **learner**, not per topic, so "heavier falls faster" is carried from gravity to momentum; the same belief seen again gains evidence and confidence (low→medium→high) and never a second record; a resolved belief seen again comes back active; 100 kept, a corrupt row is an empty history. 5/5 red→green. Wiring: the lesson's `misconception` blocks say what is wrong, so a **plea at a beat that warned her** files that belief as a low-confidence hypothesis (`[misconception] observed …`), and the tutor's brief is told what she may hold, with the instruction to state the wrong belief plainly, show where it fails, then give the correct rule. A statement observes nothing. Server 8/8, TeachView 40/40, CanvasRoute 21/21. |

#### Stage D — measured so far

| Step | Proof |
|---|---|
| **D1 diagnosis** | `server/diagnose.ts`: a plea produces **competing hypotheses**, each with a confidence and the words that raised it, ranked, never certain. A belief she may hold (0.75) beats every reading of the words; naming an earlier idea, the picture, "too much at once", "how do I", "why does it", "a different example" each name their own failure kind; the floor is `concept_gap`, weak on purpose (0.35), and when nothing points anywhere the two failures re-explaining cannot fix are **named anyway** at guess confidence, so the signals can be seen to disagree. A learner who is answering is diagnosed with nothing. 9/9 red→green. |
| **D2 intervention** | The top hypothesis chooses the strategy through `teaching.ts`'s existing map, and the strategy is put **in the tutor's brief** — the audit's one sentence was that this is computed on every lesson and never enters a prompt. Moves already spent are read back from the evidence (a plea remembers the move that answered it), so the same failed explanation is never served twice however it is worded. Proven: a belief she may hold → `misconception_repair`; a missing earlier idea → `prerequisite_repair`; three pleas → three different moves; a statement → no diagnosis, no strategy. The reply carries `diagnosis` and `strategy` so a person can argue with it. 4/4 red→green. |
| **D3 prerequisites** | The curriculum's `deps` are real data, not a plan: **506 of Class 10's 612 concepts** name at least one (class 9: 466/548, class 11: 1237/1404, class 12: 1252/1431). `prerequisitesOf` reads them **subject-scoped** — a dep that does not resolve inside the topic's own subject is dropped, never guessed (2/2 red→green). `server/prerequisites.ts` then answers "does THIS learner lack it" from what she observably did: pleaded about it blocks hardest, never met next, taught-but-silent weakest, **answered on it is not blocking and is never retaught** (6/6 red→green). Wired: the canvas sends the listed prerequisites, the server checks each against her evidence, the brief names **one** to teach first ("one at a time", decided) and the reply carries them all. 3/3 red→green. |
| **D4 reuse, measured** | `nomic-embed-text` is real and fast here: **768 dims, 595 ms cold, 11–12 ms warm**. Measured pairs (plain, no task prefix): reworded **0.889**, synonym 0.785, same topic different objective 0.673, **"what is photosynthesis" ~ "how do plants make food" 0.529**, different subject 0.429, unrelated 0.363. (With `search_query:` prefixes every score rises but the gaps shrink: 0.607 vs 0.490.) **No single threshold works** — the brief's own example sits one tenth above two different subjects. So two bands: ≥0.75 the same concept, knowledge reused; ≥0.50 related, carrying one sentence of context and merging nothing; below, new ground. The thin cut is deliberate and cheap: a wrong guess there costs a sentence, not a corrupted learner model. `embed.ts` 5/5, `concepts.ts` 7/7, wiring 3/3, all red first; absent model = null everywhere and the system behaves exactly as before. |
| Plea widened | "what is mass? i never learnt that" was read as a question and sent to the in-lesson answerer, which cannot teach the missing thing. Naming something never taught is now a plea (red→green, turn 24/24). |

#### Stage F — measured so far

| Step | Proof |
|---|---|
| **F1 arithmetic wired** | `evaluate` and `verifyArithmetic` were built, tested and wired **only into the agent loop, which the canvas never calls** — so a lesson saying "2 × 3 = 7" passed the same gate that refuses a dangling relation. `spec/arithmetic.ts` now finds every sum a lesson states (plain, `×`, `÷`, across all its blocks) and checks it; the gate refuses a wrong one **with the right answer in the message**. What it cannot read it leaves alone rather than guessing: a formula with letters, a date range, a rounded answer stated to its own places. 8/8 and 2/2, both red first. Two regex faults found by the tests, not by inspection: `*/` inside a comment closed the comment, and the answer swallowed a sentence's full stop. |

| **F2 claim check wired** | The verdict — do two **independent** domains agree — was computed by `checkClaims` and dropped twice: the search route never returned it, and `sourcesFrom` discarded it client-side. So a lesson resting on one shaky page reached the author looking exactly like one resting on two agreeing sources. Now `/api/search` returns it, `groundingPort` turns it into a sentence the author can act on ("Only one source says this. Say it, and say that it rests on one source."), and it rides into the prompt beside the page it belongs to. Client half kept too (`groundingFrom`, `howWellSourcesAgree`) for the in-lesson answerer. Port 2/2, route 43/43, prompt 1/1, all red first. |
| The tripwire fired, twice | `island.test.ts` pins the exact set of files that wire `websearch`, and it caught this change — correctly the first time (`server/openweb.ts` is the **seventh**, and the first one outside `src/`) and **wrongly the second**: `referencesFrom` is a substring scan, so a doc comment that merely said the word "websearch" counted as an edge. Recording that file would have written a fiction into the inventory, so the comment was reworded, the list stays at six, and the scanner's blind spot is now named in the test — with the real seventh asserted separately, since the scanner cannot see outside `src/`. |

#### The last five, finished 2026-09-03

| Step | Proof |
|---|---|
| **Harness: evidence scoped to its task** | `.harness/evidence.jsonl` is one log for the life of the repo and nothing in a row says which task it belongs to, so `_last_change_at` — a max over every change in the file — gave a task that had changed **nothing** the previous task's line, and any verification that task ran after it counted. A new task arrived with its static check already ticked. Now every rule reads only `at >= task.started_at`. Red first (4 tests). |
| **Harness: a reproduction can be seen** | `ROOT_CAUSE_RECORDED` accepted "a command with a non-zero exit", which on this build can never happen — a failing foreground command fires no event, a piped one records no exit code. The only way past was to type `harness reproduce`, while the gap message offered an option that could not occur. A **red test run** now counts, in the verifier and in `advance` alike. Red first (4 tests). |
| **F5 the island audit** | `scripts/islands.mjs` walks all 225 production modules under `src/` and `server/` and resolves every relative import. **13 are imported only by tests, 3 by nothing** — and every one is deliberate and says so in its own header: two entry points, five demo lessons kept as fixtures, four measuring instruments, two hand-run probes, the practice engine, and the API client whose header states the canvas does not call it yet. No hidden unwired product code. `islands.test.mjs` pins the inventory as an exact set with a written reason per name, and **proves it has teeth** by planting an orphan and requiring it to be caught — the shape `server/offSyllabus.ts` had yesterday. |
| **G2 one code path — and it found a real bug** | Every class and every exam checked through the same resolver, reader and key: **3,995 topics across four classes, 881 across three exams**, all ids usable as memory keys, all prerequisites subject-scoped, no id resolving across curricula. It caught a collision the eye would not: Class 11 and 12 have **1,404 topics and 1,402 distinct ids** — Accountancy and Business Studies each carry `theory--20-marks` and `unit-1--objectives`, because the generated id is `<chapter>--<topic>` and is unique only inside a subject. Two real students would have shared one canvas, one memory row and each other's lessons. Fixed at the loader (`uniqueTopics.ts`, 6 tests): the first topic keeps the id, a later one is qualified by its subject, prerequisites inside that subject are rewritten, names never change. Mutation-checked: bypassing the normaliser fails four tests. |
| **B2 the cache, as a number** | Identity was proven; size was not, and a forty-character identical prefix would have passed. Measured across five varied requests: **8,769 identical leading characters, 137 lines, 91.5% of the shortest prompt**, breaking exactly where the request begins. Pinned with floors under those numbers. Mutation-checked: moving one per-request line above the rules fails all five. What is still **not** measurable is whether the vendor served it from cache — both cloud keys are at 429, and that needs their response headers. |
| Everything, after all five | Frontend **253 files, 9,682 tests**; harness **207 tests**; `tsc` (3 projects) 0; `eslint` 0; `ruff` 0; reachability gate PASS. |

#### Stage G — measured so far

| Step | Proof |
|---|---|
| **G3 priority engine** | `server/priority.ts` answers "what should she do NEXT" from the curriculum graph and her own evidence, and **says why in one sentence**: something she pleaded about last outranks everything (she was there, it did not land); a prerequisite she has answered on is never sent back; what unlocks more comes first; a blocked topic is shown with what blocks it, never hidden; exam weight shifts the order **without** breaking prerequisite integrity. Derived every time, never stored — a schedule goes stale the moment she learns something. No mastery number is invented. `priority.ts` 8/8, `/api/next` 3/3, both red first. This is the learner model that was built in `src/agent/learn` and reached only by the agent loop; it is now reachable from the canvas, fed by the evidence C3 collects. |

| **G1 exams reach learning** | The four syllabi were loaded by exactly one file — the practice screen — so a student sitting JEE could not open a single topic to learn. `examSubjects.ts` loads one by id, translates it **once at the edge** into the same `Subject → Chapter → Topic` shape a class uses (the exam files say `topics`, the class files say `concepts`), and the sidebar, `topicNamed`, `prerequisitesOf` and the canvas need no special case. Measured: JEE Main and NEET UG 433 topics each, CLAT 15. **IPMAT has none, and that is correct** — it publishes an exam *pattern*, not a syllabus, and the code refuses to invent one; the sidebar now says so instead of showing an empty space. `examSubjects` 7/7, sidebar 4/4, both red first; `App.tsx` resolves a topic id against the class and the exam. |

| **F4 the gibberish laws** | Seventeen things a student can type in ten seconds — nothing, one space, one letter, `asdkjhasd`, emoji, Devanagari, Hinglish, rude, 5,000 characters, 200 newlines, HTML, JSON, a URL, SQL, digits, off-syllabus — each asked twice: with a model and with the model dead. None may hang (4 s cap), crash, leak a stack trace, or answer with nothing readable. **36/36.** Two real defects found, both fixed at the root: |
| ↳ a pasted paragraph crashed | 5,000 characters threw `BadMemoryKey: lessonId is longer than 200 characters` **out through the API**. A key is our problem, not hers: `fittedLessonId` hashes past the limit and every printable question stays readable, applied to all four key builders (explanations, aliases, lessons, evidence). 3/3 red first. |
| ↳ a salvaged lesson repeated forever | Most answers come back `partial: true` — the model's first draft is imperfect most of the time — and that path wrote **nothing** to her history, so the same question returned the same way in forever. Now remembered for **her**; the shared shelf stays clean, since a salvaged lesson is not worth handing to a second learner. Red first. |
| The reachability gate caught me | `server/offSyllabus.ts` shipped as an **orphan** — built, tested, imported by nothing — which is precisely the failure the whole audit was about, committed by me. The fix was to wire it, not to exempt it: the priority engine now filters off-syllabus evidence **explicitly**, where the guarantee is made, instead of leaving it to fall out of how the map is keyed. Gate back to PASS, 39/39 server files reachable. |
| **G4 off-syllabus** | A Class 10 student asks about black holes: taught, kept on her canvas, and **her progress does not move** — `/api/next` returns exactly what it returned before. The guarantee holds by construction (everything is keyed by topic and the syllabus is the list that counts) and is now pinned so a future change cannot quietly break it. `offSyllabus.ts` 5/5, end-to-end 1/1. |

| **The refusal now names the value** | A discriminator error listed the twelve legal kinds and never the one the model wrote, so three live refusals in a row said nothing about their own cause. The log now prints `kinds written: [...]` beside the refusal. It paid for itself immediately: the answer was **`["prose","example","table"]`** — `example` is a ROLE, written where the kind belongs. Not a representation name, so the 137-name prompt caused no regression. |
| **Two more spelling mends** | A role written as the kind becomes prose in that role; a representation name written as the kind becomes a figure of that name (a legal block kind always wins, since `table` and `chart` are both). Left for the gate when two fields disagree. Red first; mend 14/14. **Live: the kind refusals are gone** — `kinds written: ["definition","example","table"]` and no discriminator error. What remains refused is meaning, correctly: "an example points at 0 rules", "prime number used before it is introduced". |
| **Your cloud budget is spent** | Every live run this evening: `gemini 429` and `groq 429 — the daily token budget is spent`. Everything falls to the laptop 7b, whose lessons fail the teaching rules more often than they pass. The learner is **never stranded** by it: the salvage path answered on screen in plain words ("I would rather say so than guess at it. Ask me again, or ask for one smaller piece of it"), the type box stayed, and the canvas memory was written. That is A4 and the salvage doing their job under the worst conditions of the day. |

#### Stage E — measured so far

| Step | Proof |
|---|---|
| E1 drift test | `concept.legalValues.test.ts` reads the prompt's LEGAL VALUES block *and* the schema, both directions. **Red first, naming the drift:** offered-but-refused `tone: success`, `relations[].kind: leads-to`; accepted-but-never-offered `emphasis: aside`, `tone: insight`, `tone: result`, `relations[].kind: derives`. Prompt fixed (with one-line glosses for `aside`, `insight`/`result`, `derives`) → 3/3; concept suites 30/30. |
| E1 table shape | Three live refusals in a row were the table: `columns.0.key Required`, `rows.*.cells Invalid`, then `columns.1.key — ids are lowercase kebab-case`. The prompt now states the column/row shape in words (braces in the prompt broke the example-parsing test — measured, reworded) and that a key is an id. **Still refused live** after that: the 7b wrote `"Number of zeros"` again, plus roles `checkpoint`/`next` (not roles), no question in `checkpoint`, 0 `next` branches. A 7b cannot hold the whole contract in words; spelling faults need a deterministic mend before refusal (next). |
| **E2 all 137 reachable** | `everyRepresentation.test.tsx` builds the minimal payload each of the 11 shapes demands, validates it through the real gate and renders it through the real renderer, once per name: **139/139, zero refused, zero blank.** The audit's fear was a silent empty box (12 ECharts types registered against 137 names); this forbids it by name. Three names carry an invariant a generic payload cannot meet and the gate is right about all three — a population pyramid compares exactly two groups, a confusion matrix holds counts, a truth table needs rows matching its inputs. **Mutation-checked:** `SeriesShape` made to return null fails 33 names with "rendered an empty box", so the test has teeth; reverted, 204/204 green. |
| **E1 the model can reach them too** | The prompt named four representations as examples and told the model not to guess the rest — so **133 of the 137 were unreachable in practice**, and the local models invented `data.shape` values instead and were refused (measured live, twice). The prompt now carries **all 137 grouped by the payload each needs**, in words rather than braces (braces break the example-JSON check — measured). Two drift tests, both directions: every registry name is offered, and no name is offered that the registry lacks. Prompt cost: 8,737 → **10,245 characters**, one byte-identical prefix, so it is cached (B2). |
| **E3 necessity** | The gate demanded a picture for every reading but `define` and `example`, while the prompt said "never add one because this list asked for one" — a contradiction the model resolved by drawing a chart of nothing. Now: a picture is owed when the **content** has something to show (two or more quantities, steps in an order, cases held against each other, parts of a whole, named things in a relation), and a lesson may omit it by saying why in `showsNothingBecause`. That field cannot buy out of a needed picture: the idea is judged first, the excuse second. `necessity.ts` 11/11, gate 3/3, both red first. |
| Streaming via proxy | Through 5176: `/api/ask` answered `text/event-stream`, first words on screen **10.8 s** after the click (server: controller 1.4 s ∥ grounding 3.6 s, first token 8.5 s). |
| Blocks first | All five prompt examples now put `blocks` before `id`/`question`/`technicalTerms` (measured 3 s of preamble before the first body). Effect unmeasured until the next live lesson. |

`typecheck` (all three projects) exit 0, `lint` exit 0 after every step above.
Note: the browser pane now reaches the dev server at `localhost:5173`, not
`127.0.0.1:5173`.

### Stage B — It feels fast

**B1. Streaming.** `groq.ts` sends no `stream` field; `ollama.ts` sends
`stream:false`. Turn both on and stream the text straight through to the canvas.
Anything that must be checked before it is drawn — table, equation, diagram —
lands the moment it passes its check.
Test: first visible word within 1s on the local model; nothing unvalidated ever
paints.

**B2. Prompt caching.** Reorder every prompt so the stable prefix comes first,
then declare it cacheable. 8737 + 2534 + 2322 characters stop being re-sent.
Test: byte-identical prefix across two consecutive requests.

**B3. The fast path gets used.** The alias + shelf path already costs zero model
calls. Route "hi", "thanks", "ok" and known-answer questions through it.
Test: "Hi" produces a greeting and **zero** model calls.

**B4. Deadlines, coalescing, spend.** An overall deadline on `/api/ask`
(`conceptFor` is awaited bare at `:1876` and `:1964`). Hold a promise for
in-flight work so two learners asking the same new thing pay once. Read
`x-ratelimit-remaining-tokens` so the server routes away from a vendor **before**
it refuses — that header is why today's 429 happened at all. Count tokens so
"what did today cost" is answerable.

### Stage C — It remembers

**C1. Memory wired, server is the truth.** Browser calls `/api/memory` keyed by
topic; a local copy keeps the canvas instant. Replace `teachStore`'s single
`'canvas-teach'` key.
Tests: topic A's work is invisible on topic B; a reload keeps it; a different
browser keeps it; two topics learned in sequence both survive.

**C2. The canvas is additive and persistent.** A second question adds to the
topic's canvas; it never replaces it. `setAuthored` stops overwriting.
Test: ask twice, both are on screen; reload, both still there, in order.

**C3. Evidence.** Questions are rare (decided 2026-09-02): teaching does **not**
end with a question by default. A question is asked only when what the student
typed shows they did not understand, and then it is chosen to find out *what
exactly* did not land. Their typed answer becomes an evidence record.
The code says the opposite today: `conceptIssues` (`concept.ts:295`) refuses any
step whose `checkpoint` does not end in a question, and `:308` demands two `next`
branches — both measured as refusal reasons on the local model's lessons. Both
rules go here, replaced by: a `checkpoint` is optional; when present it must be
a question.
Test: an answer that shows understanding and one that does not produce different
stored evidence and different next teaching; a lesson with no question at all is
accepted.

**C4. Misconception memory**, in the shape above — revisable, evidence-backed,
carried across topics. Replaces the `/misconception` stub.

### Stage D — It is intelligent

**D1. Diagnosis before intervention.** The eight failure kinds, as competing
hypotheses with confidence, from the evidence in C3.
Test: a student failing for a missing prerequisite and one failing from a
misconception, on the same concept, get structurally different next moves.

**D2. Intervention selection.** The LLM chooses, given learner state, evidence,
prior interventions and **negative memory**. The escalation ladder stops being
thrown away — but as input to the model, not as a rule.
Test: the same failed explanation is never served twice in any wording.

**D3. Prerequisites verified, not assumed.** Curriculum prior → knowledge check →
learner evidence → is A actually blocking B.
Test: a learner with high mastery of a listed prerequisite is not made to redo it.

**D4. Learning-aware reuse.** Concept resolution by local embeddings; the four
kinds of reuse kept separate.
Test: two wordings of one concept resolve to one concept, reuse knowledge, and
still teach to the different objective.

### Stage E — Representation

**E1. Fix the contract.** Correct the illegal enum values, describe every figure
payload shape, offer `derives` and `aside`.
Test: every value the prompt offers is accepted by the schema — as a test that
reads both, so they can never drift again.

**E2. All 137 reachable.** Register the missing echarts types so nothing draws an
empty box; describe the `metric` and `simulation` fields.
Test: every one of the 137 names renders something valid or is refused loudly —
never a silent empty box.

**E3. Necessity.** Decide *whether* before *which*. "No representation" is a
first-class outcome.
Test: a concept better served by plain language produces no figure.

### Stage F — Truth, and the proof

**F1. Wire the arithmetic checker** (`evaluate` + `verifyArithmetic`) into the
lesson path. No number or step is drawn unchecked; a step that cannot be checked
is refused, never guessed.

**F2. Wire the claim check.** `sourcesFrom` stops dropping `check` and
`evidence`.

**F3. Merge the two brains.** Agent tools, arithmetic and spaced repetition plug
into `controller.ts`. Remove the duplicate path.

**F4. Rewrite the laws.** Today Law A drives the hardcoded 8-lesson picker
against a deliberately keyless server, so it proves the demo lessons and honest
refusal — never that anything new can be taught. New Law A: **a person types a
topic nobody wrote in advance and is taught it**, against a real local model.
Add the gibberish laws: empty, one letter, 5000 characters, emoji only,
`asdkjhasd`, another script, off-syllabus, rude, the same question twice, and one
asked while the model is down. None may produce a spinner, a stack trace or a
blank page.

**F5. Kill the islands.** Every module whose only importers are tests, listed
with the grep that proves it, then removed or wired. Audit the gates that let
`/api/memory` sit unreachable through a whole PR.

### Stage G — Every class, every exam, and what to do next

**G1. Onboarding sets the universe.** The student picks a CBSE class **and** an
entrance exam. Both appear in the sidebar in the same
`Subject → Chapter → Topic` shape; every topic in either opens its own canvas.
`examChoice.ts` already stores the choice and `src/data/exams/` already holds all
four syllabi — nothing routes them into learning.
Test: a JEE student sees JEE subjects and can open a JEE topic's canvas.

**G2. One code path for every topic.** No subject, class or exam is
special-cased: a topic id from Class 9 English and one from NEET Biology travel
the identical route. This is what makes "all of it works" checkable rather than
aspirational.
Test: a topic drawn at random from each of the 4 classes and each of the 4 exams
opens, teaches, and remembers.

**G3. The priority engine.** Prerequisite filter → learner-state filter →
goal/exam filter → rank by learning value → next-best action, recalculated after
every piece of evidence. `planDay` becomes the time budgeter underneath it.
Tests: a student with a mastered prerequisite is never sent back to it; a topic
that unlocks more downstream outranks one that unlocks none, all else equal; an
approaching exam shifts priority **without** violating prerequisite integrity;
and the engine can state its reason in one sentence.

**G4. Off-syllabus stays out of the model.** Tagged, kept on the canvas, never
deleted, never counted.
Test: teaching black holes to a Class 10 student changes no mastery, no
prerequisite state and no exam weighting.

---

## Verification

```bash
cd frontend && npm run typecheck && npm run lint && npx vitest run
cd frontend && npm run test:laws
cd frontend && npm run test:mutation && npm run gate:reachability
```

`typecheck` and `lint` pass on the current tree, so any failure is ours.
Playwright's browsers (chromium, firefox, webkit) are already installed here, so
the laws can run locally.

Every claim comes with the command that produced it. Anything I have not watched
pass, I label **unproven**.

---

## What I need from you

1. **Run the socket-bound tests in your own terminal.** I cannot — my sandbox is
   policy-enforced and blocks binding or connecting to a local port. It is not a
   setting I can flip. Fourteen files need a port: the five below plus
   `server/m7-control`, `m8-response`, `m9-truth`, `server/memory/m2-isolation`,
   `m3-retrieval`, `m4-consistency`, `m5-correctness` (rerun alone here: every
   one of their 107 failures was "timed out" or "not permitted", nothing else),
   and `src/websearch/fetchPage.loopback`, `gather.loopback` (`listen EPERM`).
   ```bash
   cd frontend && npx vitest run server/ src/api/
   ```
   If these are genuinely red, the API server and the memory store are red and
   Stage A's order changes.
2. **Restart your own API server on the new build** — yours answers `/api/health`
   without `vendors`, so it is the old code: no local-model fallback, no
   streaming, no free search. From the repo root:
   ```bash
   cd frontend && npm run server:build && OLLAMA_FALLBACK_MODEL=qwen2.5:7b WEB_SEARCH_ENDPOINT='http://127.0.0.1:8080/search?q={query}&format=json' node dist-server/index.js
   ```
   (SearxNG must be up for the search part: `docker compose -f frontend/docker-compose.search.yml up searxng`.)
2. **Confirm `codex` is PR 172's branch.** I could not reach GitHub.
3. Optionally, a second model key — not required, the local model covers it.

---

## Three honest warnings

**225 test files pass, 5 fail, 2 skip — and I cannot judge the 5.** All five need
a local socket, which my sandbox forbids:
```
pact_ffi::mock_server: Failed to start mock server - Operation not permitted (os error 1)
→ fetch failed
```
`server/index.test.ts`, `server/boot.test.ts`,
`server/memory/m1-persistence.test.ts`, `server/memory/live.test.ts`,
`src/api/client.pact.test.ts`. I did not run them, so I will not say they pass.

**My screenshots this session were worthless.** The browser pane reports
`document.visibilityState: "hidden"` and stops repainting, so pictures went stale
and showed me a spinner on a page that had moved on. Every finding here comes
from the live DOM, from network responses, and from source I read.

**One thing I could not reproduce.** You see a *truly empty* page at
`#/chapter/…`. I read `ChapterView` and `LearnView` and both always render at
least a heading, and "Real Numbers" drew correctly for me. So there is a failure
mode I have not found. First job in Stage A5 is to reproduce it on your exact
chapter before that screen is removed — a bug that survives a rewrite is worse
than one that never got fixed.
