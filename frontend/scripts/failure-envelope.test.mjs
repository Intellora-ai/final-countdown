import { describe, expect, it } from 'vitest'

import {
  classify, envelope, errorClass, fingerprint, headline, reproduction, titleFor, topFrame, trailer,
} from './failure-envelope.mjs'

/*
 * Every rule here is asserted in both directions, because a classifier has two
 * ways to lie: sending a code bug to "run it elsewhere", and sending a quota
 * refusal to "fix the code". Each of the four kinds is proven by a sentence a
 * real red run actually printed on this repository.
 */

const SOCKET_GUARD =
  'AssertionError: a test tried to open a network connection. The learning-os suite must run offline\n'
  + '    at _refuse (/home/runner/work/final-countdown/final-countdown/learning-os/tests/conftest.py:34)'
const EPERM_LISTEN =
  'Error: listen EPERM: operation not permitted 127.0.0.1:5183\n'
  + '    at Server.setupListenHandle [as _listen2] (node:net:1986:21)'
const QUOTA =
  "LLMUnavailable: the model could not be reached: 429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current quota'}}"
const LOCKED =
  'Error: database is locked\n'
  + '  ❯ takeTheWriteLock /home/runner/work/final-countdown/final-countdown/frontend/server/memory/sqliteStore.ts:179:10\n'
  + '  ❯ Object.update /home/runner/work/final-countdown/final-countdown/frontend/server/memory/sqliteStore.ts:339:7'
const ASSERTION =
  'AssertionError: expected 1 to be greater than or equal to 500\n'
  + '    at /home/runner/work/final-countdown/final-countdown/frontend/server/memory/m4-consistency.test.ts:1405:9\n'
  + '    at file:///home/runner/work/final-countdown/final-countdown/frontend/node_modules/@vitest/runner/dist/chunk-hooks.js:752:20'

describe('the four kinds, decided by what the run said', () => {
  it('a socket the sandbox forbids is ENVIRONMENT, not a code bug', () => {
    expect(classify({ message: SOCKET_GUARD }).kind).toBe('ENVIRONMENT')
    expect(classify({ message: EPERM_LISTEN }).kind).toBe('ENVIRONMENT')
  })

  it('a vendor quota is EXTERNAL, never something to fix in the code', () => {
    const c = classify({ message: QUOTA })
    expect(c.kind).toBe('EXTERNAL')
    expect(c.evidence).toMatch(/429|RESOURCE_EXHAUSTED/)
  })

  it('an assertion with no environment or vendor tell is CODE', () => {
    expect(classify({ message: ASSERTION }).kind).toBe('CODE')
    expect(classify({ message: LOCKED }).kind).toBe('CODE')
  })

  it('a recorded fingerprint is FLAKE -- but a new reason under an old name is not', () => {
    const fp = fingerprint({ test: 'M4 > queue', message: ASSERTION })
    const known = { [fp]: { reason: 'timing on a shared runner' } }
    expect(classify({ message: ASSERTION, fingerprint: fp, known }).kind).toBe('FLAKE')
    /* The same known fingerprint, but the message now carries a quota tell:
       the vendor wins, because that is a different failure wearing the name. */
    expect(classify({ message: QUOTA, fingerprint: fp, known }).kind).toBe('EXTERNAL')
  })

  it('environment wins over external when both tells appear', () => {
    const both = `${EPERM_LISTEN}\n${QUOTA}`
    expect(classify({ message: both }).kind).toBe('ENVIRONMENT')
  })
})

