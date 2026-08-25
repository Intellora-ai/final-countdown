# Worklog

## Phase 0, iteration 1 — source fetcher
Built frontend/scripts/curriculum/fetch.mjs + manifest.mjs. 30 tests.
37 official CBSE 2026-27 PDFs fetched, 24.8 MB, all checksummed into
data/curriculum-sources.lock.json. `npm run curriculum:verify` passes.

## Phase 0, iteration 2 — extractor
Built frontend/scripts/curriculum/extract.mjs. 58 tests, 6 committed text
fixtures of real documents.

Layout families found in the 37 documents:
  unit-marks-table    22  PARSED (roman, dotted-roman and arabic numbering)
  unit-chapter-table   2  PARSED (units containing numbered chapters)
  part-units-table     3  NOT PARSED
  section-theme-table  1  NOT PARSED
  unknown              9  NOT PARSED

Result: 214 units, 34 chapters, 16/37 documents clean.

Real defects the guards caught, each of which would have shipped wrong data:
  - business-studies: one mark value covers two units; totals still summed to
    80, so an arithmetic check alone would have passed it.
  - social-science-x: a section total printed on one chapter row.
  - maths-senior Class XII: marks wrapped onto their own line; the whole
    subject was about to be refused as unreadable.
  - history: theme rows are indistinguishable from arabic unit rows.
  - science-x: the document contradicts itself about formative-only topics.

## Next action
Parsers for the remaining families, biggest first:
  1. part-units-table  — accountancy, economics, business-studies (commerce core)
  2. unknown           — english, social-science-ix, sociology, entrepreneurship,
                         physical-education, computer-applications
  3. section-theme     — history
Then: exam syllabi (JEE / NEET / IPMAT / CLAT), then build.mjs.

## Phase 0, iteration 3 — every layout family, and atomic concepts

Added parsers for every remaining layout family, each test-driven:
  unit-chapter (Physics)      units containing numbered chapters
  section-theme (History)     theme rows sharing a line with the section title
  unit-headings               "Unit-1: Title" body headings — 190 rows across 15
                              documents that no row pattern could see
  chapter rows                six different separator styles in ONE document
  hour themes                 Class IX Social Science, with study hours
  prescribed texts            Class X English, 28 literature texts
  section rows                Class IX English, skills-based sections
  atomic concepts             "Heading: a, b, c" bodies split into teachable items

Result: 37 documents, 384 topics, 1582 atomic concepts, 36/37 readable.
Tests: 175 curriculum tests. Full frontend suite 2181 passed, 0 failed.

Quality rules that reject bad data rather than publish it:
  - marks that span rows are refused, never divided
  - question-paper-design and practicals pages are not curriculum
  - a heading containing a verb is prose, not a topic
  - working notation, unbalanced brackets, column bullets and outcome
    boilerplate all disqualify a concept
  - raw-mode titles are repaired against the layout reading of the SAME document

Refused on purpose, recorded in KNOWN_UNREADABLE with the reasons tried:
  - physical-education: cells split one word per line and interleaved with three
    other columns; every reconstruction produced corrupted titles.

## Next action
build.mjs — turn data/curriculum-extracted.json into
frontend/src/data/curriculum/<class>.ts in the existing Subject/Chapter/Concept
shape, with minutes in [10,25], resolvable deps, and a source page per concept.
Then the exam syllabi (JEE / NEET / IPMAT / CLAT), then Phase 1.

## Phase 0, iteration 4 — the app's curriculum files

build.mjs turns the extracted documents into the dashboard's existing
Subject -> Chapter -> Concept shape. A syllabus HEADING becomes a chapter and
each item under it becomes a concept, because a 25-mark unit is not something
anyone learns in twenty minutes.

Generated: frontend/src/data/curriculum/class{9,10,11,12}.ts
  50 subjects, 2283 concepts, every one carrying its source pdf and page.

A defect the tests caught: Class 11 and Class 12 came out as two identical
403 KB files. Physics, Chemistry, Biology and the rest print BOTH years in one
pdf, and filing the whole document under both classes gave Class 12 a
curriculum containing all of Class 11. Split on the second course-structure
page; the two files are now 267 KB and 320 KB.

