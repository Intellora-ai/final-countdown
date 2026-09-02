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
