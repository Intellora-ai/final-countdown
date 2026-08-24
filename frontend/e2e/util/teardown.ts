import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { LEDGER_PATH, REPORT_PATH, type LedgerEntry } from './report'

/* Fold the per-scenario ledger into one report file.
 *
 * The report states the build mode it measured and whether touch and CPU
 * conditions were emulated. A performance report that omits its own conditions
 * is a number without a claim attached, and the milestone forbids reporting
 * synthetic touch as if it were a device.
 */
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(LEDGER_PATH)) return

  const entries: LedgerEntry[] = readFileSync(LEDGER_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry)

  const buildModes = new Set(entries.map((e) => String(e.metrics.buildMode ?? 'unknown')))

  const report = {
    generatedAt: new Date().toISOString(),
    /* Stated once, loudly: these numbers come from a Vite dev server unless
     * something says otherwise. Dev is unminified and un-tree-shaken, so the
     * measurements are pessimistic rather than flattering. */
    buildModes: [...buildModes],
    caveats: [
      'Measured against the Vite dev server; production builds are faster.',
      'Touch is emulated by Chromium, not a real device. Synthetic touch is never reported as device evidence.',
      'jsWork is JavaScript callback time summed per frame. It is not frame time; frameInterval is frame time.',
      'missedFrame counts intervals above 1.5x the observed median interval; framesOver16_7ms is the literal 60Hz count.',
    ],
    scenarioCount: entries.length,
    scenarios: entries,
  }

  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  rmSync(LEDGER_PATH, { force: true })

  console.log(`\ncanvas harness report → ${REPORT_PATH} (${entries.length} scenarios)`)
}
