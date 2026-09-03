/**
 * THE CONTRACT LOADER AND ITS SELF-TEST.
 *
 * A contract is the source of truth for one decision. But a contract can
 * itself be wrong, and a wrong contract that is trusted would certify nonsense
 * -- so before it is granted any authority it must pass a self-test of pure
 * consistency rules. A contract that fails has NO authority: it can neither
 * block a change nor certify one (default-false). The self-test is deliberately
 * simple set logic so it is deterministic and itself unit-testable.
 *
 * JSON, not YAML: Node parses it natively with no dependency, and the
 * regression corpus this engine keeps is JSON anyway.
 */
import { readFileSync } from 'node:fs'

/** The maturity a claim may hold. `required` alone carries the power to block. */
export const MATURITIES = ['shadow', 'advisory', 'required']

/**
 * Read a contract file and run its self-test. Throws on a file that cannot be
 * read or parsed -- a contract the engine cannot read is not an empty contract,
 * it is an error, and silently treating it as empty is the Law-D mistake one
 * layer up.
 */
export function loadContract(pathOrUrl) {
  const text = readFileSync(pathOrUrl, 'utf8')
  const contract = JSON.parse(text)
  return { contract, selfTest: selfTest(contract) }
}

/** The identifier a semantic field is written as in code, from `code_names`,
    defaulting to the field's own name. Used by the static information-loss
    scan, which reads the identity function's source. */
export function codeNameOf(contract, field) {
  const map = asObject(asObject(contract).code_names)
  return typeof map[field] === 'string' && map[field].length > 0 ? map[field] : field
}

const asArray = (v) => (Array.isArray(v) ? v : [])
const asObject = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {})
const subset = (small, big) => small.every((x) => big.includes(x))

/**
 * The consistency rules. Each names a failure in words; the caller shows them.
 * The rules are total over any object, so a malformed shape fails loudly rather
 * than throwing.
 */
export function selfTest(contract) {
  const failures = []
  const c = asObject(contract)
  const inputs = asArray(c.inputs)
  const relevant = asArray(c.decision_relevant)
  const identityFields = asArray(asObject(c.identity).fields)
  const discarded = asObject(c.discarded)
  const discardedKeys = Object.keys(discarded)
  const pairs = asArray(c.distinguishing_pairs)
  const canaries = asArray(c.canaries)
  const assertions = asObject(c.assertions)

  const need = (cond, message) => { if (!cond) failures.push(message) }

  need(typeof c.decision === 'string' && c.decision.length > 0, 'no decision named')
  need(inputs.length > 0, 'no inputs declared')

  // 1. decision_relevant ⊆ inputs
  need(subset(relevant, inputs), `decision_relevant has a field not in inputs: ${relevant.filter((x) => !inputs.includes(x)).join(', ')}`)
  // 2. identity.fields ⊆ inputs
  need(subset(identityFields, inputs), `identity.fields has a field not in inputs: ${identityFields.filter((x) => !inputs.includes(x)).join(', ')}`)
  // 3. discarded ∩ decision_relevant = ∅
  const bothWays = discardedKeys.filter((k) => relevant.includes(k))
  need(bothWays.length === 0, `a field is both decision_relevant and discarded: ${bothWays.join(', ')}`)
  // 4. every input is either identity or justified-discarded -- nothing silently ignored
  const placed = new Set([...identityFields, ...discardedKeys])
  const orphans = inputs.filter((i) => !placed.has(i))
  need(orphans.length === 0, `input(s) neither in identity nor justified-discarded (the exact blind spot): ${orphans.join(', ')}`)
  // 4b. a discard must carry a justification string
  for (const k of discardedKeys) {
    need(typeof discarded[k] === 'string' && discarded[k].trim().length > 0, `discarded "${k}" has no justification`)
  }
  // 4c. code_names (optional) maps semantic input names to code identifiers; its keys must be inputs
  const codeNames = asObject(c.code_names)
  const strayCode = Object.keys(codeNames).filter((k) => !inputs.includes(k))
  need(strayCode.length === 0, `code_names maps a name that is not an input: ${strayCode.join(', ')}`)
  // 5. distinguishing pairs test only decision_relevant fields
  for (const [i, pair] of pairs.entries()) {
    const fields = [...Object.keys(asObject(pair.a)), ...Object.keys(asObject(pair.b))]
    const off = fields.filter((f) => !relevant.includes(f))
    need(off.length === 0, `distinguishing_pairs[${i}] tests a field that is not decision_relevant: ${off.join(', ')}`)
    need(typeof pair.differ === 'boolean', `distinguishing_pairs[${i}] has no boolean "differ"`)
  }
  // 6. canary names non-empty and unique
  need(canaries.every((n) => typeof n === 'string' && n.length > 0), 'a canary name is empty')
  need(new Set(canaries).size === canaries.length, 'two canaries share a name')
  // 7. a required assertion must point at graduation evidence
  for (const [name, a] of Object.entries(assertions)) {
    const maturity = asObject(a).maturity
    need(MATURITIES.includes(maturity), `assertion "${name}" has an unknown maturity: ${maturity}`)
    if (maturity === 'required') {
      need(typeof asObject(a).evidence === 'string' && asObject(a).evidence.length > 0,
        `assertion "${name}" is required but points at no graduation evidence`)
    }
  }

  return { ok: failures.length === 0, failures }
}
