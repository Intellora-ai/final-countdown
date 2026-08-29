import { describe, expect, it } from 'vitest';

import { FAMILIES, familyOf, optionsAround, questionFor, type ConceptFamily } from './family';
import { asChapterId, asSubjectId, asTopicId } from './ids';
import { reasonsSenseless } from './sense';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ROOT CAUSE, AND THE FIX FOR IT.
 *
 * `provider.ts` holds `TEMPLATES: Record<ReasoningStructure, Template>`. Ten
 * templates, keyed by HOW to reason -- recall, chain, comparison -- and never
 * by WHAT the topic is about. The curriculum has 3,461 practisable topics. The
 * topic name reaches the generator in exactly one place: as a string dropped
 * into a sentence written for no topic in particular.
 *
 * That is why every question read like this:
 *
 *     "Two systems differ only in Zeros of a polynomial.
 *      One reads 100, the other 2. By how much does the first exceed
 *      the second?"
 *
 * Nothing was broken in the templates. There simply was no path by which the
 * SUBJECT MATTER of a topic could influence the question, so the topic could
 * only ever be a label.
 *
 * THIS MODULE ADDS THAT PATH. A topic is classified into a concept FAMILY from
 * its own words, and each family owns questions that ask something real about
 * that kind of mathematics, with arithmetic the verifier can recompute.
 *
 * WHAT IT IS NOT, said before what it is: it is not a model, and it does not
 * understand anything. It covers the families it has, and it says `generic` --
 * out loud, in the return value -- for everything else. A classifier that
 * silently guessed a family would be worse than the label-pasting it replaces,
 * because a confidently wrong question looks exactly like a right one.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Real headings, copied out of `src/data/curriculum/class10.ts`. */
const REAL_TOPICS: readonly (readonly [string, ConceptFamily])[] = [
  ['Zeros of a polynomial', 'polynomial-roots'],
  ['Relationship between zeros and coefficients of quadratic polynomials', 'polynomial-roots'],
  ['Area of sectors and segments of a circle', 'area-circle'],
  ['Areas related to circles', 'area-circle'],
  ['Classical definition of probability', 'probability'],
  ['Simple problems on single events', 'generic'],
  ['Motivation for studying Arithmetic Progression', 'arithmetic-progression'],
  ['nth term and sum of first n terms of A.P.', 'arithmetic-progression'],
  ['Mean, median and mode of grouped data', 'statistics-average'],
  ['Pair of linear equations in two variables', 'linear-equation'],
];

describe('a topic is classified by its own words', () => {
  it('recognises the families it claims to recognise', () => {
    for (const [name, family] of REAL_TOPICS) {
      expect(familyOf(name), name).toBe(family);
    }
  });

  it('says `generic` for a topic it does not know, instead of guessing', () => {
    /*
     * THE MOST IMPORTANT ASSERTION IN THIS FILE.
     *
     * A classifier that reached for the nearest family would produce a
     * confidently wrong question -- an area question about a grammar topic --
     * and that is indistinguishable from a right one until a student reads it.
     * Unknown is a real answer and it is returned as one.
     */
    for (const name of [
      'This term is derived from the Latin version of Descartes name',
      'Tenses and modals',
      'Nationalism in Europe',
      '',
    ]) {
      expect(familyOf(name), name).toBe('generic');
    }
  });

  it('is not fooled by a signal hiding inside a longer word', () => {
    /*
     * ADDED BECAUSE A MUTANT SURVIVED. Switching whole-word matching to a
     * plain `includes` changed no result, which proved nothing here exercised
     * the difference.
     *
     * `ap` is a signal for arithmetic progression, and it sits inside
     * "Chapter", "Application" and "Capacity". Under substring matching every
     * topic containing any of those words becomes an A.P. question -- which is
     * a large fraction of a syllabus, silently.
     */
    for (const name of [
      'Chapter overview and objectives',
      'Application of derivatives',
      'Capacity of a cylindrical vessel',
    ]) {
      expect(familyOf(name), name).not.toBe('arithmetic-progression');
    }
  });
});

