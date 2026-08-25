import { describe, expect, it } from 'vitest';
import { asTopicId } from './ids';

import { adviceFrom, orderByNeed, signalFrom, SHAKY_BELOW } from './mastery';
import type { Concept } from './plan';
import type { Difficulty, QuestionAttempt, SessionResult } from './types';

/**
 * The layer that reads the per-question record.
 *
 * The interesting assertions are the ones a score cannot make: telling a gap in
 * one idea apart from a habit across several, and not letting one unlucky
 * question define a concept forever.
 */

function attempt(over: Partial<QuestionAttempt> = {}): QuestionAttempt {
  return {
    questionId: 'q',
    conceptId: 'c1',
    questionType: 'standard',
    difficulty: 'medium',
    reasoningStructure: 'single_step_application',
    selectedOption: 'A',
    correct: true,
    timeSpentMs: 30_000,
    mistakePattern: null,
    ...over,
  };
}

function session(attempts: QuestionAttempt[]): SessionResult {
  return {
    sessionId: 's',
    topicId: asTopicId('t'),
    status: 'COMPLETED',
    requested: attempts.length,
    attempts,
    correctCount: attempts.filter((a) => a.correct).length,
    answeredCount: attempts.length,
    elapsedMs: 60_000,
  };
}

describe('per-concept mastery', () => {
  it('separates accuracy by concept rather than reporting one score', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'sunk-cost', correct: false }),
        attempt({ conceptId: 'sunk-cost', correct: false }),
        attempt({ conceptId: 'scarcity', correct: true }),
        attempt({ conceptId: 'scarcity', correct: true }),
      ]),
    ]);

    const sunk = signal.byConcept.find((m) => m.conceptId === 'sunk-cost');
    const scarcity = signal.byConcept.find((m) => m.conceptId === 'scarcity');

    expect(sunk?.accuracy).toBe(0);
    expect(scarcity?.accuracy).toBe(1);
  });

  /*
   * The ceiling is the hardest band they got RIGHT, not the hardest they were
   * shown. Being handed a hard question proves nothing about the learner.
   */
  it('records the hardest band answered correctly, not the hardest seen', () => {
    const signal = signalFrom([
      session([
        attempt({ difficulty: 'hard' as Difficulty, correct: false }),
        attempt({ difficulty: 'medium' as Difficulty, correct: true }),
      ]),
    ]);

    expect(signal.byConcept[0]?.ceiling).toBe('medium');
  });

  it('ignores questions the learner never reached', () => {
    const signal = signalFrom([
      session([attempt({ correct: true }), attempt({ selectedOption: null, correct: false })]),
    ]);

    expect(signal.totalAttempts).toBe(1);
    expect(signal.byConcept[0]?.attempts).toBe(1);
  });
});

describe('a gap and a habit are different things', () => {
  /*
   * THE DISTINCTION A SCORE CANNOT MAKE.
   *
   * Three wrong on one idea is a gap. Three wrong across three ideas for the
   * SAME stated reason is a habit — more useful to hear and more fixable.
   */
  it('reports a misconception that spans concepts as recurring', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'a', correct: false, mistakePattern: 'inverts the ratio' }),
        attempt({ conceptId: 'b', correct: false, mistakePattern: 'inverts the ratio' }),
        attempt({ conceptId: 'c', correct: false, mistakePattern: 'inverts the ratio' }),
      ]),
    ]);

    expect(signal.recurringMistakes[0]).toEqual({ pattern: 'inverts the ratio', count: 3 });
    expect(adviceFrom(signal).join(' ')).toContain('inverts the ratio');
  });

  it('does not call a single-concept mistake a habit', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'a', correct: false, mistakePattern: 'forgets the half' }),
        attempt({ conceptId: 'a', correct: false, mistakePattern: 'forgets the half' }),
      ]),
    ]);

    expect(signal.recurringMistakes).toEqual([]);
    /* It is still recorded against the concept, where it belongs. */
    expect(signal.byConcept[0]?.mistakes[0]).toEqual({ pattern: 'forgets the half', count: 2 });
  });
});

