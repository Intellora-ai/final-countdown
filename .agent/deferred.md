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

## `verify` cannot pass on this branch: knowledge_search tests need submodules CI never checks out

Found 2026-08-29 while doing the deployed-backend work. NOT caused by it.

`tests/test_knowledge_search.py` arrived in `33ce6f5`. It has 29 tests, and the
ones that search the corpus assert a real property: a search over an empty
directory is a CORPUS FAULT, not a zero-result answer. That assertion is right.

`.github/workflows/verify.yml` contains no `submodules:` key on any checkout, so
the default applies and no submodule is fetched. The corpus directories are
therefore empty on every run, and the `coverage` gate fails with

    corpus fault: system-design-primer: .../knowledge/system-design-primer is
    empty -- submodule not initialised.

Run 33265701199 on `claude/hi-54e935`.

This blocks the branch: `coverage` is a required context, so nothing merges and
nothing deploys until it is resolved.

TWO OPTIONS, AND THEY ARE NOT EQUIVALENT:

1. Check out submodules in the jobs that run this suite. The corpus is 86
   pinned repositories; `ci/gates.toml` records that every checkout in gate.yml
   sets `submodules: false` deliberately, so this is a real cost and a real
   decision, not an oversight to reverse quietly.
2. Give the corpus tests a marker and deselect them in CI, the way `axle` and
   `slow` already work. The tests keep their strength locally; CI stops
   asserting a corpus it does not have.

Option 2 looks right, because the tests are about the corpus being READABLE and
CI has deliberately chosen not to carry it. But it is a decision about what CI
certifies, so it needs to be made deliberately and written down, not patched.

Do NOT weaken the assertions. They are correct: a search of an empty directory
returning nothing is exactly the lie the module was written to refuse.
