#!/usr/bin/env node
/**
 * THE GATE OVER WHAT THE PRODUCT CLAIMS A TOPIC CONTAINS.
 *
 * The schema in `src/knowledge/schema.ts` checks that a model is well formed.
 * This checks the things a schema cannot: that the model is about a topic that
 * really exists, that it does not repeat itself, that it does not reach above
 * the class it belongs to, and that every quotation it cites can actually be
 * found on the page it names.
 *
 * THE LAST ONE IS THE POINT. Provenance nobody checks is decoration. A concept
 * carrying `page 6 of maths-x` and a sentence that is not on page 6 of maths-x
 * looks exactly as trustworthy as one that is, and the whole reason this layer
 * exists is that a model's unchecked word is not good enough.
 *
 * Run: node scripts/knowledge/verify.mjs
 * Exits 1 and names every fault. Silence is not an outcome here.
 */

import { execFile } from 'node:child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..', '..')
const REPO = join(FRONTEND, '..')
/**
 * Where the knowledge files are.
 *
 * `--dir` exists ONLY so this gate's own test can point it at a copy. That test
 * has to plant faults -- an invented quotation, a topic id nobody has -- and
 * planting them in the committed file means the repository briefly contains
 * them, where anything running beside it will read them. A gate whose test
 * damages the thing it guards is a poor gate.
 */
const KNOWLEDGE = (() => {
  const at = process.argv.indexOf('--dir')
  return at === -1 ? join(FRONTEND, 'src', 'data', 'knowledge') : process.argv[at + 1]
})()
const PDFS = join(REPO, 'data', 'source-pdfs')

/** Every knowledge file on disk, whatever the directories are called. */
function knowledgeFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) knowledgeFiles(path, out)
    else if (entry.endsWith('.json')) out.push(path)
  }
  return out
}

/** The curriculum, read from the generated files rather than re-derived. */
async function everyTopic() {
  const byId = new Map()
  for (const cls of ['9', '10', '11', '12']) {
    const source = readFileSync(join(FRONTEND, 'src', 'data', 'curriculum', `class${cls}.ts`), 'utf8')
    /* From the ASSIGNMENT, not from the first `[` -- the first bracket in the
       file is the `Subject[]` type annotation, which is not JSON. */
    const at = source.indexOf('= [')
    const json = source.slice(at + 2, source.lastIndexOf(']') + 1)
    for (const subject of JSON.parse(json)) {
      for (const chapter of subject.chapters) {
        for (const concept of chapter.concepts) {
          byId.set(concept.id, { cls, subjectId: subject.id, chapterId: chapter.id, name: concept.name })
        }
      }
    }
  }
  return byId
}

/** The text of one page of one locked PDF. Cached: a page is read many times. */
const pageCache = new Map()
async function pageText(pdf, page) {
  const key = `${pdf}:${page}`
  if (pageCache.has(key)) return pageCache.get(key)
  const file = join(PDFS, `${pdf}.pdf`)
  if (!existsSync(file)) {
    pageCache.set(key, null)
    return null
  }
  try {
    const { stdout } = await run('pdftotext', ['-layout', '-f', String(page), '-l', String(page), file, '-'])
    /* Normalised the way a quotation has to be to survive a PDF: the extractor
       spreads a table row across columns, so runs of whitespace are one space
       and the comparison is on words rather than on layout. */
    const flat = stdout.replace(/\s+/g, ' ').toLowerCase()
    pageCache.set(key, flat)
    return flat
  } catch {
    pageCache.set(key, null)
    return null
  }
}

/** A quotation as it must look to be compared with a page. */
const asWords = (text) => text.replace(/\s+/g, ' ').toLowerCase().trim()

/**
 * How much of a quotation must actually appear on the page.
 *
 * NOT ALL OF IT, and the reason is measured rather than lenient: `pdftotext`
 * breaks a three-column table into interleaved lines, so a sentence printed in
 * the Content column arrives with words from the Competencies column pushed
 * through the middle of it. Requiring the whole string would fail every true
 * quotation. Requiring most of its words catches an invented one, which is
 * what this is for.
 */
