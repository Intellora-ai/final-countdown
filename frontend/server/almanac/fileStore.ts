/**
 * THE LEDGER, ON DISK.
 *
 * A JSON file holding every student's days and everything they have marked
 * done. Small, human-readable, and trivially replaceable by a database later —
 * `LedgerStore` is two methods on purpose.
 *
 * AN ABSENT FILE AND A BROKEN ONE ARE NOT THE SAME THING.
 *     Absent means a new install: start empty, nothing is lost. Broken means
 *     something is wrong, and starting empty there would wipe a student's whole
 *     history and re-plan today as if they had never used the app — with
 *     nothing anywhere reporting it. So a corrupt file stops the server, loudly.
 *
 * WHY THE WRITE IS ATOMIC.
 *     By the rule above, a truncated file stops the server. A process killed
 *     mid-write would produce exactly that. Writing to a temporary file and
 *     renaming means the real file is only ever a whole one.
 */

import { readFile, rename, writeFile, unlink } from 'node:fs/promises'

import type { LedgerData, LedgerStore } from './ledger.ts'

function isLedgerData(value: unknown): value is LedgerData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as { days?: unknown; done?: unknown }
  const objectish = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
  return objectish(candidate.days) && objectish(candidate.done)
}

export function fileStore(path: string): LedgerStore {
  return {
    async load() {
      let text: string
      try {
        text = await readFile(path, 'utf8')
      } catch {
        /* No file yet. A new install, not a failure — and the only case where
         * starting empty is the correct answer. */
        return { days: {}, done: {} }
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error(
          `almanac ledger at ${path} is not readable JSON. Refusing to start with an empty history.`,
        )
      }
      if (!isLedgerData(parsed)) {
        throw new Error(
          `almanac ledger at ${path} is not shaped like a ledger. Refusing to start with an empty history.`,
        )
      }
      return parsed
    },

    async save(data) {
      const temporary = `${path}.writing`
      try {
        await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
        await rename(temporary, path)
      } catch (error) {
        await unlink(temporary).catch(() => {})
        throw error
      }
    },
  }
}
