import { describe, expect, it } from 'vitest'

import { auditSubjects, isPractisable, reasonsUnusable } from './topic-quality.mjs'

/**
 * A TOPIC A STUDENT CANNOT PRACTISE IS NOT A TOPIC.
 *
 * The official CBSE curriculum is extracted from 37 PDFs. Extraction is good in
 * places and bad in others, and the bad output is not obviously bad: it is a
 * string in a `name` field, exactly like a real topic. Measured across all four
 * classes, 1,059 of 3,995 concepts cannot be practised — a marks-table row, a
 * teacher's instruction, half a sentence, an exam question.
 *
 * Practice cannot generate a question about "Part A". It also cannot generate a
 * question about "Divide students in 3 groups and hand over one stick to each
 * group", which is an instruction to a teacher and looks nothing like a topic
 * until you read it.
 *
 * SHAPES, NOT A WORD LIST.
 * Every rule below asks about STRUCTURE — does this string have the shape of a
 * heading, or the shape of prose someone chopped in half. A list of known-bad
 * strings would pass everything nobody thought of, and would need editing every
 * time the extractor improved. The false-positive cases at the bottom are load
 * bearing: a gate that flags real topics gets switched off, and a switched-off
 * gate enforces nothing.
 *
 * WHY A RATIO, NOT A VERDICT PER TOPIC.
 * No classifier gets every string right, so the gate does not bet on one. It
 * bets on the AGGREGATE: a subject where one concept in three is unusable is
 * broken however the individual calls landed, and a subject at 98% is fine even
 * if one call was wrong.
 */

describe('what a topic must look like', () => {
  it('accepts a plain heading', () => {
    expect(reasonsUnusable('Sections of a cone')).toEqual([])
    expect(reasonsUnusable('parabola')).toEqual([])
    expect(reasonsUnusable('Angular momentum')).toEqual([])
  })

  it('accepts a lab practical, which reads like an instruction but is a real scope', () => {
    /*
     * FOUND BY MEASURING, not by imagination. An earlier rule flagged anything
     * starting with a verb, which killed 200-odd genuine physics practicals.
     * "To determine..." is what a syllabus calls an experiment a student really
     * does and can really be questioned on.
     */
    expect(reasonsUnusable('To determine volume of an irregular lamina')).toEqual([])
  })

  it('rejects a bare structural label', () => {
    for (const label of ['Part A', 'Unit 1', 'Theory', 'Section B']) {
      expect(reasonsUnusable(label)).toContain('bare-label')
    }
  })

  it('rejects a marks-table row', () => {
    expect(
      reasonsUnusable('Organisation and Presentation of Data Statistical Tools 25 40'),
    ).toContain('marks-row')
  })

  it('rejects a sentence continuation', () => {
    for (const fragment of [
      'for example',
      'in general',
      'the best approximations to be discovered over human history',
      'we observe that each term can be written as',
    ]) {
      expect(reasonsUnusable(fragment)).toContain('continuation')
    }
  })

  it("rejects a teacher's instruction", () => {
    expect(
      reasonsUnusable('Divide students in 3 groups and hand over one stick to each group'),
    ).toContain('instruction')
  })

  it('rejects prose that ran on past a full stop', () => {
    expect(reasonsUnusable('It is not an empty set. Since a composite number has factors')).toContain(
      'prose',
    )
  })

  it('rejects an enumerated exam fragment', () => {
    expect(reasonsUnusable('B and C represent the sets (ii) of consumers')).toContain('enumerated')
  })

  it('rejects something too short to name anything', () => {
    expect(reasonsUnusable('A')).toContain('too-short')
  })

  it('is the inverse of isPractisable, so there is one rule and not two', () => {
    /*
     * Two functions that could disagree is the drift this repository keeps
     * paying for. They are pinned to each other here.
     */
    for (const name of ['parabola', 'Part A', 'for example', 'Angular momentum']) {
      expect(isPractisable(name)).toBe(reasonsUnusable(name).length === 0)
    }
  })
})

