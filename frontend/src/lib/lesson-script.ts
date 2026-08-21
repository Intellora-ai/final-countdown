/* THE LESSON SCRIPT — "step by step" as data rather than as an adjective.
 *
 * Each entry is one semantic operation and one primary object. The board plays
 * them in order and STOPS: every step after the first requires the learner to
 * ask for it, either by continuing or by answering. That is what makes the
 * claim checkable — a board that dumped all eight at once would still animate
 * beautifully and would be doing the opposite of teaching.
 *
 * THE PREDICTION IS NOT DECORATION. Step 4 asks before step 8 reveals, and step
 * 6 writes the learner's answer onto the board where they can see it. A learner
 * who has committed to "they move faster" reads the mechanism differently from
 * one who was shown it — and a learner who chose "they get heavier" needs the
 * correction to name what they actually said, which it cannot do unless the
 * board recorded it.
 *
 * NO OPTION IS A JOKE. Each wrong answer here is a real misconception about
 * melting, so choosing one is informative rather than embarrassing.
 */

import type { SceneOperationType } from './operations'

export type StepGate = 'open' | 'continue' | 'answer'

export interface AskOption {
  id: string
  label: string
  correct?: boolean
  /** Written on the board when this option is chosen. Names the learner's own
   *  idea rather than issuing a verdict. */
  response: string
}

export type StepBody =
  | { kind: 'write'; role: 'question' | 'concept-label' | 'note'; text: string }
  | { kind: 'figure'; figure: 'particle-box'; caption: string }
  | { kind: 'ask'; prompt: string; options: AskOption[] }
  | { kind: 'record' }
  | { kind: 'causal'; chain: string[]; edgeType: 'causal' }
  | { kind: 'reveal'; text: string; annotation?: string }

export interface LessonStep {
  id: string
  opType: SceneOperationType
  gate: StepGate
  /** Counts toward the cap on how much may be on the board at once. */
  primary: boolean
  body: StepBody
}

export interface LessonScript {
  question: string
  steps: LessonStep[]
  /** Variables this lesson manipulates, unlocked once the mechanism is shown. */
  interactiveVariableId?: string
}

/* ── Change of state (Class 9 chemistry, "Matter in Our Surroundings") ────── */
const CHANGE_OF_STATE: LessonScript = {
  question: 'Why does heating a solid turn it into a liquid?',
  interactiveVariableId: 'temperature',
  steps: [
    {
      id: 's1-question',
      opType: 'write',
      gate: 'open',
      primary: true,
      body: { kind: 'write', role: 'question', text: 'Why does heating a solid turn it into a liquid?' },
    },
    {
      id: 's2-label',
      opType: 'write',
      gate: 'continue',
      primary: true,
      body: { kind: 'write', role: 'concept-label', text: 'Start with the particles' },
    },
    {
      id: 's3-figure',
      opType: 'draw',
      gate: 'continue',
      primary: true,
      body: {
        kind: 'figure',
        figure: 'particle-box',
        caption: 'in a solid, particles are packed and vibrate in place',
      },
    },
    {
      id: 's4-ask',
      opType: 'ask',
      gate: 'continue',
      primary: false,
      body: {
        kind: 'ask',
        prompt: 'Now heat it. What happens to those particles?',
        options: [
          {
            id: 'faster',
            label: 'They vibrate faster',
            correct: true,
            response: 'you said they vibrate faster — hold onto that',
          },
          {
            id: 'bigger',
            label: 'Each particle gets bigger',
            response: 'you said each particle grows — worth testing against what heat actually adds',
          },
          {
            id: 'heavier',
            label: 'They get heavier',
            response: 'you said they get heavier — worth testing, since nothing was added to the solid',
          },
        ],
      },
    },
    {
      id: 's5-answer',
      opType: 'predict',
      gate: 'answer',
      primary: false,
      body: { kind: 'record' },
    },
    {
      id: 's6-record',
      opType: 'annotate',
      gate: 'continue',
      primary: false,
      body: { kind: 'write', role: 'note', text: 'your prediction is on the board — now we check it' },
    },
    {
      id: 's7-causal',
      opType: 'draw',
      gate: 'continue',
      primary: true,
      body: {
        kind: 'causal',
        edgeType: 'causal',
        chain: ['Heat in', 'Particles vibrate faster', 'Bonds stretch', 'Lattice gives way'],
      },
    },
    {
      id: 's8-reveal',
      opType: 'reveal',
      gate: 'continue',
      primary: true,
      body: {
        kind: 'reveal',
        text:
          'Heat does not make particles bigger or heavier. It gives them energy, they vibrate ' +
          'harder, and past the melting point the lattice can no longer hold them in place. ' +
          'The solid becomes a liquid — same particles, more motion.',
        annotation: 'same particles — more motion',
      },
    },
  ],
}

const SCRIPTS: Record<string, LessonScript> = {
  'matter-in-our-surroundings/change-of-state': CHANGE_OF_STATE,
}

export function scriptFor(chapterId: string, conceptId: string): LessonScript | null {
  return SCRIPTS[`${chapterId}/${conceptId}`] ?? null
}

/** How many primary objects a script has put on the board by a given step.
 *  DOD-2 caps the OPENING board at three; this is what the test measures. */
export function primaryCountThrough(script: LessonScript, stepIndex: number): number {
  return script.steps.slice(0, stepIndex + 1).filter((s) => s.primary).length
}

/** Steps that are semantic operations — the number acceptance test T2 checks. */
export function semanticStepCount(script: LessonScript): number {
  return script.steps.length
}
