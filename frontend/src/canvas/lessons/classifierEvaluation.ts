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
      id: 'headline',
      kind: 'metric',
      title: 'Reported accuracy',
      emphasis: 'primary',
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
      id: 'takeaway',
      kind: 'callout',
      title: 'The rule',
      emphasis: 'primary',
      tone: 'warning',
      body: 'Never report accuracy on an imbalanced dataset without reporting the majority-class baseline beside it. A model that cannot beat "always guess the common class" has learned nothing, and accuracy alone will never say so.',
    },

    {
      id: 'summary',
      kind: 'prose',
      title: 'In one paragraph',
      emphasis: 'supporting',
      tone: 'neutral',
      body: 'Accuracy counts every prediction equally, which is only reasonable when every error costs the same and every class is equally common. Here neither holds: fraud is 3% of the data and a missed fraud costs far more than a false alarm. The confusion matrix shows where the errors fall, precision-recall shows the tradeoff you are actually buying, and the cost curves say where to put the threshold.',
    },
  ],

  relations: [
    { from: 'imbalance', to: 'headline', kind: 'contrasts' },
    { from: 'confusion', to: 'headline', kind: 'supports' },
    { from: 'pr', to: 'roc', kind: 'contrasts' },
    { from: 'threshold-cost', to: 'pr', kind: 'supports' },
    { from: 'takeaway', to: 'confusion', kind: 'derives' },
  ],
}
