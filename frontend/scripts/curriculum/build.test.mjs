/* Tests for build.mjs — extracted documents into the app's curriculum shape.
 *
 * DESIRED OUTCOME
 *   The app receives Subject -> Chapter -> Concept data where every concept is
 *   small enough to teach in one sitting, every dependency resolves, and every
 *   concept can be traced to the page of the official document it came from.
 *
 * WHAT MUST BE TRUE
 *   1. Every concept's minutes sit in [10, 25]. The planner allocates by these.
 *   2. Every dep id refers to a concept that exists. A dangling dep silently
 *      blocks a topic forever, because the gate that unlocks it never passes.
 *   3. No dependency cycle. A cycle blocks every concept in it, permanently.
 *   4. Ids are unique inside a subject, or progress written for one concept is
 *      read back for another.
 *   5. Every concept names the document and page it came from.
 */

import { describe, expect, it } from 'vitest'
import { estimateMinutes, slugify, buildSubject, buildClasses, auditClasses, MIN_CONCEPTS_PER_SUBJECT, KNOWN_THIN } from './build.mjs'

const DOC = {
  slug: 'science-x',
  concepts: [
    { title: 'Chemical reactions', heading: 'Chemical Reactions and Equations', page: 4 },
    { title: 'Balanced chemical equation', heading: 'Chemical Reactions and Equations', page: 4 },
    { title: 'Reactivity series', heading: 'Metals and Non-metals', page: 5 },
  ],
  topics: [{ unit: 'I', title: 'Chemical Substances', marks: 25, page: 4 }],
  formative: [],
  notes: [],
}

const META = { slug: 'science-x', subject: 'Science', classes: [10] }

describe('estimateMinutes', () => {
  it('never returns less than ten minutes', () => {
    for (const t of ['pH', 'a', 'Fog', 'Mole']) expect(estimateMinutes(t)).toBeGreaterThanOrEqual(10)
  })

  it('never returns more than twenty-five minutes', () => {
    const long = 'General properties of the Transition Elements including d-Block behaviour and more'
    expect(estimateMinutes(long)).toBeLessThanOrEqual(25)
  })

  it('is deterministic — the same title always gives the same estimate', () => {
    expect(estimateMinutes('Reactivity series')).toBe(estimateMinutes('Reactivity series'))
  })

  it('gives a longer concept at least as much time as a shorter one', () => {
    expect(estimateMinutes('Mole Concept and Molar Masses in Chemistry Today'))
      .toBeGreaterThanOrEqual(estimateMinutes('Fog'))
  })
})

describe('slugify', () => {
  it('makes a stable, url-safe id', () => {
    expect(slugify('Chemical Reactions and Equations')).toBe('chemical-reactions-and-equations')
  })

  it('strips punctuation rather than encoding it', () => {
    expect(slugify("Dalton's Atomic Theory (1803)")).toBe('daltons-atomic-theory-1803')
  })

  it('gives two different names two different ids', () => {
    expect(slugify('Power sharing')).not.toBe(slugify('Power Parties'))
  })
})

