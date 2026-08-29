import type { LessonInput } from '../spec/spec'

/**
 * A second lesson, chosen to share nothing with the first.
 *
 * WHAT THIS FILE IS FOR
 * ---------------------
 * The gas lesson could have looked good because the engine was quietly built
 * around it. This one is civics, not physics: no simulation, no equation, no
 * continuous axis. It leans on shapes the first lesson never used — a process
 * with branches, a weighted flow, a Gantt of a real timeline, a matrix.
 *
 * If the layout grammar is doing real work, this must select a DIFFERENT
 * composition on its own and still look like the same product. Two lessons
 * that render identically would mean the selector is decoration; two that look
 * like different products would mean the design system is.
 */
export const billBecomesLaw: LessonInput = {
  id: 'bill-becomes-law',
  question: 'How does a bill become law in India?',
  subject: 'Civics',

  blocks: [
    {
      id: 'what-a-bill-is',
      kind: 'prose',
      title: 'What a bill is',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      body: 'A bill is a written proposal for a new law. It becomes law only after both Houses agree to it.',
      terms: [{ text: 'bill', mark: 'key' }],
    },

    {
      id: 'the-whole-route',
      kind: 'prose',
      title: 'The whole route',
      emphasis: 'primary',
      tone: 'insight',
      role: 'framework',
      body: 'Every bill takes the same road: one House, then the other, then the President. Any of the three can stop it.',
      terms: [{ text: 'Any of the three can stop it', mark: 'distinction' }],
    },

    {
      id: 'passage',
      kind: 'figure',
      title: 'The passage of a bill',
      emphasis: 'primary',
      tone: 'neutral',
      as: 'decisionFlow',
      data: {
        shape: 'process',
        steps: [
          { id: 'intro', label: 'Introduced in either House', kind: 'start' },
          { id: 'first', label: 'First reading', kind: 'action' },
          { id: 'second', label: 'Second reading and committee', kind: 'action' },
          { id: 'third', label: 'Third reading and vote', kind: 'decision' },
          { id: 'other', label: 'Sent to the other House', kind: 'action' },
          { id: 'agree', label: 'Other House agrees?', kind: 'decision' },
          { id: 'joint', label: 'Joint sitting called', kind: 'action' },
          { id: 'president', label: 'President assents?', kind: 'decision' },
          { id: 'act', label: 'Becomes an Act', kind: 'end' },
          { id: 'lapses', label: 'Bill lapses', kind: 'end' },
        ],
        transitions: [
          { from: 'intro', to: 'first' },
          { from: 'first', to: 'second' },
          { from: 'second', to: 'third' },
          { from: 'third', to: 'other', label: 'passed' },
          { from: 'third', to: 'lapses', label: 'defeated' },
          { from: 'other', to: 'agree' },
          { from: 'agree', to: 'president', label: 'yes' },
          { from: 'agree', to: 'joint', label: 'no' },
          { from: 'joint', to: 'president' },
          { from: 'president', to: 'act', label: 'assents' },
          { from: 'president', to: 'second', label: 'returns it' },
        ],
      },
      caption: 'Every branch out of a decision is labelled — an unlabelled one leaves the reader unable to tell which way to go.',
    },

    {
      id: 'where-bills-go',
      kind: 'figure',
      title: 'Where bills actually end up',
      emphasis: 'primary',
      tone: 'neutral',
      as: 'sankey',
      data: {
        shape: 'flowWeighted',
        /* Deliberately NOT conserved: bills are lost at every stage, and that
           attrition is the finding. Declaring it conserved would make the
           validator refuse it, correctly. */
        nodes: [
          { id: 'introduced', label: 'Introduced' },
          { id: 'committee', label: 'To committee' },
          { id: 'passed-one', label: 'Passed one House' },
          { id: 'passed-both', label: 'Passed both' },
          { id: 'assented', label: 'Assented' },
          { id: 'lapsed', label: 'Lapsed or withdrawn' },
        ],
        links: [
          { from: 'introduced', to: 'committee', value: 100 },
          { from: 'committee', to: 'passed-one', value: 71 },
          { from: 'committee', to: 'lapsed', value: 29 },
          { from: 'passed-one', to: 'passed-both', value: 58 },
          { from: 'passed-one', to: 'lapsed', value: 13 },
          { from: 'passed-both', to: 'assented', value: 57 },
          { from: 'passed-both', to: 'lapsed', value: 1 },
        ],
      },
      caption: 'Of 100 bills introduced, 43 never become law. The width of each ribbon is the count.',
    },

    {
      id: 'session-timeline',
      kind: 'figure',
      title: 'One session, in weeks',
      emphasis: 'supporting',
      tone: 'neutral',
      as: 'gantt',
      data: {
        shape: 'intervals',
        items: [
          { id: 'draft', label: 'Drafting', start: 0, end: 3 },
          { id: 'intro', label: 'Introduction', start: 3, end: 4, dependsOn: ['draft'] },
          { id: 'committee', label: 'Committee scrutiny', start: 4, end: 10, dependsOn: ['intro'] },
          { id: 'debate', label: 'Debate and vote', start: 10, end: 12, dependsOn: ['committee'] },
          { id: 'other', label: 'Second House', start: 12, end: 16, dependsOn: ['debate'] },
          { id: 'assent', label: 'Presidential assent', start: 16, end: 17, dependsOn: ['other'] },
        ],
      },
      caption: 'Committee scrutiny is the longest stage, and the one most often skipped when a bill is rushed.',
    },

    {
      id: 'chambers',
      kind: 'figure',
      title: 'Powers of the two Houses',
      emphasis: 'supporting',
      tone: 'neutral',
      as: 'comparisonTable',
      data: {
        shape: 'tabular',
        columns: [
          { key: 'power', label: 'Power', type: 'text' },
          { key: 'lok', label: 'Lok Sabha', type: 'text' },
          { key: 'rajya', label: 'Rajya Sabha', type: 'text' },
        ],
        rows: [
          { power: 'Introduce a money bill', lok: 'Yes', rajya: 'No' },
          { power: 'Amend a money bill', lok: 'Yes', rajya: 'Recommend only' },
          { power: 'Vote of no confidence', lok: 'Yes', rajya: 'No' },
          { power: 'Ordinary bills', lok: 'Yes', rajya: 'Yes' },
          { power: 'Term', lok: '5 years', rajya: 'Permanent, 1/3 retire every 2 years' },
        ],
      },
      caption: 'The asymmetry is the point: money bills belong to the elected House.',
    },

    {
      id: 'veto-types',
      kind: 'callout',
      title: 'The President has three options, not two',
      emphasis: 'supporting',
      tone: 'warning',
      role: 'restriction',
      body: 'Assent, withhold assent, or return the bill for reconsideration.\n\nThe third is the one students forget — and if the House passes it again, assent can no longer be withheld.',
      terms: [{ text: 'return the bill for reconsideration', mark: 'key' }],
    },

    {
      id: 'why-two-houses',
      kind: 'prose',
      title: 'Why two Houses at all',
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'component',
      /* Four runs, not one 54-word paragraph. Every clause of the original is
         still here; only the breathing spaces are new. */
      body: 'A single chamber can pass a law in an afternoon.\n\nThe second House exists to make that harder: it forces a bill to survive a different set of members, elected on a different cycle.\n\nThose members answer to states rather than constituencies.\n\nMost of the delay in the timeline above is that friction working as designed.',
      terms: [{ text: 'friction working as designed', mark: 'key' }],
    },

    {
      id: 'keep-this',
      kind: 'summary',
      title: 'Keep this',
      emphasis: 'primary',
      tone: 'result',
      role: 'summary',
      progression: [
        'A bill is introduced',
        'One House passes it',
        'The other House passes it',
        'The President assents',
        'It is law',
      ],
      mentalModel: 'Three gates, any one of which can stop a bill. The delay is the design, not a fault.',
    },
  ],

  relations: [
    { from: 'where-bills-go', to: 'passage', kind: 'supports' },
    { from: 'session-timeline', to: 'passage', kind: 'exemplifies' },
    { from: 'veto-types', to: 'passage', kind: 'contrasts' },
    { from: 'passage', to: 'the-whole-route', kind: 'exemplifies' },
    /* `chambers` compares the powers of the two Houses and was joined to
       nothing, so nothing in the lesson pointed at it. It is the evidence for
       the paragraph that asks why a second House exists at all. */
    { from: 'chambers', to: 'why-two-houses', kind: 'supports' },
  ],
}
