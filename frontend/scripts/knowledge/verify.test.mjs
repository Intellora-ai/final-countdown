import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it } from 'vitest'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = join(HERE, '..', '..')
const GATE = join(HERE, 'verify.mjs')
const REAL = join(FRONTEND, 'src', 'data', 'knowledge', 'cbse', 'class-10', 'mathematics.json')

/**
 * THE GATE OVER WHAT THE PRODUCT CLAIMS A TOPIC CONTAINS, AND WHETHER IT BITES.
 *
 * A provenance check nobody has ever seen fail is decoration. This drives the
 * real gate as a child process and plants, one at a time, each fault it exists
 * to catch. Every fault must produce a non-zero exit and a message naming it.
 *
 * THE FAULTS ARE PLANTED IN A COPY, never in the committed file. Editing the
 * real one means the repository briefly contains an invented quotation, and
 * anything running beside this test reads it. A gate whose test damages the
 * thing it guards is a poor gate.
 *
 * None of these faults is invented either: a quotation the model composed
 * rather than read, a topic id it guessed, one concept written twice under two
 * names, and a name that drifted from the curriculum.
 */

let workspace = null

async function gate(dir) {
  try {
    const { stdout } = await run('node', [GATE, '--dir', dir], { cwd: FRONTEND })
    return { code: 0, out: stdout }
  } catch (error) {
    return { code: error.code ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

/** A copy of the real knowledge tree, with one fault planted in it. */
function copyWithFault(change) {
  workspace = mkdtempSync(join(tmpdir(), 'knowledge-gate-'))
  const parsed = JSON.parse(readFileSync(REAL, 'utf8'))
  change(parsed)
  writeFileSync(join(workspace, 'mathematics.json'), JSON.stringify(parsed, null, 2))
  return workspace
}

afterEach(() => {
  if (workspace !== null) rmSync(workspace, { recursive: true, force: true })
  workspace = null
})

describe('the knowledge gate', () => {
  it('passes on what is actually committed', async () => {
    const { code, out } = await gate(join(FRONTEND, 'src', 'data', 'knowledge'))
    expect(code, out).toBe(0)
    expect(out).toContain('KNOWLEDGE GATE: PASS')
  })

  it('reads real quotations against the real locked PDFs, not nothing', async () => {
    /* A gate that checked zero quotations would pass the case above and mean
       nothing at all. */
    const { out } = await gate(join(FRONTEND, 'src', 'data', 'knowledge'))
    const checked = /(\d+) quotation\(s\) checked/.exec(out)
    expect(Number(checked?.[1] ?? 0), 'no quotation was checked against any PDF').toBeGreaterThan(0)
  })

  it('refuses to pass when it was pointed at nothing', async () => {
    /* FOUND BY RUNNING IT, 2026-09-03: against an empty directory this printed
       "0 file(s), 0 model(s) ... PASS" and exited 0. A wrong path, a rename or
       a moved directory would every one of them have read as a clean bill of
       health, which is worse than a failure because nobody investigates a pass. */
    const empty = mkdtempSync(join(tmpdir(), 'knowledge-empty-'))
    try {
      const { code, out } = await gate(empty)
      expect(code, 'a gate pointed at nothing reported success').not.toBe(0)
      expect(out).toContain('no knowledge files were found')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('refuses a quotation that is not on the page it claims', async () => {
    const dir = copyWithFault((d) => {
      d.models[0].concepts[0].evidence[0].quote =
        'The syllabus clearly states that pineapples are a trigonometric function of considerable importance'
    })
    const { code, out } = await gate(dir)
    expect(code, 'an invented quotation was accepted as provenance').not.toBe(0)
    expect(out).toContain('words are there')
  })

  it('refuses a model written against a topic that does not exist', async () => {
    /* The fault that hides best: it parses, it looks complete, and nothing ever
       asks for that id, so it never reaches a screen and never fails. */
    const dir = copyWithFault((d) => { d.models[0].topicId = 'introduction-to-trigonometry--a-topic-that-does-not-exist' })
    const { code, out } = await gate(dir)
    expect(code, 'a model about a topic nobody has was accepted').not.toBe(0)
    expect(out).toContain('is not a topic in any class')
  })

  it('refuses one concept written twice under two names', async () => {
    const dir = copyWithFault((d) => {
      const concepts = d.models[0].concepts
      concepts.push({ id: 'sine-again', name: 'The Sine Function', evidence: concepts[1].evidence })
    })
    const { code, out } = await gate(dir)
    expect(code, 'the same concept counted twice was accepted').not.toBe(0)
    expect(out).toContain('twice')
  })

  it('refuses a model whose name has drifted from the curriculum', async () => {
    const dir = copyWithFault((d) => { d.models[0].topicName = 'Something else entirely' })
    const { code, out } = await gate(dir)
    expect(code).not.toBe(0)
    expect(out).toContain('in the curriculum')
  })
})
