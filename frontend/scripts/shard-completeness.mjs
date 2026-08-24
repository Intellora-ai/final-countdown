/*
 * THE VERDICT-SIDE COMPLETENESS CHECK.
 *
 * Reads every `mutation-shard-*.json` the shards uploaded and refuses unless
 * the union of what they ran IS the whole mutant catalogue. The rule itself
 * lives in `shardsAreComplete` (./mutation-verdict.mjs), which is pure and
 * tested; this file is only the I/O around it.
 *
 * WHY A SEPARATE FILE. `mutation-verdict.mjs` must stay importable with no side
 * effects so its tests can reach it -- the same constraint that made it exist.
 * Reading a directory is a side effect, so it lives here.
 *
 * A DIRECTORY WITH NO MANIFESTS IS A FAILURE, not an empty success. That is the
 * shape a broken upload takes, and `shardsAreComplete([])` refuses it rather
 * than reporting that every mutant it heard about ran.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { shardsAreComplete } from './mutation-verdict.mjs'

const dir = process.argv[2] ?? '.'

let files = []
try {
  files = readdirSync(dir, { recursive: true })
    .filter((f) => /(^|[\\/])mutation-shard-\d+\.json$/.test(String(f)))
} catch (err) {
  process.stdout.write(`::error title=mutation shards::cannot read ${dir}: ${err.message}\n`)
  process.exit(1)
}

const manifests = []
for (const f of files) {
  const path = join(dir, String(f))
  try {
    manifests.push(JSON.parse(readFileSync(path, 'utf8')))
  } catch (err) {
    /* A manifest that will not parse is NOT skipped. Skipping it would shrink
     * the union and then report the mutants it owned as "never ran", sending
     * the reader after the wrong failure entirely. */
    process.stdout.write(`::error title=mutation shards::${path} is not readable JSON: ${err.message}\n`)
    process.exit(1)
  }
}

const verdict = shardsAreComplete(manifests)
process.stdout.write(
  `mutation shard coverage: ${manifests.length} manifest(s) from ${dir}\n`,
)

if (!verdict.ok) {
  process.stdout.write(
    `::error title=mutation shards incomplete::${verdict.reason}\n`,
  )
  if (verdict.missing.length > 0) {
    process.stdout.write(`mutants that never ran: ${verdict.missing.join(', ')}\n`)
  }
  process.exit(1)
}

process.stdout.write(
  `PASS — every mutant in the catalogue was run by exactly one shard\n`,
)
