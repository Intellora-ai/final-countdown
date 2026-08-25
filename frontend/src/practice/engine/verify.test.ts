import { describe, expect, it } from 'vitest';
import { asChapterId, asTopicId } from './ids';

import { evaluate, parseNumeric, verify } from './verify';
import type { CandidateQuestion, NumericComputation, QuestionSpec } from './types';

/**
 * The verifier's job is to disbelieve the generator.
 *
 * Every candidate below is one a careless reviewer waves through: the key names
 * a real option, the solution reads confidently, the four options look like
 * four different things. The test is whether the checks notice that one of
 * those appearances is false.
 */

const SPEC: QuestionSpec = {
  specId: 'spec-1',
  topicId: asTopicId('t1'),
  chapterId: asChapterId('ch1'),
  conceptId: 'ideal-gas-pressure',
  conceptName: 'ideal gas pressure',
  questionType: 'standard',
  difficultyTarget: 'easy',
  reasoningStructure: 'single_step_application',
  prerequisites: [],
  misconceptionTested: 'confusing temperature with heat',
};

const SOLUTION =
  'Pressure is proportional to absolute temperature at fixed volume, so raising ' +
  'the temperature raises the pressure in the same ratio.';

const GAS_LAW: NumericComputation = {
  inputs: { p1: 100, t1: 200, t2: 400 },
  steps: [
    { op: 'div', left: 't2', right: 't1', into: 'ratio' },
    { op: 'mul', left: 'p1', right: 'ratio', into: 'p2' },
  ],
  expected: 200,
  tolerance: 0.01,
  unit: 'kPa',
};

const NUMERIC_TEXT = 'A gas at 100 kPa and 200 K is heated to 400 K at fixed volume. Find P.';

function candidate(overrides: Partial<CandidateQuestion> = {}): CandidateQuestion {
  return {
    candidateId: 'c1',
    spec: SPEC,
    questionText: 'A sealed rigid container is heated. What happens to the pressure?',
    options: [
      { key: 'A', text: 'It rises', rationale: '' },
      { key: 'B', text: 'It falls', rationale: 'Treats heating as expansion of the container' },
      { key: 'C', text: 'It is unchanged', rationale: 'Assumes rigid walls fix pressure too' },
      { key: 'D', text: 'It oscillates', rationale: 'Reads the mean speed as a wave' },
    ],
    correctOption: 'A',
    fullSolution: SOLUTION,
    generationSource: 'fixture-v1',
    computation: null,
    ...overrides,
  };
}

function run(overrides: Partial<CandidateQuestion> = {}) {
  return verify({ candidate: candidate(overrides), sessionId: 's1', expectedTopicId: 't1' });
}

function checks(outcome: ReturnType<typeof verify>): string[] {
  return outcome.ok ? [] : outcome.failures.map((f) => f.check);
}

describe('a sound question passes', () => {
  it('accepts a well-formed candidate and carries the measured difficulty', () => {
    const outcome = run();
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.question.verificationStatus).toBe('PASSED');
    expect(outcome.question.correctOption).toBe('A');
    expect(outcome.question.fingerprint).toContain('ideal-gas-pressure');
    expect(outcome.question.qualityScore).toBeGreaterThan(0);
  });

  it('accepts a numeric question whose arithmetic actually checks out', () => {
    const outcome = run({
      questionText: NUMERIC_TEXT,
      options: [
        { key: 'A', text: '200 kPa', rationale: '' },
        { key: 'B', text: '120 kPa', rationale: 'Adds the temperature difference instead' },
        { key: 'C', text: '50 kPa', rationale: 'Inverts the temperature ratio' },
        { key: 'D', text: '400 kPa', rationale: 'Scales by the final temperature alone' },
      ],
      correctOption: 'A',
      computation: GAS_LAW,
    });
    expect(checks(outcome)).toEqual([]);
  });
});

