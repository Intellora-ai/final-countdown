import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult,
} from '@playwright/test/reporter'
import { SOURCE_ANNOTATION, CAUSE_ANNOTATION, RENDERER_FALLBACK } from '../util/attribution'
import { classify, remedy } from '../util/remedy'

/* THE REPORTER THAT MAKES A CI LOG WORTH READING.
 *
 * Playwright's stock `github` reporter was doing three things wrong at once,
 * measured on run 32589708228 -- 13 annotations for 5 distinct failures:
 *
 *   1. IT ANNOTATED THE DETECTOR, NOT THE DEFECT. Every one of this branch's
 *      49 annotations named composed-renderer.spec.ts. That is where the
 *      assertion lives. The bug was in ChartPanel.tsx and no annotation ever
 *      said so, so every failure began with a manual hunt through the contract
 *      registry to find which file to open.
 *
 *   2. IT ANNOTATED EVERY ATTEMPT. `retries: 1` means a failing test runs
 *      twice, and the stock reporter emits ::error for both. Exactly 2x noise
 *      on every failure, which is why 5 problems read as 10.
 *
 *   3. IT LEFT NO MACHINE-READABLE RESULT. Reconstructing what failed meant
 *      `gh run view --log | grep`, then the annotations API, then reading the
 *      spec to work out what the assertion meant. Several round trips to learn
 *      something the reporter already knew.
 *
 * This fixes all three. One annotation per test, pointed at the source files
 * the test attributed via `attribute()`, plus `ci-findings.json` written for
 * the run to upload -- so the whole failure set is one artifact download
 * instead of a log crawl.
 *
 * WHY A CUSTOM REPORTER AND NOT `retries: 0`. Dropping retries would also halve
 * the annotations, and it would throw away the one thing retries buy: the
 * difference between DETERMINISTICALLY BROKEN and FLAKY. `--fail-on-flaky-tests`
 * already fails the run either way, so the retry costs nothing at the gate and
 * the flaky/failed distinction is real diagnostic signal. Deduplicating is the
 * fix; deleting the information is not.
 */

export interface Finding {
  tool: 'playwright'
  status: 'failed' | 'timedOut' | 'interrupted' | 'flaky'
  project: string
  title: string
  /** Where the assertion lives. Provenance, not the suspect. */
  spec: string
  specLine: number
  /** Source files the test named as implicated. */
  sources: string[]
  attempts: number
  message: string
  causes: string[]
  attachments: string[]
  unverifiedSources: string[]
  durationMs: number
}