describe('the fingerprint', () => {
  it('is stable across machines: same test, same class, same frame', () => {
    const a = fingerprint({ test: 'M4 > queue', message: ASSERTION })
    const b = fingerprint({
      test: 'M4 > queue',
      message: ASSERTION.replace('/home/runner/work/final-countdown/final-countdown/', '/Users/somebody/code/'),
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^FP-[0-9a-f]{6}$/)
  })

  it('changes when the test, the error class or the frame changes', () => {
    const base = fingerprint({ test: 'M4 > queue', message: ASSERTION })
    expect(fingerprint({ test: 'M4 > other', message: ASSERTION })).not.toBe(base)
    expect(fingerprint({ test: 'M4 > queue', message: ASSERTION.replace('AssertionError', 'TypeError') })).not.toBe(base)
    expect(fingerprint({ test: 'M4 > queue', message: ASSERTION.replace(':1405:', ':1406:') })).not.toBe(base)
  })

  it('ignores the parts of a message that differ per run', () => {
    const withPort = ASSERTION.replace('500', '500 (port 5183 at 08:22:48)')
    /* The first line changed, but class and frame did not: same failure. */
    expect(fingerprint({ test: 'M4 > queue', message: withPort }))
      .toBe(fingerprint({ test: 'M4 > queue', message: ASSERTION }))
  })
})

describe('the pieces the envelope is built from', () => {
  it('reads the headline and the error class', () => {
    expect(headline(`\n\n${ASSERTION}`)).toMatch(/^AssertionError: expected 1/)
    expect(errorClass(ASSERTION)).toBe('AssertionError')
    expect(errorClass(QUOTA)).toBe('LLMUnavailable')
    expect(errorClass('database is locked')).toBe('database is locked')
  })

  it('finds the first frame that is not runner machinery, repository-relative', () => {
    expect(topFrame(ASSERTION)).toBe('frontend/server/memory/m4-consistency.test.ts:1405')
    expect(topFrame(LOCKED)).toBe('frontend/server/memory/sqliteStore.ts:179')
    expect(topFrame(SOCKET_GUARD)).toBe('learning-os/tests/conftest.py:34')
    expect(topFrame('no frames here')).toBe('')
  })
})

describe('the reproduction is the exact next command, on the right machine', () => {
  it('sends a socket-bound suite to a machine that may listen', () => {
    const r = reproduction({ runner: 'vitest', file: 'frontend/server/memory/m4-consistency.test.ts', test: 'M4 > queue', kind: 'CODE' })
    expect(r.runner).toBe('cloud-network')
    expect(r.command).toBe('cd frontend && npx vitest run server/memory/m4-consistency.test.ts -t "M4 > queue"')
  })

  it('keeps a pure unit test in the sandbox', () => {
    const r = reproduction({ runner: 'vitest', file: 'frontend/src/canvas/teach/concept.test.ts', test: 'x', kind: 'CODE' })
    expect(r.runner).toBe('sandbox')
  })

  it('an ENVIRONMENT failure is always sent elsewhere, whatever the file', () => {
    const r = reproduction({ runner: 'pytest', file: 'learning-os/tests/test_x.py', test: 'tests/test_x.py::test_y', kind: 'ENVIRONMENT' })
    expect(r.runner).toBe('cloud-network')
    expect(r.command).toBe('pytest "tests/test_x.py::test_y"')
  })

  it('a law reproduces through the laws config, by title', () => {
    const r = reproduction({ runner: 'playwright', file: 'frontend/tests/integration/law-g.spec.ts', test: 'law G -- she returns', kind: 'CODE' })
    expect(r.command).toContain('--config=playwright.reallife.config.ts tests/integration/law-g.spec.ts -g "law G -- she returns"')
    expect(r.runner).toBe('cloud-network')
  })
})

describe('the reproduction command survives a hostile test name', () => {
  it('escapes a backslash before a quote, so the shell sees the name it was given', () => {
    const name = 'reads C:\\path and says "hi"'
    const { command } = reproduction({ runner: 'vitest', file: 'frontend/src/a.test.ts', test: name, kind: 'CODE' })
    /* What the shell would parse back must be the original name. */
    const quoted = command.slice(command.indexOf(' -t ') + 4)
    const parsedBack = JSON.parse(quoted)
    expect(parsedBack).toBe(name)
    expect(command).toContain('\\\\path')
    expect(command).toContain('\\"hi\\"')
  })
})

describe('the envelope, whole', () => {
  it('carries every field a router or a person needs, and renders to one line', () => {
    const env = envelope({ runner: 'vitest', test: 'M4 > queue', file: 'frontend/server/memory/m4-consistency.test.ts', message: ASSERTION, commit: 'abc1234' })
    expect(env.schema).toBe(1)
    expect(env.commit).toBe('abc1234')
    expect(env.fingerprint).toMatch(/^FP-/)
    expect(env.classification.kind).toBe('CODE')
    expect(env.error.frame).toBe('frontend/server/memory/m4-consistency.test.ts:1405')
    expect(env.reproduction.runner).toBe('cloud-network')

    expect(titleFor('vitest: M4 > queue', env)).toBe(`vitest: M4 > queue [${env.fingerprint} CODE]`)
    const line = trailer(env)
    expect(line.startsWith('envelope: {')).toBe(true)
    expect(line).not.toMatch(/\n/)
    expect(JSON.parse(line.slice('envelope: '.length)).reproduce).toContain('npx vitest run')
  })
})
