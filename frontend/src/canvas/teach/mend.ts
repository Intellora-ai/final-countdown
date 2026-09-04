/**
 * SPELLING IS MENDED; MEANING IS NEVER TOUCHED.
 *
 * Measured on the local 7B model, 2026-09-02, three lessons in a row: the
 * whole lesson was refused because a table column was keyed `"Number of
 * zeros"` (an id must be kebab-case) and two blocks carried roles the
 * schema has never had (`checkpoint`, `next`). Everything the model had
 * REASONED -- the definition, the example, the table's numbers -- was
 * correct, and none of it reached the learner. Telling the model in more
 * words did not help (measured: the same key came back after the prompt said
 * "a key is an id"). A small model cannot hold the whole contract in words.
 *
 * So the two faults that are pure spelling are mended here, deterministically,
 * BEFORE the gate judges. The gate is not relaxed: a mended lesson goes through
 * the same `validateLesson` as any other. What this never does: change a word
 * the learner reads, invent a value, or resolve an ambiguity -- two columns
 * that would spell to the same id are left alone for the gate to refuse.
 */
import { Id } from '../spec/spec'
import { BlockRole } from '../spec/roles'
import { REPRESENTATION_NAMES } from '../spec/representations'
import { Block } from '../spec/spec'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The id a label spells to: lowercase, runs of anything else become one dash. */
export function asId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '')
}

/**
 * Relations a block carries inside itself, moved to where the lesson keeps
 * them, `from` this block when the model left it out. A malformed one leaves
 * the block untouched: an ambiguity is the gate's to refuse.
 */
function hoisted(block: Record<string, unknown>): { block: Record<string, unknown>; relations: Record<string, unknown>[] } | null {
  const inside = block['relations']
  if (!Array.isArray(inside) || typeof block['id'] !== 'string') return null
  const relations: Record<string, unknown>[] = []
  for (const one of inside) {
    if (!record(one) || typeof one['to'] !== 'string' || typeof one['kind'] !== 'string') return null
    relations.push({ from: typeof one['from'] === 'string' ? one['from'] : block['id'], to: one['to'], kind: one['kind'] })
  }
  const { relations: _moved, ...rest } = block
  void _moved
  return { block: rest, relations }
}

/** A column key that is not an id but spells to one -- old key to new key. */
function renamedKeys(columns: readonly unknown[]): Map<string, string> | null {
  const renamed = new Map<string, string>()
  const taken = new Set<string>()
  for (const column of columns) {
    if (!record(column) || typeof column['key'] !== 'string') return null
    const key = column['key']
    if (Id.safeParse(key).success) {
      taken.add(key)
      continue
    }
    const spelled = asId(key)
    if (!Id.safeParse(spelled).success) return null
    renamed.set(key, spelled)
  }
  if (renamed.size === 0) return null
  /* Two keys spelling to one id is an ambiguity, not a spelling: leave it. */
  const spelledTo = [...renamed.values()]
  if (new Set([...spelledTo, ...taken]).size !== spelledTo.length + taken.size) return null
  return renamed
}

function mendTable(block: Record<string, unknown>): Record<string, unknown> {
  const columns = block['columns']
  const rows = block['rows']
  if (!Array.isArray(columns) || !Array.isArray(rows)) return block
  const renamed = renamedKeys(columns)
  if (renamed === null) return block
  return {
    ...block,
    columns: columns.map((column) =>
      record(column) && typeof column['key'] === 'string' && renamed.has(column['key'])
        ? { ...column, key: renamed.get(column['key']) }
        : column,
    ),
    rows: rows.map((row) =>
      record(row)
        ? Object.fromEntries(Object.entries(row).map(([key, value]) => [renamed.get(key) ?? key, value]))
        : row,
    ),
  }
}

/* `table` and `chart` are BOTH a block kind and a representation name. A block
   kind always wins: it is the legal, simpler form, and converting it would
   break a lesson that was already right. */
const A_BLOCK_KIND = new Set<string>(Block.options.map((option) => option.shape.kind.value))
const A_REPRESENTATION = new Set<string>(REPRESENTATION_NAMES.filter((name) => !A_BLOCK_KIND.has(name)))

