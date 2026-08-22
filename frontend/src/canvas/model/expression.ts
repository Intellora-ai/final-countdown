/* THE EXPRESSION ENGINE — arithmetic the generator may write, parsed, never run.
 *
 * WHY THIS FILE EXISTS AT ALL. The board's whole reactive story is "one
 * variable drives a number, an equation, a graph, a table and a simulation".
 * That means formulas have to arrive as data, and data arriving as a formula
 * is the oldest injection surface there is. `new Function(expr)` would make
 * every lesson a remote-code-execution vector the moment a model writes one.
 *
 * So: a shunting-yard parser to RPN, then an evaluator over a fixed opcode
 * set. There is no property access, no call syntax beyond a whitelist, no
 * string type, no assignment, no comma operator and no way to reach a global.
 * The worst a hostile expression can do is be wrong.
 *
 * NaN IS A PARSE OUTCOME, NOT A RENDERED VALUE. evaluate() returns null rather
 * than NaN or Infinity so callers must handle the failure; a chart that plots
 * NaN fails silently, and silent is the failure mode this board refuses.
 */

export type Token =
  | { k: 'num'; v: number }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: 'fn'; v: string }
  | { k: '('; }
  | { k: ')'; }
  | { k: ','; }

export interface CompiledExpression {
  /** Reverse-polish opcode list. */
  rpn: Token[]
  /** Every identifier the expression reads. Drives dependency tracking. */
  deps: string[]
  source: string
}

export class ExpressionError extends Error {}

/* Functions a lesson may call. Every one is total over reals or returns null
 * via the NaN guard; none can observe or mutate anything. */
const FUNCTIONS: Record<string, { arity: number; fn: (...a: number[]) => number }> = {
  sqrt:  { arity: 1, fn: Math.sqrt },
  abs:   { arity: 1, fn: Math.abs },
  round: { arity: 1, fn: Math.round },
  floor: { arity: 1, fn: Math.floor },
  ceil:  { arity: 1, fn: Math.ceil },
  ln:    { arity: 1, fn: Math.log },
  log10: { arity: 1, fn: Math.log10 },
  exp:   { arity: 1, fn: Math.exp },
  sin:   { arity: 1, fn: Math.sin },
  cos:   { arity: 1, fn: Math.cos },
  tan:   { arity: 1, fn: Math.tan },
  min:   { arity: 2, fn: Math.min },
  max:   { arity: 2, fn: Math.max },
  pow:   { arity: 2, fn: Math.pow },
}

/* Constants are identifiers the evaluator resolves before the scope does, so a
 * lesson cannot shadow pi with a variable and quietly change every formula. */
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

interface OpInfo { prec: number; right?: boolean; arity: 1 | 2 }
const OPS: Record<string, OpInfo> = {
  '+': { prec: 1, arity: 2 },
  '-': { prec: 1, arity: 2 },
  '*': { prec: 2, arity: 2 },
  '/': { prec: 2, arity: 2 },
  '%': { prec: 2, arity: 2 },
  '^': { prec: 4, right: true, arity: 2 },
  /* Unary minus is its own opcode so `-2^2` parses as -(2^2), matching every
   * calculator a learner has ever used. */
  'u-': { prec: 3, right: true, arity: 1 },
  'u+': { prec: 3, right: true, arity: 1 },
}

const ID_START = /[A-Za-z_]/
const ID_PART = /[A-Za-z0-9_]/

export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  /* Whether the next '-' is binary (after a value) or unary (anywhere else). */
  let prevIsValue = false

  while (i < src.length) {
    const c = src[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }

    if (c >= '0' && c <= '9') {
      let j = i
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++
      if (src[j] === '.') { j++; while (j < src.length && src[j] >= '0' && src[j] <= '9') j++ }
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1
        if (src[k] === '+' || src[k] === '-') k++
        if (src[k] >= '0' && src[k] <= '9') { k++; while (k < src.length && src[k] >= '0' && src[k] <= '9') k++; j = k }
      }
      const v = Number(src.slice(i, j))
      if (!Number.isFinite(v)) throw new ExpressionError(`'${src.slice(i, j)}' is not a usable number.`)
      out.push({ k: 'num', v })
      i = j
      prevIsValue = true
      continue
    }

    /* A bare '.' leading a number: .5 */
    if (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
      let j = i + 1
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++
      out.push({ k: 'num', v: Number(src.slice(i, j)) })
      i = j
      prevIsValue = true
      continue
    }

    if (ID_START.test(c)) {
      let j = i
      while (j < src.length && ID_PART.test(src[j])) j++
      const name = src.slice(i, j)
      /* Lookahead past spaces: `sqrt (x)` is still a call. */
      let k = j
      while (k < src.length && src[k] === ' ') k++
      if (src[k] === '(') {
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
          throw new ExpressionError(`'${name}' is not a function this board can compute.`)
        }
        out.push({ k: 'fn', v: name })
        prevIsValue = false
      } else {
        out.push({ k: 'id', v: name })
        prevIsValue = true
      }
      i = j
      continue
    }

    if (c === '(') { out.push({ k: '(' }); i++; prevIsValue = false; continue }
    if (c === ')') { out.push({ k: ')' }); i++; prevIsValue = true; continue }
    if (c === ',') { out.push({ k: ',' }); i++; prevIsValue = false; continue }

    if (c === '*' && src[i + 1] === '*') { out.push({ k: 'op', v: '^' }); i += 2; prevIsValue = false; continue }

    if (c === '+' || c === '-') {
      out.push({ k: 'op', v: prevIsValue ? c : (c === '-' ? 'u-' : 'u+') })
      i++
      prevIsValue = false
      continue
    }

    if (c === '*' || c === '/' || c === '^' || c === '%') {
      out.push({ k: 'op', v: c })
      i++
      prevIsValue = false
      continue
    }

    throw new ExpressionError(`'${c}' is not something a formula may contain.`)
  }

  return out
}

