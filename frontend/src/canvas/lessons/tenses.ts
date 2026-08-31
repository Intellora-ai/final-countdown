import type { LessonInput } from '../spec/spec'

/**
 * The teaching shape, written out in full.
 *
 * WHY THIS LESSON EXISTS
 * ----------------------
 * `teach/teaching.ts` refuses a lesson that does not teach. A gate asserted
 * only to REFUSE is satisfied completely by `return false`, so it needs an
 * input it must ACCEPT or it proves nothing. This is that input: the one lesson
 * in the repository that satisfies every rule, which makes it the thing that
 * fails if a rule is ever accidentally tightened into unsatisfiability.
 *
 * It is also the worked example. Every rule is visible here at least once:
 *
 *   definition   the simplest true sentence, in plain words, first
 *   framework    the whole map in one line, before any detail
 *   classification   the three times, side by side in a table
 *   component    one of the three, taught alone
 *   example      four words, pointing at exactly one rule
 *   misconception    the error people actually make, corrected, with a reason
 *   flow         the choice drawn as arrows rather than narrated
 *   summary      the progression, then the one sentence to keep
 *
 * PLAIN WORDS BEFORE TECHNICAL ONES, VISIBLY
 * ------------------------------------------
 * The definition says "the word for the action". It does NOT say "verb", even
 * though "verb" is shorter and the author knows it. `technicalTerms` declares
 * that "verb" is earned in `past-tense`, and the gate refuses any earlier use —
 * so the rule is enforced here rather than remembered. That single substitution
 * is the whole of "simplify the path through the knowledge, never the
 * knowledge": the learner still meets "verb", just after the idea has landed.
 */
export const tenses: LessonInput = {
  id: 'tenses',
  question: 'What are tenses and how do I choose one?',
  subject: 'English',

  technicalTerms: [{ term: 'verb', introducedIn: 'past-tense' }],

  blocks: [
    {
      id: 'what-a-tense-is',
      kind: 'prose',
      title: 'What a tense is',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'definition',
      body: 'A tense tells you when something happens. Change the word for the action, and you change the time.',
      terms: [{ text: 'tense', mark: 'key' }],
    },

    {
      id: 'the-map',
      kind: 'prose',
      title: 'The whole map',
      emphasis: 'primary',
      tone: 'insight',
      role: 'framework',
      body: 'Every tense answers one question: when? The three times are past, present and future.',
      terms: [{ text: 'past, present and future', mark: 'distinction' }],
    },

    {
      id: 'three-times',
      kind: 'table',
      title: 'The three times',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'classification',
      columns: [
        { key: 'time', label: 'Time', type: 'text' },
        { key: 'means', label: 'When it happens', type: 'text' },
        { key: 'looks', label: 'What it looks like', type: 'text' },
      ],
      rows: [
        { time: 'Past', means: 'Before now', looks: 'She walked.' },
        { time: 'Present', means: 'Right now', looks: 'She walks.' },
        { time: 'Future', means: 'Still to come', looks: 'She will walk.' },
      ],
      caption: 'Read across one row to see one time.',
    },

    {
      id: 'past-tense',
      kind: 'prose',
      title: 'Past tense',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'component',
      body: 'Past tense means the action is already finished. The verb changes shape to show that.',
      terms: [{ text: 'verb', mark: 'key' }],
    },

    {
      id: 'walked',
      kind: 'prose',
      title: 'In one line',
      /* Not `aside` — see the same note in `logarithms.ts`. An aside is
         narrowed to span 5 of 12 and trips `noAccidentalVoid` when it lands
         alone in a band. */
      emphasis: 'supporting',
      tone: 'neutral',
      role: 'example',
      body: 'She walked home yesterday.',
      terms: [],
    },

    {
      id: 'dropped-ending',
      kind: 'misconception',
      title: 'The ending people drop',
      emphasis: 'primary',
      tone: 'warning',
      role: 'misconception',
      wrong: 'She walk home yesterday.',
      correct: 'She walked home yesterday.',
      why: 'Yesterday already fixes the time, but the verb must change too. English marks time twice.',
    },

    {
      id: 'choosing',
      kind: 'flow',
      title: 'Choosing a tense',
      emphasis: 'primary',
      tone: 'neutral',
      role: 'support',
      nodes: [
        { id: 'ask', label: 'When did it happen?', tone: 'insight' },
        { id: 'before', label: 'Before now → past', tone: 'neutral' },
        { id: 'now', label: 'Right now → present', tone: 'neutral' },
        { id: 'later', label: 'Still to come → future', tone: 'neutral' },
      ],
      links: [
        { from: 'ask', to: 'before' },
        { from: 'ask', to: 'now' },
        { from: 'ask', to: 'later' },
      ],
      caption: 'One question, three ways out.',
    },

    {
      id: 'keep-this',
      kind: 'summary',
      title: 'Keep this',
      emphasis: 'primary',
      tone: 'result',
      role: 'summary',
      progression: [
        'Ask when it happened',
        'Pick past, present or future',
        'Change the word for the action to match',
      ],
      mentalModel: 'One question, three answers, one word changes. When did it happen?',
    },
  ],

  relations: [
    { from: 'three-times', to: 'the-map', kind: 'supports' },
    { from: 'past-tense', to: 'three-times', kind: 'supports' },
    { from: 'walked', to: 'past-tense', kind: 'exemplifies' },
    { from: 'dropped-ending', to: 'past-tense', kind: 'contrasts' },
    { from: 'choosing', to: 'past-tense', kind: 'supports' },
  ],
}
