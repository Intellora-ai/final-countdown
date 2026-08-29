/*
 * ONE PAIR PER RULE: a lesson it must refuse, and one it must let through.
 *
 * Each `refuses` case is the `accepts` case with ONE deliberate mutation, so a
 * failure names the rule's boundary rather than a lesson that was wrong in a
 * dozen ways at once. That is also what stops a pair from passing for the
 * wrong reason: if both halves differ everywhere, "it fired" says nothing
 * about WHY.
 *
 * The pairs are data, not tests. `ruleCensus.test.ts` drives them, and the
 * census reads the rule names out of `teaching.ts` itself — so a new rule
 * arrives here unpaired and the suite says so by name.
 */
import type { Lesson } from '../spec/spec'

interface Case {
  readonly lesson: Lesson
  readonly arc: boolean
}

export interface RulePair {
  readonly refuses: Case
  readonly accepts: Case
}

type Block = Lesson['blocks'][number]

/** A lesson the gate accepts, so every mutation below is the only difference. */
function baseline(): Lesson {
  return structuredClone(BASE) as Lesson
}

const BASE = {
  id: 'photosynthesis',
  question: 'What is photosynthesis?',
  technicalTerms: [{ term: 'chlorophyll', introducedIn: 'mechanism' }],
  blocks: [
    {
      id: 'anchor',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'anchor',
      depth: 'core',
      body: 'Photosynthesis is what a leaf does in sunlight.',
      terms: [{ text: 'leaf', mark: 'key' }],
    },
    {
      id: 'definition',
      kind: 'prose',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      depth: 'core',
      body: 'Photosynthesis is how a plant turns light into food.',
      terms: [{ text: 'light', mark: 'key' }],
    },
    {
      id: 'parts',
      kind: 'table',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'framework',
      depth: 'core',
      columns: [
        { key: 'part', label: 'Part', type: 'text' },
        { key: 'job', label: 'Job', type: 'text' },
      ],
      rows: [
        { part: 'Leaf', job: 'Catches light' },
        { part: 'Root', job: 'Draws water' },
      ],
    },
    {
      id: 'mechanism',
      kind: 'prose',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'component',
      depth: 'core',
      body: 'A green pigment called chlorophyll catches the light energy.',
      terms: [{ text: 'chlorophyll', mark: 'key' }],
    },
    {
      id: 'closing',
      kind: 'summary',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'summary',
      depth: 'core',
      progression: ['Light arrives', 'Leaf catches it', 'Plant makes food'],
      mentalModel: 'A leaf is a kitchen that cooks with light.',
    },
  ],
  relations: [
    { kind: 'supports', from: 'definition', to: 'parts' },
    { kind: 'supports', from: 'parts', to: 'mechanism' },
  ],
} as unknown as Lesson

/** The baseline with one block replaced, so the mutation is the only change. */
function withBlock(id: string, patch: Record<string, unknown>): Lesson {
  const l = baseline()
  const i = l.blocks.findIndex((b) => b.id === id)
  if (i < 0) throw new Error(`no block ${id} in the baseline`)
  ;(l.blocks as Block[])[i] = { ...l.blocks[i], ...patch } as Block
  return l
}

/** The baseline with a block removed. */
function without(id: string): Lesson {
  const l = baseline()
  ;(l as { blocks: Block[] }).blocks = l.blocks.filter((b) => b.id !== id)
  ;(l as { relations: Lesson['relations'] }).relations = l.relations.filter(
    (r) => r.from !== id && r.to !== id,
  )
  return l
}

/** The baseline with a block appended. */
function plus(block: Record<string, unknown>): Lesson {
  const l = baseline()
  ;(l as { blocks: Block[] }).blocks = [...l.blocks, block as Block]
  return l
}

const ok = (lesson: Lesson = baseline()): Case => ({ lesson, arc: true })
const arcOff = (lesson: Lesson): Case => ({ lesson, arc: false })

/**
 * The baseline plus a chart of `chartType` over a CONTINUOUS x axis.
 *
 * The relation is not decoration here: without it `representation-is-decoration`
 * fires and the pair would pass for the wrong reason -- "a rule fired" is not
 * "THIS rule fired".
 *
 * The two halves of the pair differ in `chartType` and nothing else, so a
 * failure names the boundary rather than a lesson that was wrong in a dozen
 * ways at once.
 */