describe('exactly one correct option', () => {
  /*
   * The worst outcome this system can produce is marking a student wrong for
   * picking an option that was also true. Both directions are checked: zero
   * valid answers and more than one.
   */
  it('rejects two options that say the same thing in different words', () => {
    const outcome = run({
      options: [
        { key: 'A', text: 'It rises', rationale: '' },
        { key: 'B', text: 'it   rises!', rationale: 'Same claim, different punctuation' },
        { key: 'C', text: 'It is unchanged', rationale: 'Assumes rigid walls fix pressure' },
        { key: 'D', text: 'It oscillates', rationale: 'Reads the mean speed as a wave' },
      ],
    });
    expect(checks(outcome)).toContain('single_correct_answer');
  });

  it('rejects a numeric question where two options both match the answer', () => {
    const outcome = run({
      questionText: NUMERIC_TEXT,
      options: [
        { key: 'A', text: '200 kPa', rationale: '' },
        { key: 'B', text: '200.0 kPa', rationale: 'Same value written differently' },
        { key: 'C', text: '50 kPa', rationale: 'Inverts the temperature ratio' },
        { key: 'D', text: '400 kPa', rationale: 'Scales by the final temperature alone' },
      ],
      correctOption: 'A',
      computation: GAS_LAW,
    });
    expect(checks(outcome)).toContain('single_correct_answer');
  });

  /*
   * Asserting the DETAIL, not just the check name.
   *
   * Both the zero-match and the key-disagrees branches report
   * `single_correct_answer`, so a test that only checks the name cannot tell
   * which fired. Mutation testing proved that mattered: disabling the
   * zero-match branch left this case caught by key-disagrees instead, which
   * reported "arithmetic says undefined" — technically a rejection, and a
   * diagnostic that would send someone the wrong way.
   */
  it('rejects a numeric question where no option matches, and says so', () => {
    const outcome = run({
      questionText: NUMERIC_TEXT,
      options: [
        { key: 'A', text: '150 kPa', rationale: '' },
        { key: 'B', text: '120 kPa', rationale: 'Adds instead of scaling' },
        { key: 'C', text: '50 kPa', rationale: 'Inverts the ratio' },
        { key: 'D', text: '75 kPa', rationale: 'Halves twice' },
      ],
      correctOption: 'A',
      computation: GAS_LAW,
    });

    expect(checks(outcome)).toContain('single_correct_answer');
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failures.map((f) => f.detail).join(' ')).toContain('No option matches');
  });

  /*
   * THE CASE `NumericComputation` EXISTS FOR.
   *
   * Every surface signal is fine: four distinct options, a confident solution,
   * a key pointing at a real option. The only thing wrong is that the
   * arithmetic picks a different one, and nothing except doing the arithmetic
   * will ever find that.
   */
  it('catches an answer key that disagrees with the arithmetic', () => {
    const outcome = run({
      questionText: NUMERIC_TEXT,
      options: [
        { key: 'A', text: '50 kPa', rationale: '' },
        { key: 'B', text: '120 kPa', rationale: 'Adds instead of scaling' },
        { key: 'C', text: '200 kPa', rationale: 'The correct scaling' },
        { key: 'D', text: '75 kPa', rationale: 'Halves twice' },
      ],
      correctOption: 'A',
      computation: GAS_LAW,
    });
    expect(checks(outcome)).toContain('single_correct_answer');
  });

  it('rejects an answer key naming an option that does not exist', () => {
    const three = candidate().options.slice(0, 3);
    const outcome = run({ correctOption: 'D', options: three });
    expect(outcome.ok).toBe(false);
  });
});

describe('the arithmetic is recomputed, not believed', () => {
  it('rejects a computation whose stated result is wrong', () => {
    const outcome = run({
      questionText: NUMERIC_TEXT,
      options: [
        { key: 'A', text: '999 kPa', rationale: '' },
        { key: 'B', text: '120 kPa', rationale: 'Adds instead of scaling' },
        { key: 'C', text: '50 kPa', rationale: 'Inverts the ratio' },
        { key: 'D', text: '75 kPa', rationale: 'Halves twice' },
      ],
      correctOption: 'A',
      // The generator claims 999. The steps it supplied give 200.
      computation: { ...GAS_LAW, expected: 999 },
    });
    expect(checks(outcome)).toContain('calculation_correctness');
  });

  it('refuses a computation referencing an operand nothing defines', () => {
    expect(
      evaluate({
        inputs: { a: 2 },
        steps: [{ op: 'mul', left: 'a', right: 'nowhere', into: 'out' }],
        expected: 4,
        tolerance: 0,
        unit: null,
      }),
    ).toBeNull();
  });

  it('refuses division by zero rather than producing Infinity', () => {
    expect(
      evaluate({
        inputs: { a: 1, b: 0 },
        steps: [{ op: 'div', left: 'a', right: 'b', into: 'out' }],
        expected: 0,
        tolerance: 0,
        unit: null,
      }),
    ).toBeNull();
  });

  it('chains steps through their bound names', () => {
    expect(
      evaluate({
        inputs: { a: 2, b: 3, c: 4 },
        steps: [
          { op: 'add', left: 'a', right: 'b', into: 'sum' },
          { op: 'mul', left: 'sum', right: 'c', into: 'out' },
        ],
        expected: 20,
        tolerance: 0,
        unit: null,
      }),
    ).toBe(20);
  });

  /*
   * A PROPERTY, OVER SEEDED INPUTS RATHER THAN ONE EXAMPLE.
   *
   * `fast-check` is not a dependency here and adding one is a tripwire in this
   * repo's CLAUDE.md, so the generator is a seeded LCG - the same approach the
   * canvas chart tests already use for tick ranges. Deterministic, so a failure
   * is reproducible from the seed alone.
   */
  it('agrees with plain arithmetic across 200 seeded cases', () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let i = 0; i < 200; i += 1) {
      const a = Math.round(next() * 400) - 200;
      const b = Math.round(next() * 400) - 200;
      const c = Math.round(next() * 20) + 1;

      const got = evaluate({
        inputs: { a, b, c },
        steps: [
          { op: 'add', left: 'a', right: 'b', into: 'sum' },
          { op: 'div', left: 'sum', right: 'c', into: 'out' },
        ],
        expected: 0,
        tolerance: 0,
        unit: null,
      });

      expect(got, `seed case ${i}: (${a} + ${b}) / ${c}`).toBeCloseTo((a + b) / c, 9);
    }
  });
});