/** Workflow commands are line-based; a literal newline would split one. */
function esc(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/** Playwright wraps failure text in ANSI colour even when piped. */
const ANSI = new RegExp('\\[[0-9;]*m', 'g')

/**
 * The lines of an error that carry evidence, and only those.
 *
 * THE THREE-LINE WINDOW WAS WRONG, AND IT WAS MEASURED WRONG. It kept
 * `clean.split('\n').slice(0, 3)`, which against Playwright 1.62.1 is the
 * matcher, a BLANK LINE, and the locator -- so `Expected:` and `Received:`,
 * the only two lines that say what actually happened, fell outside it.
 *
 * That is not merely untidy. `classify()` reads those lines, so trimming them
 * off silently starved it: a forced failure printed `WHY unknown` about a
 * `toHaveCount` mismatch the rules handle perfectly well.
 *
 * Selected by SHAPE rather than by position, so a change in how Playwright
 * formats an error cannot quietly re-open the same hole.
 */
const EVIDENCE = /^(Expected|Received|Timed out|Test timeout|Error|Locator|Timeout)\b/
const MAX_PARTS = 8

export function usefulMessage(raw: string): string {
  const lines = raw.replace(ANSI, '').split('\n').map((l) => l.trim()).filter((l) => l !== '')
  /* The call log names the spec and the node_modules frame under it. That is
     where the assertion lives and never where the defect lives -- the whole
     reason this reporter exists. */
  const stop = lines.findIndex((l) => l.startsWith('Call log:'))
  const body = stop >= 0 ? lines.slice(0, stop) : lines
  const kept = body.filter((l) => EVIDENCE.test(l)).slice(0, MAX_PARTS)
  const parts = kept.length > 0 ? kept : body.slice(0, MAX_PARTS)
  return parts.join(' | ').slice(0, 600) || 'failed with no message'
}

function firstUsefulLine(result: TestResult): string {
  return usefulMessage(result.error?.message ?? result.errors[0]?.message ?? '')
}

export default class CanvasReporter implements Reporter {
  private readonly findings = new Map<string, Finding>()
  private outFile = 'ci-findings.json'

  onBegin(_config: FullConfig, _suite: Suite): void {
    /* NOT `config.rootDir`. That was the first cut and CI proved it wrong on
     * the first green run: rootDir is the common root of the TEST FILES --
     * measured as frontend/e2e, not frontend -- so the findings landed one
     * directory below where the upload step looked, and the artifact came back
     * empty with only an `if-no-files-found: warn` annotation to say so.
     *
     * The local check missed it because it passed CANVAS_FINDINGS explicitly,
     * which is exactly the path CI does not take.
     *
     * Resolving from this file's own location is independent of rootDir, of
     * the working directory, and of which config invoked it. */
    const here = dirname(fileURLToPath(import.meta.url))
    this.outFile = process.env.CANVAS_FINDINGS || resolve(here, '../../ci-findings.json')
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed' || result.status === 'skipped') return

    /* THE DEDUPLICATION. Keyed on the test's stable id, so attempt 2 of a
     * failing test updates the existing finding rather than adding a second
     * one. `attempts` records how many times it ran, which is the information
     * the duplicate annotation was accidentally conveying. */
    const prior = this.findings.get(test.id)

    const sources = [
      ...new Set(
        test.annotations
          .filter((a) => a.type === SOURCE_ANNOTATION && a.description)
          .map((a) => a.description as string),
      ),
    ].sort()

    const causes = [
      ...new Set(
        test.annotations
          .filter((a) => a.type === CAUSE_ANNOTATION && a.description)
          .map((a) => a.description as string),
      ),
    ]

    /* The artifacts Playwright already wrote. Naming them costs nothing and
       saves a reader guessing whether a screenshot exists. */
    const attachments = [...new Set(result.attachments.map((a) => a.name))].sort()

    const resolved = sources.length ? sources : [RENDERER_FALLBACK]

    this.findings.set(test.id, {
      tool: 'playwright',
      status: result.status,
      project: test.parent.project()?.name ?? 'unknown',
      title: test.titlePath().slice(1).filter(Boolean).join(' > '),
      spec: this.repoPath(test.location.file),
      specLine: test.location.line,
      sources: resolved,
      /* Checked, not trusted. An attribution is a claim about a file, and this
         is the only place that can test the claim before it is printed. */
      unverifiedSources: resolved.filter((p) => !this.pathExists(p)),
      attempts: (prior?.attempts ?? 0) + 1,
      message: firstUsefulLine(result),
      causes: causes.length > 0 ? causes : (prior?.causes ?? []),
      attachments,
      durationMs: result.duration,
    })
  }

  onEnd(result: FullResult): void {
    const all = [...this.findings.values()]
      .sort((a, b) => a.project.localeCompare(b.project) || a.title.localeCompare(b.title))

    /* ONE ANNOTATION PER TEST, ON THE SOURCE. The spec location rides along in
     * the body so provenance is never lost -- what changes is which file
     * GitHub opens when the annotation is clicked. */
    for (const line of annotationsFor(all)) process.stdout.write(`${line}\n`)

    try {
      mkdirSync(dirname(this.outFile), { recursive: true })
      writeFileSync(
        this.outFile,
        JSON.stringify({ status: result.status, count: all.length, findings: all }, null, 2),
      )
      process.stdout.write(`canvas-reporter: ${all.length} finding(s) -> ${this.outFile}\n`)
    } catch (e) {
      /* Loud. A findings file that silently failed to write is the same
       * "no output means no problems" trap this reporter exists to close. */
      process.stdout.write(
        '::error file=frontend/e2e/reporters/canvas-reporter.ts,title=findings file not written::'
        + `${esc(e instanceof Error ? e.message : String(e))}. `
        + 'The run\'s failures exist only in the log.\n',
      )
    }
  }

  /**
   * Does a repo-relative attributed path exist on disk?
   *
   * Resolved from this file's own location, like `outFile` above and for the
   * same measured reason: the reporter's working directory is not knowable
   * from inside it, and a check that silently answers "no" for every path
   * would mark every attribution stale.
   */
  private pathExists(repoRelative: string): boolean {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
    return existsSync(resolve(root, repoRelative))
  }

  private repoPath(abs: string): string {
    const s = abs.replace(/\\/g, '/')
    const i = s.indexOf('/frontend/')
    return i >= 0 ? s.slice(i + 1) : s.replace(/^\/+/, '')
  }

  printsToStdio(): boolean {
    return true
  }
}

/* ------------------------------------------------------------------------ */
/* The annotation itself                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Six labelled fields, so a reader never has to open an artifact to know what
 * happened.
 *
 * The old annotation was one line: the assertion, and a filename somebody had
 * typed by hand. Everything a reader actually needed next -- had the page
 * crashed, was it a flake, is the blamed file even capable of this failure --
 * was rediscovered by hand, every time, from the same run that already knew.
 *
 * Every field below is COPIED from the run or LOOKED UP in a rule table.
 * Nothing here composes a sentence about the failure, which is why nothing here
 * can compose a wrong one. A field with no evidence behind it is omitted rather
 * than filled: no cause, no `WHY` detail; no matching rule, no `NEXT`; no
 * attachments, no `ALSO`.
 */
export function detailFor(f: Finding): string {
  const shape = {
    message: f.message,
    status: f.status,
    attempts: f.attempts,
    causes: f.causes,
    where: f.sources[0] ?? RENDERER_FALLBACK,
  }
  const why = classify(shape)
  const next = remedy(shape, why)

  const lines: string[] = [
    `[${f.project}${f.attempts > 1 ? `, ${f.attempts} attempts` : ''}]`,
    '',
    `WHAT     ${f.message}`,
    /* The page's own error, when there is one. This is the field that was
       missing entirely: a React throw unmounts the subtree, so the assertion
       reports a truthful `Received: 0` about a page that no longer exists, and
       the real error sat in the test's local array and never left the runner. */
    `WHY      ${why}${f.causes.length > 0 ? ` — ${f.causes.join(' ; ')}` : ''}`,
  ]

  if (next !== '') lines.push(`NEXT     ${next}`)

  /* ATTRIBUTED, NOT PROVEN, and the word is chosen. `attribute()` resolves a
     renderer from a `data-kind` the DOM actually emitted; `attributeFiles()`
     takes whatever a human typed. Printing both as bare fact is how a reader
     ends up in `doubt.ts` -- a pure text matcher with no viewport and no clock
     -- looking for a bug that only appears at one viewport.

     A path that does not exist is called out IN THE ANNOTATION rather than
     quietly used, because the previous stale map in this repo failed silently:
     six of six paths pointed at nothing and every attribution degraded without
     saying so. */
  for (const source of f.sources) {
    const stale = f.unverifiedSources.includes(source)
    lines.push(
      `WHERE    ${source}   ${stale ? '(ATTRIBUTION STALE: this path does not exist)' : '(attributed)'}`,
    )
  }

  lines.push(`FOUND BY ${f.spec}:${f.specLine}`)

  if (f.attachments.length > 0) {
    lines.push(`ALSO     ${f.attachments.join(', ')} in the run artifacts`)
  }

  return lines.join('\n')
}

/**
 * One `::error` per source file.
 *
 * Still one annotation per test per source -- the deduplication in `onTestEnd`
 * is what stopped 13 annotations describing 5 failures -- but each one now
 * carries the whole picture instead of a single line.
 */
export function annotationsFor(all: readonly Finding[]): string[] {
  const out: string[] = []
  for (const f of all) {
    for (const source of f.sources) {
      out.push(`::error file=${source},title=${esc(`${f.status}: ${f.title}`)}::${esc(detailFor(f))}`)
    }
  }
  return out
}