/** Parse to RPN. Throws ExpressionError on anything malformed. */
export function compile(source: string): CompiledExpression {
  if (typeof source !== 'string' || !source.trim()) throw new ExpressionError('The formula was empty.')
  if (source.length > 500) throw new ExpressionError('The formula was too long to be a formula.')

  const tokens = tokenize(source)
  if (!tokens.length) throw new ExpressionError('The formula was empty.')

  const out: Token[] = []
  const stack: Token[] = []
  /* Argument counters, one per open function call, so arity is checked at
   * parse time rather than discovered as a NaN at render time. */
  const argc: number[] = []

  for (const t of tokens) {
    if (t.k === 'num' || t.k === 'id') { out.push(t); continue }

    if (t.k === 'fn') { stack.push(t); argc.push(1); continue }

    if (t.k === ',') {
      while (stack.length && stack[stack.length - 1].k !== '(') out.push(stack.pop()!)
      if (!stack.length) throw new ExpressionError('A comma appeared outside a function call.')
      if (!argc.length) throw new ExpressionError('A comma appeared outside a function call.')
      argc[argc.length - 1]++
      continue
    }

    if (t.k === 'op') {
      const info = OPS[t.v]
      while (stack.length) {
        const top = stack[stack.length - 1]
        if (top.k !== 'op') break
        const ti = OPS[top.v]
        if (ti.prec > info.prec || (ti.prec === info.prec && !info.right)) out.push(stack.pop()!)
        else break
      }
      stack.push(t)
      continue
    }

    if (t.k === '(') { stack.push(t); continue }

    if (t.k === ')') {
      while (stack.length && stack[stack.length - 1].k !== '(') out.push(stack.pop()!)
      if (!stack.length) throw new ExpressionError('A closing bracket had no opening bracket.')
      stack.pop()
      const top = stack[stack.length - 1]
      if (top && top.k === 'fn') {
        const fn = FUNCTIONS[top.v]
        const given = argc.pop() ?? 0
        if (given !== fn.arity) {
          throw new ExpressionError(`${top.v}() takes ${fn.arity} value${fn.arity === 1 ? '' : 's'}, not ${given}.`)
        }
        out.push(stack.pop()!)
      }
      continue
    }
  }

  while (stack.length) {
    const t = stack.pop()!
    if (t.k === '(') throw new ExpressionError('An opening bracket was never closed.')
    if (t.k === 'fn') throw new ExpressionError('A function call was never closed.')
    out.push(t)
  }

  /* Shape check: simulate the stack depth so a malformed RPN is rejected here
   * rather than producing undefined at evaluation time. */
  let depth = 0
  for (const t of out) {
    if (t.k === 'num' || t.k === 'id') depth++
    else if (t.k === 'op') { const a = OPS[t.v].arity; depth -= a; if (depth < 0) throw new ExpressionError('The formula is missing a value.'); depth++ }
    else if (t.k === 'fn') { const a = FUNCTIONS[t.v].arity; depth -= a; if (depth < 0) throw new ExpressionError('The formula is missing a value.'); depth++ }
  }
  if (depth !== 1) throw new ExpressionError('The formula does not reduce to a single value.')

  const deps: string[] = []
  for (const t of out) {
    if (t.k === 'id' && !Object.prototype.hasOwnProperty.call(CONSTANTS, t.v) && deps.indexOf(t.v) < 0) deps.push(t.v)
  }

  return { rpn: out, deps, source }
}

/** Evaluate against a scope. Returns null when the result is not a real,
 *  finite number, or when an identifier is unbound. Never throws. */
export function evaluate(expr: CompiledExpression, scope: Record<string, number>): number | null {
  const st: number[] = []
  for (const t of expr.rpn) {
    if (t.k === 'num') { st.push(t.v); continue }
    if (t.k === 'id') {
      const v = Object.prototype.hasOwnProperty.call(CONSTANTS, t.v)
        ? CONSTANTS[t.v]
        : (Object.prototype.hasOwnProperty.call(scope, t.v) ? scope[t.v] : undefined)
      if (typeof v !== 'number' || !Number.isFinite(v)) return null
      st.push(v)
      continue
    }
    if (t.k === 'op') {
      const info = OPS[t.v]
      if (info.arity === 1) {
        const a = st.pop()
        if (a === undefined) return null
        st.push(t.v === 'u-' ? -a : a)
      } else {
        const b = st.pop(), a = st.pop()
        if (a === undefined || b === undefined) return null
        let r: number
        switch (t.v) {
          case '+': r = a + b; break
          case '-': r = a - b; break
          case '*': r = a * b; break
          case '/': r = b === 0 ? NaN : a / b; break
          case '%': r = b === 0 ? NaN : a % b; break
          case '^': r = Math.pow(a, b); break
          default: return null
        }
        st.push(r)
      }
      continue
    }
    if (t.k === 'fn') {
      const f = FUNCTIONS[t.v]
      const args: number[] = []
      for (let i = 0; i < f.arity; i++) {
        const v = st.pop()
        if (v === undefined) return null
        args.unshift(v)
      }
      st.push(f.fn(...args))
      continue
    }
  }
  if (st.length !== 1) return null
  const r = st[0]
  return Number.isFinite(r) ? r : null
}

/** Compile + evaluate in one step. Returns null on any failure. */
export function tryEvaluate(source: string, scope: Record<string, number>): number | null {
  try {
    return evaluate(compile(source), scope)
  } catch {
    return null
  }
}

export function knownFunctions(): string[] { return Object.keys(FUNCTIONS) }
export function knownConstants(): string[] { return Object.keys(CONSTANTS) }
