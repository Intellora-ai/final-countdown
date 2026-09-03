/**
 * READING THE NODES OFF DISK — and never lying about what is there.
 *
 * This copies the discipline of `src/knowledge/load.ts` deliberately, because
 * that discipline was earned. Two rules, both from failures this repository
 * actually met:
 *
 *   1. A FILE THAT CANNOT BE READ IS REPORTED, NEVER SKIPPED. A knowledge
 *      layer that quietly drops what it cannot parse reports health it does
 *      not have.
 *
 *   2. AN EMPTY STORE IS EMPTY, NOT HEALTHY. `gate:knowledge` once printed
 *      "0 file(s) ... PASS" and exited 0 against the wrong directory. That is
 *      worse than a red result, because nobody investigates a pass.
 *
 * One id belonging to two files is the same class of fault as `load.ts`'s
 * "described twice": last-one-wins is a bug worth seeing, not a merge worth
 * doing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { KnowledgeNode, LEVELS, STATES, STATUSES, SYSTEMS } from './schema/node.ts'

export interface Fault {
  readonly path: string
  readonly why: string
}

export interface Store {
  readonly dir: string
  readonly nodes: readonly KnowledgeNode[]
  readonly faults: readonly Fault[]
  /** Kept as `broken` too, matching `load.ts`'s vocabulary for the same idea. */
  readonly broken: readonly Fault[]
  /** The directory itself is absent — different from present and empty. */
  readonly missing: boolean
}

/** Every `.json` under the tree, in a stable order so output does not shuffle. */
function everyJsonFile(dir: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at).sort()) {
      const path = join(at, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (entry.endsWith('.json')) found.push(path)
    }
  }
  walk(dir)
  return found
}

export function readStore(dir: string): Store {
  if (!existsSync(dir)) {
    return { dir, nodes: [], faults: [], broken: [], missing: true }
  }
  const nodes: KnowledgeNode[] = []
  const faults: Fault[] = []
  const claimedBy = new Map<string, string>()

  for (const path of everyJsonFile(dir)) {
    /* `relative`, not slicing: the CLI resolves its store with a trailing
       slash, and arithmetic on the length produced `-lie.json` for a file
       called `a-lie.json`. A fault that names the wrong file sends you to
       look at something innocent, which is worse than naming none. */
    const shown = relative(dir, path)
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error: unknown) {
      faults.push({ path: shown, why: `not JSON: ${error instanceof Error ? error.message : String(error)}` })
      continue
    }
    const read = KnowledgeNode.safeParse(parsed)
    if (!read.success) {
      /* Every issue, not just the first: a node is usually wrong in one way,
         but when it is wrong in three, hiding two costs three round trips. */
      faults.push({ path: shown, why: read.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') })
      continue
    }
    const already = claimedBy.get(read.data.id)
    if (already !== undefined) {
      faults.push({ path: shown, why: `${read.data.id} is described twice; already claimed by ${already}` })
      continue
    }
    claimedBy.set(read.data.id, shown)
    nodes.push(read.data)
  }
  return { dir, nodes, faults, broken: faults, missing: false }
}

export interface Summary {
  readonly total: number
  readonly empty: boolean
  readonly missing: boolean
  readonly faults: number
  readonly bySystem: Readonly<Record<string, number>>
  readonly byState: Readonly<Record<string, number>>
  readonly byLevel: Readonly<Record<string, number>>
  readonly byStatus: Readonly<Record<string, number>>
}

/** Every declared value appears as a key even at zero, so nothing hides by being absent. */
function tally<T extends string>(values: readonly T[], of: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(values.map((v) => [v, 0]))
  for (const one of of) counts[one] = (counts[one] ?? 0) + 1
  return counts
}

export function summarise(store: Store): Summary {
  return {
    total: store.nodes.length,
    empty: store.nodes.length === 0,
    missing: store.missing,
    faults: store.faults.length,
    bySystem: tally(SYSTEMS, store.nodes.map((n) => n.system)),
    byState: tally(STATES, store.nodes.map((n) => n.state)),
    byLevel: tally(LEVELS, store.nodes.map((n) => n.level)),
    byStatus: tally(STATUSES, store.nodes.map((n) => n.status)),
  }
}
