# CS-9 … CS-11 — three ways to see one temperature

The batch where "show me another way" stops being a slogan. Three representations now read the
same variable, the switch between them is chosen by the registry rather than by a hard-coded
order, and the board writes observed learner events into the store without inventing a single
number.

## What landed

| CS | Delivered | Files |
|---|---|---|
| 9 | KaTeX melting condition; representation registry wired to the board; switching ranked by `cannotExplain` | `lib/lesson-representations.ts`, `canvas/MeltingCondition.tsx`, `canvas/Board.tsx` |
| 10 | PixiJS particle simulation with one shared pre-blurred texture; speed ∝ √T; lattice breaks above the melting point | `canvas/ParticleMotion.tsx` |
| 11 | Observed progress writes — attempts, seconds, activity events | `lib/progress-writer.ts` |

## Verified in a browser

| Check | Observed |
|---|---|
| Registry ranking | With `particle-lattice` active, the two offers were **"Show me melting condition"** and **"Show me particle motion"** — exactly the two covering its declared gaps |
| Declared limits shown | `cannot explain: the exact temperature at which it melts; how much heat a given mass needs; how individual particles move at a given temperature` |
| KaTeX | rendered `T=450K > T_fus=273.15K ⇒ no longer solid`, with the spoken equivalent beside it |
| Physics | phase at 450 K = **gas** (above 373.15 K), correct |
| PixiJS | canvas 300 × 190 live; *"20 particles at 450 kelvin. Average speed is **1.28** times their speed at the melting point."* — √(450 / 273.15) = 1.2835 |
| Synchronisation | slider, equation and simulation all moved from the one temperature |

**T4 satisfied across three representations**, none of which holds a copy of the value.

## The switching order is derived, not authored

Nobody wrote "after the causal chain, offer the melting condition". The chain declares it cannot
explain the threshold; the condition declares it can; the registry ranks by that overlap. The test
asserts both the ordering *and* the declarations behind it, so a future edit that widened
`explains` dishonestly would not quietly start passing.

## Why the bundle got split

Bundled eagerly, PixiJS and KaTeX pushed the main chunk to **738 kB** — every learner opening any
page downloading a WebGL renderer for one representation inside one lesson. Both are now
`React.lazy` imports:

| | Before | After |
|---|---|---|
| main chunk | 738.03 kB (229.67 kB gzip) | **242.42 kB (78.24 kB gzip)** |
| `ParticleMotion` | — | 236.57 kB, on demand |
| `MeltingCondition` | — | 258.73 kB, on demand |

The main chunk grew by 8 kB for this batch. A learner who never asks for the simulation never
downloads it.

## The physics is real, and honest about its limits

`WATER.fusionK = 273.15` and `vaporisationK = 373.15` are the actual values at one atmosphere, not
numbers chosen to make a demo work. Speed scales with **√T**, the real kinetic-theory
relationship, and is reported as a *multiplier against the speed at the melting point* rather than
in metres per second — the simulation has no mass and no scale, so a figure in real units would be
invented.

`melting` is kept as its own phase rather than rounded into solid or liquid. A substance at its
melting point absorbs heat *without getting hotter*, which is the entire subject of this lesson;
collapsing it would hide the thing being taught.

Particle starting velocities come from the index, not `Math.random` — a replayed scene must show
the same motion.

## What CS-11 deliberately does not write

- **hints** — this board has no hint affordance, so a hint count would be a zero pretending to be
  an observation.
- **accuracy, confidence, score** — nobody has defined what one prediction on one concept would be
  a percentage *of*. Correctness is logged as an event; it is never folded into a ratio.
- **representations visited** as a progress metric — it goes in the activity log. "How many ways
  did they look at it" measures nothing until someone says what it would mean.
- **weakness** — `weaknessHook` still returns `null`. Two wrong predictions is two wrong
  predictions, tested explicitly.

Seconds are measured from an injected clock, floored, never written when they round to zero, and
`close()` is idempotent so an unmount twice does not double the time.

## Results

typecheck exit 0 · **70 tests / 10 files** · build succeeds with code-split chunks

## Rollback

`git revert` the batch commit, then `npm ci` to drop `katex` and `pixi.js` from the tree. Only
`frontend/` and `docs/` are touched.
