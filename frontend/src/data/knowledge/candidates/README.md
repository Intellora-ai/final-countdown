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

## Promoting one

Move the model into `src/data/knowledge/cbse/class-<n>/<subject>.json`, set
`status` to `verified` and add a `verifiedAt` date. The schema refuses a
`verified` model with no date, and `gate:knowledge` will check its quotations,
its topic id and its name against the curriculum.
