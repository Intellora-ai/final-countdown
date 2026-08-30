/* NO SECRET MAY SIT IN AN EXAMPLE ENV FILE.
 *
 * DESIRED OUTCOME
 *   The files a new developer copies to start work can only teach them to put
 *   PUBLIC values in `VITE_` variables. Copying an example file must never be
 *   the step that publishes a credential.
 *
 * WHY THIS IS A TEST AND NOT A PARAGRAPH
 *   `frontend/.env.example` and `frontend/.env.production.example` both open
 *   with a loud header saying `VITE_` means public. A header is a request.
 *   Six months from now someone in a hurry pastes a working key under it to
 *   "just get the tutor running", the header is still true and still ignored,
 *   and the key ships to every browser in the next build. Documentation rots
 *   silently; a test that reads the real bytes off disk does not.
 *
 * WHAT MUST BE TRUE
 *   1. The example files exist and this test can find them. A policy that
 *      scans nothing passes for the wrong reason, so an empty scan is a
 *      FAILURE here, not a pass.
 *   2. No secret-shaped `VITE_` name carries a value in any of them.
 *   3. Nor does one carry a value while commented out. Uncommenting is one
 *      keystroke, and a commented-out key is still a key in a public file.
 *   4. A public value is NOT flagged. A gate that cries wolf gets deleted,
 *      and then it enforces nothing at all. `VITE_API_BASE` is the flagship
 *      case: a backend address is the address of a server, not a way in.
 *   5. The files are not clean by being empty. Both must actually configure
 *      the public backend base, which is the thing they exist to configure.
 *
 * WHAT THIS DELIBERATELY DOES NOT SCAN
 *   Real `.env` / `.env.local` files. Those are gitignored, they never leave
 *   the machine that wrote them, and today `VITE_TUTOR_KEY` in one of them is
 *   how the tutor is actually run. Failing a developer's whole suite for their
 *   own local file would teach them to delete this test, and a deleted gate
 *   enforces nothing. Only files whose name says `example` are policed,
 *   because only those are templates other people copy.
 *
 * WHAT ALREADY EXISTS, AND WHY THIS IS NOT A DUPLICATE
 *   `scripts/secret-exposure-gate.mjs` scans SOURCE for `import.meta.env`
 *   reads of secret-shaped names. This scans CONFIGURATION for secret-shaped
 *   names holding values. Different surface, same law.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A `VITE_` name that reads as a credential.
 *
 * A SHAPE, NOT A LIST. It matches KEY, SECRET, TOKEN and PASSWORD anywhere
 * after the prefix, so `VITE_BILLING_WEBHOOK_SECRET` is caught on the day
 * somebody invents it, without this file being edited first. A list only ever
 * catches the names its author already thought of, and it fails silently.
 */
export const SECRET_SHAPED_NAME = /VITE_[A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)/

/** The example files this policy governs, by exact name. */
const GOVERNED = ['.env.example', '.env.production.example'] as const

/** One `NAME=value` line found in an example file. */
interface Assignment {
  readonly line: number
  readonly name: string
  readonly value: string
  /** True when the assignment sits behind a `#`. Still a finding — see rule 3. */
  readonly commented: boolean
}

/* `export FOO=bar`, `FOO=bar`, and the commented forms of both. The leading
 * `#` is captured rather than skipped, because a commented-out credential is
 * the case this file most wants to refuse. */