function plusChartOverNumbers(chartType: 'bar' | 'line'): Lesson {
  const l = baseline()
  /* BEFORE the closing summary, not after it. The summary has to be the last
     core block -- `summary-does-not-close-the-core` -- and a representation
     belongs in the body it illustrates rather than past the ending. Appending
     it tripped that rule instead of this one, which would have made the pair
     pass for the wrong reason. */
  const closing = l.blocks.findIndex((b) => b.kind === 'summary')
  const chart = [
    {
      id: 'curve',
      kind: 'chart',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'component',
      depth: 'core',
      chartType,
      xLabel: 'Light (arbitrary units)',
      yLabel: 'Sugar made',
      series: [
        {
          name: 'Rate',
          colorIndex: 0,
          points: [
            { x: 1, y: 0 },
            { x: 2, y: 1 },
            { x: 4, y: 2 },
            { x: 8, y: 3 },
          ],
        },
      ],
    } as unknown as Block,
  ]
  ;(l as { blocks: Block[] }).blocks = [
    ...l.blocks.slice(0, closing),
    ...(chart as Block[]),
    ...l.blocks.slice(closing),
  ]
  ;(l as { relations: Lesson['relations'] }).relations = [
    ...l.relations,
    { kind: 'supports', from: 'mechanism', to: 'curve' },
  ] as Lesson['relations']
  return l
}

/** Thirty-one words: one over the cap, so the boundary is the only difference. */
const THIRTY_ONE =
  'one two three four five six seven eight nine ten eleven twelve thirteen ' +
  'fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone ' +
  'twentytwo twentythree twentyfour twentyfive twentysix twentyseven ' +
  'twentyeight twentynine thirty thirtyone'

/** The same words, broken so no single run exceeds the cap. */
const THIRTY_ONE_BROKEN = THIRTY_ONE.replace('sixteen ', 'sixteen\n\n')

