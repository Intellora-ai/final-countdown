import type { Tool, ToolResult } from '../kernel/contracts'

/**
 * TOOL SELECTION, EXECUTION, CHAINING AND RECOVERY.
 *
 * THE RULE THAT SHAPES THIS WHOLE FILE
 * ------------------------------------
 * Arguments are validated BEFORE execution, always, and a validation failure
 * is a `bad-args` result rather than a thrown error. That single decision is
 * what makes recovery possible: a thrown exception tells the caller that
 * something went wrong, while a typed failure tells it WHICH KIND of wrong,
 * and only one kind of wrong is worth retrying unchanged.
 *
 * Blind retry is the default failure behaviour in most agent code and it is
 * wrong for three of the five failure classes. Retrying `bad-args` reproduces
 * the same bad arguments. Retrying `denied` asks a second time to do something
 * that is not permitted. Retrying `not-found` looks for the same missing thing.
 * Only `transient` is a genuine "try again", and separating it out is the
 * difference between recovering and looping.
 */

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export interface Registry {
  register(tool: Tool): void
  get(name: string): Tool | undefined
  list(): readonly Tool[]
  /** Tools whose description matches the need, best first. */
  select(need: string, limit?: number): readonly Tool[]
}

export function createRegistry(seed: readonly Tool[] = []): Registry {
  const tools = new Map<string, Tool>()
  for (const t of seed) tools.set(t.name, t)

  return {
    register(tool) {
      /* Replacing a registered tool silently is how a test double survives
         into production. Names are unique and collisions are loud. */
      if (tools.has(tool.name)) {
        throw new Error(`tool "${tool.name}" is already registered`)
      }
      tools.set(tool.name, tool)
    },
    get: (name) => tools.get(name),
    list: () => [...tools.values()],
    select(need, limit = 3) {
      const want = new Set(need.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
      return [...tools.values()]
        .map((t) => {
          const has = new Set(`${t.name} ${t.description}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
          let hits = 0
          for (const w of want) if (has.has(w)) hits++
          return { t, score: hits }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.t)
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Argument validation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A deliberately small JSON Schema subset: object, required, and the five
 * primitive types.
 *
 * Small because the alternative is pulling in a full validator for a job whose
 * entire purpose is "did the model send a string where a number goes". zod is
 * already a dependency and could do this --- it is not used here because tool
 * schemas have to be serialisable to send to a model, and a zod schema is code.
 */
export interface SimpleSchema {
  type: 'object'
  properties: Record<string, { type: 'string' | 'number' | 'boolean' | 'array' | 'object'; description?: string }>
  required?: readonly string[]
}

export function validate(schema: unknown, args: unknown): string[] {
  const s = schema as SimpleSchema
  if (!s || s.type !== 'object' || typeof s.properties !== 'object') return []
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    return ['arguments must be an object']
  }
  const given = args as Record<string, unknown>
  const problems: string[] = []

  for (const key of s.required ?? []) {
    if (!(key in given) || given[key] === undefined) problems.push(`missing required "${key}"`)
  }
  for (const [key, spec] of Object.entries(s.properties)) {
    if (!(key in given) || given[key] === undefined) continue
    const actual = Array.isArray(given[key]) ? 'array' : typeof given[key]
    if (actual !== spec.type) {
      problems.push(`"${key}" should be ${spec.type}, got ${actual}`)
    }
  }
  /* Unknown keys are reported for the same reason the canvas LessonSpec is
     `.strict()`: a silently dropped argument lets the caller believe it was
     honoured, and the next attempt keeps sending it. */
  for (const key of Object.keys(given)) {
    if (!(key in s.properties)) problems.push(`unknown argument "${key}"`)
  }
  return problems
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

export interface RunOptions {
  /** Attempts for a `transient` failure. 1 means "no retry". */
  attempts?: number
  /** Effectful tools need permission. Absent means "not allowed". */
  allowEffects?: boolean
}

export interface Attempt {
  tool: string
  args: unknown
  result: ToolResult
}

/**
 * Run one tool, safely.
 *
 * Never throws. A tool that throws is converted to a typed failure, because a
 * registry of third-party callbacks WILL contain one that throws, and a single
 * unhandled rejection collapsing a ten-step task is precisely the failure the
 * brief calls out: "Do not allow one failed tool call ... to collapse the
 * whole task."
 */
export async function run(
  registry: Registry,
  name: string,
  args: unknown,
  opts: RunOptions = {},
): Promise<ToolResult> {
  const tool = registry.get(name)
  if (!tool) {
    return { ok: false, error: `no tool named "${name}"`, failure: 'not-found' }
  }

  /* THE GATE, BEFORE ANY SIDE EFFECT. An effectful tool that runs without
     permission cannot be un-run, so this is checked before validation --- a
     malformed delete is still a delete attempt. */
  if (tool.effectful && !opts.allowEffects) {
    return {
      ok: false,
      error: `"${name}" changes the world and was not permitted to run`,
      failure: 'denied',
    }
  }

  const problems = validate(tool.schema, args)
  if (problems.length > 0) {
    return { ok: false, error: problems.join('; '), failure: 'bad-args' }
  }

  const attempts = Math.max(1, opts.attempts ?? 2)
  let last: ToolResult = { ok: false, error: 'not run', failure: 'unavailable' }

  for (let i = 0; i < attempts; i++) {
    try {
      last = await tool.run(args)
    } catch (e) {
      last = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        /* An exception is UNAVAILABLE, not TRANSIENT. Transient means "the
           same call may work next time", and a thrown error is evidence of a
           bug, not of weather. Classifying it as transient would retry a
           deterministic crash. */
        failure: 'unavailable',
      }
    }
    if (last.ok) return last
    /* The only class worth repeating unchanged. */
    if (last.failure !== 'transient') return last
  }
  return last
}

/**
 * Run tools in sequence, feeding each result into the next arguments.
 *
 * STOPS AT THE FIRST FAILURE AND REPORTS THE PARTIAL RUN.
 *
 * Continuing past a failed step means later steps compute on a value that does
 * not exist, and the chain returns a confident answer built on a hole. The
 * partial trace is returned rather than discarded so recovery can see exactly
 * how far it got --- which is what makes "recover from partial state" possible
 * instead of restarting.
 */
export async function chain(
  registry: Registry,
  steps: readonly { tool: string; args: (prev: unknown) => unknown }[],
  opts: RunOptions = {},
): Promise<{ ok: boolean; attempts: Attempt[]; value?: unknown }> {
  const attempts: Attempt[] = []
  let prev: unknown = undefined

  for (const step of steps) {
    const args = step.args(prev)
    const result = await run(registry, step.tool, args, opts)
    attempts.push({ tool: step.tool, args, result })
    if (!result.ok) return { ok: false, attempts }
    prev = result.value
  }
  return { ok: true, attempts, value: prev }
}

/* -------------------------------------------------------------------------- */
/* Recovery                                                                   */
/* -------------------------------------------------------------------------- */

export type Recovery =
  | { action: 'retry'; why: string }
  | { action: 'fix-args'; why: string; problems: string }
  | { action: 'try-another'; why: string }
  | { action: 'ask-user'; why: string }
  | { action: 'give-up'; why: string }

/**
 * What to do about a failure --- Capability 25.
 *
 * A pure function of the failure class, which is the point of having the
 * class. Every branch here is a DIFFERENT action; if two classes mapped to the
 * same recovery, one of them would not be worth distinguishing.
 */
export function recover(result: ToolResult, triedAnother = false): Recovery {
  switch (result.failure) {
    case 'transient':
      return { action: 'retry', why: 'the failure was temporary and the same call may succeed' }
    case 'bad-args':
      return {
        action: 'fix-args',
        why: 'the call was malformed; retrying unchanged would reproduce it exactly',
        problems: result.error ?? '',
      }
    case 'not-found':
    case 'unavailable':
      return triedAnother
        ? { action: 'give-up', why: 'no alternative tool worked either' }
        : { action: 'try-another', why: 'this tool cannot serve the request; another might' }
    case 'denied':
      /* NEVER auto-retried and never routed around. A denial is a decision
         someone made, and an agent that works around it has overridden a
         human. Escalating is the only correct move. */
      return { action: 'ask-user', why: 'permission is required and only the user can grant it' }
    default:
      return { action: 'give-up', why: 'unclassified failure; guessing would be worse than stopping' }
  }
}

/* -------------------------------------------------------------------------- */
/* Built-in tools                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Arithmetic, evaluated rather than estimated --- Capability 21.
 *
 * NO `eval`, NO `new Function`. Not for style: those execute arbitrary code
 * from whatever produced the expression, and the thing producing it is a
 * language model reading user text. This is a shunting-yard parser over a
 * closed operator set, so the worst a malicious expression achieves is a
 * parse error.
 */
export function evaluate(expression: string): number {
  const cleaned = expression
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '')
  const tokens = cleaned.match(/\d+\.?\d*|[+\-*/^()%]/g)
  if (!tokens) throw new Error(`nothing to evaluate in "${expression}"`)

  /* EVERY CHARACTER MUST BE CONSUMED.
     Without this the tokenizer silently DROPS whatever it does not recognise,
     and `process.exit(1)` reduces to the tokens `(`, `1`, `)` --- which
     evaluates to 1 and returns it as a confident answer. Nothing is executed,
     so this was never a code-execution hole; it was worse in the way that
     matters here, because a thrown error is visible and a wrong number is not.
     Rejecting unconsumed input is the difference between a parser and a
     filter. */
  if (tokens.join('') !== cleaned) {
    throw new Error(`"${expression}" is not a pure arithmetic expression`)
  }

  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }
  const output: (number | string)[] = []
  const ops: string[] = []

  let expectValue = true
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      output.push(Number(t))
      expectValue = false
      continue
    }
    if (t === '(') {
      ops.push(t)
      expectValue = true
      continue
    }
    if (t === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') output.push(ops.pop() as string)
      if (ops.pop() !== '(') throw new Error('unbalanced parentheses')
      expectValue = false
      continue
    }
    /* Unary minus. Without this, "-5 + 3" parses as a binary minus with no
       left operand and silently produces the wrong answer rather than an
       error, which is the worst of both outcomes. */
    if (t === '-' && expectValue) {
      output.push(0)
      ops.push('-')
      continue
    }
    if (!(t in prec)) throw new Error(`unsupported operator "${t}"`)
    while (
      ops.length > 0 &&
      ops[ops.length - 1] !== '(' &&
      (prec[ops[ops.length - 1] as string] as number) >= (prec[t] as number) &&
      t !== '^' // right-associative
    ) {
      output.push(ops.pop() as string)
    }
    ops.push(t)
    expectValue = true
  }
  while (ops.length > 0) {
    const op = ops.pop() as string
    if (op === '(') throw new Error('unbalanced parentheses')
    output.push(op)
  }

  const stack: number[] = []
  for (const t of output) {
    if (typeof t === 'number') {
      stack.push(t)
      continue
    }
    const b = stack.pop()
    const a = stack.pop()
    if (a === undefined || b === undefined) throw new Error(`malformed expression "${expression}"`)
    switch (t) {
      case '+': stack.push(a + b); break
      case '-': stack.push(a - b); break
      case '*': stack.push(a * b); break
      case '/':
        /* Returning Infinity here would flow into an answer as a number. */
        if (b === 0) throw new Error('division by zero')
        stack.push(a / b)
        break
      case '%': stack.push(a % b); break
      case '^': stack.push(Math.pow(a, b)); break
      default: throw new Error(`unsupported operator "${t}"`)
    }
  }
  const result = stack.pop()
  if (result === undefined || stack.length > 0) throw new Error(`malformed expression "${expression}"`)
  if (!Number.isFinite(result)) throw new Error('result is not a finite number')
  return result
}

export const calculator: Tool = {
  name: 'calculator',
  description: 'Evaluate an arithmetic expression exactly. Use for any calculation, percentage, or numeric comparison.',
  effectful: false,
  schema: {
    type: 'object',
    properties: { expression: { type: 'string', description: 'e.g. "17.5 % 100 * 2400" or "(3+4)*2"' } },
    required: ['expression'],
  } satisfies SimpleSchema,
  async run(args) {
    const { expression } = args as { expression: string }
    try {
      return { ok: true, value: evaluate(expression) }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        /* A bad expression is bad ARGUMENTS, not an unavailable calculator.
           Classified this way, recovery rewrites the expression instead of
           retrying the same one or giving up on arithmetic entirely. */
        failure: 'bad-args',
      }
    }
  },
}

/** Where file tools read from. Injected so nothing here touches a real disk. */
export interface FileSource {
  read(path: string): Promise<string | null>
  list(): Promise<readonly string[]>
}

export function fileTools(source: FileSource): readonly Tool[] {
  return [
    {
      name: 'read_file',
      description: 'Read the full text of one file the user provided.',
      effectful: false,
      schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      } satisfies SimpleSchema,
      async run(args) {
        const { path } = args as { path: string }
        const content = await source.read(path)
        return content === null
          ? { ok: false, error: `no file "${path}"`, failure: 'not-found' }
          : { ok: true, value: content }
      },
    },
    {
      name: 'search_files',
      description: 'Find which provided files mention a term, and the matching lines.',
      effectful: false,
      schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      } satisfies SimpleSchema,
      async run(args) {
        const { query } = args as { query: string }
        const needle = query.toLowerCase()
        const hits: { path: string; line: number; text: string }[] = []
        for (const path of await source.list()) {
          const content = await source.read(path)
          if (content === null) continue
          content.split('\n').forEach((text, i) => {
            if (text.toLowerCase().includes(needle)) hits.push({ path, line: i + 1, text: text.trim() })
          })
        }
        /* An empty result is a SUCCESSFUL search that found nothing, not a
           failure. Conflating them makes recovery retry a search that
           correctly reported absence. */
        return { ok: true, value: hits }
      },
    },
  ]
}
