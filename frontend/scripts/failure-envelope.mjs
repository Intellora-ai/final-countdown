/**
 * THE FAILURE ENVELOPE: what a red test leaves behind, made portable.
 *
 * WHY THIS EXISTS. Measured across one pull request: four separate causes
 * (a return card that never painted, a socket guard inside a test, a vendor
 * quota, a stranded mutant) each cost a full CI round -- eleven minutes --
 * purely to LEARN what had failed, because the only place the reason lived
 * was a job log that GitHub shows to admins alone. Every one of those reasons
 * was sitting in the test process's own memory at the moment it failed.
 *
 * So every failure is now described once, structurally, by the process that
 * saw it, in a form that survives without the log:
 *
 *   {
 *     fingerprint:    "FP-9a72c1"            -- stable id for THIS failure
 *     classification: { kind, confidence, evidence }
 *     reproduction:   { command, runner }    -- the exact next step
 *   }
 *
 * and both channels carry it: a `::error` annotation on the run (readable by
 * anyone who can see the run) and `test-results/failures.json` on disk (for a
 * local or cloud rerun to read back). Nothing here decides pass or fail. It
 * says what failed, of what kind, and how to see it again in seconds.
 *
 * THE FOUR KINDS, AND WHY THEY ARE THE ONLY ONES THAT MATTER.
 *
 *   CODE         the product or a test is wrong           -> fix flow
 *   ENVIRONMENT  this machine cannot run this test        -> run it elsewhere
 *   EXTERNAL     a provider refused (quota, outage)       -> retry / wait, never edit
 *   FLAKE        a known probabilistic failure            -> reproduce before believing
 *
 * Two of the four rounds above were spent applying CODE fixes to ENVIRONMENT
 * and EXTERNAL failures. The classifier is deliberately narrow and pattern
 * based, and every pattern is one that actually appeared on a red run.
 *
 * A PURE MODULE. No filesystem, no process, no clock; `known` is passed in.
 * That is what makes every rule below assertable in `failure-envelope.test.mjs`.
 */
import { createHash } from 'node:crypto'

/** The four kinds, as the router reads them. */
export const KINDS = Object.freeze(['CODE', 'ENVIRONMENT', 'EXTERNAL', 'FLAKE'])

/* Each pattern is a sentence a real red run printed. Order matters: an EPERM
 * on listen() is an environment fact even when the test then times out. */
const ENVIRONMENT = [
  /\bEPERM\b/, /\bEACCES\b/, /operation not permitted/i, /\bEADDRINUSE\b/,
  /No module named/, /ERR_MODULE_NOT_FOUND/, /Cannot find module/, /not importable/i,
  /command not found/, /a test tried to open a network connection/,
  /forbids binding a loopback socket/, /Process from config\.webServer was not able to start/,
]
const EXTERNAL = [
  /\b429\b/, /RESOURCE_EXHAUSTED/, /\bquota\b/i, /rate limit/i, /Retry-After/i,
  /\bECONNRESET\b/, /\bETIMEDOUT\b/, /\bENOTFOUND\b/, /\bEAI_AGAIN\b/,
  /API_KEY_INVALID/, /the model could not be reached/, /\b50[234]\b.*(gateway|unavailable)/i,
]

function firstMatch(patterns, text) {
  for (const p of patterns) {
    const m = p.exec(text)
    if (m) return m[0]
  }
  return null
}

/**
 * The first line of a failure, which is the assertion or the error; the rest
 * is a stack that varies by machine and would poison the fingerprint.
 */
export function headline(message) {
  const first = String(message ?? '').split('\n').find((l) => l.trim() !== '')
  return first === undefined ? '' : first.trim()
}

/** `Error: x`, `AssertionError: y`, `TypeError: z` -> the class; else the head. */
export function errorClass(message) {
  const head = headline(message)
  const m = /^([A-Za-z_][\w.]*(?:Error|Exception|Refused|Timeout|Unavailable))\b/.exec(head)
  return m ? m[1] : head.slice(0, 40)
}

/**
 * The first frame that is not test-runner machinery, as `file:line`, with the
 * machine-specific prefix removed so two runners agree on the same failure.
 */
export function topFrame(message) {
  const lines = String(message ?? '').split('\n')
  for (const line of lines) {
    const m = /(?:at .*?\(?|^\s*)((?:\/|[A-Za-z]:\\)[^\s():]+):(\d+)(?::\d+)?\)?\s*$/.exec(line)
      ?? /((?:src|server|scripts|tests|e2e|learning-os)\/[^\s():]+):(\d+)/.exec(line)
    if (!m) continue
    const file = m[1].replace(/\\/g, '/')
    if (/node_modules|node:internal|\/vitest\/|@vitest|site-packages/.test(file)) continue
    return `${repoRelative(file)}:${m[2]}`
  }
  return ''
}

