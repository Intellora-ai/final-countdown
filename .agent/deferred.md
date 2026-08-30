
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

### Where the 30 came from — settled, so the deferral is not ambiguous

The open question was whether the CAP or the LESSON is wrong. Out-of-the-tar-pit's
test applies: if someone can state the teaching reason, the number is essential
and the lesson is too long; if nobody can, the number is accidental and the
lesson is evidence against the rule.

Someone can. Two independent records:

- `teaching.ts`, on `MAX_DEFINITION_WORDS`: it is "the single sentence the
  learner should be able to hold", and "a definition delivered in four
  instalments is not a definition". That is a teaching reason, not a rendering
  one.
- Commit `8ac9c54`, which introduced it, carries the requirement verbatim:
  "exactly one definition, <=30 words, one run, no technical term in it" -- a
  stated requirement, not a number someone tuned until the fixtures passed.

So the cap is ESSENTIAL and the hand-written lesson's 54-word definition is
genuinely too long. The fix is to rewrite that block, which is authoring.

Explicitly NOT done, and both are the tempting wrong moves: the cap was not
raised to make the lesson pass, and a good lesson was not compressed to satisfy
a number nobody could justify.

Related: `MAX_RUN_WORDS = 30` is per SEGMENT (a run between blank lines), not per
block -- eight segments of 25 words pass. Only the definition is capped whole.

---

## The required browser gate runs a hand-typed list of spec files

Found while fixing the filler list. Not fixed here: it is a CI change, and this
change is a product one.

`.github/workflows/learning-canvas-frontend.yml:588` runs Playwright against
four literal paths:

    e2e/scene-regressions.spec.ts  e2e/composed-renderer.spec.ts
    e2e/token-invariance.spec.ts   e2e/a11y.spec.ts

Nothing compares that list to the contents of `frontend/e2e/`. `gate_integrity`
check (f) validates `--project=` coverage; there is no equivalent for spec
files. So a spec file is only a gate if somebody also remembered to edit the
workflow, and forgetting is silent.

It has already happened twice:

- `frontend/e2e/practice-session.spec.ts` -- 9 tests, runs in no job. Verified
  by grepping every spec basename across `.github/`, `ci/`, `Makefile` and
  `scripts/`: zero hits.
- `frontend/e2e/journey.spec.ts`, added on this branch and described in its own
  header as "the only logically necessary test in the suite", is in the same
  position. Its `npm run test:journey` script has no CI caller.

The fix is a script of roughly thirty lines: read the directory, read the spec
paths out of the workflow's `playwright test` steps, fail on any file in
neither, and require an intentional exclusion to be declared with a reason.
Watched failing first means it must go red on `practice-session.spec.ts` before
any list is edited.

Worth stating plainly because it is the general shape: an enumerated list is
only as good as whoever last edited it, and nothing here notices when it falls
behind. That is the same defect as the filler list this commit fixed, one layer
up.

## Three text boxes classify nothing

`classifyTurn` guards the lesson checkpoint only. The other three free-text
boxes check for empty and nothing else:

- `frontend/src/canvas/learn/AskView.tsx:79`   -- `question === ''`
- `frontend/src/canvas/CanvasRoute.tsx:403`    -- `topic.trim() === ''`
- `frontend/src/tutor/TutorView.tsx:209`       -- `draft.trim() === ''`

Typing a greeting into the topic box asks a model to write a whole lesson about
it. Not in scope here; recorded so the next person does not have to rediscover
which boxes are covered.

## `frontend-visual` cannot block a merge

`frontend-verdict` is a required check and aggregates
`needs: [frontend, frontend-mutation, frontend-scenes]`. `frontend-visual` is
absent from that list, so a visual regression turns its own job red and the
verdict stays green.
