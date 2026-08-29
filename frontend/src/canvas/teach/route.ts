/**
 * THE SAME TRUTH, A DIFFERENT WAY IN.
 *
 * WHY THIS IS NOT A GATE RULE
 * ---------------------------
 * The obvious move is a 32nd rule in `teaching.ts` refusing a lesson that
 * resembles an earlier one. `CONSTRAINTS.md` forbids exactly that, and it is
 * right: "a model optimising against a long rule list produces output that
 * passes and does not teach."
 *
 * A rule can only ever REFUSE. It cannot make the second explanation different
 * from the first. Variation has to happen in generation, and the gate stays the
 * floor it already is.
 *
 * WHAT VARIES, AND WHAT MUST NOT
 * ------------------------------
 * `out-of-the-tar-pit.pdf` splits essential from accidental complexity, and it
 * transfers exactly:
 *
 *   ESSENTIAL  the truth being taught          -- repeat it
 *   ACCIDENTAL the route in: where it opens,
 *              what it shows, which example    -- never repeat it
 *
 * Every axis below is accidental BY CONSTRUCTION. Not one of them can change
 * whether a statement is true, which is what makes rotating them safe. An axis
 * that could alter the content would be a machine for generating confident
 * falsehoods, and `route.test.ts` asserts that no directive here talks about
 * correctness at all.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * -----------------------------------
 * Shannon, 1948: information is surprise, and a message the receiver could have
 * predicted carries zero bits. That is the precise definition of a generic
 * lesson -- not a weak one, literally not a message.
 *
 * And a predictable system gets gamed. The gaming-the-system paper in the same
 * corpus reports students learning the PATTERN rather than the idea: click
 * through, guess the shape, pass the checkpoint without understanding it. So
 * variation is not decoration. It is what stops the checkpoint becoming a
 * formality.
 */

export interface Axis {
  /** Stable id, so "already used" survives a reorder of this list. */
  readonly id: string
  /** What to tell the model about HOW to come at the topic. Never about what is so. */
  readonly directive: string
}

/**
 * Twelve ways into the same idea.
 *
 * Deliberately about opening, order, representation and example domain -- the
 * things a learner perceives as "another explanation" -- and deliberately
 * silent about content.
 */
export const AXES: readonly Axis[] = [
  { id: 'definition-first', directive: 'Open with the definition in plain words, then show it working.' },
  { id: 'example-first', directive: 'Open with one concrete worked example, and name the idea only afterwards.' },
  { id: 'problem-first', directive: 'Open with a small problem the learner cannot yet solve, then give them what solves it.' },
  { id: 'misconception-first', directive: 'Open with the belief learners usually hold here, then show what actually happens.' },
  { id: 'whole-then-parts', directive: 'Show the whole thing first, then take it apart into its pieces.' },
  { id: 'parts-then-whole', directive: 'Build from the smallest piece upward until the whole thing appears.' },
  { id: 'contrast', directive: 'Teach it side by side with the thing it is most often mixed up with.' },
  { id: 'sequence', directive: 'Walk through what happens step by step, in the order it happens.' },
  { id: 'everyday-example', directive: 'Reach for an example from money, cooking, sport or travel rather than a textbook one.' },
  { id: 'scale-up', directive: 'Start with a single instance, then show the same idea at a much larger scale.' },
  { id: 'numbers-first', directive: 'Lead with actual numbers in a table or chart, and let the idea follow from them.' },
  { id: 'question-led', directive: 'Lead by asking the learner what they expect to happen, then show it.' },
]

export function routeDirective(axis: Axis): string {
  return axis.directive
}

/**
 * A small deterministic PRNG (mulberry32).
 *
 * `Math.random()` is deliberately not used. `plan()` and `beats()` in this
 * codebase are pure for the same reason: the same learner state must produce
 * the same route on every machine, or a route is not something a test can pin
 * down and a bug in one is unreproducible.
 */
function rng(seed: number): () => number {
  let a = (seed >>> 0) + 0x6d2b79f5
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates, and the choice of algorithm is the point.
 *
 * The naive shuffle -- sort by a random key, or swap with any index -- is
 * BIASED: some orderings are far likelier than others, so routes cluster and a
 * learner sees the same one twice before seeing a third. Fisher-Yates is
 * uniform, so a full pass visits every route before any repeats.
 *
 * "Sometimes different" was never the requirement. "Not the one you just had"
 * is, and only an unbiased shuffle gives it.
 */
function shuffled(seed: number): Axis[] {
  const out = [...AXES]
  const next = rng(seed)
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

export interface RouteState {
  /** Anything stable about this learner and topic. Same seed, same order. */
  readonly seed: number
  /** Route ids this learner has already been given for this idea. */
  readonly alreadyUsed: readonly string[]
}

/**
 * The next way in, given what this learner has already been shown.
 *
 * EXHAUSTION IS NOT AN ERROR. A learner who has seen every route and asks again
 * must still be taught, so the cycle restarts rather than refusing. Refusing
 * here would reintroduce the exact failure this repository keeps finding: a
 * learner who asked a fair question and got silence.
 */
export function nextRoute(state: RouteState): Axis {
  const order = shuffled(state.seed)
  const used = new Set(state.alreadyUsed)
  return order.find((axis) => !used.has(axis.id)) ?? order[0]!
}
