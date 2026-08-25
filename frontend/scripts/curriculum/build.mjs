#!/usr/bin/env node
/**
 * BUILD THE APP'S CURRICULUM FROM THE EXTRACTED DOCUMENTS
 *
 * Turns data/curriculum-extracted.json into the Subject -> Chapter -> Concept
 * shape the dashboard already uses, one file per school class.
 *
 * WHY A HEADING BECOMES A CHAPTER
 *     A unit like "Algebra, 25 marks" is not something anyone sits down and
 *     learns in twenty minutes. The syllabus prints its detail one level down —
 *     "Chemical Reactions and Equations: chemical reactions, chemical equation,
 *     balanced chemical equation" — so the heading is the chapter and each item
 *     under it is a concept. That is the granularity the planner needs.
 *
 * WHY MINUTES ARE AN ESTIMATE AND SAY SO
 *     Only one of the 37 documents states study time at all (Class IX Social
 *     Science, in hours per theme). For everything else the figure is derived
 *     from the concept's own length by a fixed rule, and it is clamped to the
 *     10-25 minute band the planner works in. It is an estimate of effort, not
 *     a fact from the document, and nothing downstream should treat it as one.
 *
 * WHY DEPENDENCIES ARE A CHAIN
 *     A syllabus is written in teaching order. Within a chapter each concept
 *     therefore depends on the one printed before it. That is a real, defensible
 *     default. It is not a claim that the document states prerequisites — none
 *     of them do — and it deliberately never crosses a chapter boundary, so a
 *     wrong guess can only ever hold up one chapter, never the whole subject.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { whyNotATopic } from './concept-quality.mjs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MANIFEST } from './manifest.mjs'

const MIN_MINUTES = 10
const MAX_MINUTES = 25

/**
 * A deterministic effort estimate, in minutes, from the concept's own wording.
 * Longer names describe more to learn. Crude, but stable and inside the band.
 */
export function estimateMinutes(title) {
  const words = String(title).trim().split(/\s+/).filter(Boolean).length
  const minutes = words <= 2 ? 10 : words <= 4 ? 15 : words <= 7 ? 20 : 25
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes))
}

export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Build one Subject from one extracted document. */
export function buildSubject(doc, meta) {
  const byHeading = new Map()
  for (const concept of doc.concepts ?? []) {
    if (!byHeading.has(concept.heading)) byHeading.set(concept.heading, [])
    byHeading.get(concept.heading).push(concept)
  }

  const usedIds = new Set()
  const uniqueId = (base) => {
    let id = base || 'concept'
    let n = 2
    while (usedIds.has(id)) {
      id = `${base}-${n}`
      n += 1
    }
    usedIds.add(id)
    return id
  }

  const chapters = []
  for (const [heading, items] of byHeading) {
    const concepts = []
    for (const item of items) {
      /* The id is prefixed with the chapter so two chapters may both contain a
       * concept called "Introduction" without colliding. */
      const id = uniqueId(`${slugify(heading)}--${slugify(item.title)}`)
      concepts.push({
        id,
        name: item.title,
        minutes: estimateMinutes(item.title),
        /* Syllabus order: each concept follows the one before it, and the chain
         * never crosses into another chapter. */
        deps: concepts.length > 0 ? [concepts[concepts.length - 1].id] : [],
        /* `item.pdf` is set when concepts from several documents were merged
         * into one subject, so each one still names the document it came from. */
        source: { pdf: item.pdf ?? doc.slug, page: item.page },
      })
    }
    chapters.push({ id: slugify(heading), name: heading, concepts })
  }

  return { id: slugify(meta.subject), name: meta.subject, chapters }
}

/**
 * Split a combined XI-XII document between its two school years.
 *
 * Physics, Chemistry, Biology and the rest print both years in ONE pdf, each
 * with its own course-structure table. Filing the whole document under both
 * classes gave Class 12 a curriculum that contained the whole of Class 11.
 *
 * The second course-structure page is the boundary. When a document has only
 * one such page there is nothing to split on, and both years keep everything —
 * showing a student one extra year is bad, but silently deleting half their
 * syllabus is worse.
 */
export function conceptsForClass(doc, meta, cls) {
  const concepts = doc.concepts ?? []
  const pages = doc.coursePages ?? []
  if (meta.classes.length < 2 || pages.length < 2) return concepts

  const boundary = pages[1]
  const isFirstYear = cls === meta.classes[0]
  return concepts.filter((c) =>
    typeof c.page !== 'number' ? true : isFirstYear ? c.page < boundary : c.page >= boundary,
  )
}

