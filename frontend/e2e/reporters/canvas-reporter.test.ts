import { describe, expect, test } from 'vitest'
import { annotationsFor, detailFor, usefulMessage, type Finding } from './canvas-reporter'

/* THE MODULE THAT DECIDES WHAT EVERY CI FAILURE LOOKS LIKE, FINALLY TESTED.
 *
 * These assert the EXACT text GitHub receives. A test that checked
 * `toContain('WHY')` would pass against an annotation that printed the word
 * WHY above the wrong cause, which is the failure mode being fixed here, so
 * every assertion below names the whole line.
 */

const base: Finding = {
  tool: 'playwright',
  status: 'failed',
  project: 'square-900',
  title: 'asking a doubt answers it without advancing the lesson',
  spec: 'frontend/e2e/scene-regressions.spec.ts',
  specLine: 454,
  sources: ['frontend/src/canvas/teach/TeachView.tsx'],
  unverifiedSources: [],
  attempts: 1,
  message: 'expect(locator).toHaveCount(expected) | Expected: 1 | Received: 0',
  causes: [],
  attachments: [],
  durationMs: 12_000,
}
const finding = (over: Partial<Finding>): Finding => ({ ...base, ...over })

describe('detailFor', () => {
  test('a crash reports the page error as the cause, not the count', () => {
    const d = detailFor(finding({
      causes: ["pageerror: TypeError: Cannot read properties of undefined (reading 'columns')"],
    }))
    expect(d).toContain('WHAT     expect(locator).toHaveCount(expected) | Expected: 1 | Received: 0')
    expect(d).toContain("WHY      crashed — pageerror: TypeError: Cannot read properties of undefined (reading 'columns')")
    expect(d).toContain('NEXT     the page threw before the assertion ran — fix the error under WHY, not the assertion')
  })

  test('with no page error the same failure is a thing that never rendered', () => {
    const d = detailFor(finding({}))
    expect(d).toContain('WHY      never-rendered')
    expect(d).toContain('NEXT     element never rendered — check the conditional that gates it in frontend/src/canvas/teach/TeachView.tsx')
  })

  test('provenance survives: the spec is named as where the assertion lives', () => {
    expect(detailFor(finding({})))
      .toContain('FOUND BY frontend/e2e/scene-regressions.spec.ts:454')
  })

  test('the attributed file is named, and marked as attributed not proven', () => {
    expect(detailFor(finding({})))
      .toContain('WHERE    frontend/src/canvas/teach/TeachView.tsx   (attributed)')
  })

  /* THE ONE THAT STOPS THE ORIGINAL DEFECT REPEATING. A path nobody checked is
     printed with a warning, never silently as though it were verified. */
  test('an attributed path that does not exist is called out, not printed as fact', () => {
    const d = detailFor(finding({
      sources: ['frontend/src/canvas/teach/gone.ts'],
      unverifiedSources: ['frontend/src/canvas/teach/gone.ts'],
    }))
    expect(d).toContain('WHERE    frontend/src/canvas/teach/gone.ts   (ATTRIBUTION STALE: this path does not exist)')
  })

  test('a failure no rule recognises carries no NEXT line at all', () => {
    const d = detailFor(finding({ message: 'browserType.launch: Executable does not exist' }))
    expect(d).toContain('WHY      unknown')
    expect(d).not.toContain('NEXT')
  })

  test('artifacts are pointed at only when the run actually wrote some', () => {
    expect(detailFor(finding({ attachments: ['screenshot', 'trace'] })))
      .toContain('ALSO     screenshot, trace in the run artifacts')
    expect(detailFor(finding({ attachments: [] }))).not.toContain('ALSO')
  })

  test('a retry is reported as timing and says how many attempts', () => {
    const d = detailFor(finding({ status: 'flaky', attempts: 2 }))
    expect(d).toContain('WHY      flaky-on-retry')
    expect(d).toContain('NEXT     passed on retry — treat as timing, not a defect')
    expect(d).toContain('[square-900, 2 attempts]')
  })
})

describe('annotationsFor', () => {
  test('one line per source file, and newlines encoded so GitHub keeps them', () => {
    const lines = annotationsFor([finding({
      sources: ['frontend/src/a.tsx', 'frontend/src/b.tsx'],
    })])
    expect(lines).toHaveLength(2)
    expect(lines[0].startsWith('::error file=frontend/src/a.tsx,title=')).toBe(true)
    expect(lines[1].startsWith('::error file=frontend/src/b.tsx,title=')).toBe(true)
    /* A literal newline splits a workflow command in half; %0A does not. */
    expect(lines[0].includes('\n')).toBe(false)
    expect(lines[0]).toContain('%0A')
  })

  test('the title carries the status and the test name', () => {
    expect(annotationsFor([finding({})])[0])
      .toContain('title=failed: asking a doubt answers it without advancing the lesson::')
  })
})

/* THE WINDOW THAT STARVED THE CLASSIFIER.
 *
 * `firstUsefulLine` kept the first three lines of the error. Measured against
 * Playwright 1.62.1 those three are the matcher, a BLANK LINE, and the locator
 * -- so `Expected:` and `Received:` fell outside the window and never reached
 * the annotation. Proven end to end: a real failure printed
 * `WHY unknown` because the evidence its rules read had been trimmed off.
 */
describe('usefulMessage', () => {
  const REAL = [
    'Error: expect(locator).toHaveCount(expected) failed',
    '',
    'Locator:  locator(\'.lc-teach__answer\')',
    'Expected:  1',
    'Received:  0',
    'Timeout:  2000ms',
    '',
    'Call log:',
    '  - Expect "toHaveCount" with timeout 2000ms',
    '    at /repo/frontend/e2e/scene-regressions.spec.ts:454:32',
  ].join('\n')

  test('the expected and received values survive, which the 3-line window lost', () => {
    const m = usefulMessage(REAL)
    expect(m).toContain('Expected:  1')
    expect(m).toContain('Received:  0')
  })

  test('the matcher line is kept, so the reader knows what was asserted', () => {
    expect(usefulMessage(REAL)).toContain('expect(locator).toHaveCount(expected) failed')
  })

  test('the call-log stack is dropped: it names the spec, never the defect', () => {
    expect(usefulMessage(REAL)).not.toContain('at /repo/frontend/e2e')
  })

  test('blank lines never eat a slot', () => {
    expect(usefulMessage(REAL).split(' | ').filter((p) => p.trim() === '')).toEqual([])
  })

  test('and the whole point: the result classifies instead of falling to unknown', () => {
    expect(detailFor(finding({ message: usefulMessage(REAL) }))).toContain('WHY      never-rendered')
  })

  test('ANSI colour is stripped even when the output was piped', () => {
    expect(usefulMessage('\u001b[31mExpected: 1\u001b[39m')).toBe('Expected: 1')
  })

  test('an error with nothing in it says so rather than returning empty', () => {
    expect(usefulMessage('')).toBe('failed with no message')
  })
})
