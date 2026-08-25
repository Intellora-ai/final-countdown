import { describe, expect, it } from 'vitest';
import { asChapterId, asTopicId } from './ids';

import { buildPlan, type Concept, type TopicProfile } from './plan';
import { QUESTION_COUNTS, type QuestionCount } from './types';

/**
 * THE TOPIC BOUNDARY, FENCED.
 *
 * The product invariant is one line: the topic a student selected is the topic
 * every question tests. `verify.ts` and `session.ts` already refuse a question
 * whose `topicId` differs from the session's, and `verify.test.ts` and
 * `session.test.ts` already cover that case.
 *
 * WHAT THEY DO NOT COVER, AND WHY IT MATTERS
 * ------------------------------------------
 * Both existing checks compare `question.topicId` against `session.topicId`.
 * That is an equality check between two values the same code path produced, so
 * it holds whenever both sides agree -- INCLUDING when both sides agree on a
 * value that is not a topic id at all.
 *
 * A chapter-scoped launch does exactly that. `SessionView.profileFor` builds
 * `{ topicId: chapter.id, chapterId: chapter.id }` and passes the chapter's
 * TOPICS as the `concepts` array. `buildPlan` then stamps every spec with
 * `topicId: profile.topicId`, so fifteen questions covering five different
 * topics all carry one chapter id in the field that is supposed to name the
 * topic under test. The equality check passes. The metadata is wrong.
 *
 * Nothing caught it because no test asked the question these do: not "do the
 * two sides agree" but "does `topicId` identify the topic".
 */

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function concept(id: string, over: Partial<Concept> = {}): Concept {
  return {
    id,
    name: id.replace(/-/g, ' '),
    /* A concept named `chapter--topic--idea` belongs to `chapter--topic`; a
       concept that IS a topic belongs to itself. Derived rather than passed so
       a fixture cannot quietly disagree with its own id. */
    topicId: asTopicId(id.split('--').slice(0, 2).join('--')),
    numeric: false,
    prerequisites: [],
    commonMisconception: null,
    ...over,
  };
}

/**
 * A profile shaped the way `SessionView.profileFor` shapes a CHAPTER launch:
 * the chapter's id in both slots, and the chapter's topics arriving as
 * `concepts`. Written out rather than imported because `profileFor` is local
 * to a component; if that changes, this fixture is the thing to update.
 */
function chapterScope(): TopicProfile {
  return {
    topicId: asTopicId('functions'),
    chapterId: asChapterId('functions'),
    quantitative: 0.5,
    concepts: [
      concept('functions--domain-and-range'),
      concept('functions--graphs-of-functions'),
      concept('functions--composite-functions'),
      concept('functions--inverse-functions'),
    ],
  };
}

function topicScope(topicId: string, chapterId: string): TopicProfile {
  return {
    topicId: asTopicId(topicId),
    chapterId: asChapterId(chapterId),
    quantitative: 0.5,
    concepts: [concept(`${topicId}--a`), concept(`${topicId}--b`), concept(`${topicId}--c`)],
  };
}

/* -------------------------------------------------------------------------- */

describe('topicId names the topic under test', () => {
  it('gives two questions on different topics two different topic ids', () => {
    /*
     * The failing case, stated as the product rule rather than as the bug.
     *
     * A chapter's four topics are four separate practice scopes. A set drawn
     * across them tests more than one topic, so more than one topic id has to
     * appear -- otherwise `topicId` is not identifying anything and §19's
     * "topic_id is mandatory" buys nothing but a filled-in field.
     */
    const specs = buildPlan(chapterScope(), 15);
    expect(specs.length).toBeGreaterThan(1);

    const conceptsCovered = new Set(specs.map((s) => s.conceptId));
    expect(conceptsCovered.size).toBeGreaterThan(1);

    const topicsClaimed = new Set(specs.map((s) => s.topicId));
    expect(topicsClaimed.size).toBe(conceptsCovered.size);
  });

  it('never puts the chapter id in the topic slot when the two are different things', () => {
    /*
     * A topic id and a chapter id are different kinds of name. They may not
     * collide by construction -- if they do, every downstream equality check
     * is comparing a chapter to a chapter and calling it topic isolation.
     */
    const specs = buildPlan(chapterScope(), 5);
    for (const spec of specs) {
      expect(spec.topicId).not.toBe(spec.chapterId);
    }
  });
});

describe('the boundary holds for a topic-scoped launch', () => {
  it('stamps the requested topic on every spec', () => {
    const profile = topicScope('functions--graphs-of-functions', 'functions');
    const specs = buildPlan(profile, 15);

    expect(specs).not.toHaveLength(0);
    for (const spec of specs) {
      expect(spec.topicId).toBe('functions--graphs-of-functions');
      expect(spec.chapterId).toBe('functions');
    }
  });

  it('holds across every count and a wide spread of topics', () => {
    /*
     * §29, at the plan layer: for ANY valid request, the topic that comes back
     * is the topic that was asked for. Seeded and exhaustive over the counts
     * rather than sampled, because the set is small enough to cover fully and a
     * sampled property test that never hits count=15 proves less than it looks.
     *
     * 240 profiles x 3 counts = 720 plans, every spec checked.
     */
    let specsChecked = 0;

    for (let seed = 0; seed < 240; seed += 1) {
      const chapterId = `ch-${seed % 17}`;
      const topicId = `${chapterId}--topic-${seed}`;
      const profile = topicScope(topicId, chapterId);

      for (const count of QUESTION_COUNTS as readonly QuestionCount[]) {
        for (const spec of buildPlan(profile, count)) {
          expect(spec.topicId).toBe(topicId);
          expect(spec.chapterId).toBe(chapterId);
          specsChecked += 1;
        }
      }
    }

    /*
     * A property test that checked nothing would pass every assertion above.
     * 240 profiles x (5 + 10 + 15) is 7,200 specs, and asserting the count
     * exactly is what makes an empty run a failure rather than a green tick.
     */
    expect(specsChecked).toBe(240 * (5 + 10 + 15));
  });
});

describe('a prerequisite is not a target topic', () => {
  it('leaves the target topic alone when a concept depends on another topic', () => {
    /*
     * §4. Quadratic graphs need basic algebra. That makes algebra a
     * prerequisite, not the thing being tested -- and the two live in separate
     * fields precisely so one can never quietly become the other.
     */
    const profile: TopicProfile = {
      topicId: asTopicId('functions--quadratic-graphs'),
      chapterId: asChapterId('functions'),
      quantitative: 0.8,
      concepts: [
        concept('functions--quadratic-graphs--vertex', {
          prerequisites: ['algebra--factorising', 'algebra--completing-the-square'],
        }),
        concept('functions--quadratic-graphs--roots', {
          prerequisites: ['algebra--factorising'],
        }),
      ],
    };

    const specs = buildPlan(profile, 10);
    expect(specs).not.toHaveLength(0);

    for (const spec of specs) {
      expect(spec.topicId).toBe('functions--quadratic-graphs');
      /* The prerequisites are carried, and carried SEPARATELY. */
      for (const prerequisite of spec.prerequisites) {
        expect(prerequisite).not.toBe(spec.topicId);
      }
    }
  });
});