Gates now enforced by provenance.test.mjs against the real shipped data:
  every concept has a source pdf and page; the pdf is a real manifest entry;
  minutes are inside [10,25]; every dep resolves; ids are unique per subject;
  no dependency cycle anywhere; the two senior classes differ.

Verified: 2216 tests passed / 0 failed. typecheck clean. eslint clean.
vite build succeeds. bundle budget PASS (67.84 of 150 KB). reachability PASS.

## Next action
Exam syllabi: JEE Main, NEET UG, IPMAT, CLAT from official sources, mapped onto
the CBSE concepts so practice reuses one concept store. Then Phase 1, the server.

## Phase 1 — the server  [COMPLETE]

frontend/server/ — one Node process, the only thing that holds the API key.
  handler.ts   pure request in / response out, model and search injected
  model.ts     the Anthropic client (claude-opus-5, adaptive thinking)
  index.ts     node:http wiring, loopback by default, body capped while read
  node.d.ts    hand-written Node declarations — no new dependency, following
               the precedent already set by src/websearch/node-http.d.ts

55 server tests. Mutation check: 7 mutants planted, 7 killed, 0 survivors.

Three defects found and fixed during the phase:

1. THE SERVER COULD NOT START. `validate.ts` imports './figure' with no file
   extension. Vite and TypeScript resolve that; Node's native ESM does not. 49
   unit tests, three typecheck projects, all green — and the real process died
   on its first line with ERR_MODULE_NOT_FOUND. None of them ever started it.
   Fixed by bundling with Vite (already a dependency). boot.test.ts now starts
   the real artifact; 5 of its 6 tests go red against the broken state.

2. TYPECHECK NEVER LOOKED AT server/. tsconfig.json includes only `src`, so the
   whole server was unchecked. Added tsconfig.server.json; it immediately found
   six real type errors, all fixed.

3. Reported in DEFERRED-QUESTIONS #2: the reachability gate was ALREADY failing
   before this phase, and an earlier summary of mine wrongly called it PASS.

New gate: scripts/secret-exposure-gate.mjs (15 tests). Refuses any import of
server/ from src/, and any VITE_* variable whose name looks like a credential —
Vite inlines those into the browser bundle as literal strings.

Root-sweep variant hunt over the whole repo:
  Class "credential reaches the browser": 2 candidates, both ruled SAFE with
    reasons — modelProvider's direct mode is guarded and tested; websearch's
    key-in-URL is server-side only. The gate above now prevents the class.
  Class "unvalidated content into a renderer": ZERO hits repo-wide. No
    dangerouslySetInnerHTML, no innerHTML assignment.

Verified: 2290 tests, 2289 pass, 1 fail (the pre-existing reachability gate).
typecheck clean across 3 projects. eslint clean. vite build OK. server build OK.
secret gate PASS. curriculum sources PASS. bundle budget PASS.

## Next action
Phase 2 — Almanac core: the day ledger that makes "never repeat" possible.

## Phase 2 — Almanac core  [COMPLETE]

frontend/server/almanac/
  plan.ts        the pure rule that decides one day
  ledger.ts      the memory: one written record per student per date
  fileStore.ts   that memory on disk, atomically written
  curriculum.ts  loads the class the student is actually in
  routes         POST /api/day and POST /api/done, in handler.ts

83 Almanac tests, including three property tests that walk thousands of
simulated days. Mutation runs: 9/9 killed on plan.ts, 8/8 on ledger.ts,
4/4 on fileStore.ts. Zero survivors anywhere.

The rules, all enforced and all mutation-proved:
  a finished concept never comes back; unfinished work carries over keeping its
  ORIGINAL date; prerequisites gate; at most one concept per chosen subject; at
  least min(2, subjects) while work remains; minutes stay in 10-25; the daily
  budget holds except that the two-topic floor beats it; the same inputs always
  produce the same day; a day once set never changes; "yesterday" is the most
  recent EARLIER day, because students miss days.

Only the student marks done. Asserted directly: fetching a day repeatedly never
adds to the done set.

Three defects found and fixed:

1. TWO SUBJECTS BOTH CALLED "science" IN CLASS 10 — one with 2 chapters, one
   with 13. Two official documents share a subject name; the builder emitted
   both, and the planner, which treats a subject id as unique, kept whichever
   came first. A Class 10 student would have been shown a syllabus missing
   eleven chapters. Documents are now merged per (class, subject).