const ENOUGH_OF_A_QUOTE = 0.8

async function main() {
  const faults = []
  const files = knowledgeFiles(KNOWLEDGE)
  const topics = await everyTopic()
  let models = 0
  let concepts = 0
  let quotesChecked = 0

  for (const file of files) {
    /* A path outside the repo (the gate's own test uses a copy) is shown whole. */
    const shown = file.startsWith(FRONTEND) ? file.slice(FRONTEND.length + 1) : file
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      faults.push(`${shown}: is not readable JSON (${error.message})`)
      continue
    }

    for (const model of parsed.models ?? []) {
      models += 1
      const topic = topics.get(model.topicId)

      /* THE FAULT THAT HIDES BEST: a model written against an id the curriculum
         does not have. It parses, it looks complete, and nothing ever asks for
         it, so it never appears on a screen and never fails. */
      if (topic === undefined) {
        faults.push(`${shown}: ${model.topicId} is not a topic in any class`)
        continue
      }
      if (topic.name !== model.topicName) {
        faults.push(`${shown}: ${model.topicId} is called "${model.topicName}" here and "${topic.name}" in the curriculum`)
      }
      if (topic.subjectId !== model.subjectId || topic.chapterId !== model.chapterId) {
        faults.push(`${shown}: ${model.topicId} is filed under ${model.subjectId}/${model.chapterId} and belongs to ${topic.subjectId}/${topic.chapterId}`)
      }

      const seen = new Set()
      for (const concept of model.concepts ?? []) {
        concepts += 1
        /* Two concepts that are the same thing spelled differently -- "Sine",
           "sin θ", "the sine ratio" -- read as three things to learn. */
        const plain = concept.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
        if (seen.has(plain)) faults.push(`${shown}: ${model.topicId} lists "${concept.name}" twice`)
        seen.add(plain)

        for (const part of [concept, ...(concept.subConcepts ?? [])]) {
          for (const evidence of part.evidence ?? []) {
            if (evidence.kind !== 'syllabus') continue
            quotesChecked += 1
            const page = await pageText(evidence.pdf, evidence.page)
            if (page === null) {
              faults.push(`${shown}: ${part.id} cites ${evidence.pdf} page ${evidence.page}, which could not be read`)
              continue
            }
            const words = asWords(evidence.quote).split(' ').filter((w) => w.length > 2)
            const found = words.filter((w) => page.includes(w)).length
            if (words.length === 0 || found / words.length < ENOUGH_OF_A_QUOTE) {
              faults.push(
                `${shown}: ${part.id} quotes "${evidence.quote.slice(0, 60)}" as being on ` +
                  `${evidence.pdf} page ${evidence.page}, and only ${found} of its ${words.length} words are there`,
              )
            }
          }
        }
      }
    }
  }

  console.log(`knowledge: ${files.length} file(s), ${models} model(s), ${concepts} concept(s), ${quotesChecked} quotation(s) checked against the locked PDFs`)

  /* A GATE POINTED AT NOTHING IS NOT A GATE THAT PASSED.
   *
   * Found 2026-09-03: run against an empty directory this printed
   * "0 file(s), 0 model(s) ... PASS" and exited 0. A wrong path, a rename, a
   * moved directory would all read as a clean bill of health -- the shape that
   * is worse than a failure, because nobody investigates a pass. Being asked to
   * check nothing is a configuration mistake and it is reported as one. */
  if (files.length === 0) {
    console.error(`\nKNOWLEDGE GATE: FAIL — no knowledge files were found in ${KNOWLEDGE}`)
    process.exit(1)
  }
  if (faults.length > 0) {
    console.error(`\nKNOWLEDGE GATE: FAIL — ${faults.length} fault(s)`)
    for (const fault of faults) console.error(`  ${fault}`)
    process.exit(1)
  }
  console.log('KNOWLEDGE GATE: PASS')
}

await main()
