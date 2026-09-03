import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { COMMANDS, run } from './cli.ts'

/**
 * THE ONE WAY IN, and its one promise at this phase: it never pretends.
 *
 * Most of what this CLI will eventually do is not built yet. The failure to
 * avoid is the one the plan names in its own rules -- a command that answers
 * plausibly instead of saying it does not exist. An empty answer from a
 * feature that was never written is indistinguishable from an empty answer
 * from a feature that found nothing, and the second is a lie.
 */

let scratch = ''
afterEach(() => { if (scratch !== '') { rmSync(scratch, { recursive: true, force: true }); scratch = '' } })

function aStore(files: Record<string, unknown> = {}): string {
  scratch = mkdtempSync(join(tmpdir(), 'cto-cli-'))
  for (const [name, contents] of Object.entries(files)) {
    const path = join(scratch, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2))
  }
  return scratch
}

const aNode = {
  id: 'read-failure-is-not-empty',
  type: 'INVARIANT',
  system: 'memory',
  state: 'KNOWN',
  level: 'L3',
  statement: 'A read that failed is never the same value as a canvas that is empty.',
  evidence: [{ kind: 'experiment', experiment: 'canvas-durability-laws', measurement: 'LAW D red before the fix', at: '2026-09-03T00:00:00.000Z' }],
  status: 'active',
  links: [],
}

function said(dir: string, argv: string[]): { code: number; out: string } {
  const lines: string[] = []
  const code = run(argv, { dir, say: (l) => lines.push(l) })
  return { code, out: lines.join('\n') }
}

describe('status', () => {
  it('counts what is there and succeeds', () => {
    const { code, out } = said(aStore({ 'a.json': aNode }), ['status'])
    expect(code).toBe(0)
    expect(out).toMatch(/memory/)
    expect(out).toMatch(/\b1\b/)
  })

  it('says an empty store is EMPTY rather than reporting health', () => {
    const { code, out } = said(aStore({}), ['status'])
    expect(out, 'an empty store did not say so in words').toMatch(/empty|nothing/i)
    expect(code, 'nothing to check is not a pass').not.toBe(0)
  })

  it('says a missing store is MISSING, which is a different fault from empty', () => {
    const { out } = said(join(tmpdir(), 'cto-never-created-at-all'), ['status'])
    expect(out).toMatch(/missing|does not exist/i)
  })

  it('fails, and names every file it could not read', () => {
    const { code, out } = said(aStore({ 'a.json': aNode, 'bad.json': '{ not json' }), ['status'])
    expect(code, 'a store with an unreadable file exited 0').not.toBe(0)
    expect(out).toMatch(/bad\.json/)
  })
})

describe('commands that are not built yet', () => {
  it('every one of them says so loudly, names its phase, and fails', () => {
    /* Driven from the command table itself, so a command added tomorrow is
       held to this the day it appears. */
    const dir = aStore({ 'a.json': aNode })
    const unbuilt = COMMANDS.filter((c) => c.built === false)
    expect(unbuilt.length, 'no unbuilt commands are declared, so this test checks nothing').toBeGreaterThan(0)
    for (const command of unbuilt) {
      const { code, out } = said(dir, [command.name, 'anything'])
      expect(code, `${command.name} succeeded without being built`).not.toBe(0)
      expect(out, `${command.name} did not say it is not built`).toMatch(/not built|not yet/i)
      expect(out, `${command.name} did not name the phase that builds it`).toMatch(/phase \d/i)
      expect(out, `${command.name} produced something that could be read as an answer`).not.toMatch(/^\s*\[|^\s*\{/m)
    }
  })
})

describe('the shape of the tool itself', () => {
  it('every declared command is reachable, and an invented one is refused', () => {
    const dir = aStore({ 'a.json': aNode })
    for (const command of COMMANDS) {
      const { out } = said(dir, [command.name, 'x'])
      expect(out, `${command.name} printed nothing at all`).not.toBe('')
      expect(out, `${command.name} fell through to the usage text, so it is not wired`).not.toMatch(/unknown command/i)
    }
    const { code, out } = said(dir, ['summarise-everything'])
    expect(code).not.toBe(0)
    expect(out).toMatch(/unknown command/i)
  })

  it('with no arguments it explains itself instead of guessing', () => {
    const { code, out } = said(aStore({ 'a.json': aNode }), [])
    expect(code).not.toBe(0)
    for (const command of COMMANDS) expect(out, `usage never mentions ${command.name}`).toMatch(command.name)
  })
})