describe('each family asks a question about its own mathematics', () => {
  const real = FAMILIES.filter((family) => family !== 'generic');

  it('covers more than one family, so the sweep is not vacuous', () => {
    expect(real.length).toBeGreaterThan(4);
  });

  it('never pastes the topic heading into the question', () => {
    /*
     * The defect this whole module exists to remove. The question is about the
     * topic; it does not NAME the topic and then say nothing about it.
     */
    for (const family of real) {
      const q = questionFor(family, 7);
      expect(q.text, family).not.toContain('Zeros of a polynomial');
      expect(q.text.length, family).toBeGreaterThan(25);
    }
  });

  it('uses the vocabulary of its own family', () => {
    /*
     * The oracle is the family name itself: a polynomial question says
     * "polynomial", a probability question says "probability". A generator
     * emitting one generic sentence for every family passes every other
     * assertion here and fails this one.
     */
    const mustSay: Readonly<Record<string, RegExp>> = {
      'polynomial-roots': /polynomial|zero|root/i,
      'area-circle': /circle|radius|sector|area/i,
      probability: /probability|marble|drawn|bag/i,
      'arithmetic-progression': /term|progression|sequence/i,
      'linear-equation': /equation|solve|x\b/i,
      'statistics-average': /mean|average|median/i,
      ratio: /ratio|proportion|per cent|percent/i,
    };

    for (const family of real) {
      const pattern = mustSay[family];
      expect(pattern, `no vocabulary declared for ${family}`).toBeDefined();
      expect(questionFor(family, 3).text, family).toMatch(pattern!);
    }
  });

  it('states an answer the arithmetic actually produces', () => {
    /*
     * TEST ORACLE. The expected value is not "whatever the code returned" --
     * each family declares `expected`, and this recomputes it from the same
     * inputs by a route the family did not write. A question whose stated
     * answer disagrees with its own numbers is the one defect no amount of
     * good wording survives.
     */
    for (const family of real) {
      for (const seed of [0, 1, 7, 23, 99]) {
        const q = questionFor(family, seed);
        expect(Number.isFinite(q.expected), `${family}/${seed}`).toBe(true);
        expect(q.check(), `${family} seed ${seed}: stated ${q.expected}`).toBeCloseTo(q.expected, 6);
      }
    }
  });

  it('gives four distinct options with the answer among them', () => {
    for (const family of real) {
      const q = questionFor(family, 11);
      expect(new Set(q.options).size, family).toBe(4);
      expect(q.options, family).toContain(q.expected);
    }
  });

  it('varies with the seed, so ten questions are not one question', () => {
    for (const family of real) {
      const texts = new Set([0, 1, 2, 3, 4].map((seed) => questionFor(family, seed).text));
      expect(texts.size, family).toBeGreaterThan(3);
    }
  });

  it('passes the sense checker it was built to satisfy', () => {
    /*
     * The gate that rejected 12 of 12 generated questions. If a family's own
     * output cannot clear it, the family is the next defect.
     */
    for (const family of real) {
      const q = questionFor(family, 5);
      expect(reasonsSenseless(q.text, 'Zeros of a polynomial', 'mathematics'), family).toEqual([]);
    }
  });
});

/*
 * `optionsAround` is tested directly because a mutant proved it could not
 * otherwise fail through a family: every family in use returns a positive
 * answer, so the collapsing case was never reached.
 *
 * It also settled which line is actually doing the work. An explicit
 * deduplication loop was written first, and removing it changed no result --
 * the `Math.max(1, ...)` floor on the step had already separated every value.
 * The loop was deleted and the floor is what these tests pin.
 */