/**
 * Everything in a document worth teaching, for one class.
 *
 * Normally that is its atomic concepts. But some subjects are not written as a
 * list of concepts at all: Class 10 English yields four, and twenty-eight
 * TOPICS — the prescribed literature, which is precisely what an English
 * student studies. Ignoring the richer list because it arrived under a
 * different name left the subject below the floor while its real content sat
 * unused.
 *
 * The topics are only borrowed when they OUTNUMBER the concepts. Mathematics
 * has thirty-four concepts and seven unit topics, and a unit is not a twenty
 * minute lesson — planning "ALGEBRA" as one would be worse than not planning
 * it at all.
 */
export function teachableItems(doc, meta, cls) {
  const concepts = conceptsForClass(doc, meta, cls)
  const topics = doc.topics ?? []
  const picked =
    concepts.length >= topics.length
      ? concepts
      : (() => {
          const seen = new Set(concepts.map((c) => c.title.toLowerCase()))
          const borrowed = topics
            .filter((t) => typeof t.title === 'string' && !seen.has(t.title.toLowerCase()))
            .map((t) => ({ title: t.title, heading: 'Prescribed', page: t.page ?? null }))
          return [...concepts, ...borrowed]
        })()

  // THE CHOKEPOINT. Everything a subject ships passes through here, so this is
  // the one place that can guarantee a student is never handed "Since" as a
  // topic to spend fifteen minutes on. The "at advanced level" documents are
  // worked-problem books, and reading their solved examples as curriculum put
  // 569 such fragments into the shipped data past a provenance gate that saw
  // nothing wrong with any of them.
  return picked.filter((item) => whyNotATopic(item.title) === null)
}

/**
 * Group subjects by the school class each document governs.
 *
 * TWO DOCUMENTS CAN BE THE SAME SUBJECT. CBSE publishes both a combined IX-X
 * "Science" and a Class X "Science"; both are fetched deliberately so the
 * extractor can cross-check them. Emitting them as two subjects gave class 10
 * two entries both with id "science" — one with 2 chapters and one with 13 —
 * and the planner, which treats a subject id as unique, kept whichever came
 * first. A student would have been shown a syllabus missing eleven chapters
 * with nothing anywhere reporting a problem.
 *
 * So documents are grouped by (class, subject id) and merged into one subject.
 * Nothing is dropped, and each concept still names the document it came from.
 */
export function buildClasses(extracted, manifest) {
  const bySlug = new Map(manifest.map((m) => [m.slug, m]))

  /** `${cls}|${subjectId}` -> { cls, meta, concepts } */
  const groups = new Map()

  for (const doc of extracted.documents ?? []) {
    const meta = bySlug.get(doc.slug)
    if (!meta) continue
    for (const cls of meta.classes) {
      const key = `${cls}|${slugify(meta.subject)}`
      const group = groups.get(key) ?? { cls, meta, concepts: [] }
      for (const concept of teachableItems(doc, meta, cls)) {
        group.concepts.push({ ...concept, pdf: concept.pdf ?? doc.slug })
      }
      groups.set(key, group)
    }
  }

  const classes = {}
  for (const group of groups.values()) {
    classes[group.cls] ??= []
    const subject = buildSubject({ slug: group.meta.slug, concepts: group.concepts }, group.meta)
    if (subject.chapters.length > 0) classes[group.cls].push(subject)
  }
  return classes
}

/**
 * A subject with fewer concepts than this is not a syllabus a student can work
 * through. Ten is deliberately low: it is a floor for "something is wrong",
 * not a target.
 */
export const MIN_CONCEPTS_PER_SUBJECT = 10

/**
 * Subjects known to come out thin, keyed `${cls}|${subjectId}`, each with the
 * reason. Adding to this is a deliberate line in a diff, never a silent gap.
 *
 * All of these share one cause: their syllabus is laid out as a Content /
 * Competencies TABLE rather than as "Heading: item, item, item" prose, and the
 * extractor reads prose. That is a real gap in Phase 0, not a property of the
 * subject.
 */
export const KNOWN_THIN = {
  '9|english-language-and-literature':
    'Nine concepts against a floor of ten, and that is genuinely all the document contains. Class IX English names one prescribed textbook — "Kaveri: Textbook of English for Grade 9" — and does not reproduce its contents, so there is no text list to read. Its syllabus is reading, writing, grammar and literature SKILLS. Closing this needs the Kaveri contents from another source, not a better parser.',
  '9|elements-of-business':
    'Table-layout syllabus (Content / Learning Outcomes columns) which the prose extractor cannot read yet.',
  '9|elements-of-book-keeping-accountancy':
    'Table-layout syllabus (Units/Topics and Learning Outcomes columns) not yet readable by the extractor.',
  '10|elements-of-business':
    'Table-layout syllabus (Content / Learning Outcomes columns) which the prose extractor cannot read yet.',
  '11|political-science':
    'Seventeen items were extracted and eleven of them were worked-example and question fragments out of the document, leaving six. This subject did not shrink -- it was never sixteen real concepts, and the count floor read the rubbish as content. Its syllabus is a themes-and-questions layout the prose extractor does not read. Closing it needs a table reader, not a lower floor.',
}

