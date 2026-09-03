# Candidates: what a model proposed, and nobody has read yet

Nothing in this directory is shown to a student. `src/knowledge/load.ts` returns
only `status: "verified"` models, and it globs `../data/knowledge/cbse/**` —
which is not here — so these are not in the browser bundle either. They are
committed because they need reviewing, and a review needs a diff.

## How they got here

`scripts/knowledge/build.mjs`, run on 2026-09-03 over one topic per subject
across all four classes. Each topic's own sha256-locked syllabus page was put in
front of the model, which was told to quote it for every concept it named.
Anything it could not quote was discarded before the file was written, and
`npm run gate:knowledge` re-checks all 150 quotations against the real PDFs.

## The finding that matters before you review any of this

Half the batch ran on `gemma3:12b`. Partway through, the machine reached 11%
free memory, so the rest ran on `qwen2.5:7b`, roughly half the size. The
difference is not subtle:

| model | topics | concepts | mean per topic | returned only one concept |
|---|---|---|---|---|
| `gemma3:12b` | 20 | 98 | **4.9** | 2 of 20 |
| `qwen2.5:7b` | 29 | 39 | **1.3** | **25 of 29** |

A "decomposition" of one concept is almost always the topic's own name said
again. So the `qwen2.5:7b` candidates are mostly not worth your time — read the
`gemma3:12b` ones, and re-run the rest on a larger model when there is memory
for it. Every model records which one wrote it in `generatedBy`.

This is the reason a first batch is run at all, and it is an argument about
model size rather than about prompts: both halves got the identical brief.

## The web check, and what it is worth

`scripts/knowledge/webcheck.mjs` asks the different question `gate:knowledge`
cannot: not "was this quoted from the page" but "is this an idea the world
recognises". It searches each concept name and asks whether **two independent
sites** name the whole thing.

Run on 2026-09-03 over 104 concepts from 38 of these models:

| verdict | count |
|---|---|
| recognised (two or more independent sites) | 15 |
| unrecognised | 53 |
| could not check (the search did not answer) | 36 |

**Read the "unrecognised" column with care, because the check has a measured
bias.** Every one of the fifteen it confirmed has a short name — CPU, Fungi,
SMTP, TCP/IP, Internet, Measurement, Mole Concept. Every longer name failed,
including ones that are plainly real: "Web Servers" found only one site,
"Network Protocols" none, "Capital and revenue receipts" could not be checked at
all. The check requires every word of a name to appear inside one short search
snippet, and a long name rarely does.

So it is a **positive signal and not a gate**: `recognised` means something,
`unrecognised` mostly means the name was too long to confirm this way. It does
not promote anything and it must not be used to reject anything on its own.

The other half of the reason is the search itself. Measured the same day: one
engine returned US court records and Fresno crime news for "Fundamental Theorem
of Arithmetic mathematics class 10". Adding the subject and class to a query
does not narrow it, it replaces it — the same finding that moved the reading
level out of the question in `server/openweb.ts`, arrived at twice.

## Promoting one

Move the model into `src/data/knowledge/cbse/class-<n>/<subject>.json`, set
`status` to `verified` and add a `verifiedAt` date. The schema refuses a
`verified` model with no date, and `gate:knowledge` will check its quotations,
its topic id and its name against the curriculum.

---

## What was promoted on 2026-09-03, and what was not

The owner handed this gate over ("do it yourself"), so it was read and decided
here rather than waiting. Ten topics are now `verified` and on screen; the
rest stay candidates, each for a reason.

**The bar, applied in this order.** A model had to clear all four:

1. the topic passes `teachable.ts` (all twenty did -- this refuses nothing here)
2. at least TWO concepts that are not the topic's own name said again
3. no two concepts the same, and no two sharing an id
4. the concepts are right for that subject at that level, read one by one

**Promoted (10 distinct topics, 65 concepts, every quotation re-checked against
the locked PDFs by `npm run gate:knowledge`):** computer networking and the
characteristics of a computer (Computer Applications, 9 and 10); the five
kingdoms (Biology 11); some basic concepts of chemistry (Chemistry 11); units
of measurement (Physics 11, which Class 12 resolves too); binary numbers
(Applied Mathematics 11, likewise); meristematic and permanent tissues
(Science 9/10); miracles in biotechnology (Science at Advanced Level 9/10);
book-keeping objectives (Class 9); and the pre-modern world (Social Science 10).