/**
 * A FLOW WHOSE TWO FIELDS ARE NAMED WITH THE OTHER COMMON WORD FOR EACH.
 *
 * MEASURED LIVE 2026-09-04, gpt-oss-120b via Groq: two consecutive fresh
 * lessons lost their diagram to this, in two languages --
 *
 *   how a rainbow forms     blocks.1.links.0: Unrecognized key(s): 'source', 'target'
 *   प्रकाश संश्लेषण क्या है   blocks.1: Unrecognized key(s): 'steps', 'transitions'
 *
 * with `kinds written: ["prose","flow"]` both times. The model chose the right
 * block and drew the right graph; it named the fields `steps`/`transitions` and
 * the link ends `source`/`target`. The learner got the prose and an apology
 * where the diagram belonged.
 *
 * UNAMBIGUOUS, WHICH IS THE ONLY REASON THIS IS MENDED AND NOT REFUSED. A flow
 * has no field called `steps`, `transitions`, `source` or `target`, so there is
 * nothing to guess between. When BOTH names are present the block says two
 * things at once, and that is the gate's to refuse -- the same rule this file
 * already keeps for a kind that contradicts a role.
 */
function mendFlow(block: Record<string, unknown>): Record<string, unknown> {
  let mended = block
  if (mended['nodes'] === undefined && Array.isArray(mended['steps'])) {
    const { steps: nodes, ...rest } = mended
    mended = { ...rest, nodes }
  }
  if (mended['links'] === undefined && Array.isArray(mended['transitions'])) {
    const { transitions: links, ...rest } = mended
    mended = { ...rest, links }
  }
  const links = mended['links']
  if (!Array.isArray(links)) return mended
  let renamed = false
  const ends = links.map((one) => {
    if (!record(one) || one['from'] !== undefined || one['to'] !== undefined) return one
    if (typeof one['source'] !== 'string' || typeof one['target'] !== 'string') return one
    const { source: from, target: to, ...rest } = one
    renamed = true
    return { ...rest, from, to }
  })
  return renamed ? { ...mended, links: ends } : mended
}

function mendBlock(block: unknown): unknown {
  if (!record(block)) return block
  let mended = block
  /* A REPRESENTATION NAME WRITTEN AS THE KIND. Measured live 2026-09-02 on the
     build that first showed the model all 137 names: every block came back
     with `kind: "flowchart"`, `kind: "numberLine"`, and the lesson was refused
     for an invalid discriminator. The model chose what to draw and put the
     word one field to the left. The correct form is unambiguous. */
  if (typeof mended['kind'] === 'string' && A_REPRESENTATION.has(mended['kind']) && mended['as'] === undefined) {
    mended = { ...mended, kind: 'figure', as: mended['kind'] }
  }
  /* A ROLE WRITTEN WHERE THE KIND BELONGS. Measured live 2026-09-02:
     `kinds written: ["prose","example","table"]` -- "example" is a role, and
     the whole lesson was refused for it. The block is prose, in that role.
     Left alone when a role is already written and differs: two fields
     disagreeing is an ambiguity, and the gate is the place for those. */
  if (
    typeof mended['kind'] === 'string' &&
    !A_BLOCK_KIND.has(mended['kind']) &&
    (BlockRole.options as readonly string[]).includes(mended['kind']) &&
    (mended['role'] === undefined || mended['role'] === mended['kind'])
  ) {
    mended = { ...mended, kind: 'prose', role: mended['kind'] }
  }
  if (typeof mended['role'] === 'string' && !(BlockRole.options as readonly string[]).includes(mended['role'])) {
    /* A role the schema never had: with it gone, the schema's own default applies. */
    const { role: _invented, ...rest } = mended
    void _invented
    mended = rest
  }
  if (mended['kind'] === 'table') mended = mendTable(mended)
  if (mended['kind'] === 'flow') mended = mendFlow(mended)
  return mended
}

/**
 * The parsed reply with its spelling faults mended, or the very same object
 * when there were none -- so a caller can tell nothing was touched. `asked`
 * is the question the learner typed: a lesson that forgot its `id` or
 * `question` is filed under it.
 */
export function mendSpelling(parsed: unknown, asked?: string): unknown {
  if (!record(parsed) || !Array.isArray(parsed['blocks'])) return parsed
  let changed = false
  const moved: Record<string, unknown>[] = []
  const blocks = parsed['blocks'].map((block) => {
    let mended = mendBlock(block)
    if (record(mended)) {
      const lifted = hoisted(mended)
      if (lifted !== null) {
        moved.push(...lifted.relations)
        mended = lifted.block
      }
    }
    if (mended !== block) changed = true
    return mended
  })
  const out: Record<string, unknown> = { ...parsed, blocks }
  if (moved.length > 0) {
    out['relations'] = [...(Array.isArray(parsed['relations']) ? parsed['relations'] : []), ...moved]
    changed = true
  }
  if (asked !== undefined && asked.trim() !== '') {
    if (typeof out['id'] !== 'string' || out['id'] === '') {
      out['id'] = asId(asked)
      changed = true
    }
    if (typeof out['question'] !== 'string' || out['question'] === '') {
      out['question'] = asked
      changed = true
    }
  }
  return changed ? out : parsed
}
