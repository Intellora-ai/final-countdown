#!/usr/bin/env node
/**
 * TURNING A BATCH OF REAL MODEL ANSWERS INTO CANDIDATE KNOWLEDGE MODELS.
 *
 * The generator (`build.mjs`) calls the model itself, which is the ordinary
 * path. This exists because on THIS machine the model is reachable from the
 * browser and not from the shell the scripts run in, so the answers are
 * collected there and brought here. Every judgement below is `build.mjs`'s own
 * `decompose` -- nothing about what is kept or thrown away is decided twice.
 *
 * Run: node scripts/knowledge/ingest.mjs <answers.json> <batch.json> <pagesDir>
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { notTeachable } from '../../src/knowledge/teachable.ts'

import { decompose } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..', '..')

const [answersPath, batchPath, pagesDir] = process.argv.slice(2)
if (answersPath === undefined || batchPath === undefined || pagesDir === undefined) {
  console.error('usage: ingest.mjs <answers.json> <batch.json> <pagesDir>')
  process.exit(1)
}

const answers = JSON.parse(readFileSync(answersPath, 'utf8'))
const batch = JSON.parse(readFileSync(batchPath, 'utf8'))

const bySubject = new Map()
const tally = { asked: 0, notATopic: 0, atomic: 0, flat: 0, hierarchical: 0, droppedConcepts: 0, skipped: 0, noAnswer: 0 }

for (const topic of batch) {
  const said = answers[topic.topicId]
  if (said === undefined || said.ok !== true) { tally.noAnswer += 1; continue }

  /* THE SAME REFUSAL `build.mjs` MAKES, and it has to be here too. The first
     run of this batch produced scope for "30 Marks" -- Practical/Project, Viva,
     Project Evaluation Parameters -- and for "whose first term is -3 and common
     difference is 4". Both are real curriculum entries and neither is a topic;
     the rules that catch them were added because this batch found them. */
  const notATopic = notTeachable(topic.topicName)
  if (notATopic !== null) { tally.notATopic += 1; continue }
  tally.asked += 1

  const out = await decompose(
    { id: topic.topicId, name: topic.topicName, source: { pdf: topic.pdf, page: topic.page } },
    { id: topic.chapterId, name: topic.chapterName },
    { id: topic.subjectId, name: topic.subjectName },
    topic.cls,
    async () => said.answer,
    async () => readFileSync(join(pagesDir, `${topic.pdf}-${topic.page}.txt`), 'utf8'),
  )

  if (out.skipped !== undefined) { tally.skipped += 1; continue }
  tally[out.shape] += 1
  tally.droppedConcepts += out.dropped

  const key = `cbse-class-${topic.cls}::${topic.subjectId}`
  if (!bySubject.has(key)) bySubject.set(key, { cls: topic.cls, subjectId: topic.subjectId, models: [] })
  bySubject.get(key).models.push({
    topicId: topic.topicId,
    topicName: topic.topicName,
    curriculum: `cbse-class-${topic.cls}`,
    subjectId: topic.subjectId,
    chapterId: topic.chapterId,
    version: 1,
    /* NEVER `verified` FROM A SCRIPT. A person reads it first. */
    status: 'candidate',
    shape: out.shape,
    concepts: out.concepts,
    /* WHICH MODEL ACTUALLY ANSWERED, not a default. Half this batch ran on
       gemma3:12b and half on qwen2.5:7b, because the machine ran out of memory
       partway through; a reviewer comparing two candidates needs to know which
       is which. */
    generatedBy: `ollama/${said.model ?? 'gemma3:12b'}`,
  })
}

for (const { cls, subjectId, models } of bySubject.values()) {
  /* OUTSIDE `cbse/`, which is what the browser bundle globs. Candidates are
     committed and gate-checked; they are not shipped. */
  const dir = join(FRONTEND, 'src', 'data', 'knowledge', 'candidates', `class-${cls}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${subjectId}.json`),
    `${JSON.stringify({ curriculum: `cbse-class-${cls}`, subjectId, models }, null, 2)}\n`,
  )
}

console.log(JSON.stringify(tally, null, 1))
console.log(`\nwritten: ${bySubject.size} subject file(s) under src/data/knowledge/candidates/class-*/`)