/**
 * Repository-relative, whatever machine printed it. The runner's absolute
 * prefix goes; a path already relative to the frontend package gets the
 * package back; a Python path keeps the outermost marker it carries.
 */
export function repoRelative(file) {
  const s = String(file ?? '').replace(/\\/g, '/')
  const i = s.indexOf('/frontend/')
  if (i >= 0) return s.slice(i + 1)
  if (/^(src|server|scripts|e2e|tests\/integration)\//.test(s)) return `frontend/${s}`
  for (const marker of ['/learning-os/', '/features/', '/tests/', '/scripts/']) {
    const at = s.indexOf(marker)
    if (at >= 0) return s.slice(at + 1)
  }
  return s.replace(/^\/+/, '')
}

/**
 * A stable id for one failure: the test, the error class and the top frame.
 * Not the message text -- a timestamp, a port or a temp path in it would make
 * the same failure look new on every run, which is the opposite of the point.
 */
export function fingerprint({ test, message }) {
  const material = `${test}|${errorClass(message)}|${topFrame(message)}`
  return `FP-${createHash('sha1').update(material).digest('hex').slice(0, 6)}`
}

/**
 * Which of the four kinds, with the evidence that decided it.
 *
 * `known` maps fingerprints to a recorded reason (`known-failures.json`); a
 * hit there is FLAKE only when no environment or external pattern claims the
 * failure first, because a known flake that starts failing for a new reason
 * is a new failure.
 */
export function classify({ message, fingerprint: fp, known = {} }) {
  const text = String(message ?? '')
  let hit = firstMatch(ENVIRONMENT, text)
  if (hit) return { kind: 'ENVIRONMENT', confidence: 0.95, evidence: hit }
  hit = firstMatch(EXTERNAL, text)
  if (hit) return { kind: 'EXTERNAL', confidence: 0.9, evidence: hit }
  if (fp && known[fp]) return { kind: 'FLAKE', confidence: 0.8, evidence: String(known[fp].reason ?? 'recorded flake') }
  return { kind: 'CODE', confidence: 0.6, evidence: headline(text).slice(0, 120) }
}

/** Suites that need a socket, a browser or a second process: not for the sandbox. */
const NEEDS_A_REAL_MACHINE = /(server\/(memory\/m\d|boot|index|live|m7|m8|m9)|tests\/integration\/|^e2e\/|playwright)/

/**
 * The exact next step, per runner. `sandbox` is the developer shell this
 * repository is usually driven from; `cloud-network` is any machine that may
 * listen on a port -- a CI runner or a remote agent.
 */
export function reproduction({ runner, file, test, kind }) {
  const rel = String(file ?? '').replace(/^frontend\//, '')
  const needsMachine = NEEDS_A_REAL_MACHINE.test(rel) || kind === 'ENVIRONMENT'
  const where = needsMachine ? 'cloud-network' : 'sandbox'
  const quoted = (s) => `"${String(s).replace(/"/g, '\\"')}"`
  const command =
    runner === 'vitest' ? `cd frontend && npx vitest run ${rel} -t ${quoted(test)}`
    : runner === 'playwright' ? `cd frontend && npx playwright test --config=playwright.reallife.config.ts ${rel} -g ${quoted(test)}`
    : runner === 'pytest' ? `pytest ${quoted(test)}`
    : `# rerun ${rel}: ${test}`
  return { command, runner: where }
}

/**
 * Everything the next reader needs, in one object.
 *
 * @param {object} p
 * @param {string} p.runner   vitest | playwright | pytest | behave
 * @param {string} p.test     the test's full name (suite > case)
 * @param {string} p.file     repository-relative source file when known
 * @param {string} p.message  the failure message, stack included
 * @param {object} [p.known]  fingerprint -> { reason } from known-failures.json
 * @param {string} [p.commit] the revision under test
 */
export function envelope({ runner, test, file, message, known = {}, commit = '' }) {
  const fp = fingerprint({ test, message })
  const classification = classify({ message, fingerprint: fp, known })
  return {
    schema: 1,
    commit,
    runner,
    test,
    file: file ?? '',
    fingerprint: fp,
    classification,
    error: { class: errorClass(message), headline: headline(message).slice(0, 300), frame: topFrame(message) },
    reproduction: reproduction({ runner, file, test, kind: classification.kind }),
  }
}

/** The title an annotation carries: the human name, then the two facts a router needs. */
export function titleFor(prefixText, env) {
  return `${prefixText} [${env.fingerprint} ${env.classification.kind}]`
}

/** One compact line to append to an annotation message: the whole envelope, JSON. */
export function trailer(env) {
  return `envelope: ${JSON.stringify({
    fingerprint: env.fingerprint,
    kind: env.classification.kind,
    confidence: env.classification.confidence,
    evidence: env.classification.evidence,
    reproduce: env.reproduction.command,
    runner: env.reproduction.runner,
  })}`
}
