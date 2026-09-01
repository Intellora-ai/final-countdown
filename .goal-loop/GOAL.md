# Goal — Almanac

Build Almanac: a named planner that owns every day of a student's study life,
and a teaching screen that can teach any concept it names.

Plan: ~/.claude/plans/now-i-have-a-clever-lantern.md

---

## TWO PHASE NUMBERINGS EXIST. THEY ARE NOT THE SAME. READ THIS FIRST.

A previous version of this file listed only the plan's phases and said
"Phase 1 server — not started", which was FALSE and had been for some time —
`frontend/server/` exists with all four routes. A stale status file is worse
than none, because the next session believes it.

There are two tracks, both real:

### Track A — the plan's phases (`now-i-have-a-clever-lantern.md`)

- Phase 0 curriculum + exam syllabi — IN PROGRESS
- Phase 1 server — **BUILT** (routes, almanac, memory; not the plan's own gate)
- Phase 2 Almanac core — partly built (`server/almanac/`)
- Phase 3 dashboard wiring — not started
- Phase 4 live lessons — not started
- Phase 5 teaching screen rework — not started
- Phase 6 ask anything — not started

### Track B — the M-phases the owner has been directing session by session

This is the track under active work. Numbering is independent of Track A.

- **Phase 1 — Memory storage foundation (M1, M2, M3). COMPLETE.**
- **Phase 2 — Memory correctness (M4, M5). Rules built, two mutants alive.**
- **Phase 3 — Adaptive explanation engine (R2, M6). Scoping.**

---

## Track B status, with the evidence

### Phase 1 — Memory storage foundation — COMPLETE

Done-when was "M1–M3 tests pass and are mutation-tested". Met.

    M1 persistence  16 tests   7 mutants planted, 7 killed
    M2 isolation    19 tests  11 mutants planted, 11 killed
    M3 retrieval    25 tests  12 mutants planted, 11 killed

M1's crash proof kills a real OS process with SIGKILL and asserts the exit
signal. M3's one surviving mutant is a real finding, not a weak test — see
"Open findings" below.

### Phase 2 — Memory correctness — NOT FINISHED

Done-when: "M4–M5 pass, and writing to lesson A never changes lesson B."

    M4 consistency  19 tests   green
    M5 correctness  21 tests   green
    progress rules  32 tests   green
    whole suite    140 tests   green (8 files)
    behave          31 scenarios, 120 steps green

Mutation run on a verified-green baseline: **11 of 13 killed (85%)**.
TWO SURVIVED, and a survivor is a must-fix:

1. `sqliteStore.ts` — `BEGIN IMMEDIATE` → `BEGIN DEFERRED` survives.
   Nothing catches a lost update, because `node:sqlite` is synchronous and one
   process can never contend with itself. Needs real OS processes.
2. `sqliteStore.ts` — `busy_timeout 5000` → `0` survives. Nothing proves a
   busy database queues instead of erroring.

An earlier 12/13 score was RETRACTED: the agents' files landed mid-run, so part
of it was scored against a red baseline.

**BOTH SURVIVORS ARE DEAD AS OF 2026-09-01, AND THE COUNTS ABOVE ARE STALE.**
This paragraph is left standing rather than deleted because the reasoning in it
was right and is the reason the kills work: neither mutant can die inside one
process, so `m4-consistency.test.ts` grew cases that spawn real OS processes
contending for one file. Re-measured against the pristine file at HEAD:

    BEGIN IMMEDIATE -> BEGIN DEFERRED   3 failed | 18 passed
      "402 of 600 saves were turned away while 5 processes shared one file"
      "the save returned immediately, so it never met the held lock at all"
    busy_timeout 5000 -> 0              3 failed | 18 passed
      "the next student was told her work did not save, when the database was
       merely busy: expected 'database is locked' to be undefined"

The killing cases are `m4-consistency.test.ts:1173` and `:1326`, already
committed. The suite is **174 tests in 10 files**, not the 140 in 8 recorded
above; that line was written before `progress.test.ts` and `variation.test.ts`
grew. A third defect surfaced while proving these: two replicas switching the
journal to WAL at the same moment raced, because `busy_timeout` does not cover
that pragma, and the loser exited at boot. Fixed in `sqliteStore.ts` with a
bounded retry on SQLITE_BUSY (5) and SQLITE_LOCKED (6) only, and pinned by
`m4-startup-contention.test.ts`.

### Phase 3 — Adaptive explanation engine — SCOPING

What already exists, verified by reading:

- `server/teaching.ts` — 11 strategies, 10 diagnoses, `chooseStrategy()`.
  Adaptation on struggle is largely BUILT: 2 attempts → change_representation,
  3+ → analogy, carried-over → decomposition, a named diagnosis outranks counts.
- `server/prompt.ts` — already carries `taught`, `justSaid`, `askedInside`,
  `strategy` to the model.

What does NOT exist anywhere:

- storing an explanation (wording + examples) keyed by lesson + concept
- retrieval of prior explanations for a concept
- any variation check at all

**The defect at the heart of the phase:** `chooseStrategy` picks by attempt
COUNT, so attempts 3, 4, 5 and 6 all return `analogy`. Ask four times, get the
same approach four times. It must know which strategies have ALREADY been used,
not merely how many attempts there have been.

**How M6 can honestly be proven.** The suite runs with the model deliberately
unreachable, and a model's output is not deterministic, so "ask twice and
compare" is not a test. The mechanism is what gets proven: given a model that
returns identical text every time, the system must DETECT the repeat and refuse
to serve it. That is a harder claim than "the two strings differed".

---

## Open findings — real, reported, not fixed

1. `record.ts:75-78` is dead code. Its docblock claims it catches `Date`,
   `NaN`, `Map`; it catches none of them — they are silently coerced. M3 proved
   the line unreachable and pinned it.
2. `MAX_RECORD_BYTES`'s friendly 400 can never reach a browser: `MAX_BODY_BYTES`
   is the same 256 KB, so 413 always fires first.
3. `MemoryStore.write` is dead product code. Every write goes through
   `update()` now; a leak planted in `write` survived all 140 tests.
4. **245 files are deleted in the working tree and NOT committed. 153 are
   tests.** Still recoverable from HEAD. Do not commit before restoring them.

## Blocked, by the owner's decision to defer

- The Stop gate demands rows in real PostgreSQL. Docker's containerd image
  store is corrupt (I/O errors even after a restart; it cannot list images),
  and the host disk is 99% full, so the image cannot be pulled.
- The behave suite therefore runs on the JSON ledger and SAYS SO in its
  receipt. That is the other configuration the product really ships, not a
  fallback that hides anything.
