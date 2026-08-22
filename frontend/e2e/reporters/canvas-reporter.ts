import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult,
} from '@playwright/test/reporter'
import { SOURCE_ANNOTATION, RENDERER_FALLBACK } from '../util/attribution'

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

interface Finding {
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
  durationMs: number
}

/** Workflow commands are line-based; a literal newline would split one. */
function esc(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/** Playwright wraps failure text in ANSI colour even when piped. */
const ANSI = new RegExp('\\[[0-9;]*m', 'g')

function firstUsefulLine(result: TestResult): string {
  const raw = result.error?.message ?? result.errors[0]?.message ?? 'failed with no message'
  const clean = raw.replace(ANSI, '').trim()
  /* The first three lines carry the matcher, the expected and the received.
   * The rest is a stack through node_modules that helps nobody. */
  return clean.split('\n').slice(0, 3).join(' | ').slice(0, 600)
}

export default class CanvasReporter implements Reporter {
  private readonly findings = new Map<string, Finding>()
  private outFile = 'ci-findings.json'

  onBegin(config: FullConfig, _suite: Suite): void {
    this.outFile = process.env.CANVAS_FINDINGS || `${config.rootDir}/ci-findings.json`
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

    this.findings.set(test.id, {
      tool: 'playwright',
      status: result.status,
      project: test.parent.project()?.name ?? 'unknown',
      title: test.titlePath().slice(1).filter(Boolean).join(' > '),
      spec: this.repoPath(test.location.file),
      specLine: test.location.line,
      sources: sources.length ? sources : [RENDERER_FALLBACK],
      attempts: (prior?.attempts ?? 0) + 1,
      message: firstUsefulLine(result),
      durationMs: result.duration,
    })
  }

  onEnd(result: FullResult): void {
    const all = [...this.findings.values()]
      .sort((a, b) => a.project.localeCompare(b.project) || a.title.localeCompare(b.title))

    /* ONE ANNOTATION PER TEST, ON THE SOURCE. The spec location rides along in
     * the message so provenance is never lost -- what changes is which file
     * GitHub opens when the annotation is clicked. */
    for (const f of all) {
      for (const source of f.sources) {
        const detail =
          `${f.message}  ::  found by ${f.spec}:${f.specLine} `
          + `[${f.project}]${f.attempts > 1 ? ` after ${f.attempts} attempts` : ''}`
        process.stdout.write(
          `::error file=${source},title=${esc(`${f.status}: ${f.title}`)}::${esc(detail)}\n`,
        )
      }
    }

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

  private repoPath(abs: string): string {
    const s = abs.replace(/\\/g, '/')
    const i = s.indexOf('/frontend/')
    return i >= 0 ? s.slice(i + 1) : s.replace(/^\/+/, '')
  }

  printsToStdio(): boolean {
    return true
  }
}