**Left as candidates, with the reason:**

| topic | why it stayed |
|---|---|
| Capital and revenue receipts (10) | two of its three concepts are the topic's name and then "Capital" and "Revenue" -- it says nothing the title did not |
| Fundamental Theorem of Arithmetic (10) | one real concept beyond the name; a two-item scope where one item is the title |
| circles (11) | one concept, and it is the topic's name. If this topic really is one idea it should be `shape: atomic` with no concepts at all, which is a different fix |
| Uses language appropriate to social context (9) | the one concept is the topic restated |
| Understands numbers, natural to real (9) | "Numbers" and "Real Numbers" for a title that already names six kinds |
| An overview 5 (Biotechnology 11) | **a generator defect, not a judgement** -- see below |
| the 29 `qwen2.5:7b` models | 1.3 concepts per topic, 25 of 29 giving only the topic's name back. Re-run them on a larger model; do not read them one by one |

**The generator defect, found by promoting.** Every concept in the
Biotechnology "An overview 5" model carries the id `biotechnology-an-overview`
-- the TOPIC's slug, four times, instead of each concept's own. The names are
the model's contribution and they are fine; the ids are `build.mjs`'s and they
are wrong. It went back to candidates rather than being repaired by hand,
because hand-editing model output is exactly what the verify-then-promote
pipeline exists to avoid. `build.mjs` should slug each concept's name.

**One topic id can belong to two classes, and one model serves both.** Class 11
and 12 share `syllabus--1-binary-numbers`; Classes 9 and 10 share the tissues
and biotechnology topics -- one syllabus PDF generates both. The loader keys by
topic id alone and calls a second copy "described twice", correctly. The lower
class holds the file; both classes resolve it. Promoting both copies is what
made `load.ts` report five broken files, and its own test caught it before any
of this was committed.

---

## The re-run on `qwen3:8b`, and why none of it was promoted

The 29 weak groups were re-run on 2026-09-03 with `KNOWLEDGE_MODEL=qwen3:8b`
(the `knowledge-rebatch` entry in `.claude/launch.json`). It produced **121
models, 397 concepts, 511 quotations all verified against the locked PDFs**.

| model | topics | mean concepts | gave only one |
|---|---|---|---|
| `qwen2.5:7b` (first batch) | 29 | 1.3 | 25 |
| `gemma3:12b` (first batch) | 20 | 4.9 | 2 |
| `qwen3:8b` (this re-run) | 121 | 3.3 | 55 |

**More concepts, and a new way of being wrong.** Read one by one, the bigger
model frequently answers with the CHAPTER's contents attached to one topic --
exactly what the brief forbids ("Not the chapter. Not the subject. That
topic."). Three measurements say it plainly:

- **11% of the models give a concept list identical to another topic's in the
  same subject.** In Class 12 History, all nine Harappan sites -- Harappa,
  Kalibangan, Balakot, Dholavira, Nageshwar, Lothal, Mohenjodaro, Chanhudaro,
  Kot Diji -- received the same list. In Computer Science, "Society" and "Law
  and Ethics" received the same nine.
- "double fertilization" was answered with Apomixis, Parthenocarpy,
  Polyembryony and seed dispersal -- the rest of the chapter, not what is
  inside that topic.
- "One unseen passage to assess comprehension, interpretation, analysis,
  inference and vocabulary" was answered by splitting its own sentence into
  Comprehension / Interpretation / Analysis / Inference / Vocabulary.

**The quotation gate cannot catch any of this**, because those concepts really
are quoted from the page. The gate proves a concept was READ; it cannot prove
it belongs to THIS topic rather than its neighbour.

**So nothing from this batch was promoted, and the fix is not a bigger model.**
It is a check the pipeline does not have yet: a concept that also fits the
topic next door is evidence of a chapter-level answer, and two topics in one
chapter receiving the same list should be refused outright. That check can be
written and tested without a GPU, the way every other rule here was.