describe('ranking what to practise next', () => {
  /*
   * One wrong answer scores 0% and would otherwise dominate the ranking
   * forever on the strength of a single unlucky question.
   */
  it('does not let one unlucky question outrank a repeatedly weak concept', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'once-wrong', correct: false }),
        attempt({ conceptId: 'often-wrong', correct: false }),
        attempt({ conceptId: 'often-wrong', correct: false }),
        attempt({ conceptId: 'often-wrong', correct: false }),
        attempt({ conceptId: 'often-wrong', correct: true }),
      ]),
    ]);

    expect(signal.needsWork[0]).toBe('often-wrong');
  });

  it('leaves confident concepts out of the list entirely', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'solid', correct: true }),
        attempt({ conceptId: 'solid', correct: true }),
      ]),
    ]);

    expect(signal.needsWork).not.toContain('solid');
  });

  it('treats the threshold as the product rule it is', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'borderline', correct: true }),
        attempt({ conceptId: 'borderline', correct: true }),
        attempt({ conceptId: 'borderline', correct: false }),
      ]),
    ]);

    const mastery = signal.byConcept[0];
    expect(mastery?.accuracy).toBeCloseTo(2 / 3, 5);
    expect(signal.needsWork.includes('borderline')).toBe((mastery?.accuracy ?? 1) < SHAKY_BELOW);
  });
});

describe('feeding the next set', () => {
  const concepts: Concept[] = [
    { id: 'solid', name: 'Solid', topicId: asTopicId('t'), numeric: true, prerequisites: [], commonMisconception: null },
    { id: 'weak', name: 'Weak', topicId: asTopicId('t'), numeric: true, prerequisites: [], commonMisconception: null },
    { id: 'unseen', name: 'Unseen', topicId: asTopicId('t'), numeric: true, prerequisites: [], commonMisconception: null },
  ];

  it('puts what the learner is getting wrong at the front', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'weak', correct: false }),
        attempt({ conceptId: 'weak', correct: false }),
        attempt({ conceptId: 'solid', correct: true }),
        attempt({ conceptId: 'solid', correct: true }),
      ]),
    ]);

    expect(orderByNeed(concepts, signal).map((c) => c.id)[0]).toBe('weak');
  });

  /*
   * A REORDER, NEVER A FILTER. Practising only the weak concepts stops testing
   * the rest, and a learner who has quietly forgotten something they once knew
   * would never be shown it again.
   */
  it('keeps every concept, including the ones already solid', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'weak', correct: false }),
        attempt({ conceptId: 'weak', correct: false }),
      ]),
    ]);

    const ordered = orderByNeed(concepts, signal);
    expect(ordered).toHaveLength(3);
    expect(ordered.map((c) => c.id).sort()).toEqual(['solid', 'unseen', 'weak']);
  });

  it('leaves a topic with no history exactly as it was', () => {
    const signal = signalFrom([]);
    expect(orderByNeed(concepts, signal)).toEqual(concepts);
  });
});

describe('what the learner is told', () => {
  it('says nothing at all when there is nothing worth saying', () => {
    /* A message every session trains people to skip it, and then the one that
       mattered gets skipped too. */
    expect(adviceFrom(signalFrom([]))).toEqual([]);
    expect(adviceFrom(signalFrom([session([attempt({ correct: true })])]))).toEqual([]);
  });

  it('names the concept and the numbers rather than a grade', () => {
    const signal = signalFrom([
      session([
        attempt({ conceptId: 'sunk-cost', correct: false }),
        attempt({ conceptId: 'sunk-cost', correct: false }),
        attempt({ conceptId: 'sunk-cost', correct: true }),
      ]),
    ]);

    const advice = adviceFrom(signal).join(' ');
    expect(advice).toContain('sunk cost');
    expect(advice).toContain('1 of 3');
  });
});
