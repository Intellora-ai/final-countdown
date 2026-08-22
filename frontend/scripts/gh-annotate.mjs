#!/usr/bin/env node
/* TURN TOOL OUTPUT INTO GITHUB ANNOTATIONS.
 *
 * WHY THIS EXISTS. A census of 8,236 log lines across 19 CI jobs on a green
 * commit returned zero `##[error]` entries. That was accurate -- nothing had
 * failed -- but it was also uninformative, because when something DOES fail,
 * `tsc`, `eslint` and `vitest` all print to stdout and stdout alone. The
 * failure lands inside a collapsed log group with no run annotation, no file
 * and no line, and a reader has to expand the right group and scroll.
 *
 * GitHub Actions reads `::error file=F,line=L,col=C::message` from a step's
 * stdout and turns each one into an annotation pinned to that exact source
 * line, plus an `##[error]` entry in the raw log. This script converts each
 * tool's machine-readable output into those commands. Nothing here decides
 * pass or fail -- the tools already did that -- it only makes the verdict
 * addressable.
 *
 * Usage:
 *   node scripts/gh-annotate.mjs tsc     < tsc-output.txt
 *   node scripts/gh-annotate.mjs eslint  < eslint.json
 *   node scripts/gh-annotate.mjs vitest  < vitest.json
 *
 * EXIT STATUS, and why it is no longer unconditionally 0.
 *
 * This file used to end in `process.exit(0)` with three bare `catch {}` blocks
 * above it, on the reasoning that a broken annotator must never fail a build.
 * That reasoning has one hole, and the hole is the entire complaint this file
 * exists to answer: if the parser silently returns 0 for input that plainly
 * describes failures, you get a red build with NO locations and nothing
 * anywhere saying the annotator is the reason. A census of 8,236 CI log lines
 * once returned zero error lines, and no signal distinguished "nothing was
 * wrong" from "nothing was looking".
 *
 * So the rule is now precise rather than blanket:
 *
 *   step failed  + 0 annotations  ->  ::error naming THIS script, exit 1
 *   step failed  + n annotations  ->  exit 0
 *   step passed  + any count      ->  exit 0
 *
 * The first case cannot make a green build red: the step it annotates already
 * failed, so the job was going to fail anyway. All it does is name the
 * blindness instead of leaving it to be discovered by reading logs by hand.
 *
 * The step's outcome arrives through the STEP_OUTCOME environment variable,
 * set from `${{ steps.<id>.outcome }}` in the workflow. Read from env rather
 * than interpolated into the `run:` body -- the value is GitHub-controlled and
 * safe either way, but env is the shape this repository uses so no reviewer has
 * to decide whether a given interpolation is the dangerous kind.
 */

import { readFileSync } from 'node:fs'