describe('buildSubject', () => {
  it('names the subject from the manifest, not the file slug', () => {
    expect(buildSubject(DOC, META).name).toBe('Science')
  })

  it('makes one chapter per heading', () => {
    expect(buildSubject(DOC, META).chapters.map((c) => c.name))
      .toEqual(['Chemical Reactions and Equations', 'Metals and Non-metals'])
  })

  it('puts each concept under its own heading', () => {
    const [first] = buildSubject(DOC, META).chapters
    expect(first.concepts.map((c) => c.name)).toEqual(['Chemical reactions', 'Balanced chemical equation'])
  })

  it('gives every concept minutes inside the ten to twenty-five band', () => {
    for (const ch of buildSubject(DOC, META).chapters) {
      for (const c of ch.concepts) {
        expect(c.minutes, c.name).toBeGreaterThanOrEqual(10)
        expect(c.minutes, c.name).toBeLessThanOrEqual(25)
      }
    }
  })

  it('records the source document and page on every concept', () => {
    const [first] = buildSubject(DOC, META).chapters
    expect(first.concepts[0].source).toEqual({ pdf: 'science-x', page: 4 })
  })

  it('chains dependencies in syllabus order inside a chapter', () => {
    const [first] = buildSubject(DOC, META).chapters
    expect(first.concepts[0].deps).toEqual([])
    expect(first.concepts[1].deps).toEqual([first.concepts[0].id])
  })

  it('every dep id refers to a concept that exists', () => {
    const subject = buildSubject(DOC, META)
    const ids = new Set(subject.chapters.flatMap((ch) => ch.concepts.map((c) => c.id)))
    for (const ch of subject.chapters) {
      for (const c of ch.concepts) {
        for (const dep of c.deps) expect(ids.has(dep), `${c.id} -> ${dep}`).toBe(true)
      }
    }
  })

  it('gives every concept in a subject a unique id', () => {
    const doc = {
      ...DOC,
      concepts: [
        { title: 'Introduction', heading: 'Alpha', page: 1 },
        { title: 'Introduction', heading: 'Beta', page: 2 },
      ],
    }
    const ids = buildSubject(doc, META).chapters.flatMap((ch) => ch.concepts.map((c) => c.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contains no dependency cycle', () => {
    const subject = buildSubject(DOC, META)
    const deps = new Map()
    for (const ch of subject.chapters) for (const c of ch.concepts) deps.set(c.id, c.deps)

    const state = new Map()
    const hasCycle = (id) => {
      if (state.get(id) === 'done') return false
      if (state.get(id) === 'open') return true
      state.set(id, 'open')
      for (const d of deps.get(id) ?? []) if (hasCycle(d)) return true
      state.set(id, 'done')
      return false
    }
    for (const id of deps.keys()) expect(hasCycle(id), id).toBe(false)
  })

  it('produces no chapters for a document with no concepts', () => {
    expect(buildSubject({ ...DOC, concepts: [] }, META).chapters).toEqual([])
  })
})

describe('two documents for the same subject become one subject', () => {
  /* CBSE publishes both a combined IX-X "Science" document and a Class X one.
   * Both are fetched on purpose, so the extractor can cross-check them. The
   * builder then emitted TWO subjects both with id "science" in class 10 — one
   * with 2 chapters and one with 13 — and the planner, which treats a subject
   * id as unique, silently kept whichever came first. A Class 10 student would
   * have been shown a syllabus missing eleven chapters. */
  const DOC_A = {
    slug: 'science-ix-x',
    concepts: [{ title: 'Motion', heading: 'Physics Basics', page: 3 }],
    topics: [], formative: [], notes: [],
  }
  const DOC_B = {
    slug: 'science-x',
    concepts: [
      { title: 'Chemical reactions', heading: 'Chemical Reactions', page: 4 },
      { title: 'Reactivity series', heading: 'Metals and Non-metals', page: 5 },
    ],
    topics: [], formative: [], notes: [],
  }
  const MANIFEST_TWO = [
    { slug: 'science-ix-x', subject: 'Science', classes: [9, 10] },
    { slug: 'science-x', subject: 'Science', classes: [10] },
  ]

  it('produces exactly one subject per id in a class', () => {
    const classes = buildClasses({ documents: [DOC_A, DOC_B] }, MANIFEST_TWO)
    const ids = classes['10'].map((s) => s.id)
    expect(ids).toEqual([...new Set(ids)])
  })

  it('keeps the chapters from BOTH documents', () => {
    const classes = buildClasses({ documents: [DOC_A, DOC_B] }, MANIFEST_TWO)
    const science = classes['10'].find((s) => s.id === 'science')
    expect(science.chapters.map((c) => c.name).sort())
      .toEqual(['Chemical Reactions', 'Metals and Non-metals', 'Physics Basics'])
  })

  it('still gives every concept a unique id after the merge', () => {
    const classes = buildClasses({ documents: [DOC_A, DOC_B] }, MANIFEST_TWO)
    const science = classes['10'].find((s) => s.id === 'science')
    const ids = science.chapters.flatMap((c) => c.concepts.map((x) => x.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves each concept traceable to the document it came from', () => {
    const classes = buildClasses({ documents: [DOC_A, DOC_B] }, MANIFEST_TWO)
    const science = classes['10'].find((s) => s.id === 'science')
    const sources = science.chapters.flatMap((c) => c.concepts.map((x) => x.source.pdf))
    expect(new Set(sources)).toEqual(new Set(['science-ix-x', 'science-x']))
  })

  it('does not merge across different classes', () => {
    const classes = buildClasses({ documents: [DOC_A, DOC_B] }, MANIFEST_TWO)
    const nine = classes['9'].find((s) => s.id === 'science')
    expect(nine.chapters.map((c) => c.name)).toEqual(['Physics Basics'])
  })
})

describe('a combined XI-XII document is split between the two years', () => {
  /* Physics, Chemistry, Biology and the rest print Class XI and Class XII in
   * ONE pdf, with a course-structure table for each. Filing the whole document
   * under both classes gave Class 12 a curriculum containing all of Class 11 —
   * two identical 403 KB files. The second course-structure page is the
   * boundary: concepts before it are XI, concepts from it on are XII. */
  const COMBINED = {
    slug: 'chemistry',
    coursePages: [2, 8],
    concepts: [
      { title: 'Some Basic Concepts', heading: 'Unit 1', page: 3 },
      { title: 'Structure of Atom', heading: 'Unit 2', page: 4 },
      { title: 'Solid State', heading: 'Unit 1', page: 9 },
      { title: 'Electrochemistry', heading: 'Unit 3', page: 10 },
    ],
    topics: [],
    formative: [],
    notes: [],
  }
  const CHEM_META = { slug: 'chemistry', subject: 'Chemistry', classes: [11, 12] }

  it('gives Class 11 only the concepts printed before the Class XII table', () => {
    const classes = buildClasses({ documents: [COMBINED] }, [CHEM_META])
    const names = classes['11'][0].chapters.flatMap((c) => c.concepts.map((x) => x.name))
    expect(names).toEqual(['Some Basic Concepts', 'Structure of Atom'])
  })

  it('gives Class 12 only the concepts printed from that table onward', () => {
    const classes = buildClasses({ documents: [COMBINED] }, [CHEM_META])
    const names = classes['12'][0].chapters.flatMap((c) => c.concepts.map((x) => x.name))
    expect(names).toEqual(['Solid State', 'Electrochemistry'])
  })

  it('does not give the two classes identical curricula', () => {
    const classes = buildClasses({ documents: [COMBINED] }, [CHEM_META])
    expect(JSON.stringify(classes['11'])).not.toBe(JSON.stringify(classes['12']))
  })

  it('leaves a single-class document alone', () => {
    const classes = buildClasses({ documents: [DOC] }, [META])
    expect(classes['10'][0].chapters.flatMap((c) => c.concepts).length).toBe(3)
  })

  it('keeps every concept when a combined document has only one table', () => {
    /* No second course-structure page means no boundary to split on. Dropping
     * half the subject would be worse than showing both years. */
    const oneTable = { ...COMBINED, coursePages: [2] }
    const classes = buildClasses({ documents: [oneTable] }, [CHEM_META])
    expect(classes['11'][0].chapters.flatMap((c) => c.concepts).length).toBe(4)
    expect(classes['12'][0].chapters.flatMap((c) => c.concepts).length).toBe(4)
  })
})

describe('buildClasses', () => {
  it('files a subject under every class its document covers', () => {
    const classes = buildClasses(
      { documents: [{ ...DOC, slug: 'chemistry' }] },
      [{ slug: 'chemistry', subject: 'Chemistry', classes: [11, 12] }],
    )
    expect(Object.keys(classes).sort()).toEqual(['11', '12'])
  })

  it('skips a document the manifest does not describe', () => {
    const classes = buildClasses({ documents: [{ ...DOC, slug: 'mystery' }] }, [])
    expect(Object.keys(classes)).toEqual([])
  })

  it('omits a subject with neither concepts nor topics', () => {
    /* Rewritten when `teachableItems` landed. It used to pass a document with
     * no concepts but a full topic list and expect nothing — which is now the
     * wrong answer, because those topics ARE the subject for English. The rule
     * being asserted is the real one: nothing in, nothing out. */
    const classes = buildClasses(
      { documents: [{ ...DOC, slug: 'science-x', concepts: [], topics: [] }] },
      [META],
    )
    expect(classes['10'] ?? []).toEqual([])
  })
})


describe('auditClasses — a subject can never go missing quietly', () => {
  /* Class 10 Mathematics silently produced ZERO concepts and was dropped from
   * the output entirely. Nothing failed. A Class 10 student would have opened
   * the app and simply had no Mathematics, with no error anywhere.
   *
   * A percentage would not have caught it either: 2160 concepts across 48
   * subjects looks healthy right up until you ask which subjects. */

  const META = [
    { slug: 'maths-x', subject: 'Mathematics', classes: [10] },
    { slug: 'science-x', subject: 'Science', classes: [10] },
  ]

  function docWith(slug, count) {
    return {
      slug,
      concepts: Array.from({ length: count }, (_, i) => ({
        title: `concept number ${i}`, heading: 'Chapter One', page: 1,
      })),
      topics: [], formative: [], notes: [],
    }
  }

  it('reports a subject the manifest promised that produced nothing', () => {
    const classes = buildClasses({ documents: [docWith('science-x', 30)] }, META)
    /* An explicit empty exception list: this asserts the DETECTION, not the
     * current contents of KNOWN_THIN. */
    const audit = auditClasses(classes, META, {})
    expect(audit.missing).toEqual([{ cls: 10, subject: 'mathematics' }])
  })

  it('reports a subject that came out too thin to teach', () => {
    const classes = buildClasses({ documents: [docWith('maths-x', 3), docWith('science-x', 30)] }, META)
    const audit = auditClasses(classes, META, {})
    expect(audit.thin).toEqual([{ cls: 10, subject: 'mathematics', concepts: 3 }])
  })

  it('says nothing about a healthy subject', () => {
    const classes = buildClasses({ documents: [docWith('maths-x', 30), docWith('science-x', 30)] }, META)
    const audit = auditClasses(classes, META, {})
    expect(audit.thin).toEqual([])
    expect(audit.missing).toEqual([])
  })

  it('accepts a thin subject that is on the written exception list', () => {
    const known = { '10|mathematics': 'a table-layout syllabus the extractor cannot read yet' }
    const classes = buildClasses({ documents: [docWith('maths-x', 3), docWith('science-x', 30)] }, META)
    expect(auditClasses(classes, META, known).thin).toEqual([])
  })

  it('uses a floor high enough to mean something', () => {
    expect(MIN_CONCEPTS_PER_SUBJECT).toBeGreaterThanOrEqual(10)
  })

  it('keeps every exception paired with a reason someone can act on', () => {
    for (const [key, reason] of Object.entries(KNOWN_THIN)) {
      expect(typeof reason, key).toBe('string')
      expect(reason.length, `${key}'s reason is too short to be useful`).toBeGreaterThan(30)
    }
  })

  it('does not list an exception for a subject that is now healthy', () => {
    /* The list must not rot into a permanent mute button. */
    const classes = buildClasses({ documents: [docWith('maths-x', 30), docWith('science-x', 30)] }, META)
    const known = { '10|mathematics': 'stale entry that should have been removed once it was fixed' }
    expect(auditClasses(classes, META, known).recovered).toEqual([{ cls: 10, subject: 'mathematics' }])
  })
})


describe('a document whose readers found less than its own topic list', () => {
  /* Class 10 English yields 4 concepts from the prose readers and 28 TOPICS —
   * the prescribed literature, which is exactly what an English student
   * studies. Ignoring the richer list because it arrived under a different name
   * left the subject below the floor while its real content sat unused. */

  const META = [{ slug: 'english-x', subject: 'English', classes: [10] }]

  const DOC = {
    slug: 'english-x',
    concepts: [{ title: 'reading comprehension', heading: 'Skills', page: 1 }],
    topics: [
      { unit: 1, title: 'A Letter to God', marks: null, page: 5 },
      { unit: 2, title: 'Nelson Mandela - Long Walk to Freedom', marks: null, page: 5 },
      { unit: 3, title: 'Dust of Snow', marks: null, page: 6 },
    ],
    formative: [], notes: [],
  }

  it('uses the topics when they outnumber the concepts', () => {
    const classes = buildClasses({ documents: [DOC] }, META)
    const names = classes['10'][0].chapters.flatMap((c) => c.concepts.map((x) => x.name))
    expect(names).toContain('A Letter to God')
    expect(names).toContain('Dust of Snow')
  })

  it('keeps the concepts it did find as well', () => {
    const classes = buildClasses({ documents: [DOC] }, META)
    const names = classes['10'][0].chapters.flatMap((c) => c.concepts.map((x) => x.name))
    expect(names).toContain('reading comprehension')
  })

  it('does NOT add topics when the readers already found more', () => {
    /* Mathematics has 34 concepts and 7 unit topics. A unit is not a twenty
     * minute lesson, so it must not be planned as one. */
    const rich = {
      slug: 'maths-x',
      concepts: Array.from({ length: 20 }, (_, i) => ({ title: `concept ${i}`, heading: 'Ch', page: 1 })),
      topics: [{ unit: 'I', title: 'ALGEBRA', marks: 20, page: 3 }],
      formative: [], notes: [],
    }
    const classes = buildClasses({ documents: [rich] }, [{ slug: 'maths-x', subject: 'Mathematics', classes: [10] }])
    const names = classes['10'][0].chapters.flatMap((c) => c.concepts.map((x) => x.name))
    expect(names).not.toContain('ALGEBRA')
    expect(names).toHaveLength(20)
  })

  it('still gives every borrowed topic a source page', () => {
    const classes = buildClasses({ documents: [DOC] }, META)
    const all = classes['10'][0].chapters.flatMap((c) => c.concepts)
    expect(all.every((c) => c.source && typeof c.source.pdf === 'string')).toBe(true)
  })
})
