import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { askEngine, interpreterFor, ENGINE_PYTHON_ENV } from './vite-plugin-engine'

/**
 * The bridge between the canvas and the Python engine.
 *
 * WHY THIS FILE SITS AT THE PACKAGE ROOT RATHER THAN UNDER `src/`
 * ---------------------------------------------------------------
 * It tests dev-server infrastructure, which lives beside `vite.config.ts` and
 * not in the application tree. `vite.config.ts` names the areas vitest sweeps
 * and the reason each one is separate; this adds a fourth for the same reason
 * the third exists — there is code here that can fail, and code that can fail
 * with no test is code nobody finds out about until a learner does.
 *
 * THE BUG THIS FILE WAS WRITTEN FOR
 * ---------------------------------
 * The first version picked `<root>/.venv/bin/python3`. That venv is the one the
 * AXLE and gate work uses and it does not contain `pydantic`, which the engine
 * needs — so every request came back as a raw Python traceback wrapped in a 502.
 * The engine has its OWN lock file (`requirements-learning-os.lock`) and
 * therefore needs its own interpreter, and the discovery order below is what
 * makes that findable rather than a thing you debug from a stack trace.
 */

const made: string[] = []

/**
 * A repository-shaped temp directory.
 *
 * `learning-os/` is created because the child is spawned with it as `cwd`, and
 * a missing cwd fails with the same ENOENT as a missing interpreter. Without it
 * every test below would exercise the missing-directory branch and assert
 * nothing about the one it names.
 */
function scratchRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'engine-plugin-'))
  mkdirSync(join(dir, 'learning-os'), { recursive: true })
  made.push(dir)
  return dir
}

function touchInterpreter(root: string, relative: string): string {
  const full = join(root, relative)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, '#!/bin/sh\n')
  return full
}

afterEach(() => {
  delete process.env[ENGINE_PYTHON_ENV]
})

/* -------------------------------------------------------------------------- */
/* Which interpreter runs the engine                                          */
/* -------------------------------------------------------------------------- */

describe('finding an interpreter that can actually run the engine', () => {
  it('prefers the engine’s own venv over the repository one', () => {
    /*
     * THE BUG. `<root>/.venv` belongs to the AXLE and gate work and has no
     * `pydantic` in it; the engine's dependencies are pinned separately in
     * `learning-os/requirements-learning-os.lock`. Picking the repository venv
     * produced `ModuleNotFoundError` on every single request, delivered as a
     * traceback in a 502 — which reads as the engine being broken rather than
     * as the wrong python being chosen.
     */
    const root = scratchRoot()
    touchInterpreter(root, '.venv/bin/python3')
    const engine = touchInterpreter(root, 'learning-os/.venv/bin/python3')

    expect(interpreterFor(root)).toBe(engine)
  })

  it('falls back to the repository venv when the engine has none', () => {
    const root = scratchRoot()
    const repo = touchInterpreter(root, '.venv/bin/python3')
    expect(interpreterFor(root)).toBe(repo)
  })

  it('falls back to python3 on the PATH when neither venv exists', () => {
    /* Falls back rather than failing, so a non-standard layout still works. */
    expect(interpreterFor(scratchRoot())).toBe('python3')
  })

  it('an explicit option beats everything', () => {
    const root = scratchRoot()
    touchInterpreter(root, 'learning-os/.venv/bin/python3')
    expect(interpreterFor(root, '/usr/bin/python3.12')).toBe('/usr/bin/python3.12')
  })

  it('the environment variable beats discovery', () => {
    /* Somebody running the engine from conda, pyenv, or a container needs a way
       in that is not editing a config file. */
    const root = scratchRoot()
    touchInterpreter(root, 'learning-os/.venv/bin/python3')
    process.env[ENGINE_PYTHON_ENV] = '/opt/python/bin/python3'
    expect(interpreterFor(root)).toBe('/opt/python/bin/python3')
  })

  it('an explicit option still beats the environment variable', () => {
    process.env[ENGINE_PYTHON_ENV] = '/opt/python/bin/python3'
    expect(interpreterFor(scratchRoot(), '/explicit/python3')).toBe('/explicit/python3')
  })
})

/* -------------------------------------------------------------------------- */
/* A broken setup explains itself                                             */
/* -------------------------------------------------------------------------- */

describe('a failure says what to do about it', () => {
  it('an interpreter that does not exist becomes a 503, not a crash', async () => {
    const reply = await askEngine('{"text":"x","resume_at":"b"}', {
      root: scratchRoot(),
      python: '/definitely/not/here/python3',
    })
    expect(reply.status).toBe(503)
    expect(JSON.parse(reply.body).outcome).toBe('unavailable')
  })

  it('the 503 names the interpreter it tried', async () => {
    /* "The engine is unavailable" with no further detail sends a reader to check
       their network when the actual cause is a path. */
    const reply = await askEngine('{"text":"x","resume_at":"b"}', {
      root: scratchRoot(),
      python: '/definitely/not/here/python3',
    })
    expect(JSON.parse(reply.body).refusal).toContain('/definitely/not/here/python3')
  })

  it('a missing python package is named, not delivered as a traceback', async () => {
    /*
     * The exact failure this bridge shipped with for one iteration. A raw
     * traceback in a 502 is technically complete and practically useless: the
     * reader has to know the repository layout to work out that the wrong venv
     * was chosen. Naming the module and the file that pins it turns a debugging
     * session into one command.
     */
    const root = scratchRoot()
    const fake = touchInterpreter(root, 'fakepy')
    writeFileSync(
      fake,
      '#!/bin/sh\ncat >/dev/null\necho "ModuleNotFoundError: No module named \'pydantic\'" >&2\nexit 1\n',
    )
    /* `writeFileSync`'s `mode` applies only when it CREATES the file, and
       `touchInterpreter` already made this one. Without the explicit chmod the
       spawn fails with EACCES and the test passes for the wrong reason: it
       would assert the not-executable path, not the missing-module path. */
    chmodSync(fake, 0o755)

    const reply = await askEngine('{"text":"x","resume_at":"b"}', { root, python: fake })
    const parsed = JSON.parse(reply.body)
    expect(parsed.refusal).toContain('pydantic')
    expect(parsed.refusal).toContain('requirements-learning-os.lock')
  })

  it('a body larger than the cap is refused before anything is spawned', async () => {
    const reply = await askEngine(JSON.stringify({ text: 'x'.repeat(20_000) }), {
      root: scratchRoot(),
      python: '/definitely/not/here/python3',
    })
    expect(reply.status).toBe(413)
  })
})

/* -------------------------------------------------------------------------- */
/* A missing engine directory is named as such                                */
/* -------------------------------------------------------------------------- */

describe('a missing engine directory is not blamed on the interpreter', () => {
  it('says the directory is absent rather than naming a python that is fine', async () => {
    /* `spawn` reports the same ENOENT for a missing interpreter and a missing
       cwd. Telling a reader to build a venv when the actual problem is that
       `learning-os/` is not there sends them to fix something that is not
       broken. */
    const bare = mkdtempSync(join(tmpdir(), 'engine-plugin-bare-'))
    made.push(bare)
    const reply = await askEngine('{"text":"x","resume_at":"b"}', {
      root: bare,
      python: '/usr/bin/env',
    })
    const parsed = JSON.parse(reply.body)
    expect(parsed.outcome).toBe('unavailable')
    expect(parsed.refusal).toContain('does not exist')
    expect(parsed.refusal).not.toContain('venv')
  })
})
