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
