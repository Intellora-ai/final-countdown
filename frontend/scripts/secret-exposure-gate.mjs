#!/usr/bin/env node
/**
 * SECRET EXPOSURE GATE
 *
 * Refuses any change that would let a credential reach the browser bundle.
 *
 * THE TWO WAYS IT HAPPENS HERE
 *
 * 1. `src/` importing `server/`. The server process holds the API key;
 *    everything under `src/` is compiled into JavaScript every student
 *    downloads. Those facts are only safe while nothing crosses that line, and
 *    it is one careless import away from being false. The resulting bundle
 *    looks entirely normal, which is what makes it worth a gate.
 *
 * 2. A `VITE_*` environment variable holding a secret. Vite INLINES every
 *    variable with that prefix into the bundle as a literal string. A variable
 *    named VITE_ANTHROPIC_API_KEY would ship the key to every browser and
 *    nothing in the toolchain would say a word.
 *
 * WHY THE OTHER DIRECTION IS ALLOWED
 *    `server/` importing `src/` is the point: the server validates lessons with
 *    the SAME schema the browser uses. Only the src -> server direction moves a
 *    credential toward the browser.
 *
 * WHY THE NAME CHECK IS A SHAPE, NOT A LIST
 *    It matches KEY, SECRET, TOKEN, PASSWORD, CREDENTIAL, PASSPHRASE and
 *    PRIVATE anywhere in the variable name, so a name nobody has thought of yet
 *    is still caught. VITE_PRACTICE_ENDPOINT is not a credential and is not
 *    flagged — a gate that cries wolf gets switched off.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Credential-ish words, matched anywhere in the variable's name. */
export const SECRETY_NAME = /VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSPHRASE|CREDENTIAL|PRIVATE)/

/* An import specifier that reaches into server/ — quoted, so the word "server"
 * inside an identifier or a comment is not a finding. */
const IMPORTS_SERVER = /from\s+['"][^'"]*(?:^|\/)server\/[^'"]*['"]|import\s*\(\s*['"][^'"]*(?:^|\/)server\/[^'"]*['"]/

/* Both ways Vite exposes an inlined variable. */
const VITE_ENV = /import\.meta\.env(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])/g

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage'])
const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    /* An absent directory is not a finding: a fresh checkout may have no
     * server/ yet. Reported as nothing to scan, not as a failure. */
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (CODE.test(entry.name)) yield full
  }
}

/**
 * @returns {Promise<Array<{kind: 'imports-server'|'inlined-secret', file: string, line: number, detail: string}>>}
 */
export async function findExposures(frontendRoot) {
  const findings = []
  const srcRoot = join(frontendRoot, 'src')

  for await (const file of walk(srcRoot)) {
    const rel = relative(frontendRoot, file).split(sep).join('/')
    /* The gate's own tests contain the patterns it hunts for. */
    if (rel.includes('.test.') || rel.includes('.spec.')) continue

    const text = await readFile(file, 'utf8')
    const lines = text.split('\n')

    for (const [index, line] of lines.entries()) {
      if (IMPORTS_SERVER.test(line)) {
        findings.push({
          kind: 'imports-server',
          file: rel,
          line: index + 1,
          detail: line.trim(),
        })
      }

      VITE_ENV.lastIndex = 0
      let match
      while ((match = VITE_ENV.exec(line)) !== null) {
        const name = match[1] ?? match[2]
        if (name && SECRETY_NAME.test(name)) {
          findings.push({ kind: 'inlined-secret', file: rel, line: index + 1, detail: name })
        }
      }
    }
  }

  return findings
}

/* ---------------------------------------------------------------- CLI ---- */

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

async function main() {
  const root = process.env['SECRET_GATE_ROOT'] ?? DEFAULT_ROOT
  const findings = await findExposures(root)

  if (findings.length === 0) {
    console.log('SECRET EXPOSURE GATE: PASS — nothing under src/ can reach a credential.')
    return 0
  }

  console.log('SECRET EXPOSURE')
  for (const finding of findings) {
    if (finding.kind === 'imports-server') {
      console.log(`  ${finding.file}:${finding.line}  imports server/ — that code holds the API key`)
      console.log(`      ${finding.detail}`)
    } else {
      console.log(`  ${finding.file}:${finding.line}  ${finding.detail} is inlined into the browser bundle by Vite`)
    }
  }
  console.log('')
  console.log('Everything under src/ ships to every student. Move the code that needs')
  console.log('the credential into server/, and call it over HTTP instead.')
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.log(`secret-exposure-gate: ${err.message}`)
      process.exit(1)
    },
  )
}
