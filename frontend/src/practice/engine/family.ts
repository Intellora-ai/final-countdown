/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A TOPIC IS ABOUT — the path that did not exist.
 *
 * THE ROOT CAUSE
 * --------------
 * `provider.ts` holds `TEMPLATES: Record<ReasoningStructure, Template>`. Ten
 * templates, keyed by HOW to reason -- recall, chain, comparison -- and never
 * by WHAT the topic is about. The curriculum has 3,461 practisable topics, and
 * the topic name reached the generator in exactly one place: as a string
 * dropped into a sentence written for no topic in particular.
 *
 * Nothing in those templates was broken. There was simply no path by which the
 * SUBJECT MATTER of a topic could influence the question, so the topic could
 * only ever be a label. Measured on the real Class 10 curriculum, 12 of 12
 * generated questions read like this:
 *
 *     "Two systems differ only in Zeros of a polynomial.
 *      One reads 100, the other 2. By how much does the first exceed
 *      the second?"
 *
 * This module is that missing path.
 *
 * WHAT IT IS NOT, BEFORE WHAT IT IS
 * ---------------------------------
 * It is not a model and it understands nothing. It classifies a topic into one
 * of a handful of concept FAMILIES from the topic's own words, and each family
 * owns questions that ask something real about that kind of mathematics with
 * arithmetic the verifier can recompute.
 *
 * FOR EVERYTHING ELSE IT RETURNS `generic`, OUT LOUD, IN THE RETURN VALUE. A
 * classifier that reached for the nearest family would produce an area question
 * about a grammar topic, and a confidently wrong question is indistinguishable
 * from a right one until a student reads it. Unknown is a real answer here.
 *
 * THE HONEST BOUNDARY. Seven families do not cover 3,461 topics. What this
 * changes is that SOME topics now get questions genuinely about themselves,
 * and the rest are marked as not covered rather than dressed up. That number is
 * measurable and is meant to be measured.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FAMILIES = [
  'polynomial-roots',
  'area-circle',
  'probability',
  'arithmetic-progression',
  'linear-equation',
  'statistics-average',
  'ratio',
  'generic',
] as const;

export type ConceptFamily = (typeof FAMILIES)[number];

/**
 * Words that identify a family, matched as WHOLE WORDS.
 *
 * A LIST, and named as one. No structural property separates "polynomial" from
 * "paragraph"; what separates them is what the word means, and that is
 * knowledge rather than shape. Pretending otherwise would make this look more
 * general than it is.
 *
 * Whole-word matching is load-bearing: `area` inside `Linear search in an
 * array` must not select the circle-area family, and a substring match would
 * make exactly that mistake.
 */
const SIGNALS: Readonly<Record<Exclude<ConceptFamily, 'generic'>, readonly string[]>> = {
  'polynomial-roots': ['polynomial', 'polynomials', 'zeros', 'zeroes', 'roots', 'quadratic'],
  'area-circle': ['circle', 'circles', 'sector', 'sectors', 'segment', 'segments', 'circumference'],
  probability: ['probability', 'probabilities', 'chance', 'outcomes'],
  'arithmetic-progression': ['progression', 'progressions', 'a.p.', 'ap', 'nth', 'sequence'],
  'linear-equation': ['linear', 'equations', 'equation', 'variables', 'substitution', 'elimination'],
  'statistics-average': ['mean', 'median', 'mode', 'average', 'grouped'],
  ratio: ['ratio', 'ratios', 'proportion', 'percentage', 'percent'],
};

/**
 * Which family a topic belongs to, or `generic` when none of them fits.
 *
 * FIRST MATCH IN DECLARATION ORDER, not "best" match. A scoring scheme would
 * invent confidence it does not have -- "Areas related to circles" scores for
 * both `area-circle` and nothing else, and a topic that genuinely straddles two
 * families is a topic this module should not be guessing about at all.
 */
export function familyOf(topicName: string): ConceptFamily {
  const words = new Set(
    String(topicName ?? '')
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((word) => word.length > 0),
  );

  for (const [family, signals] of Object.entries(SIGNALS)) {
    if (signals.some((signal) => words.has(signal))) return family as ConceptFamily;
  }

  return 'generic';
}