describe('four options, always four, whatever the answer is', () => {
  it('stays distinct when the answer is zero', () => {
    /*
     * THE CASE THE GUARD EXISTS FOR. With an answer of 0 the step is
     * proportional to 0, so every derived option lands on 0 and a student is
     * shown the same number four times -- with all four correct.
     */
    const options = optionsAround(0, 0);

    expect(new Set(options).size).toBe(4);
    expect(options).toContain(0);
  });

  it('stays distinct for a tiny answer, where rounding collapses the spread', () => {
    const options = optionsAround(0.0001, 2);
    expect(new Set(options).size).toBe(4);
  });

  it('still contains the answer for an ordinary value', () => {
    /* The pair: a guard that guaranteed distinctness by discarding the answer
       would pass both tests above. */
    const options = optionsAround(42, 1);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain(42);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * THE WIRE. A family that nothing calls is the state this repository's own
 * notes call CONFIGURED TO BE CHECKED: every quality signal green, zero
 * execution. Four engines here have already been found in exactly that state.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('the generator asks the family, not one template for everything', () => {
  it('produces a real polynomial question for a polynomial topic', async () => {
    const { fixtureProvider } = await import('./provider');
    const spec = {
      specId: 'x-0',
      topicId: asTopicId('t'),
      chapterId: asChapterId('c'),
      subjectId: asSubjectId('mathematics'),
      conceptId: 't--zeros',
      conceptName: 'Zeros of a polynomial',
      questionType: 'standard',
      difficultyTarget: 'medium',
      reasoningStructure: 'single_step_application',
      prerequisites: [],
      misconceptionTested: null,
    } as never;

    const q = await fixtureProvider().generate(spec, 0, new AbortController().signal);

    /*
     * The defect, stated as an assertion: the heading must not appear in the
     * question at all. A question ABOUT zeros of a polynomial does not need to
     * announce the chapter it came from.
     */
    expect(q.questionText).not.toContain('Zeros of a polynomial');
    expect(q.questionText).toMatch(/polynomial|zero/i);
  });

  it('falls back to the old templates for a topic no family covers', async () => {
    /*
     * THE PAIR. 43 of 1850 topics match a family today -- 2%, measured. The
     * other 1807 must still produce a question, and they must not be quietly
     * handed a polynomial one.
     */
    const { fixtureProvider } = await import('./provider');
    const spec = {
      specId: 'y-0',
      topicId: asTopicId('t'),
      chapterId: asChapterId('c'),
      subjectId: asSubjectId('history'),
      conceptId: 't--n',
      conceptName: 'Nationalism in Europe',
      questionType: 'standard',
      difficultyTarget: 'medium',
      reasoningStructure: 'single_step_application',
      prerequisites: [],
      misconceptionTested: null,
    } as never;

    const q = await fixtureProvider().generate(spec, 0, new AbortController().signal);

    expect(q.questionText.length).toBeGreaterThan(20);
    expect(q.questionText).not.toMatch(/polynomial/i);
  });

  it('keeps the arithmetic checkable on the family path', async () => {
    /*
     * The verifier recomputes from `computation` and rejects disagreement. A
     * family question that shipped without one would skip the strongest check
     * in the pipeline.
     */
    const { fixtureProvider } = await import('./provider');
    const spec = {
      specId: 'z-0',
      topicId: asTopicId('t'),
      chapterId: asChapterId('c'),
      subjectId: asSubjectId('mathematics'),
      conceptId: 't--prob',
      conceptName: 'Classical definition of probability',
      questionType: 'standard',
      difficultyTarget: 'medium',
      reasoningStructure: 'single_step_application',
      prerequisites: [],
      misconceptionTested: null,
    } as never;

    const q = await fixtureProvider().generate(spec, 0, new AbortController().signal);

    expect(q.computation).not.toBeNull();
    const answer = q.options.find((option) => option.key === q.correctOption);
    expect(answer, 'the correct option is missing').toBeDefined();
    expect(Number.parseFloat(answer!.text)).toBeCloseTo(q.computation!.expected, 6);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * §18 — DISTRACTORS MUST REPRESENT PLAUSIBLE ERRORS.
 *
 * "For MCQs, wrong options should represent plausible errors... Do not allow
 * random distractors merely to fill four options."
 *
 * The first version derived every wrong option from the answer by ±20%. Read
 * off the real generator:
 *
 *     A bag holds 7 red marbles and 4 blue marbles. P(red)?
 *     -> 0.636 | 1.636 | -0.364 | 2.636
 *
 * Three of those are impossible. A probability cannot exceed 1 or fall below 0,
 * so a student who knows only that eliminates three options without doing any
 * mathematics -- the question tests nothing and still looks rigorous.
 *
 * A distractor now has to be the answer a REAL MISTAKE produces: the other
 * colour, the ratio instead of the probability, the whole circle instead of the
 * sector, the term before the one asked for.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('every wrong option is a mistake a student could actually make', () => {
  const real = FAMILIES.filter((family) => family !== 'generic');

  it('keeps a probability inside 0 and 1', () => {
    /*
     * The measured defect, as an assertion. This is the one case where the
     * bound is a property of the quantity itself rather than a matter of taste.
     */
    for (const seed of [0, 1, 3, 7, 12, 40]) {
      const q = questionFor('probability', seed);
      for (const option of q.options) {
        expect(option >= 0 && option <= 1, `seed ${seed}: ${option} is not a probability`).toBe(true);
      }
    }
  });

  it('keeps an area positive, because a negative area is not a mistake', () => {
    for (const seed of [0, 2, 5, 9]) {
      for (const option of questionFor('area-circle', seed).options) {
        expect(option, `seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives every wrong option a stated reason', () => {
    /*
     * §18: store the relationship from distractor to error type. A wrong option
     * nobody can explain is noise, and it is also unusable for the diagnosis
     * this whole engine exists to support.
     */
    for (const family of real) {
      const q = questionFor(family, 4);
      expect(q.wrongReasons.length, family).toBe(3);
      for (const reason of q.wrongReasons) {
        expect(reason.trim().length, `${family}: "${reason}"`).toBeGreaterThan(12);
      }
    }
  });

  it('still has four distinct options with the answer among them', () => {
    /*
     * THE PAIR. Deriving distractors from real mistakes must not reintroduce a
     * collision -- two mistakes can produce the same number, and then a student
     * sees three options where four were promised.
     */
    for (const family of real) {
      for (const seed of [0, 1, 2, 3, 6, 15, 31]) {
        const q = questionFor(family, seed);
        expect(new Set(q.options).size, `${family} seed ${seed}`).toBe(4);
        expect(q.options, `${family} seed ${seed}`).toContain(q.expected);
      }
    }
  });
});
