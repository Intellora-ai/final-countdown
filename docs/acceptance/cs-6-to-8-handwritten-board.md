# CS-6 … CS-8 — the board teaches

The batch where the canvas stops describing itself and starts writing. Camera persistence,
handwriting, and the eight-step reference lesson ship together because none is demonstrable
without the others: a lesson with no camera cannot be examined, and a camera with nothing drawn on
it has nothing to remember.

## What landed

| CS | Delivered | Files |
|---|---|---|
| 6 | Camera persisted through the adapter, keyed chapter + concept + representation; deterministic fit as fallback, never override; explicit **Fit** control | `types.ts`, `data/store.ts`, `canvas/Board.tsx` |
| 7 | Handwriting — text wiped in, strokes genuinely traced; one object finishes before the next starts; reduced motion keeps the content | `canvas/Handwriting.tsx`, `tokens/fonts.css`, `tokens/typography.css`, `components.css` |
| 8 | The eight-step **Change of state** lesson, gated on learner action at every step | `lib/lesson-script.ts`, `canvas/Board.tsx` |

## Verified in a browser, not only in tests

Run through the real learner flow at 1408 × 768, as a Class 9 chemistry learner:

| Step | Observed |
|---|---|
| 1 | Question written left-to-right in Caveat; **Continue disabled while writing** |
| 2 | "Start with the particles" in accent teal |
| 3 | Particle box drawn as a real traced stroke; 20 indigo particles in an ordered lattice with bloom; handwritten caption |
| 4 | Prediction asked, three real options |
| 5 | Chose the **wrong** answer ("They get heavier") — recorded verbatim on the board |
| 6 | "your prediction is on the board — now we check it" |
| 7 | Causal chain drawn with real arrows: Heat in → Particles vibrate faster → Bonds stretch → Lattice gives way |
| 8 | Reveal, and the temperature slider unlocks |
| — | Slider 273 K → **450 K**; semantic count stayed at **9**, because a parameter change is not a teaching step |
| — | Zoom ×4, full page reload → zoom **1.9389 restored exactly** |

Final state: **Step 8 of 8 · 9 semantic operations recorded.** Above the floor of eight.

## Three defects the browser found that the tests could not

**The board cropped its own content at zoom 1.** `vh` was derived from the panel's pixel height
(478) against a 640-unit world, putting the frame at `y = 320 − 239 = 81` and cutting the question
off the top — it rendered perfectly and was invisible. The viewBox now sizes from the world with
`preserveAspectRatio="xMidYMid meet"`, so zoom 1 fits every board on every panel, which is what
the chapter map's own comment had warned about all along.

**Two overlaps.** The prediction prompt landed on the figure caption, and the note landed on the
recorded answer. Both were unreadable rather than ugly — two handwritten lines on top of each
other defeat the entire claim that the learner can follow what is being written. Vertical position
now comes from one `BAND` table, so a new step cannot silently land on an existing one.

**The zoom buttons lost presses.** `onClick={() => setZoom(zoom * 1.18)}` reads `zoom` from the
closure, so two clicks in one render both computed from the same stale value and the second did
nothing. Measured: two presses persisted `1.18`, not `1.18²`. Now a functional updater; three
further presses correctly produced `1.18⁴`.

None of these is visible from a passing test suite. All three were found by opening the board.

## Handwriting: what is real and what is a wipe

Strokes are genuinely drawn — `stroke-dasharray` set to the measured path length, `stroke-dashoffset`
animated to zero, so an arrow is traced end to end as a pen would.

Text is **not**. Glyphs are not paths, and stroking their outlines draws letters in outline order,
which looks nothing like writing. Text is revealed by a left-to-right wipe in a handwriting face.
That is a wipe, and calling it one matters: the claim made to the learner is "this is appearing as
I say it", not "this is my handwriting", and a wipe satisfies the first honestly.

`prefers-reduced-motion` skips the reveal and calls the completion callback immediately, so the
same words and marks are on the board and only the animation is gone. The static result is
identical either way.

## Colour: the ruling held under contact with the real thing

Teal carries explanation and state — the concept label, the recorded prediction, the reveal
annotation, the slider value. Indigo carries matter — the particles, and only the particles. Glow
is `drop-shadow` over existing tokens at two radii; **no new colour token was added**, which the
board confirms visually: the particles read as substance rather than as another label.

## Known limitation

Reopening a concept restarts the lesson at step 1. The operation log is per-session; persisting and
replaying it into a restored scene is DOD-6 work and belongs with the replay changeset, not here.
Recorded rather than glossed.

## Rollback

`git revert` the batch commit. Only `frontend/` and `docs/` are touched.
