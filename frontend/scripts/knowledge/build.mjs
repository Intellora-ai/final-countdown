#!/usr/bin/env node
/**
 * MAKING THE KNOWLEDGE MODELS: what is inside each topic.
 *
 * THE ONE RULE THIS SCRIPT IS BUILT AROUND: a model may PROPOSE what a topic
 * contains; only a checked, quoted, committed file may be shown to a student.
 * So everything this writes is `status: "candidate"` and the loader refuses to
 * hand a candidate to anybody. Promotion to `verified` is a person reading it.
 *
 * WHY IT IS A SCRIPT AND NOT A SERVER ROUTE. Curriculum knowledge is canonical
 * content: it changes deliberately, it belongs in a diff somebody can argue
 * with, and a student's session must never be able to rewrite what a topic
 * contains for everybody. The running product only ever READS these files.
 *
 * WHAT IT DOES, PER TOPIC, IN THIS ORDER:
 *
 *   1. Refuse anything that is not a topic at all. About nine entries in every
 *      hundred are apparatus lists, instructions or a book's authors; asked
 *      what is inside "Collect the following items: a spring, a stand", any
 *      answer is invented. `teachable.ts` decides this, deterministically.
 *
 *   2. Read the syllabus page the topic came from. Every one of the 3,995
 *      records the PDF and page it was read from, and those PDFs are locked by
 *      sha256 in `data/curriculum-sources.lock.json`.
 *
 *   3. Ask the model to decompose it USING THAT PAGE, and to quote the page for
 *      every concept it names. Grounded, not remembered: a model asked from
 *      memory produces plausible curriculum, which is the failure this whole
 *      layer exists to prevent.
 *
 *   4. Throw away any concept whose quotation is not on the page. This is done
 *      here as well as in `verify.mjs` so a bad batch costs nothing to discard.
 *
 * Run:  node scripts/knowledge/build.mjs --chapter <chapterId> [--class 10] [--subject mathematics]
 *       node scripts/knowledge/build.mjs --chapter introduction-to-trigonometry --dry-run
 *
 * `--dry-run` prints what would be written and writes nothing.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..', '..')
const REPO = join(FRONTEND, '..')
const PDFS = join(REPO, 'data', 'source-pdfs')

/** Where the model lives. Ollama, because it needs no key and no quota. */
const OLLAMA = process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434'
const MODEL = process.env['KNOWLEDGE_MODEL'] ?? 'gemma3:12b'

/* -------------------------------------------------------------------------- */

function said(...parts) {
  console.log(...parts)
}