/** Workflow commands are line-based, so a literal newline would split one. */
function esc(s) {
  return String(s ?? '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

function emit(level, { file, line, col, title, message }) {
  const parts = []
  if (file) parts.push(`file=${file}`)
  if (line) parts.push(`line=${line}`)
  if (col) parts.push(`col=${col}`)
  if (title) parts.push(`title=${esc(title)}`)
  const loc = parts.length ? ` ${parts.join(',')}` : ''
  process.stdout.write(`::${level}${loc}::${esc(message)}\n`)
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/* ── tsc ────────────────────────────────────────────────────────────────── */
/* Matches both shapes tsc emits:
 *   src/x.ts(12,5): error TS2345: Argument of type ...
 *   src/x.ts:12:5 - error TS2345: Argument of type ...            */
function annotateTsc(text) {
  const patterns = [
    /^(?<file>[^\s(][^(]*)\((?<line>\d+),(?<col>\d+)\):\s+(?<level>error|warning)\s+(?<code>TS\d+):\s*(?<msg>.*)$/,
    /^(?<file>[^\s:][^:]*):(?<line>\d+):(?<col>\d+)\s+-\s+(?<level>error|warning)\s+(?<code>TS\d+):\s*(?<msg>.*)$/,
  ]
  let n = 0
  for (const raw of text.split('\n')) {
    for (const re of patterns) {
      const m = raw.match(re)
      if (!m) continue
      const g = m.groups
      emit(g.level === 'warning' ? 'warning' : 'error', {
        file: prefix(g.file),
        line: g.line,
        col: g.col,
        title: `tsc ${g.code}`,
        message: g.msg,
      })
      n++
      break
    }
  }
  return n
}

/* ── eslint --format json ───────────────────────────────────────────────── */
function annotateEslint(text) {
  let results
  try {
    results = JSON.parse(text)
  } catch (e) {
    /* Reported, not swallowed. A parse failure here means every eslint finding
     * on this run is invisible, which is worse than the findings themselves. */
    emit('error', {
      file: 'frontend/scripts/gh-annotate.mjs',
      title: 'gh-annotate could not parse eslint output',
      message: `${e instanceof Error ? e.message : String(e)}. `
        + `Received ${text.length} byte(s). Every eslint finding on this run is unreported.`,
    })
    return NaN
  }
  let n = 0
  for (const file of results) {
    for (const m of file.messages ?? []) {
      emit(m.severity === 1 ? 'warning' : 'error', {
        file: prefix(file.filePath),
        line: m.line,
        col: m.column,
        title: `eslint ${m.ruleId ?? 'error'}`,
        message: m.message,
      })
      n++
    }
  }
  return n
}

/* ── vitest --reporter=json ─────────────────────────────────────────────── */
function annotateVitest(text) {
  let report
  try {
    report = JSON.parse(text)
  } catch (e) {
    emit('error', {
      file: 'frontend/scripts/gh-annotate.mjs',
      title: 'gh-annotate could not parse vitest output',
      message: `${e instanceof Error ? e.message : String(e)}. `
        + `Received ${text.length} byte(s). Every failing test on this run is unreported.`,
    })
    return NaN
  }
  let n = 0
  for (const suite of report.testResults ?? []) {
    for (const t of suite.assertionResults ?? []) {
      if (t.status === 'passed' || t.status === 'pending') continue
      const first = (t.failureMessages ?? [])[0] ?? 'failed'
      /* Recover a source location from the stack when vitest supplies one. */
      const at = first.match(/\((\/[^):]+):(\d+):(\d+)\)/)
      emit('error', {
        file: at ? prefix(at[1]) : prefix(suite.name),
        line: at ? at[2] : undefined,
        col: at ? at[3] : undefined,
        title: `vitest: ${[...(t.ancestorTitles ?? []), t.title].join(' > ')}`,
        message: first.split('\n').slice(0, 6).join('\n'),
      })
      n++
    }
  }
  return n
}

/* Annotations must be repo-relative. Every tool here runs inside `frontend/`,
 * so an absolute path is rewritten and a bare relative one is prefixed. */
function prefix(p) {
  if (!p) return undefined
  const s = String(p).replace(/\\/g, '/')
  const i = s.indexOf('/frontend/')
  if (i >= 0) return s.slice(i + 1)
  if (s.startsWith('frontend/')) return s
  if (s.startsWith('/')) return s.replace(/^\/+/, '')
  return `frontend/${s}`
}

const mode = process.argv[2]
const input = readStdin()
const handlers = { tsc: annotateTsc, eslint: annotateEslint, vitest: annotateVitest }
const handler = handlers[mode]

if (!handler) {
  process.stdout.write(`::warning::gh-annotate: unknown mode '${mode}'\n`)
  process.exit(0)
}

const count = handler(input)
const parseFailed = Number.isNaN(count)
process.stdout.write(
  `gh-annotate(${mode}): ${parseFailed ? 'PARSE FAILED' : `${count} annotation(s) emitted`}\n`,
)

/* THE CONTRADICTION CHECK. A failed step with nothing to point at is the exact
 * state that made GitHub logs useless: red, and silent about where. */
const outcome = process.env.STEP_OUTCOME ?? ''
if (outcome === 'failure' && (parseFailed || count === 0)) {
  process.stdout.write(
    `::error file=frontend/scripts/gh-annotate.mjs,title=${mode} failed with no annotations::`
    + `The '${mode}' step failed and this annotator produced no locations for it, `
    + `so the failure has no file or line anywhere on this run. `
    + `That is a defect in the annotator or in what it was fed, not an absence of errors. `
    + `Read the '${mode}' step's own log and fix the parser for that output shape.\n`,
  )
  process.exit(1)
}
process.exit(0)