const ASSIGNMENT = /^(\s*#+\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

/**
 * The value a dotenv loader would see.
 *
 * Quotes are stripped, so `KEY=""` is correctly empty rather than two
 * characters long. An unquoted trailing `# comment` is stripped too, because
 * that is what the loader does — judging the file by different rules than the
 * thing that reads it would produce findings nobody can reproduce.
 */
function valueOf(raw: string): string {
  const trimmed = raw.trim()
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed)
  if (quoted !== null) return quoted[2] ?? ''
  return trimmed.replace(/\s+#.*$/, '').trim()
}

/** Every assignment in one file's text, commented ones included. */
export function assignmentsIn(text: string): readonly Assignment[] {
  const found: Assignment[] = []
  for (const [index, raw] of text.split('\n').entries()) {
    const match = ASSIGNMENT.exec(raw)
    if (match === null) continue
    const name = match[2]
    if (name === undefined) continue
    found.push({
      line: index + 1,
      name,
      value: valueOf(match[3] ?? ''),
      commented: match[1] !== undefined,
    })
  }
  return found
}

/**
 * The frontend package root, checked rather than assumed.
 *
 * If this test is ever moved, the path below silently points somewhere with no
 * example files in it and every scan comes back clean — a check that passes
 * because it looked in the wrong place is worse than no check. So the anchor
 * proves itself against `package.json` and throws if it is wrong.
 */
function frontendRoot(): string {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  if (!existsSync(join(root, 'package.json'))) {
    throw new Error(
      `envPolicy.test.ts expected the frontend package root at ${root}, but found no package.json there. ` +
        'The test file has moved; fix the relative path rather than the assertions.',
    )
  }
  return root
}

/** Example env files present on disk, by name. Real `.env` files are skipped. */
export function exampleEnvFiles(): readonly string[] {
  return readdirSync(frontendRoot())
    .filter((name) => name.startsWith('.env') && name.includes('example'))
    .sort()
}

function readExample(name: string): string {
  return readFileSync(join(frontendRoot(), name), 'utf8')
}

/** `file:line NAME` for every offending assignment, ready to read in a diff. */
function offences(predicate: (a: Assignment) => boolean): readonly string[] {
  return exampleEnvFiles().flatMap((file) =>
    assignmentsIn(readExample(file))
      .filter((a) => SECRET_SHAPED_NAME.test(a.name) && predicate(a))
      .map((a) => `${file}:${a.line} ${a.name}`),
  )
}

describe('example env files', () => {
  it('exist and are found, so a clean scan means clean and not empty', () => {
    const files = exampleEnvFiles()
    expect(files).toContain('.env.example')
    expect(files).toContain('.env.production.example')
  })

  it('never give a secret-shaped VITE_ variable a value', () => {
    /* THE ONE THAT MATTERS. Every `VITE_` value is inlined into the bundle a
     * browser downloads, so a key here is a published key. */
    const found = offences((a) => !a.commented && a.value !== '')
    expect(
      found,
      `secret in a PUBLIC variable — every VITE_ value ships to the browser: ${found.join(', ')}`,
    ).toEqual([])
  })

  it('never give one a value behind a comment either', () => {
    /* A commented credential is one keystroke from being a live one, and it is
     * sitting in a file whose whole purpose is to be copied. */
    const found = offences((a) => a.commented && a.value !== '')
    expect(
      found,
      `commented-out secret in an example file — uncommenting publishes it: ${found.join(', ')}`,
    ).toEqual([])
  })

  it('configure the public backend base, so they are not clean by being empty', () => {
    const missing = GOVERNED.filter(
      (file) =>
        !assignmentsIn(readExample(file)).some(
          (a) => !a.commented && a.name === 'VITE_API_BASE',
        ),
    )
    expect(
      missing,
      `example files with no VITE_API_BASE assignment: ${missing.join(', ')}`,
    ).toEqual([])
  })
})

describe('the secret-shaped name rule', () => {
  it('leaves public values alone, so the gate is worth keeping installed', () => {
    /* Load bearing. A rule that flagged these would be switched off within a
     * week, and then it would enforce nothing at all. */
    const public_ = [
      'VITE_API_BASE=https://api.example.org',
      'VITE_TUTOR_ENDPOINT=https://api.example.org/v1/messages',
      'VITE_PRACTICE_PROVIDER=ollama',
      'VITE_SEARCH_DEPTH=3',
    ].join('\n')
    const flagged = assignmentsIn(public_)
      .filter((a) => SECRET_SHAPED_NAME.test(a.name))
      .map((a) => a.name)
    expect(flagged).toEqual([])
  })

  it('catches a credential name nobody has invented yet', () => {
    /* Proof this is a shape and not a list: no such variable exists anywhere
     * in this repository. */
    const flagged = assignmentsIn('VITE_BILLING_WEBHOOK_SECRET=whsec-fake')
      .filter((a) => SECRET_SHAPED_NAME.test(a.name))
      .map((a) => `${a.name}=${a.value}`)
    expect(flagged).toEqual(['VITE_BILLING_WEBHOOK_SECRET=whsec-fake'])
  })
})
