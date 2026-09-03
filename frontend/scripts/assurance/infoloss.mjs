/**
 * ATTACK A -- INFORMATION-LOSS TRIPWIRE (static).
 *
 * Read the source of a decision's identity function and check that every field
 * the contract says forms the identity actually appears in that function's
 * body. It catches the blatant shape of the shelf bug: an identity function
 * that never mentions `asked` cannot possibly key on it.
 *
 * This is a tripwire, not a proof. Text can lie -- a field could be aliased and
 * still appear, or appear in an unrelated inner scope. So this stays advisory
 * and the runtime equivalence detector (attack B) is the deterministic
 * authority. It earns its place by being a DIFFERENT mechanism (reads source,
 * runs nothing) -- an uncorrelated failure mode, and it works even when the
 * code cannot run.
 */
import { codeNameOf } from './contract.mjs'

/**
 * The body of the FIRST definition of `fnName` that has a `{ ... }` body, by
 * balanced braces. An interface/type declaration of the same name (which ends
 * in `;` or a type, with no body brace before the next member) is skipped.
 * Returns the body text (without the outer braces) or null.
 */
export function scanBody(source, fnName) {
  const needle = `${fnName}(`
  let from = 0
  while (true) {
    const at = source.indexOf(needle, from)
    if (at === -1) return null
    // Find the matching ) of the parameter list.
    const open = source.indexOf('(', at)
    let depth = 0
    let i = open
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1
      else if (source[i] === ')') { depth -= 1; if (depth === 0) break }
    }
    // After the ), the next non-space run decides: `{` is a body; anything else
    // (`:` return type, `;`, `=>` without a brace) is not this definition's body.
    let j = i + 1
    while (j < source.length && /\s/.test(source[j])) j += 1
    // A TS method/function body opens with `{`. A `:` return-type annotation on
    // an interface member is not a body -- skip to the next occurrence.
    if (source[j] === '{') {
      let bd = 0
      for (let k = j; k < source.length; k += 1) {
        if (source[k] === '{') bd += 1
        else if (source[k] === '}') { bd -= 1; if (bd === 0) return source.slice(j + 1, k) }
      }
      return null
    }
    from = at + needle.length
  }
}

/**
 * The identity fields the contract declares that are ABSENT from the identity
 * function's body, each as `{field, code, fn, file}`. Empty means the tripwire
 * is clear. `deps.readFile(relPath) -> string` reads a repo file; injected so
 * the check is unit-testable against synthetic sources.
 */
export function infoloss(contract, deps) {
  const site = (contract && contract.identity_site) || {}
  const fields = ((contract && contract.identity && contract.identity.fields) || [])
  const source = deps.readFile(site.file)
  const body = scanBody(source, site.fn)
  if (body === null) {
    // The named function was not found -- that is itself a loss: the contract
    // points at an identity site that does not exist, so nothing can be keyed.
    return fields.map((field) => ({ field, code: codeNameOf(contract, field), fn: site.fn, file: site.file, reason: 'identity function not found' }))
  }
  const violations = []
  for (const field of fields) {
    const code = codeNameOf(contract, field)
    const present = new RegExp(`\\b${escapeRe(code)}\\b`).test(body)
    if (!present) violations.push({ field, code, fn: site.fn, file: site.file, reason: 'identity field absent from the identity function' })
  }
  return violations
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
