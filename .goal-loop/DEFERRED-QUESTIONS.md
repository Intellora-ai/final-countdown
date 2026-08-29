# Deferred — needs a human or an external change

## 1. Exam syllabi cannot be fetched from official sources today

**Checked on 2026-08-25, by HTTP probe, not by assumption:**

| Source | URL | Result |
|---|---|---|
| JEE Main syllabus | `jeemain.nta.ac.in/images/syllabus-for-jee-main-2024-as-on-01-november-2023.pdf` | **502 Bad Gateway** |
| JEE Main syllabus (nic.in) | `jeemain.nta.nic.in/images/...` | **404** |
| CLAT UG syllabus | `consortiumofnlus.ac.in/clat-2026/ug-syllabus.html` | **404** — the 2026 cycle is over |

**Why this is not solved by using another site.** Every CBSE fact in this repo
is traceable to an official document and a page number. Filling the exam layer
from a coaching site would put untraceable claims next to traceable ones, and
nobody downstream could tell which was which.

**Timing that matters, and is not blocked:**
- **CLAT 2027 is on 6 December 2026 — 103 days from today.** Registration runs
  3 August to 31 October 2026. This is the nearest real deadline.
- JEE Main 2027 official syllabus is expected in **October 2026**. Until then the
  current official syllabus is the 2024 revision.
- NEET UG 2026 syllabus was finalised by NMC on 22 December 2025 with no
  chapters removed.

**A JEE fact the planner must model.** The 2024 revision REMOVED chapters that
are still in the CBSE board syllabus:
- Mathematics: Mathematical Induction, Mathematical Reasoning
- Physics: Communication Devices
- Chemistry: Surface Chemistry, States of Matter, Isolation of Metals,
  s-block Elements, Hydrogen, Environmental Chemistry, Alcohols/Phenols/Ethers,
  Polymers

A JEE aspirant revising those is spending board-exam time on non-JEE content, so
an exam chapter needs a status of included or removed, not just a name.

**What is needed:** either the official URLs come back up, or you point me at the
official PDFs you have. Nothing else in the plan is blocked by this.

## 2. [RESOLVED 2026-08-25] The reachability gate WAS failing, from before this work

**Proof it is pre-existing, not caused by Phase 1:**
- Removing `frontend/server/` entirely and re-running the gate: still FAILS, identically.
- Running the gate in a clean `git worktree` at HEAD: still FAILS, identically.
- `frontend/scripts/reachability-gate.mjs` is byte-identical to HEAD.

**I reported this gate as PASS in an earlier summary. That was wrong** — I read a
truncated output. It has been failing the whole time.

**What it says, and it is right:**

```
[websearch] 11/11 source files reachable from entry points
  DEAD  src/websearch/latency.ts exports percentile
  DEAD  src/websearch/quality.ts exports citationSupports
  DEAD  src/websearch/quality.ts exports RetrievalInput
  DEAD  src/websearch/quality.ts exports RetrievalReport
  DEAD  src/websearch/quality.ts exports retrievalReport
REACHABILITY GATE: FAIL
```

Verified by reading every reference in `src/websearch/`: all five are called
**only from their own test files**. `Latency` mentions `percentile` in three
comments and never calls it. This is the same shape as the `src/agent` orphans
CLAUDE.md describes — written, tested, and reachable by nothing that ships.

**Why I did not "fix" it during Phase 1.** The only honest fixes are to wire
them to a real caller or to delete them. `retrievalReport` needs `judged`,
`relevantTotal` and `aspectsRequired` — inputs only the benchmark has, never a
live request — so it cannot be wired into a serving path without inventing a
caller. Inventing a caller to turn a gate green is gaming the gate, which is the
one thing this repo's rules are most explicit about.

**When it should be fixed: Phase 4**, which wires `src/websearch` into the
server for real. At that point `citationSupports` has a genuine caller (checking
a lesson's claims against the sources it searched), and `retrievalReport` and
`percentile` belong in `corpus.ts`'s benchmark run, replacing the
precision/recall/coverage it currently computes by hand.

**Decide if you disagree:** wire in Phase 4 (my recommendation), delete now, or
fix now by refactoring `corpus.ts`.


### Resolution of #2

All five dead exports are closed, none of them by deletion-to-silence:

- `retrievalReport`, `RetrievalInput`, `RetrievalReport` — WIRED. `corpus.ts`
  was rebuilding, by hand, exactly what `retrievalReport` returns. Two copies of
  one calculation, and the second copy was the only thing keeping the first
  unreachable. Replaced with a call; identical output.
- `citationSupports` — WIRED. `/api/search` now reports, per result, whether the
  page actually supports the query. A page that mentions the words but not the
  figure is not an answer, and this function already knew the difference.
  The gate then still called it dead: it analysed one area at a time and could
  not see an importer in `server/`. That was a GATE defect, fixed at rung 6 of
  the escalation ladder, with a test that fails without the fix.
- `percentile` — DELETED, superseded. `latency.ts` held two implementations of
  nearest-rank: this one, which sorted a copy on every call, and a private
  `fromSorted` used by `summary`. The header records a 200k-sample test failing
  twice over on exactly that sorting. The private one won and is now exported as
  `nearestRank`; all ten of `percentile`'s tests moved onto it unchanged.
- `memoryStore` — MOVED into `ledger.test.ts`. A test double living in
  production code is production code nobody runs. `fileStore` is what ships.

REACHABILITY GATE: PASS.