/**
 * Check that every subject the manifest promised actually arrived, and arrived
 * with enough in it to teach.
 *
 * Class 10 Mathematics produced ZERO concepts and was dropped from the output
 * with nothing reporting it. A student would simply have had no Mathematics. A
 * total concept count cannot catch that: 2160 concepts across 48 subjects looks
 * healthy right up until you ask WHICH subjects.
 */
export function auditClasses(classes, manifest, known = KNOWN_THIN) {
  const missing = []
  const thin = []
  const recovered = []

  const expected = new Map()
  for (const meta of manifest) {
    for (const cls of meta.classes) expected.set(`${cls}|${slugify(meta.subject)}`, { cls, subject: slugify(meta.subject) })
  }

  for (const [key, { cls, subject }] of expected) {
    const built = (classes[cls] ?? []).find((s) => s.id === subject)
    const count = built === undefined
      ? 0
      : built.chapters.reduce((n, c) => n + c.concepts.length, 0)

    const listed = key in known
    if (built === undefined) {
      if (!listed) missing.push({ cls, subject })
      continue
    }
    if (count < MIN_CONCEPTS_PER_SUBJECT) {
      if (!listed) thin.push({ cls, subject, concepts: count })
      continue
    }
    /* Healthy but still on the list: the entry has gone stale. */
    if (listed) recovered.push({ cls, subject })
  }

  return { missing, thin, recovered }
}

/* ---------------------------------------------------------------- CLI ---- */

const IN = fileURLToPath(new URL('../../../data/curriculum-extracted.json', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('../../src/data/curriculum/', import.meta.url))

function fileFor(cls, subjects) {
  const totalConcepts = subjects.reduce(
    (n, s) => n + s.chapters.reduce((m, c) => m + c.concepts.length, 0),
    0,
  )
  return `/* GENERATED FILE — do not edit by hand.
 *
 * Built by frontend/scripts/curriculum/build.mjs from the official CBSE 2026-27
 * syllabus documents recorded in data/curriculum-sources.lock.json.
 * Re-generate with: npm run curriculum:build
 *
 * Class ${cls}: ${subjects.length} subjects, ${totalConcepts} concepts.
 *
 * Every concept carries the pdf and page it was read from. Every "minutes"
 * value is an ESTIMATE derived from the concept's wording, not a figure the
 * document states.
 */

import type { Subject } from '../../types'

export const CLASS_${cls}: Subject[] = ${JSON.stringify(subjects, null, 2)}
`
}

async function main() {
  const extracted = JSON.parse(await readFile(IN, 'utf8'))
  const classes = buildClasses(extracted, MANIFEST)

  await mkdir(OUT_DIR, { recursive: true })
  let subjects = 0
  let concepts = 0
  const written = []

  for (const [cls, list] of Object.entries(classes)) {
    if (list.length === 0) continue
    await writeFile(join(OUT_DIR, `class${cls}.ts`), fileFor(cls, list), 'utf8')
    subjects += list.length
    concepts += list.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.concepts.length, 0), 0)
    written.push(`class${cls}.ts`)
  }

  console.log(`CURRICULUM BUILT — ${written.length} files, ${subjects} subjects, ${concepts} concepts`)
  for (const f of written) console.log(`  ${f}`)

  const audit = auditClasses(classes, MANIFEST)
  for (const { cls, subject } of audit.recovered) {
    console.log(`  NOW HEALTHY: class ${cls} ${subject} — remove it from KNOWN_THIN.`)
  }
  const listed = Object.keys(KNOWN_THIN).length - audit.recovered.length
  console.log(`  known thin subjects: ${listed}`)

  if (audit.missing.length > 0 || audit.thin.length > 0) {
    console.log('')
    console.log('CURRICULUM SUBJECT GAP')
    for (const { cls, subject } of audit.missing) {
      console.log(`  class ${cls} ${subject}: the manifest promises this subject and NOTHING was built for it.`)
    }
    for (const { cls, subject, concepts: n } of audit.thin) {
      console.log(`  class ${cls} ${subject}: only ${n} concepts, below the floor of ${MIN_CONCEPTS_PER_SUBJECT}.`)
    }
    return 1
  }

  return concepts > 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.log(`curriculum build: ${err.message}`)
      process.exit(1)
    },
  )
}
