import type { LessonInput } from '../spec/spec'

/**
 * A third lesson, chosen to exercise the shapes the other two do not.
 *
 * Physics used a simulation. Civics used a branching process. This one is
 * machine learning, where the native vocabulary is a confusion matrix, an ROC
 * curve and a feature-importance bar — three different shapes, all reached
 * through `figure` and the registry rather than through bespoke block kinds.
 *
 * It also carries the lesson's own point: accuracy on an imbalanced dataset is
 * a number that flatters. Every figure below exists to take that number apart.
 */
export const classifierEvaluation: LessonInput = {
  id: 'classifier-evaluation',
  question: 'Why is 97% accuracy a bad way to judge this model?',
  subject: 'Machine learning',

  blocks: [
    {
      id: 'what-accuracy-is',
      kind: 'prose',
      title: 'What accuracy is',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      body: 'Accuracy is the share of predictions a model gets correct. It counts every prediction the same way.',
      terms: [{ text: 'accuracy', mark: 'key' }],
    },

    {
      id: 'headline',
      kind: 'metric',
      title: 'Reported accuracy',
      /* `supporting`, not `primary`, and the lesson's own argument is the
         reason: this number is the thing being taken apart, not the thing
         being taught. Its caption already says so. As `primary` it also sat
         alone in a band five columns wide, which `noAccidentalVoid` reports —
         the definition and the flattering number belong side by side. */
      emphasis: 'supporting',
      tone: 'result',
      value: 97.1,
      unit: '%',
      caption: 'On 10,000 held-out transactions. The number is real. It is also almost meaningless.',
    },

    {
      id: 'imbalance',
      kind: 'figure',
      title: 'What the data actually contains',
      emphasis: 'primary',
      tone: 'warning',
      as: 'donut',
      data: {
        shape: 'parts',
        parts: [
          { label: 'Legitimate', value: 9700 },
          { label: 'Fraudulent', value: 300 },
        ],
        whole: 10000,
      },
      caption: 'Predict "legitimate" every single time and you score 97%. The model must beat that, not the coin flip.',
    },

    {
      id: 'confusion',
      kind: 'figure',
      title: 'Where the errors actually fall',
      emphasis: 'primary',
      tone: 'neutral',
      as: 'confusionMatrix',
      data: {
        shape: 'matrix',
        /* Rows are TRUE, columns PREDICTED, and the class lists must be
           identical and in the same order — a transposed matrix silently swaps
           precision and recall, which the invariant refuses. */
        rows: ['Legitimate', 'Fraudulent'],
        columns: ['Legitimate', 'Fraudulent'],
        values: [
          [9655, 45],
          [245, 55],
        ],
      },
      caption: 'It catches 55 of 300 frauds. The 97% is carried almost entirely by the top-left cell.',
    },

    {
      id: 'roc',
      kind: 'figure',
      title: 'ROC, and why it flatters here',
      emphasis: 'supporting',
      tone: 'neutral',
      as: 'rocCurve',
      data: {
        shape: 'series',
        continuousX: true,
        xLabel: 'False positive rate',
        yLabel: 'True positive rate',
        series: [
          {
            name: 'Model',
            colorIndex: 0,
            points: [
              { x: 0, y: 0 },
              { x: 0.005, y: 0.18 },
              { x: 0.02, y: 0.34 },
              { x: 0.06, y: 0.52 },
              { x: 0.15, y: 0.68 },
              { x: 0.35, y: 0.83 },
              { x: 0.65, y: 0.93 },
              { x: 1, y: 1 },
            ],
          },
        ],
      },
      caption: 'AUC looks respectable because the false-positive rate is measured against 9,700 negatives. A handful of extra false alarms barely moves it.',
    },

    {
      id: 'pr',
      kind: 'figure',
      title: 'Precision-recall tells the truth',
      emphasis: 'primary',
      tone: 'insight',
      as: 'precisionRecall',
      data: {
        shape: 'series',
        continuousX: true,
        xLabel: 'Recall',
        yLabel: 'Precision',
        series: [
          {
            name: 'Model',
            colorIndex: 0,
            points: [
              { x: 0.05, y: 0.72 },
              { x: 0.18, y: 0.61 },
              { x: 0.34, y: 0.47 },
              { x: 0.52, y: 0.31 },
              { x: 0.68, y: 0.19 },
              { x: 0.83, y: 0.11 },
              { x: 0.93, y: 0.06 },
            ],
          },
        ],
      },
      caption: 'To catch half the fraud you accept that two in three flagged transactions are innocent. That tradeoff is invisible on an ROC curve.',
    },

    {
      id: 'threshold-cost',
      kind: 'figure',
      title: 'The cost of each threshold',
      emphasis: 'supporting',
      tone: 'neutral',
      as: 'line',
      data: {
        shape: 'series',
        continuousX: true,
        xLabel: 'Decision threshold',
        yLabel: 'Cost (thousand)',
        series: [
          {
            name: 'Missed fraud',
            colorIndex: 2,
            points: [
              { x: 0.1, y: 12 }, { x: 0.3, y: 28 }, { x: 0.5, y: 61 },
              { x: 0.7, y: 104 }, { x: 0.9, y: 158 },
            ],
          },
          {
            name: 'Investigating innocents',
            colorIndex: 1,
            points: [
              { x: 0.1, y: 143 }, { x: 0.3, y: 79 }, { x: 0.5, y: 44 },
              { x: 0.7, y: 21 }, { x: 0.9, y: 6 },
            ],
          },
        ],
      },
      caption: 'The two curves cross near 0.45. That crossing, not the accuracy, is where the threshold belongs.',
    },

    {
      id: 'features',
      kind: 'figure',
      title: 'What the model is leaning on',
      emphasis: 'supporting',
      tone: 'neutral',
      as: 'featureImportance',
      data: {
        shape: 'series',
        series: [
          {
            name: 'Importance',
            colorIndex: 0,
            points: [
              { x: 'Amount vs. account mean', y: 0.31 },
              { x: 'Hour of day', y: 0.22 },
              { x: 'Merchant category', y: 0.17 },
              { x: 'Distance from last txn', y: 0.14 },
              { x: 'Card age', y: 0.09 },
              { x: 'Device changed', y: 0.07 },
            ],
          },
        ],
      },
      caption: 'Nothing here is a proxy for a protected attribute — worth checking before the model ships, not after.',
    },

    {
      id: 'why-the-rule-holds',
      kind: 'reasoning',
      title: 'Why the rule holds',
      emphasis: 'primary',
      tone: 'insight',
      role: 'rule',
      /* The rule below was stated and never earned, which is the definition of
         something to be memorised. Each step here follows from a number the
         learner has already been shown on this page. */
      mode: 'why',
      claim: 'Accuracy alone cannot tell you whether this model learned anything.',
      steps: [
        {
          expression: 'Only 300 of the 10,000 transactions are fraudulent.',
          because: 'The donut above counts them.',
        },
        {
          expression: 'Answering "legitimate" every time therefore scores 97%.',
          because: 'It is correct on all 9,700 legitimate transactions and wrong on the 300.',
        },
        {
          expression: 'The model reports 97.1%.',
          because: 'That is the headline figure it was given.',
        },
        {
          expression: 'So the model is worth about a tenth of a point over guessing.',
          because: 'Its score and the always-guess score differ by 0.1 percentage points.',
        },
      ],
      therefore: 'Without the baseline printed beside it, 97% reads as success and is very nearly nothing.',
    },

    {
      id: 'takeaway',
      kind: 'callout',
      title: 'The rule',
      emphasis: 'primary',
      tone: 'warning',
      role: 'rule',
      body: 'Never report accuracy on an imbalanced dataset without reporting the majority-class baseline beside it.\n\nA model that cannot beat "always guess the common class" has learned nothing, and accuracy alone will never say so.',
      terms: [{ text: 'majority-class baseline', mark: 'key' }],
    },

    {
      id: 'in-one-paragraph',
      kind: 'prose',
      title: 'In one paragraph',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'component',
      /* Four runs. The 67-word original is intact, split where the argument
         turns rather than trimmed to fit a limit. */
      body: 'Accuracy counts every prediction equally, which is only reasonable when every error costs the same and every class is equally common.\n\nHere neither holds: fraud is 3% of the data, and a missed fraud costs far more than a false alarm.\n\nThe confusion matrix shows where the errors fall, and precision-recall shows the tradeoff you are actually buying.\n\nThe cost curves say where to put the threshold.',
      terms: [{ text: 'a missed fraud costs far more than a false alarm', mark: 'key' }],
    },

    {
      id: 'keep-this',
      kind: 'summary',
      title: 'Keep this',
      emphasis: 'primary',
      tone: 'result',
      role: 'summary',
      progression: [
        'Check how rare the positive class is',
        'Compare against always guessing the common class',
        'Read the confusion matrix',
        'Pick the threshold from the cost curve',
      ],
      mentalModel: 'Accuracy answers a question nobody asked when the classes are lopsided. Ask what each error costs.',
    },
  ],

  relations: [
    { from: 'imbalance', to: 'headline', kind: 'contrasts' },
    { from: 'confusion', to: 'headline', kind: 'supports' },
    /* Same beat as `confusion`, and the honest reading: an ROC curve is the
       confusion matrix re-counted at every threshold, which is exactly why it
       can look respectable while the matrix does not. */
    { from: 'roc', to: 'confusion', kind: 'contrasts' },
    { from: 'pr', to: 'roc', kind: 'contrasts' },
    { from: 'threshold-cost', to: 'pr', kind: 'supports' },
    /*
     * `supports`, NOT `derives`, AND THE DIFFERENCE IS SPATIAL.
     *
     * `spec.ts` defines `supports` as "block B is evidence for block A", which
     * the layout may honour by placing B beneath A, beside it, or behind a
     * disclosure. `derives` is stronger and literal: the layout stacks a
     * derived block DIRECTLY under its source, in the same column, because
     * `PV = nRT` coming from `P ∝ T` reads as one argument and side-by-side
     * would read as two facts.
     *
     * The confusion matrix does not DERIVE the rule -- it is the evidence a
     * reader needs before the rule is believable. Declaring `derives` hoisted
     * this callout six blocks up to sit under `confusion`, so the rendered
     * order stopped matching the authored order and
     * `scene-regressions.spec.ts:101` caught it on desktop-1440 and square-900.
     */
    { from: 'takeaway', to: 'confusion', kind: 'supports' },
    { from: 'headline', to: 'what-accuracy-is', kind: 'exemplifies' },
    /* `features` was joined to nothing. It shows which inputs the model leans
       on, which is the evidence for the paragraph explaining what accuracy
       hides. */
    { from: 'features', to: 'in-one-paragraph', kind: 'supports' },
    /* Same correction as `takeaway` above: the imbalance figure is the
       EVIDENCE this reasoning reads from, not a step it was derived from. */
    { from: 'why-the-rule-holds', to: 'imbalance', kind: 'supports' },
  ],
}
