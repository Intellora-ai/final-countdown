
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
