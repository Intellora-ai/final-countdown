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
 * Always exits 0. A broken annotator must never be the thing that fails a
 * build; the step it annotates carries the real verdict.
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
  } catch {
    return 0
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
  } catch {
    return 0
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
process.stdout.write(`gh-annotate(${mode}): ${count} annotation(s) emitted\n`)
process.exit(0)