/** One question, and the means to check its own answer. */
export interface FamilyQuestion {
  readonly text: string;
  readonly expected: number;
  readonly unit: string;
  readonly options: readonly number[];
  /**
   * Why each wrong option is wrong, in the order the wrong options appear.
   *
   * §18: a distractor is the answer a REAL MISTAKE produces, and the mistake is
   * recorded rather than left implicit. A wrong option nobody can explain is
   * noise, and it is also useless for the diagnosis this engine exists for.
   */
  readonly wrongReasons: readonly string[];
  readonly solution: string;
  /**
   * Recomputes the answer by the family's own arithmetic.
   *
   * Present so a test can verify the stated answer against the numbers in the
   * question rather than against whatever the code happened to return, which
   * is an oracle that tests nothing.
   */
  readonly check: () => number;
}

/** Deterministic, seeded, and never `Math.random` — a question must not change under the student. */
function pick(seed: number, lo: number, hi: number): number {
  const mixed = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  return lo + Math.floor(mixed * (hi - lo + 1));
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Four distinct options containing the answer, placed by the seed.
 *
 * EXPORTED FOR ITS OWN TEST, because a mutant proved it could not otherwise
 * fail: deleting the collision guard below changed no result. Every family in
 * use today produces a positive answer, so the proportional step is never zero
 * and the four values never collide -- the guard was correct and unreachable,
 * which is indistinguishable from correct and absent.
 */
/**
 * Four options from the answer and three NAMED MISTAKES.
 *
 * §18: "wrong options should represent plausible errors". The first version
 * derived them from the answer by ±20%, and the cost was visible on the first
 * real question:
 *
 *     A bag holds 7 red and 4 blue marbles. P(red)?
 *     -> 0.636 | 1.636 | -0.364 | 2.636
 *
 * Three of those are impossible. A student who knows only that a probability
 * lies between 0 and 1 eliminates them without doing any mathematics.
 *
 * COLLISIONS ARE RESOLVED, NOT ASSUMED AWAY. Two different mistakes can land on
 * the same number -- forgetting a factor and inverting a ratio agree more often
 * than you would guess -- and a set of four that contains three values shows a
 * student three choices where the screen promises four. Each duplicate is
 * nudged by a whole unit, which keeps it a wrong answer without pretending the
 * mistake it came from was different.
 */
function fourFrom(
  expected: number,
  mistakes: readonly number[],
  seed: number,
  bounds: readonly [number, number] = [-Infinity, Infinity],
): readonly number[] {
  const [low, high] = bounds;
  /*
   * THE NUDGE IS PROPORTIONAL AND BOUNDED, and both halves were bugs.
   *
   * Nudging by a whole unit pushed a probability to 1.5 -- an impossible value,
   * reintroducing the exact defect this function was written to remove. A
   * bounded quantity has to stay inside its bounds however a collision is
   * resolved, and the size of a meaningful nudge depends on the quantity: 1 is
   * nothing next to an area of 235 and everything next to a probability of 0.6.
   */
  const scale = Math.max(Math.abs(expected) * 0.05, 1e-3);
  const clamp = (value: number): number => Math.min(high, Math.max(low, value));

  const seen = new Set<number>([round(expected)]);
  const distinct = mistakes.map((value) => {
    let candidate = round(clamp(value));
    let bump = 1;
    while (seen.has(candidate) && bump < 64) {
      /* Alternate up and down, so a value pinned at a bound can still move. */
      const direction = bump % 2 === 0 ? 1 : -1;
      candidate = round(clamp(value + direction * Math.ceil(bump / 2) * scale));
      bump += 1;
    }
    seen.add(candidate);
    return candidate;
  });

  const all = [round(expected), ...distinct];
  const at = seed % 4;
  return [all[at]!, ...all.filter((_, index) => index !== at)];
}

/**
 * Exported for its own test, because a mutant proved it could not otherwise
 * fail: no family in use produces a collision, so the resolution above was
 * correct and unreachable -- which from the outside is identical to absent.
 */
export const optionsAround = (expected: number, seed: number): readonly number[] =>
  fourFrom(expected, [expected + 1, expected - 1, expected + 2], seed);

export function questionFor(family: ConceptFamily, seed: number): FamilyQuestion {
  const build = BUILDERS[family];
  return build(seed);
}

type Builder = (seed: number) => FamilyQuestion;

const BUILDERS: Readonly<Record<ConceptFamily, Builder>> = {
  /* Sum of the zeros of x^2 - (p+q)x + pq is p + q. Real, checkable, and the
     question asks about zeros rather than announcing that it is about them. */
  'polynomial-roots': (seed) => {
    const p = pick(seed, 2, 12);
    const q = pick(seed + 41, 2, 12);
    const b = p + q;
    const c = p * q;
    const expected = b;
    return {
      text: `The polynomial p(x) = x² − ${b}x + ${c} has two zeros. What is the sum of those zeros?`,
      expected,
      unit: '',
      /* The three mistakes: reading the sum off the constant term, dropping the
         sign, and halving as though the zeros were equal. */
      options: fourFrom(expected, [c, -b, b / 2], seed),
      wrongReasons: [
        'Read the sum off the constant term, which is the PRODUCT of the zeros.',
        'Forgot that the sum is minus the coefficient of x, not the coefficient itself.',
        'Assumed the two zeros are equal and halved the coefficient.',
      ],
      solution: `For x² + bx + c the sum of the zeros is −b. Here −(−${b}) = ${b}.`,
      check: () => b,
    };
  },

  'area-circle': (seed) => {
    const radius = pick(seed, 3, 20);
    const degrees = [30, 45, 60, 90, 120, 180][pick(seed + 7, 0, 5)] ?? 90;
    const expected = round((degrees / 360) * Math.PI * radius * radius);
    return {
      text: `A sector of a circle of radius ${radius} cm subtends an angle of ${degrees}° at the centre. What is its area, to three decimal places?`,
      expected,
      unit: 'cm²',
      /* Forgot the θ/360 fraction, used the circumference formula, used r not r². */
      options: fourFrom(
        expected,
        [
          round(Math.PI * radius * radius),
          round((degrees / 360) * 2 * Math.PI * radius),
          round((degrees / 360) * Math.PI * radius),
        ],
        seed,
        /* An area is positive. A negative one is not a mistake a student makes. */
        [0.001, Infinity],
      ),
      wrongReasons: [
        'Used the area of the WHOLE circle and forgot the θ/360 fraction.',
        'Used the arc length formula 2πr instead of the area formula πr².',
        'Used r instead of r² in the area formula.',
      ],
      solution: `Area of a sector is (θ/360) × πr². Here (${degrees}/360) × π × ${radius}² = ${expected} cm².`,
      check: () => round((degrees / 360) * Math.PI * radius * radius),
    };
  },

  probability: (seed) => {
    const red = pick(seed, 2, 9);
    const blue = pick(seed + 13, 2, 9);
    const total = red + blue;
    const expected = round(red / total);
    return {
      text: `A bag holds ${red} red marbles and ${blue} blue marbles. One marble is drawn at random. What is the probability that it is red, to three decimal places?`,
      expected,
      unit: '',
      /*
       * All three stay inside 0 and 1, which is the point. The mistakes are the
       * other colour, the ratio red:blue read as a probability, and dividing by
       * the wrong count.
       */
      options: fourFrom(
        expected,
        [round(blue / total), round(Math.min(red, blue) / Math.max(red, blue)), round(red / (total + 1))],
        seed,
        /* A probability cannot leave [0, 1], whatever a collision does. */
        [0, 1],
      ),
      wrongReasons: [
        'Found the probability of the OTHER colour.',
        'Gave the ratio of the two colours instead of a probability.',
        'Divided by the wrong total.',
      ],
      solution: `Probability is favourable outcomes over total outcomes: ${red} ÷ ${total} = ${expected}.`,
      check: () => round(red / (red + blue)),
    };
  },

  'arithmetic-progression': (seed) => {
    const first = pick(seed, 2, 15);
    const difference = pick(seed + 5, 2, 9);
    const n = pick(seed + 17, 5, 20);
    const expected = first + (n - 1) * difference;
    return {
      text: `An arithmetic progression begins ${first}, ${first + difference}, ${first + 2 * difference}, … What is its ${n}th term?`,
      expected,
      unit: '',
      /* The classic off-by-one, multiplying instead of adding, and the term before. */
      options: fourFrom(
        expected,
        [first + n * difference, first * n, first + (n - 2) * difference],
        seed,
      ),
      wrongReasons: [
        'Used n instead of (n − 1), the most common slip in this formula.',
        'Multiplied the first term by n instead of adding the differences.',
        'Gave the term before the one asked for.',
      ],
      solution: `The nth term is a + (n − 1)d = ${first} + (${n} − 1) × ${difference} = ${expected}.`,
      check: () => first + (n - 1) * difference,
    };
  },

  'linear-equation': (seed) => {
    const a = pick(seed, 2, 9);
    const x = pick(seed + 3, 2, 15);
    const b = pick(seed + 29, 1, 20);
    const c = a * x + b;
    return {
      text: `Solve the equation ${a}x + ${b} = ${c} for x.`,
      expected: x,
      unit: '',
      /* Added instead of subtracted, forgot to divide, divided before subtracting. */
      options: fourFrom(x, [round((c + b) / a), c - b, round(c / a - b)], seed),
      wrongReasons: [
        `Added ${b} to both sides instead of subtracting it.`,
        'Subtracted correctly but forgot to divide by the coefficient.',
        'Divided before subtracting, so the constant was divided too.',
      ],
      solution: `Subtract ${b} from both sides to get ${a}x = ${c - b}, then divide by ${a} to get x = ${x}.`,
      check: () => (c - b) / a,
    };
  },

  'statistics-average': (seed) => {
    const values = [0, 1, 2, 3, 4].map((i) => pick(seed + i * 11, 4, 40));
    const total = values.reduce((sum, value) => sum + value, 0);
    const expected = round(total / values.length);
    return {
      text: `Five readings were recorded: ${values.join(', ')}. What is their mean, to three decimal places?`,
      expected,
      unit: '',
      /* The total itself, the median, and dividing by one fewer reading. */
      options: fourFrom(
        expected,
        [total, [...values].sort((left, right) => left - right)[2]!, round(total / (values.length - 1))],
        seed,
      ),
      wrongReasons: [
        'Gave the total instead of dividing by the number of readings.',
        'Gave the MEDIAN, the middle reading, rather than the mean.',
        'Divided by one fewer reading than there are.',
      ],
      solution: `The mean is the total divided by the count: ${total} ÷ ${values.length} = ${expected}.`,
      check: () => round(values.reduce((sum, value) => sum + value, 0) / values.length),
    };
  },

  ratio: (seed) => {
    const parts = pick(seed, 2, 9);
    const other = pick(seed + 19, 2, 9);
    const total = (parts + other) * pick(seed + 31, 2, 12);
    const expected = round((parts / (parts + other)) * total);
    return {
      text: `An amount of ${total} is divided in the ratio ${parts} : ${other}. What is the larger share of the first part, to three decimal places?`,
      expected,
      unit: '',
      /* Took the other share, divided by the wrong part, split it evenly. */
      options: fourFrom(
        expected,
        [
          round((other / (parts + other)) * total),
          round((parts / other) * total),
          round(total / 2),
        ],
        seed,
      ),
      wrongReasons: [
        'Gave the OTHER share of the ratio.',
        'Divided by the second part instead of by the sum of both parts.',
        'Split the total evenly, ignoring the ratio.',
      ],
      solution: `The first part is ${parts}/${parts + other} of the total: (${parts} ÷ ${parts + other}) × ${total} = ${expected}.`,
      check: () => round((parts / (parts + other)) * total),
    };
  },

  /*
   * NOT A QUESTION, AND THAT IS THE POINT.
   *
   * `generic` means "no family covers this topic". Emitting a plausible
   * question here would be the label-pasting this module replaced, wearing a
   * new coat. It throws, so a caller cannot use it by accident -- the caller's
   * job is to check `familyOf` first and fall back to the old templates
   * knowingly.
   */
  generic: () => {
    throw new Error(
      'No concept family covers this topic. Check familyOf() before calling questionFor().',
    );
  },
};