function argOf(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

/** The generated curriculum, read from the file the product actually ships. */
function curriculumFor(cls) {
  const source = readFileSync(join(FRONTEND, 'src', 'data', 'curriculum', `class${cls}.ts`), 'utf8')
  const at = source.indexOf('= [')
  return JSON.parse(source.slice(at + 2, source.lastIndexOf(']') + 1))
}

async function pageText(pdf, page) {
  const file = join(PDFS, `${pdf}.pdf`)
  if (!existsSync(file)) return null
  try {
    const { stdout } = await run('pdftotext', ['-layout', '-f', String(page), '-l', String(page), file, '-'], {
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout
  } catch {
    return null
  }
}

/**
 * The brief.
 *
 * IT ASKS FOR NOTHING IT CANNOT CHECK. Every concept must carry a quotation
 * from the page, and a quotation is checkable; "importance" or "difficulty"
 * would not be. And it is told in as many words that an empty answer is a real
 * answer, because a template expecting three bullets is how three bullets get
 * invented for a topic that has one idea.
 */
function brief(topic, chapterName, subjectName, cls, page) {
  return `You are reading the official CBSE syllabus for Class ${cls} ${subjectName}.

Here is the page it is printed on, exactly as it appears:

--- BEGIN PAGE ---
${page.slice(0, 6000)}
--- END PAGE ---

The chapter is "${chapterName}".
The topic is "${topic.name}".

List what a student must understand INSIDE that one topic. Not the chapter. Not
the subject. That topic.

RULES, and the answer is thrown away if it breaks any of them:
- Every concept you name must be supported by a QUOTE copied word for word from
  the page above. If you cannot quote the page for it, do not name it.
- If the topic is a single idea with nothing inside it, answer with an empty
  list. That is a correct answer and is often the right one. Never invent parts
  to fill a list.
- Name at most 8 concepts. Give sub-concepts only where the page itself
  distinguishes them.
- Do not repeat one concept under two names.
- Do not include anything above Class ${cls} level.

Answer with JSON only, in exactly this shape:
{"shape":"atomic"|"flat"|"hierarchical","concepts":[{"id":"lowercase-kebab-case","name":"...","quote":"...","subConcepts":[{"id":"...","name":"...","quote":"..."}]}]}`
}

/**
 * ASKING THE MODEL. Injected everywhere below rather than called directly, so
 * the pipeline's own logic -- what it keeps, what it throws away, what shape it
 * concludes -- is provable without a model running. Every one of those
 * decisions is a place this can go quietly wrong, and none of them should need
 * a GPU to test.
 */
async function askOllama(prompt) {
  const response = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json', options: { temperature: 0 } }),
  })
  if (!response.ok) throw new Error(`the model answered ${response.status}`)
  const body = await response.json()
  return String(body.response ?? '')
}

/** As much of a quote as must really be on the page; see `verify.mjs`. */
const ENOUGH_OF_A_QUOTE = 0.8

function quoteIsOnThePage(quote, page) {
  const flat = page.replace(/\s+/g, ' ').toLowerCase()
  const words = quote.replace(/\s+/g, ' ').toLowerCase().split(' ').filter((w) => w.length > 2)
  if (words.length === 0) return false
  return words.filter((w) => flat.includes(w)).length / words.length >= ENOUGH_OF_A_QUOTE
}

const anId = (raw) =>
  String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export async function decompose(topic, chapter, subject, cls, ask = askOllama, readPage = pageText) {
  const source = topic.source
  if (source?.pdf === undefined || source.page === null || source.page === undefined) {
    return { skipped: 'the curriculum does not record which page this came from' }
  }
  const page = await readPage(source.pdf, source.page)
  if (page === null) return { skipped: `${source.pdf}.pdf page ${source.page} could not be read` }

  let answered
  try {
    answered = JSON.parse(await ask(brief(topic, chapter.name, subject.name, cls, page)))
  } catch (error) {
    return { skipped: `the model did not answer usably (${error.message})` }
  }

  const evidence = { kind: 'syllabus', pdf: source.pdf, page: source.page }
  const kept = []
  let dropped = 0
  for (const concept of answered.concepts ?? []) {
    /* THE QUOTE IS CHECKED HERE, not only in the gate. A batch of invented
       concepts should cost nothing to throw away, and a candidate file full of
       them is a person's afternoon. */
    if (typeof concept.quote !== 'string' || !quoteIsOnThePage(concept.quote, page)) {
      dropped += 1
      continue
    }
    const subConcepts = (concept.subConcepts ?? [])
      .filter((part) => typeof part.quote === 'string' && quoteIsOnThePage(part.quote, page))
      .map((part) => ({ id: anId(part.id ?? part.name), name: String(part.name), evidence: [{ ...evidence, quote: part.quote }] }))
    kept.push({
      id: anId(concept.id ?? concept.name),
      name: String(concept.name),
      evidence: [{ ...evidence, quote: concept.quote }],
      ...(subConcepts.length > 0 ? { subConcepts } : {}),
    })
  }

  /* SHAPE IS READ OFF WHAT SURVIVED, never taken from the model's word for it.
     A model that says "hierarchical" and produces no sub-concepts would write a
     file the schema refuses; a model that says "flat" for a topic whose parts
     were all dropped would claim parts that are not there. */
  const shape = kept.length === 0 ? 'atomic' : kept.some((c) => c.subConcepts) ? 'hierarchical' : 'flat'
  return { concepts: kept, shape, dropped }
}

async function main() {
  const cls = argOf('class', '10')
  const wantedChapter = argOf('chapter')
  const wantedSubject = argOf('subject')
  const dryRun = process.argv.includes('--dry-run')

  if (wantedChapter === null) {
    console.error('say which chapter: --chapter <chapterId> [--class 10] [--subject mathematics]')
    process.exit(1)
  }

  const { notTeachable } = await import('../../src/knowledge/teachable.ts').catch(() => ({ notTeachable: null }))
  if (notTeachable === null) {
    console.error('could not load the teachability rule; run this through a TypeScript-aware runner')
    process.exit(1)
  }

  const subjects = curriculumFor(cls)
  const models = []
  let skipped = 0
  let refused = 0

  for (const subject of subjects) {
    if (wantedSubject !== null && subject.id !== wantedSubject) continue
    for (const chapter of subject.chapters) {
      if (chapter.id !== wantedChapter) continue
      for (const topic of chapter.concepts) {
        const notATopic = notTeachable(topic.name)
        if (notATopic !== null) {
          refused += 1
          said(`  refused  ${topic.id.slice(0, 60)} — ${notATopic.reason}`)
          continue
        }
        const out = await decompose(topic, chapter, subject, cls)
        if (out.skipped !== undefined) {
          skipped += 1
          said(`  skipped  ${topic.id.slice(0, 60)} — ${out.skipped}`)
          continue
        }
        said(`  ${out.shape.padEnd(13)} ${out.concepts.length} concept(s), ${out.dropped} unquotable dropped — ${topic.name.slice(0, 50)}`)
        models.push({
          topicId: topic.id,
          topicName: topic.name,
          curriculum: `cbse-class-${cls}`,
          subjectId: subject.id,
          chapterId: chapter.id,
          version: 1,
          /* NEVER `verified` FROM A SCRIPT. A person reads it first; that is the
             whole point of the layer. */
          status: 'candidate',
          shape: out.shape,
          concepts: out.concepts,
          generatedBy: `ollama/${MODEL}`,
        })
      }
    }
  }

  said(`\n${models.length} candidate(s), ${refused} refused as not topics, ${skipped} skipped`)
  if (dryRun || models.length === 0) {
    said(dryRun ? 'dry run: nothing written' : 'nothing to write')
    return
  }

  const subjectId = models[0].subjectId
  const dir = join(FRONTEND, 'src', 'data', 'knowledge', 'cbse', `class-${cls}`)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${subjectId}.candidates.json`)
  /* WRITTEN BESIDE THE VERIFIED FILE, NEVER OVER IT. A generator that could
     overwrite checked work would put a model back in charge of what a topic
     contains, which is the one thing this layer forbids. */
  writeFileSync(file, `${JSON.stringify({ curriculum: `cbse-class-${cls}`, subjectId, models }, null, 2)}\n`)
  said(`written: ${file.slice(FRONTEND.length + 1)}`)
  said('read it, then move the models you accept into the verified file with status "verified" and a verifiedAt date.')
}

/* ONLY WHEN RUN, NEVER WHEN IMPORTED.
 *
 * `build.test.mjs` imports `decompose` to prove what this pipeline keeps and
 * what it throws away, and without this guard that import RAN the whole script
 * -- which exits 1 when no chapter is named, so the suite reported "no tests"
 * and nothing about the generator was ever proven. `mutation-gate.test.mjs`
 * records the same trap one directory up. */
const invokedDirectly = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) await main()
