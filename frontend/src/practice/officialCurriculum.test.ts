import { describe, expect, it } from 'vitest';

import { toPracticeCurriculum } from './officialCurriculum';
import type { Subject as OfficialSubject } from '../types';

/**
 * THE OFFICIAL CURRICULUM HAS NO TOPIC LAYER.
 *
 * CBSE gives `Subject -> Chapter -> Concept`. Practice needs
 * `Subject -> Chapter -> Topic`. Measured against the real data, the concept IS
 * the topic: `Sections of a cone` contains `circles`, `ellipse`, `parabola`,
 * `hyperbola` -- exactly the grain a student would click.
 *
 * So the adapter does not invent a layer. It renames one, and then it FILTERS.
 *
 * WHY THE FILTER IS THE POINT
 * --------------------------
 * 1,059 of 3,995 concepts cannot be practised: marks-table rows, teacher
 * instructions, half-sentences. `Part A` is in there. A student clicking `Part A`
 * gets a generated question about nothing, so a topic that fails the quality
 * rules must never reach the map at all.
 *
 * Dropping is the whole job, which means the counts here are load bearing: an
 * adapter that silently passed everything through would satisfy any test that
 * only checked the shape.
 */

function official(): OfficialSubject[] {
  return [
    {
      id: 'maths',
      name: 'Mathematics',
      chapters: [
        {
          id: 'cone',
          name: 'Sections of a cone',
          concepts: [
            { id: 'cone--circles', name: 'circles', minutes: 30, deps: [] },
            { id: 'cone--ellipse', name: 'ellipse', minutes: 30, deps: ['cone--circles'] },
            { id: 'cone--parabola', name: 'parabola', minutes: 30, deps: [] },
          ],
        },
      ],
    },
    {
      id: 'eco',
      name: 'Economics',
      chapters: [
        {
          id: 'theory',
          name: 'Theory',
          concepts: [
            { id: 'theory--a', name: 'Part A', minutes: 10, deps: [] },
            { id: 'theory--b', name: 'the learners are expected to acquire skills', minutes: 10, deps: [] },
            { id: 'theory--c', name: 'Index numbers', minutes: 10, deps: [] },
          ],
        },
      ],
    },
  ];
}

describe('adapting the official curriculum for practice', () => {
  it('turns every usable concept into a topic', () => {
    const [maths] = toPracticeCurriculum([official()[0]!]);
    expect(maths!.name).toBe('Mathematics');
    expect(maths!.chapters).toHaveLength(1);
    expect(maths!.chapters[0]!.topics.map((t) => t.name)).toEqual([
      'circles',
      'ellipse',
      'parabola',
    ]);
  });

  it('drops a topic a student could not practise, and keeps the rest', () => {
    const [, eco] = toPracticeCurriculum(official());
    /* `Part A` and the half-sentence are gone; `Index numbers` survives. */
    expect(eco!.chapters[0]!.topics.map((t) => t.name)).toEqual(['Index numbers']);
  });

  it('drops a chapter whose topics were all unusable rather than shipping it empty', () => {
    const allBad: OfficialSubject[] = [
      {
        id: 's',
        name: 'S',
        chapters: [
          {
            id: 'c',
            name: 'C',
            concepts: [{ id: 'c--a', name: 'Part A', minutes: 1, deps: [] }],
          },
        ],
      },
    ];
    /*
     * An empty chapter is worse than an absent one: it renders as a node on the
     * map that opens onto nothing, and the student cannot tell the difference
     * between "not built yet" and "broken".
     */
    expect(toPracticeCurriculum(allBad)).toEqual([]);
  });

  it('carries the chapter number, because the student sees "Chapter 3"', () => {
    const [maths] = toPracticeCurriculum([official()[0]!]);
    expect(maths!.chapters[0]!.number).toBe(1);
  });

  it('keeps ids untouched, so saved progress still resolves', () => {
    /*
     * Progress is persisted against these ids. Renaming or re-slugging here
     * would detach every student's history at once, silently.
     */
    const [maths] = toPracticeCurriculum([official()[0]!]);
    expect(maths!.id).toBe('maths');
    expect(maths!.chapters[0]!.id).toBe('cone');
    expect(maths!.chapters[0]!.topics[0]!.id).toBe('cone--circles');
  });

  it('drops nothing it cannot justify — every survivor passes the quality rules', () => {
    const kept = toPracticeCurriculum(official()).flatMap((s) =>
      s.chapters.flatMap((c) => c.topics.map((t) => t.name)),
    );
    expect(kept).toEqual(['circles', 'ellipse', 'parabola', 'Index numbers']);
    expect(kept).not.toContain('Part A');
  });
});
