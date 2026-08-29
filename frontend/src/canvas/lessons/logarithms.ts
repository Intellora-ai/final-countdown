import type { LessonInput } from '../spec/spec'

/**
 * Logarithms, taught to the patterns in `docs/engineering/teaching-patterns.md`.
 *
 * WHAT THE FIRST VERSION OF THIS FILE GOT WRONG
 * ---------------------------------------------
 * It was simple and it was SHALLOW. Ten blocks, no product law, no domain
 * restrictions, and — worst — not one derivation. It passed every check,
 * because nothing was measuring depth.
 *
 * "Simplify the path, never the destination" was being honoured in one
 * direction only: it avoided saying "exponent" too early, and then never taught
 * most of the subject either.
 *
 * WHAT IS DIFFERENT NOW
 * ---------------------
 *   anchor         opens on 2³ = 8, which the reader can already read
 *   notation       says the thing out loud, and names every part
 *   rule           states the laws
 *   reasoning      EARNS the product law instead of asserting it
 *   restriction    where it stops being true, and what is thereby invalid
 *   reasoning/worked  solves one, with the condition checked inside
 *   misconception  the trap, with numbers that settle it
 *
 * None of that structure is mathematical. `reasoning` carries a proof here and
 * a five-step causal chain in a geography lesson; `restriction` carries a
 * domain here and a scope condition elsewhere. These roles are the shape of
 * EXPLAINING, not the shape of maths.
 */