2. "UNIT VII" READ AS A TEACHING HEADING. The marks-table row became a concept,
   and Class 10 Mathematics collapsed to a single "concept" called STATISTICS
   AND PROBABILITY. A unit label is now only accepted as a heading when a LIST
   follows it — Chemistry genuinely writes its syllabus that way, and rejecting
   the label outright deleted 56 real Chemistry concepts.

3. SUBJECTS VANISHING SILENTLY. Fixing (2) revealed that Class 10 Mathematics
   produces ZERO concepts and had simply been dropped from the output. Nothing
   failed. New gate `auditClasses`: any subject the manifest promises that comes
   out missing or below 10 concepts fails the build unless it is on a written
   list with a reason.

## OPEN — the curriculum build now FAILS, on purpose

`npm run curriculum:build` exits 1 and names 11 subjects that produce nothing:
  class 10  english-language-and-literature, computer-applications
  class 11  applied-mathematics, history, political-science, psychology, english-core
  class 12  applied-mathematics, sociology, psychology, english-core
plus 12 more listed in KNOWN_THIN as too thin to teach, Class 10 Mathematics
worst among them.

One cause: those syllabuses are laid out as Content/Competencies TABLES, and the
extractor reads prose. This was always true; it was invisible until the gate.
Phase 0 was reported complete. It is not — that report was wrong.

## Next action
Close the table-layout extraction gap so the promised subjects exist, then
Phase 3 (dashboard wiring).

## Extraction gap + ledger race + reachability  [COMPLETE]

### The curriculum gap is closed. Build exits 0.

  before   2160 concepts · 48 subjects · 11 subjects producing NOTHING
  after    4564 concepts · 60 subjects · 0 missing

New readers, each test-driven, each closing a layout the extractor could not see:
  parseContentTable   Content/Competencies tables read in READING ORDER, because
                      three of seven content pages have no vertical gutter and
                      slicing by column welded the neighbouring column onto every
                      title. This alone recovered Class 10 Mathematics, which had
                      ZERO concepts and had been dropped silently.
  bulleted book lists Two conventions in one corpus: Class X numbers both books
                      and texts and tells them apart by case; Class XI numbers the
                      books and bullets the texts. English Core reported eight
                      concepts with twenty texts sitting unread.
  teachableItems      A subject's own topic list is used when it outnumbers the
                      concepts. English's prescribed literature IS the syllabus.

Three root causes found by reading the documents, not by guessing:
  1. "Internal assessment" was in the end-of-syllabus markers. It is a ROW of the
     marks table on page 2 of nearly every document, so the parser stopped a few
     pages in. Psychology yielded pages 2-5 of a 12-page document.
  2. "QUESTION PAPER DESIGN" appears in the MIDDLE of a combined XI-XII document,
     with the whole Class XII syllabus after it. Breaking there threw away a full
     school year. Now it skips to the next unit instead of stopping.
  3. Units are written both "UNIT III: NAME" and "Unit VIII Name". Requiring the
     colon left Psychology with no chapters at all.

### The ledger race is fixed.

Reproduced first: 25 concurrent marks, ONE survivor. The write was atomic; the
read-modify-write around it was not. Writes are now serialised on a promise
chain. Proved two ways — removing the serialiser turns 4 tests red.

### The reachability gate PASSES for the first time on this branch.

See DEFERRED-QUESTIONS #2 for how each of the five dead exports was closed.
One of them was a defect in the GATE, not the code: it analysed one area at a
time and could not see an importer in another, so it called an export dead while
a shipping file used it on every request.

### Hooks

/root-sweep and /thiel added to the enforced set. Three copies of that list had
drifted — the gate required five skills, the reminder named three, and the repo
copy the TESTS run against named ten different ones. That is precisely the
failure force-skills.py's own header predicts, and it blocked two turns in this
session with no warning. All three are now identical and the copies are
byte-for-byte equal, which test_installed_copy_matches_this_one enforces.

### Verified, every one a command that ran

  2458 tests, 2458 passed, 0 failed
  typecheck clean (3 projects) · eslint clean
  app build OK · server build OK · curriculum build OK (exit 0)
  reachability PASS · secret exposure PASS · sources verified · bundle budget PASS
  19/19 enforce_skills tests