describe('the solution has to explain', () => {
  it('rejects a solution that only announces the answer', () => {
    expect(checks(run({ fullSolution: 'Option A is correct.' }))).toContain(
      'solution_completeness',
    );
  });

  it('rejects a solution too short to contain reasoning', () => {
    expect(checks(run({ fullSolution: 'Gas law.' }))).toContain('solution_completeness');
  });

  /*
   * THE LENGTH GATE MADE THE ANNOUNCE-ONLY CHECK UNREACHABLE.
   *
   * Mutation testing disabled the announce-only branch entirely and every test
   * still passed. The reason: the check returns early below 30 characters, and
   * every string the old pattern could match ("Option A is correct.") is
   * shorter than that. It had never once executed.
   *
   * These are the announce-only solutions that actually ship — long enough to
   * look like an explanation, saying nothing a student who got it wrong could
   * learn from.
   */
  it.each([
    'The correct answer here is option C, as shown above.',
    'Option B is the right choice for this particular question.',
    'Answer: D. That is the correct option for this question.',
  ])('rejects a long solution that still only announces the answer: %s', (solution) => {
    expect(checks(run({ fullSolution: solution }))).toContain('solution_completeness');
  });

  it('accepts a solution of similar length that actually reasons', () => {
    const real =
      'Because the volume is fixed, the pressure and the absolute temperature ' +
      'rise together in the same proportion, so doubling one doubles the other.';
    expect(checks(run({ fullSolution: real }))).not.toContain('solution_completeness');
  });
});

describe('distractors', () => {
  it('rejects a distractor with no rationale, because it teaches nothing', () => {
    const outcome = run({
      options: [
        { key: 'A', text: 'It rises', rationale: '' },
        { key: 'B', text: 'It falls', rationale: '' },
        { key: 'C', text: 'It is unchanged', rationale: 'Assumes rigid walls fix pressure' },
        { key: 'D', text: 'It oscillates', rationale: 'Reads the mean speed as a wave' },
      ],
    });
    expect(checks(outcome)).toContain('distractor_quality');
  });
});

describe('topic binding', () => {
  it('refuses a question generated for another topic', () => {
    const outcome = verify({
      candidate: candidate({ spec: { ...SPEC, topicId: asTopicId('elsewhere') } }),
      sessionId: 's1',
      expectedTopicId: 't1',
    });
    expect(checks(outcome)).toContain('topic_relevance');
  });
});

describe('difficulty consistency', () => {
  it('refuses a one-step recall that was asked to be hard', () => {
    const outcome = run({
      spec: { ...SPEC, difficultyTarget: 'hard', reasoningStructure: 'direct_recall' },
    });
    expect(checks(outcome)).toContain('difficulty_consistency');
  });

  it('tolerates one band out, because the boundary is a number', () => {
    const outcome = run({
      spec: { ...SPEC, difficultyTarget: 'medium', reasoningStructure: 'direct_recall' },
    });
    expect(checks(outcome)).not.toContain('difficulty_consistency');
  });
});

describe('parseNumeric', () => {
  it('reads a value out of a unit-bearing option', () => {
    expect(parseNumeric('200 kPa')).toBe(200);
    expect(parseNumeric('-3.5')).toBe(-3.5);
    expect(parseNumeric('about 42.25 metres')).toBe(42.25);
  });

  it('returns null when there is no number to read', () => {
    expect(parseNumeric('it rises')).toBeNull();
  });
});
