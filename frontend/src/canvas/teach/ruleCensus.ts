/*
 * THE RULE CENSUS — a list is only as good as whoever last edited it.
 *
 * `teaching.ts` refuses a lesson by emitting a named rule. Twenty-eight names
 * exist today and nothing forced any of them to be exercised, so a rule could
 * be dead — never firing on any input — while coverage reported it green,
 * because `validate.ts` calls the gate and coverage counts lines that RAN, not
 * assertions that CHECKED.
 *
 * This module reads the names out of the gate's own source. A hand-typed list
 * would rot the moment somebody adds rule twenty-nine; a census counts the
 * code, so the new rule is unpaired the instant it lands and the suite says so.
 *
 * Reading source text rather than importing a constant is deliberate. A
 * constant can be updated to match a list that was never paired — the census
 * would then agree with itself and prove nothing. The `rule:` literals are
 * what the gate actually emits, so they cannot drift from what it does.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Every rule name `checkTeaching` can emit, read from its source. */
export function declaredRules(): readonly string[] {
  const source = readFileSync(join(HERE, 'teaching.ts'), 'utf8')
  const found = new Set<string>()
  for (const m of source.matchAll(/\brule:\s*'([a-z][a-z-]*)'/g)) found.add(m[1]!)
  return [...found].sort()
}