describe('the subject audit', () => {
  const clean = {
    id: 'maths',
    name: 'Mathematics',
    chapters: [
      {
        id: 'cone',
        name: 'Sections of a cone',
        concepts: [
          { id: 'cone--circles', name: 'circles' },
          { id: 'cone--ellipse', name: 'ellipse' },
          { id: 'cone--parabola', name: 'parabola' },
          { id: 'cone--hyperbola', name: 'hyperbola' },
        ],
      },
    ],
  }

  const broken = {
    id: 'eco',
    name: 'Economics',
    chapters: [
      {
        id: 'theory',
        name: 'Theory',
        concepts: [
          { id: 'theory--a', name: 'Part A' },
          { id: 'theory--b', name: 'the learners are expected to acquire skills' },
          { id: 'theory--c', name: 'Statistical Tools and Interpretation 25 40' },
          { id: 'theory--d', name: 'Index numbers' },
        ],
      },
    ],
  }

  it('passes a subject whose topics are all practisable', () => {
    const [report] = auditSubjects([clean])
    expect(report).toMatchObject({ subject: 'Mathematics', total: 4, usable: 4 })
    expect(report.ratio).toBe(1)
    expect(report.ok).toBe(true)
  })

  it('fails a subject where most topics cannot be practised, and names them', () => {
    const [report] = auditSubjects([broken])
    expect(report.total).toBe(4)
    expect(report.usable).toBe(1)
    expect(report.ratio).toBe(0.25)
    expect(report.ok).toBe(false)
    /* The examples are the whole point: a number nobody can act on is a number
       nobody acts on. */
    expect(report.examples.length).toBeGreaterThan(0)
    expect(report.examples.map((e) => e.name)).toContain('Part A')
  })

  it('holds every subject to the same bar', () => {
    const reports = auditSubjects([clean, broken])
    expect(reports).toHaveLength(2)
    expect(reports.filter((r) => r.ok)).toHaveLength(1)
  })

  it('refuses a subject with no concepts rather than calling it perfect', () => {
    /*
     * 0 of 0 is 100% by arithmetic and 0% by usefulness. A subject that
     * extracted nothing is the worst case, not the best, and an audit that
     * scores it 1.0 would hide exactly the subjects most in need of a fix.
     */
    const empty = { id: 'x', name: 'Empty', chapters: [{ id: 'c', name: 'C', concepts: [] }] }
    const [report] = auditSubjects([empty])
    expect(report.total).toBe(0)
    /* Pinned explicitly. Leaving `ratio` unasserted let a mutant score an empty
       subject 1.0 and still pass, because `ok` was false for the other reason. */
    expect(report.ratio).toBe(0)
    expect(report.ok).toBe(false)
  })
})

/*
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT POINTING THIS FILTER AT A DOCUMENT ITS AUTHOR NEVER SAW REVEALED.
 *
 * Every rule here was written against CBSE school-syllabus PDFs and measured
 * against them. Run unchanged over the entrance-exam PDFs, it rejected:
 *
 *     jee-main-2026    64 of 160 topics   40%    57 of them for `too-long`
 *     neet-ug-2026     79 of 468 topics   17%    66 of them for `too-long`
 *     clat-2027        10 of  19 skills   53%     6 of them for `instruction`
 *
 * Command: reasonsUnusable() over every topic string in src/data/exams/*.ts.
 *
 * Those are not junk. An exam board publishes a topic as a dense comma list --
 * "Matrices, algebra of matrices, type of matrices, determinants..." is one
 * real, practisable JEE topic that happens to run past fourteen words. And
 * CLAT publishes SKILLS, which are imperative sentences by design, because
 * CLAT states outright that it tests aptitude rather than a syllabus.
 *
 * `too-long` and `instruction` are PROXIES for "this is a fragment", and both
 * are tuned to one document style. Measured on the exam corpus they scored
 * 0 true positives and 123 false positives. They stay for school syllabus,
 * where they earn their place; the caller states which style it is grading.
 * That is a real distinction between two kinds of document, not a carve-out
 * for the input that broke.
 *
 * `marks-row`, `continuation`, `bare-label`, `too-short`, `enumerated` and
 * `prose` are unchanged and apply to both.
 * ────────────────────────────────────────────────────────────────────────────
 */