export const RULE_PAIRS: Record<string, RulePair> = {
  /*
   * THE CHART MUST FIT THE DATA, NOT SATISFY A RULE.
   *
   * `nothing-is-shown` already demands a representation, and its own message
   * says one "chosen because it fits, never for decoration" -- but nothing
   * enforced the fitting half, so the cheapest way to satisfy it was to bolt on
   * whatever chart came to mind. A rule that can be satisfied by the wrong
   * answer teaches a model to give the wrong answer.
   *
   * The registry already records when each type is the wrong choice.
   * `REPRESENTATIONS.bar.avoidWhen` is "the x axis is continuous -- use a
   * line", and that is the case made executable here: bars over numbers claim
   * the gaps between them mean nothing, when on a continuous axis they are the
   * whole point.
   */
  'chart-fights-its-data': {
    refuses: ok(plusChartOverNumbers('bar')),
    accepts: ok(plusChartOverNumbers('line')),
  },
  'run-too-long': {
    refuses: ok(withBlock('mechanism', { body: THIRTY_ONE, terms: [{ text: 'seven', mark: 'key' }] })),
    accepts: ok(withBlock('mechanism', { body: THIRTY_ONE_BROKEN, terms: [{ text: 'seven', mark: 'key' }] })),
  },

  'no-definition': {
    refuses: ok(withBlock('definition', { role: 'support' })),
    accepts: ok(),
  },

  'many-definitions': {
    refuses: ok(withBlock('mechanism', { role: 'definition' })),
    accepts: ok(),
  },

  'no-summary': {
    refuses: ok(without('closing')),
    accepts: ok(),
  },

  'nothing-marked': {
    refuses: ok(
      withBlock('mechanism', {
        body: 'A green pigment inside the leaf catches the light energy arriving from the sun above.',
        terms: [],
      }),
    ),
    accepts: ok(),
  },

  'nothing-is-shown': {
    refuses: ok(without('parts')),
    accepts: ok(),
  },

  'marked-term-absent': {
    refuses: ok(withBlock('mechanism', { terms: [{ text: 'photosynthesise', mark: 'key' }] })),
    accepts: ok(),
  },

  'definition-too-long': {
    refuses: ok(
      withBlock('definition', {
        body: `Photosynthesis is ${THIRTY_ONE}`,
        terms: [{ text: 'seven', mark: 'key' }],
      }),
    ),
    accepts: ok(),
  },

  'definition-split-up': {
    refuses: ok(
      withBlock('definition', {
        body: 'Photosynthesis is how a plant works.\n\nIt turns light into food.',
      }),
    ),
    accepts: ok(),
  },

  'definition-is-not-prose': {
    refuses: ok(withBlock('parts', { role: 'definition' })),
    accepts: ok(withBlock('parts', { role: 'framework' })),
  },

  'definition-mixes-in-a-formula': {
    refuses: ok(withBlock('definition', { body: 'Photosynthesis is light + water = sugar for the plant.' })),
    accepts: ok(),
  },

  'definition-mixes-in-an-example': {
    refuses: ok(
      withBlock('definition', {
        body: 'Photosynthesis feeds a plant, for example a leaf in sunlight.',
      }),
    ),
    accepts: ok(),
  },

  'does-not-open-on-the-topic': {
    refuses: ok(withBlock('anchor', { body: 'Great question! Let us begin our wonderful journey today.', terms: [] })),
    accepts: ok(),
  },

  'material-before-the-definition': {
    refuses: ok(withBlock('anchor', { role: 'component' })),
    accepts: ok(),
  },

  'detail-before-framework': {
    refuses: ok(withBlock('anchor', { role: 'classification' })),
    accepts: ok(),
  },

  'component-before-classification': {
    refuses: ok(withBlock('closing', { role: 'classification' })),
    accepts: ok(),
  },

  'many-summaries': {
    refuses: ok(
      plus({
        id: 'second-summary',
        kind: 'summary',
        emphasis: 'primary',
        tone: 'neutral',
        role: 'summary',
        depth: 'core',
        progression: ['One', 'Two'],
        mentalModel: 'A leaf cooks with light.',
      }),
    ),
    accepts: ok(),
  },

  'summary-is-not-core': {
    refuses: ok(withBlock('closing', { depth: 'deeper' })),
    accepts: ok(),
  },

  'summary-does-not-close-the-core': {
    refuses: ok(
      plus({
        id: 'trailing',
        kind: 'prose',
        emphasis: 'supporting',
        tone: 'neutral',
        role: 'support',
        depth: 'core',
        body: 'One more core note.',
        terms: [],
      }),
    ),
    accepts: ok(),
  },

  'deeper-material-inside-the-core': {
    refuses: ok(withBlock('parts', { depth: 'deeper' })),
    accepts: ok(),
  },

  'term-introduced-nowhere': {
    refuses: (() => {
      const l = baseline()
      ;(l as { technicalTerms: Lesson['technicalTerms'] }).technicalTerms = [
        { term: 'chlorophyll', introducedIn: 'no-such-block' },
      ]
      return ok(l)
    })(),
    accepts: ok(),
  },

  'example-isolates-nothing': {
    refuses: ok(
      plus({
        id: 'worked',
        kind: 'prose',
        emphasis: 'supporting',
        tone: 'neutral',
        role: 'example',
        depth: 'core',
        body: 'A leaf in sun makes sugar.',
        terms: [],
      }),
    ),
    accepts: (() => {
      const l = plus({
        id: 'worked',
        kind: 'prose',
        emphasis: 'supporting',
        tone: 'neutral',
        role: 'example',
        depth: 'core',
        body: 'A leaf in sun makes sugar.',
        terms: [],
      })
      ;(l as { relations: Lesson['relations'] }).relations = [
        ...l.relations,
        { kind: 'exemplifies', from: 'worked', to: 'definition' },
      ] as Lesson['relations']
      return ok(l)
    })(),
  },

  'representation-is-decoration': {
    refuses: (() => {
      const l = baseline()
      ;(l as { relations: Lesson['relations'] }).relations = l.relations.filter(
        (r) => r.from !== 'parts' && r.to !== 'parts',
      )
      return ok(l)
    })(),
    accepts: ok(),
  },

  'contrast-without-a-comparison': {
    /* The rule keys off a `contrasts` RELATION, not a block role, and the
       table is what satisfies it. So the refusing case declares the contrast
       and removes the table; the accepting case declares the same contrast and
       keeps it. One difference, which is the table. */
    refuses: (() => {
      const l = without('parts')
      ;(l as { relations: Lesson['relations'] }).relations = [
        { kind: 'contrasts', from: 'anchor', to: 'mechanism' },
      ] as Lesson['relations']
      return ok(l)
    })(),
    accepts: (() => {
      const l = baseline()
      ;(l as { relations: Lesson['relations'] }).relations = [
        ...l.relations,
        { kind: 'contrasts', from: 'anchor', to: 'mechanism' },
      ] as Lesson['relations']
      return ok(l)
    })(),
  },

  'arrow-drawn-in-prose': {
    refuses: ok(withBlock('mechanism', { body: 'Light -> pigment catches it.' })),
    accepts: ok(),
  },

  'chain-narrated-not-drawn': {
    refuses: ok(
      withBlock('mechanism', {
        body: 'Light lands, then the pigment holds it, next the plant stores it, so that food results.',
        terms: [{ text: 'pigment', mark: 'key' }],
      }),
    ),
    accepts: ok(),
  },

  'rule-stated-but-never-earned': {
    refuses: ok(withBlock('mechanism', { role: 'rule' })),
    accepts: arcOff(withBlock('mechanism', { role: 'rule' })),
  },

  'headings-outweigh-the-body': {
    /* Arc-gated, so `arc: false` would silence the rule and the pair would
       prove nothing. */
    refuses: ok({
      ...baseline(),
      blocks: [
        {
          id: 'only',
          kind: 'prose',
          emphasis: 'primary',
          tone: 'neutral',
          role: 'anchor',
          depth: 'core',
          title: 'A Very Long Heading About Photosynthesis Indeed Truly',
          body: 'Short.',
          terms: [],
        },
      ],
      relations: [],
      technicalTerms: [],
    } as unknown as Lesson),
    accepts: ok(),
  },
}
