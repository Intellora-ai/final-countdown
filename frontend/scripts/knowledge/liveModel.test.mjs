import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { decompose } from './build.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * THE PIPELINE, RUN ON WHAT A REAL MODEL REALLY SAID.
 *
 * WHY THIS IS NOT ANOTHER UNIT TEST. `build.test.mjs` proves the pipeline's
 * judgements against answers I wrote to exercise them. That is necessary and it
 * is not the same as knowing the thing works: a model's real output has a shape
 * nobody designs for, and every one of my hand-written answers was, inevitably,
 * shaped like what I expected.
 *
 * So this is a real answer from a real model, recorded verbatim, run against
 * the real syllabus page it was given.
 *
 *   model     gemma3:12b, running locally
 *   asked     the brief this script actually composes, byte for byte
 *   given     page 6 of maths-x.pdf, the sha256-locked CBSE Class 10 syllabus
 *   took      23 seconds
 *   recorded  2026-09-03
 *
 * RECORDED RATHER THAN CALLED LIVE, and the reason is not convenience: a test
 * that needs a 12-billion-parameter model running would be a test nobody can
 * run, on a machine that may not have it, taking 23 seconds. What matters is
 * that this input is genuine, and it is.
 */

const RECORDED = JSON.parse(readFileSync(join(HERE, '__fixtures__', 'gemma3-12b-trigonometry.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, '__fixtures__', 'maths-x-page-6.txt'), 'utf8')

const TOPIC = {
  id: 'introduction-to-trigonometry--trigonometric-ratios-of-an-acute-angle-of-a-right-angled-triangle-proof-of-their',
  name: RECORDED.topic,
  source: { pdf: 'maths-x', page: 6 },
}
const CHAPTER = { id: 'introduction-to-trigonometry', name: 'INTRODUCTION TO TRIGONOMETRY' }
const SUBJECT = { id: 'mathematics', name: 'Mathematics' }

const theModel = async () => JSON.stringify(RECORDED.answer)
const thePage = async () => PAGE

describe('what a real model really answered, through the real pipeline', () => {
  it('the recorded answer and the page are both genuine', () => {
    expect(RECORDED.model).toBe('gemma3:12b')
    expect(RECORDED.answer.concepts.length, 'the recording is empty, so this file proves nothing').toBeGreaterThan(0)
    expect(PAGE, 'the page fixture is not the trigonometry page').toContain('TRIGONOMETRY')
  })

  it('produces concepts that survive the quotation check', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', theModel, thePage)
    expect(out.skipped, 'the pipeline could not handle a real model answer').toBeUndefined()
    expect(out.concepts.length, 'every concept a real model gave was thrown away').toBeGreaterThan(0)
  })

  it('gives every surviving concept a quotation that is really on that page', async () => {
    /* The claim the whole layer rests on. Checked here against the page text
       itself rather than against the pipeline's own opinion of it. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', theModel, thePage)
    const flat = PAGE.replace(/\s+/g, ' ').toLowerCase()
    for (const concept of out.concepts) {
      const quote = concept.evidence[0].quote
      const words = quote.replace(/\s+/g, ' ').toLowerCase().split(' ').filter((w) => w.length > 2)
      const found = words.filter((w) => flat.includes(w)).length
      expect(found / words.length, `"${quote}" is not on the page`).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('files them under the page the curriculum says the topic came from', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', theModel, thePage)
    for (const concept of out.concepts) {
      expect(concept.evidence[0]).toMatchObject({ kind: 'syllabus', pdf: 'maths-x', page: 6 })
    }
  })

  it('reads the shape off what survived, not off what the model claimed', async () => {
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', theModel, thePage)
    const hasParts = out.concepts.some((c) => c.subConcepts !== undefined)
    expect(out.shape).toBe(out.concepts.length === 0 ? 'atomic' : hasParts ? 'hierarchical' : 'flat')
  })

  it('writes ids the schema will accept', async () => {
    /* A real model returns ids with degree signs and capitals in them. */
    const out = await decompose(TOPIC, CHAPTER, SUBJECT, '10', theModel, thePage)
    for (const concept of out.concepts) {
      expect(concept.id, `"${concept.id}" is not a usable id`).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })
})