describe('grading a document the rules were not written for', () => {
  const JEE_TOPIC =
    'Matrices, algebra of matrices, type of matrices, determinants and matrices of order two and three, evaluation of determinants, area of triangles using determinants';
  const CLAT_SKILL = 'Draw inferences and conclusions based on the passage';

  it('lets a dense comma-list from an exam PDF through', () => {
    expect(reasonsUnusable(JEE_TOPIC, 'exam')).toEqual([]);
    /*
     * The PAIR. The same string is still too long for a school CONCEPT name,
     * where every real entry is short and a long one means the extractor ran
     * two lines together. A rule asserted only to pass is satisfied by
     * returning nothing at all.
     */
    expect(reasonsUnusable(JEE_TOPIC, 'syllabus')).toEqual(['too-long']);
  });

  it('lets a CLAT skill through, which is an imperative on purpose', () => {
    expect(reasonsUnusable(CLAT_SKILL, 'exam')).toEqual([]);
    expect(reasonsUnusable(CLAT_SKILL, 'syllabus')).toEqual(['instruction']);
  });

  it('defaults to school syllabus, so an un-styled call loses nothing', () => {
    /*
     * If the parameter defaulted to `exam`, every existing caller would
     * silently lose two rules and this entire file would keep passing.
     */
    expect(reasonsUnusable(JEE_TOPIC)).toEqual(['too-long']);
    expect(reasonsUnusable(CLAT_SKILL)).toEqual(['instruction']);
  });

  it('still fires the rules that catch actual wreckage, in BOTH styles', () => {
    for (const style of ['syllabus', 'exam']) {
      expect(reasonsUnusable('Part A', style), style).toEqual(['bare-label']);
      expect(reasonsUnusable('Example 1', style), style).toEqual(['bare-label']);
      expect(
        reasonsUnusable('Statistical Tools and Interpretation 25 40', style).length,
        style,
      ).toBeGreaterThan(0);
      expect(reasonsUnusable('and the learners are expected to', style).length, style).toBeGreaterThan(0);
      expect(reasonsUnusable('of', style), style).toContain('too-short');
    }
  });
});

/*
 * `Solutions` is a chemistry unit in BOTH the JEE and the NEET syllabus, and
 * this filter deleted it. `solution` is on the bare-label list because a worked
 * example ends with that word, and the rule allowed any trailing letters, so
 * the plural matched the singular label. One real unit lost per exam, silently,
 * indistinguishable from a unit that was never published.
 *
 * A label is now either the bare word, or the word followed by a SEPARATE
 * token -- `Part A`, `Unit 1`. `Solutions` is one word and is not on the list.
 */
describe('a label word that is also a real topic', () => {
  it('keeps the chemistry unit named Solutions', () => {
    expect(reasonsUnusable('SOLUTIONS')).toEqual([]);
    expect(reasonsUnusable('Solutions')).toEqual([]);
  });

  it('still catches the singular label it was written for', () => {
    /* The PAIR. Without this, deleting the whole rule would pass the test above. */
    expect(reasonsUnusable('Solution')).toEqual(['bare-label']);
    expect(reasonsUnusable('Solution 3')).toEqual(['bare-label']);
  });
});

/*
 * `The universal law of gravitation` is a real unit in the JEE syllabus, a real
 * unit in the NEET syllabus, and this filter deleted all 31 topics like it.
 *
 * `the` sits on the continuation list because a chopped paragraph reads
 * "the best approximations to be discovered over human history". True -- and a
 * determiner is also how an enormous number of genuine headings begin: `The
 * Solid State`, `The Living World`, `The p-Block Elements`.
 *
 * CASE IS WHAT SEPARATES THEM, and it is structural rather than a list. A
 * heading is capitalised. A sentence chopped in half is not, because the words
 * before it carried the capital. So a determiner opens a continuation only when
 * it is lower-case; a connective -- `and`, `for`, `including`, `e.g.` -- opens
 * one either way, because no heading has ever begun `And ...`.
 */
describe('a determiner starts plenty of real headings', () => {
  it('keeps a capitalised heading that begins with a determiner', () => {
    for (const name of [
      'The universal law of gravitation',
      'The Solid State',
      'These are the p-Block Elements',
      'A note on notation',
      'Its structure and bonding',
    ]) {
      expect(reasonsUnusable(name), name).toEqual([]);
    }
  });

  it('still catches the lower-case chopped sentence it was written for', () => {
    /* The PAIR. Deleting the determiners from the list entirely would pass the
     * test above and fail every one of these. */
    for (const name of [
      'the best approximations to be discovered over human history',
      'this is continued from the previous line',
      'their relationship to one another',
      'which is why the value changes',
    ]) {
      expect(reasonsUnusable(name), name).toContain('continuation');
    }
  });

  it('catches a connective whatever its case, because no heading starts that way', () => {
    for (const name of [
      'And the resulting equation',
      'and the resulting equation',
      'For example, a simple pendulum',
      'Including the effects of friction',
      'e.g. a simple pendulum',
    ]) {
      expect(reasonsUnusable(name), name).toContain('continuation');
    }
  });
});
