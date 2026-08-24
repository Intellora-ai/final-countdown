import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* THE RUN LEDGER.
 *
 * Specs append one line per measured scenario; the teardown folds those lines
 * into a single report. A line is written the moment it is measured, so a run
 * that crashes halfway still leaves behind exactly the evidence it earned —
 * which is the only kind worth having.
 */

/* Anchored to this file, not to process.cwd(): the canvas suite is normally
 * launched from the repository root (`npm run test:canvas`), and a cwd-relative
 * path would scatter reports wherever the command happened to start. */
export const REPORT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'report')
export const LEDGER_PATH = resolve(REPORT_DIR, 'ledger.jsonl')
export const REPORT_PATH = resolve(REPORT_DIR, 'canvas-harness-report.json')

export interface LedgerEntry {
  scenario: string
  conditions: Record<string, unknown>
  metrics: Record<string, unknown>
  at: string
}

export function appendLedger(entry: LedgerEntry): void {
  mkdirSync(dirname(LEDGER_PATH), { recursive: true })
  appendFileSync(LEDGER_PATH, `${JSON.stringify(entry)}\n`, 'utf8')
}