export const logarithms: LessonInput = {
  id: 'logarithms',
  question: 'What is a logarithm, and how do I use one?',
  subject: 'Mathematics',

  technicalTerms: [
    { term: 'power', introducedIn: 'the-question' },
    { term: 'base', introducedIn: 'read-aloud' },
    { term: 'exponent', introducedIn: 'why-we-need-it' },
    { term: 'product', introducedIn: 'product-law' },
  ],

  blocks: [
    /* ================= CORE — the answer to the question asked ============= */

    {
      id: 'already-know',
      kind: 'prose',
      title: 'Start with what you can already read',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'anchor',
      body:
        'Before any logarithm, look at 2³ = 8.\n\n' +
        'You already know what that says. Two, multiplied by itself three times, makes eight.',
      terms: [{ text: '2³ = 8', mark: 'key' }],
    },

    {
      id: 'the-question',
      kind: 'prose',
      title: 'Now turn it around',
      emphasis: 'primary',
      tone: 'insight',
      role: 'anchor',
      body:
        'Same three numbers. A different question.\n\n' +
        'Two raised to what power gives eight? You know the answer is three.\n\n' +
        'That question is the whole of what a logarithm asks.',
      terms: [{ text: 'what power', mark: 'distinction' }],
    },

    /* ---- B. The definition, as the answer to that question --------------- */

    {
      id: 'what-a-log-is',
      kind: 'prose',
      title: 'What a logarithm is',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      body: 'A logarithm is the missing count. It says how many times one number multiplies by itself to reach another.',
      terms: [{ text: 'logarithm', mark: 'key' }],
    },

    {
      id: 'read-aloud',
      kind: 'prose',
      title: 'How to say it',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'notation',
      body:
        'You write it log₂ 8 = 3.\n\n' +
        'You say it: “log base 2 of 8 equals 3.”\n\n' +
        'Every logarithm you meet is that same sentence with different numbers in it.',
      terms: [{ text: 'log base 2 of 8', mark: 'key' }],
    },

    {
      id: 'the-parts',
      kind: 'table',
      title: 'The three parts',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'classification',
      columns: [
        { key: 'part', label: 'Part', type: 'text' },
        { key: 'here', label: 'In log₂ 8 = 3', type: 'text' },
        { key: 'job', label: 'What it does', type: 'text' },
      ],
      rows: [
        { part: 'Base', here: '2', job: 'the number doing the multiplying' },
        { part: 'Argument', here: '8', job: 'the number you are trying to reach' },
        { part: 'Value', here: '3', job: 'how many times it took' },
      ],
      caption: 'Name these three and every logarithm reads the same way.',
    },

    /* ---- C. The canonical statement -------------------------------------- */

    {
      id: 'the-law',
      kind: 'equation',
      title: 'The whole subject, in one line',
      emphasis: 'primary',
      tone: 'insight',
      role: 'rule',
      latex: '\\log_a b = c \\iff a^c = b',
      highlight: ['c'],
      caption: 'The two sides are the same fact. Only the unknown moves.',
    },

    {
      id: 'three-at-once',
      kind: 'table',
      title: 'The same shape, three times',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'example',
      columns: [
        { key: 'log', label: 'Log form', type: 'text' },
        { key: 'means', label: 'Means', type: 'text' },
      ],
      rows: [
        { log: 'log₃ 81 = 4', means: '3⁴ = 81' },
        { log: 'log₅ 125 = 3', means: '5³ = 125' },
        { log: 'log₂ 32 = 5', means: '2⁵ = 32' },
      ],
      caption: 'Read each row both ways until the swap feels automatic.',
    },

    /* ---- D. Why the idea has to exist ------------------------------------ */

    {
      id: 'why-we-need-it',
      kind: 'prose',
      title: 'Why the notation has to exist',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'component',
      body:
        'Solve 2ˣ = 16 and you can just see it. x is 4.\n\n' +
        'Now solve 2ˣ = 20. No whole number works.\n\n' +
        'The answer exists, but you have no way to write it down. A logarithm is that way: x = log₂ 20.\n\n' +
        'So this is not decoration. It names an exponent you could not otherwise name.',
      terms: [{ text: 'exponent', mark: 'key' }],
    },

    {
      id: 'inverse-family',
      kind: 'flow',
      title: 'You have done this twice already',
      emphasis: 'primary',
      tone: 'insight',
      role: 'component',
      nodes: [
        { id: 'add', label: 'Adding is undone by subtracting', tone: 'neutral' },
        { id: 'mul', label: 'Multiplying is undone by dividing', tone: 'neutral' },
        { id: 'pow', label: 'Powers are undone by logarithms', tone: 'result' },
      ],
      links: [
        { from: 'add', to: 'mul' },
        { from: 'mul', to: 'pow' },
      ],
      caption: 'A logarithm is not a new kind of thing. It is the third member of a family you know.',
    },

    /* ---- E. A law, and then that law EARNED ------------------------------ */

    {
      id: 'log-growth',
      kind: 'chart',
      title: 'Why logs grow so slowly',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'support',
      chartType: 'line',
      xLabel: 'x',
      yLabel: 'log₂ x',
      series: [
        {
          name: 'log₂ x',
          colorIndex: 0,
          points: [
            { x: 1, y: 0 },
            { x: 2, y: 1 },
            { x: 4, y: 2 },
            { x: 8, y: 3 },
            { x: 16, y: 4 },
            { x: 32, y: 5 },
          ],
        },
      ],
      annotate: { atX: 32, label: 'x is 32 times bigger; the log only reached 5' },
      caption: 'Double x, and the log goes up by exactly one. That is the whole shape of it.',
    },

    {
      id: 'keep-this',
      kind: 'summary',
      title: 'Keep this',
      emphasis: 'primary',
      tone: 'result',
      role: 'summary',
      progression: [
        'Ask: the base, raised to what?',
        'Swap into power form',
        'Solve it there',
        'Check the argument is above zero',
      ],
      mentalModel:
        'A logarithm is a counter. It counts multiplications, and it undoes a power the way dividing undoes multiplying.',
    },

    /* ================= DEEPER — offered by name, never delivered ===========
       Nothing below is shown unless the learner says yes to it at the
       checkpoint. `depth: 'deeper'` is what makes that true: `deriveBeats`
       refuses to put core and deeper material in the same beat, and the
       checkpoint that crosses the boundary asks by name instead of saying
       "continue". */

    {
      id: 'product-law',
      kind: 'equation',
      title: 'The product law',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'rule',
      depth: 'deeper',
      latex: '\\log_a(xy) = \\log_a x + \\log_a y',
      caption: 'A multiplication inside becomes an addition outside.',
    },

    {
      id: 'why-product-law',
      kind: 'reasoning',
      title: 'Why that is true',
      emphasis: 'primary',
      tone: 'insight',
      role: 'support',
      depth: 'deeper',
      mode: 'why',
      claim: 'The product law is the exponent multiplication rule, wearing different clothes.',
      steps: [
        {
          expression: 'Let m be the log of x, so a to the m gives x',
          latex: '\\log_a x = m \\iff a^m = x',
          because: 'this is only the definition, applied to x',
        },
        {
          expression: 'Let n be the log of y, so a to the n gives y',
          latex: '\\log_a y = n \\iff a^n = y',
          because: 'the same definition, applied to y',
        },
        {
          expression: 'Multiply the two together',
          latex: 'xy = a^m \\cdot a^n',
          because: 'if the parts are equal, so are the things they make',
        },
        {
          expression: 'Adding the powers is a rule you already have',
          latex: 'a^m \\cdot a^n = a^{m+n}',
          because: 'multiplying powers of the same base adds the exponents',
        },
        {
          expression: 'So the log of xy is m plus n',
          latex: '\\log_a(xy) = m + n',
          because: 'read that last line back through the definition',
        },
      ],
      therefore:
        'You are not memorising a random rule. It is the exponent rule you already knew, said in log form.',
    },

    {
      id: 'check-the-law',
      kind: 'prose',
      title: 'Check it with numbers',
      emphasis: 'supporting',
      tone: 'result',
      role: 'example',
      depth: 'deeper',
      body: 'log₂(8 × 4) = 3 + 2 = 5. And 8 × 4 = 32, with log₂ 32 = 5.',
      terms: [],
    },

    /* ---- F. Where it stops being true ------------------------------------ */

    {
      id: 'restrictions',
      kind: 'prose',
      title: 'Where a logarithm stops working',
      emphasis: 'primary',
      tone: 'warning',
      role: 'restriction',
      depth: 'deeper',
      body:
        'Three conditions, and every one of them matters.\n\n' +
        'The base must be greater than zero. The base cannot be one. The argument must be greater than zero.\n\n' +
        'Break any one of them and there is no real answer to find.',
      terms: [{ text: 'cannot be one', mark: 'distinction' }],
    },

    {
      id: 'invalid-ones',
      kind: 'table',
      title: 'So these are not logarithms',
      emphasis: 'supporting',
      tone: 'warning',
      role: 'restriction',
      depth: 'deeper',
      columns: [
        { key: 'written', label: 'Written', type: 'text' },
        { key: 'fails', label: 'Why it fails', type: 'text' },
      ],
      rows: [
        { written: 'log₂ (−5)', fails: 'no power of 2 is ever negative' },
        { written: 'log₁ 7', fails: '1 multiplied any number of times is still 1' },
        { written: 'log₀ 8', fails: '0 multiplied any number of times is still 0' },
      ],
      caption: 'Every failure is the same failure: nothing you raise the base to would ever reach the argument.',
    },

    /* ---- G. From understanding to doing ---------------------------------- */

    {
      id: 'solve-one',
      kind: 'reasoning',
      title: 'Now solve one',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'support',
      depth: 'deeper',
      mode: 'worked',
      claim: 'Solve log₂(x − 3) = 4.',
      steps: [
        {
          expression: 'Turn it into power form',
          latex: 'x - 3 = 2^4',
          because: 'the definition, used in the direction that removes the log',
        },
        {
          expression: 'Work out the right-hand side',
          latex: 'x - 3 = 16',
          because: '2 multiplied by itself four times is 16',
        },
        {
          expression: 'Add three to both sides',
          latex: 'x = 19',
          because: 'the same operation on both sides keeps them equal',
        },
        {
          expression: 'Check the condition before accepting it',
          latex: 'x - 3 > 0 \\Rightarrow x > 3',
          because: 'the argument must be above zero, and 19 clears it',
        },
      ],
      therefore: 'x = 19, and it is valid — which you only know because you checked the condition.',
    },

    /* ---- H. The trap, disproved ------------------------------------------ */

    {
      id: 'the-trap',
      kind: 'misconception',
      title: 'The mistake almost everyone makes',
      emphasis: 'primary',
      tone: 'warning',
      role: 'misconception',
      depth: 'deeper',
      wrong: 'log(x + y) = log x + log y',
      correct: 'log(x × y) = log x + log y',
      why:
        'The law turns multiplication into addition. It says nothing at all about addition inside.\n\n' +
        'There is no rule for the log of a sum. There is no way to split it.',
      counterexample: 'log(2 + 3) = log 5, but log 2 + log 3 = log 6. Five is not six.',
    },
  ],

  relations: [
    { from: 'the-question', to: 'already-know', kind: 'derives' },
    { from: 'read-aloud', to: 'what-a-log-is', kind: 'supports' },
    { from: 'the-parts', to: 'read-aloud', kind: 'supports' },
    { from: 'the-law', to: 'the-parts', kind: 'derives' },
    { from: 'three-at-once', to: 'the-law', kind: 'exemplifies' },
    { from: 'inverse-family', to: 'why-we-need-it', kind: 'supports' },
    { from: 'why-product-law', to: 'product-law', kind: 'derives' },
    { from: 'check-the-law', to: 'product-law', kind: 'exemplifies' },
    { from: 'invalid-ones', to: 'restrictions', kind: 'exemplifies' },
    { from: 'solve-one', to: 'restrictions', kind: 'supports' },
    { from: 'the-trap', to: 'product-law', kind: 'contrasts' },
    { from: 'log-growth', to: 'why-we-need-it', kind: 'supports' },
  ],
}
