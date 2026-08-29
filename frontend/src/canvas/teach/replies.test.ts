/*
 * WHAT THE MODEL ACTUALLY SAID, REPLAYED FOREVER.
 *
 * The gate's other tests judge lessons a person wrote. The lessons it judges in
 * production come from a model, and every one of those was thrown away after
 * being looked at once — six five-minute runs producing six real inputs, none
 * of which survived to be checked again.
 *
 * A model reply stops being unreproducible the moment it is written to a file.
 * Capture costs one run on a machine with a model; every replay after that is
 * a few milliseconds of pure function on any runner, needing no GPU, no
 * weights, and no network. That is the whole reason this directory exists.
 *
 * The expectation is the verdict, not "it passes". A corpus that demanded every
 * reply be accepted would be red on the day it was created and would stay red,
 * so it would be deleted. Recording what the gate says TODAY turns any later
 * change in that answer into a failure with a name — a rule that stopped
 * firing, or one that started firing on text it used to allow.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractJson, dropNulls } from './authorLesson'
import { validateLesson } from '../spec/validate'
import { EXPECTED_VERDICTS } from './repliesExpected'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'replies')
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()

/** The gate's verdict on one captured reply, as rule names. */
function verdict(file: string): readonly string[] {
  const raw = readFileSync(join(DIR, file), 'utf8')
  const result = validateLesson(dropNulls(extractJson(raw)))
  return result.ok ? [] : result.issues.map((i) => i.rule ?? i.path).sort()
}

describe('captured model replies', () => {
  it('the corpus is not empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('every captured reply has a recorded verdict', () => {
    const missing = files.filter((f) => !(f in EXPECTED_VERDICTS))
    expect(missing).toEqual([])
  })

  it('no recorded verdict names a file that is gone', () => {
    const present = new Set(files)
    expect(Object.keys(EXPECTED_VERDICTS).filter((f) => !present.has(f))).toEqual([])
  })
})

describe.each(files)('%s', (file) => {
  it('gets the verdict that was recorded for it', () => {
    expect(verdict(file)).toEqual([...(EXPECTED_VERDICTS[file] ?? ['<unrecorded>'])].sort())
  })
})
