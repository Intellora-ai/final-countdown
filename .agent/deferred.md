# Deferred

Unrelated issues noticed while working on something else. Recorded here under
the Scope Lock rule in `CLAUDE.md`: noticed, not fixed, so that neither the
finding nor the focus is lost.

**This file is a queue, not an archive.** An entry that is fixed gets deleted,
not ticked — a list that only grows stops being read.

Format:

```
## <short title>
- found:   YYYY-MM-DD, while doing <what>
- where:   path/to/file.ts:123
- what:    one sentence on what is wrong
- why not now: which Scope Lock rule kept it out of that task
```

---

## eslint does not cover frontend/e2e/ (found 2026-08-29)
`npx eslint frontend/e2e/**` returns "File ignored because no matching configuration was supplied" for every file. The whole e2e directory, including the reporter that decides what CI failures look like, is unlinted. Unrelated to the annotation work, so recorded rather than fixed.

## Hand-written engine companion does not meet the teaching arc

`frontend/src/canvas/lessons/handwritten/contract-honoured-by-hand.json` fails
`checkTeaching` at `arc: true` after Batch 4 raised the engine's output contract.

Measured, not guessed:

| Rule | Detail |
|---|---|
| `definition-too-long` | its definition block is 54 words; the cap is 30 |
| `definition-split-up` | that definition runs across two sentences |
| `no-summary` / `nothing-is-shown` | it has neither a summary nor a shown block |
| `nothing-marked` | no block marks a term |

Not fixed here because fixing it is AUTHORING -- rewriting a human's prose --
not a change to `learning_os/api/emit.py`, which is what Batch 4 is about. The
two engine-GENERATED lessons now pass the same gate, which is the claim Batch 4
makes. See `frontend/src/canvas/lessons/engineTeaches.test.ts`.
