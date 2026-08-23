import { describe, expect, it } from 'vitest'

import type { Tool } from '../kernel/contracts'
import toolsSource from './tools.ts?raw'
import {
  calculator,
  chain,
  createRegistry,
  evaluate,
  fileTools,
  recover,
  run,
  validate,
  type FileSource,
  type SimpleSchema,
} from './tools'

const okTool = (name: string, value: unknown, effectful = false): Tool => ({
  name,
  description: `returns ${value}`,
  effectful,
  schema: { type: 'object', properties: {} } satisfies SimpleSchema,
  async run() {
    return { ok: true, value }
  },
})

describe('the calculator computes, and never executes', () => {
  it('does not use eval or new Function anywhere in the module', () => {
    /* THE POINT OF WRITING A PARSER INSTEAD OF ONE LINE OF eval().
       The expression reaching this tool was produced by a language model
       reading user text. `eval` there is arbitrary code execution with a
       language model as the attacker's proxy. Asserted against the SOURCE so
       nobody can reintroduce it as a "temporary simplification". */
    const code = toolsSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(code).not.toMatch(/\beval\s*\(/)
    expect(code).not.toMatch(/new\s+Function\s*\(/)
  })

  it.each([
    ['2+2', 4],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['10 / 4', 2.5],
    ['2 ^ 10', 1024],
    ['2 ^ 3 ^ 2', 512], // right-associative
    ['-5 + 3', -2], // unary minus
    ['17.5 / 100 * 2400', 420],
    ['7 % 3', 1],
  ])('evaluates %s to %s', (expr, want) => {
    expect(evaluate(expr)).toBeCloseTo(want, 9)
  })

  it.each([
    'process.exit(1)',
    'require("fs")',
    '__proto__',
    '2 +',
    '(2 + 3',
    '2 + 3)',
    '1/0',
    '',
  ])('refuses %s rather than producing a number', (expr) => {
    expect(() => evaluate(expr)).toThrow()
  })

  it('reports a bad expression as bad-args, not as an unavailable calculator', async () => {
    /* Classified this way, recovery rewrites the expression. Classified as
       unavailable, it would give up on arithmetic entirely. */
    const result = await calculator.run({ expression: 'banana' })
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('bad-args')
  })

  it('returns the exact value through the registry', async () => {
    const r = createRegistry([calculator])
    expect(await run(r, 'calculator', { expression: '17.5 / 100 * 2400' })).toEqual({ ok: true, value: 420 })
  })
})

describe('argument validation happens before execution', () => {
  it('rejects a missing required argument', () => {
    const schema: SimpleSchema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }
    expect(validate(schema, {})).toEqual(['missing required "a"'])
  })

  it('rejects a wrong type', () => {
    const schema: SimpleSchema = { type: 'object', properties: { n: { type: 'number' } } }
    expect(validate(schema, { n: 'five' })[0]).toContain('should be number')
  })

  it('rejects an unknown argument rather than dropping it', () => {
    /* Same reasoning as the canvas LessonSpec being `.strict()`: a silently
       dropped argument lets the caller believe it was honoured. */
    const schema: SimpleSchema = { type: 'object', properties: { a: { type: 'string' } } }
    expect(validate(schema, { a: 'x', colour: 'red' })[0]).toContain('unknown argument "colour"')
  })

  it('never runs the tool when arguments are invalid', async () => {
    let ran = false
    const spy: Tool = {
      name: 'spy',
      description: 'x',
      effectful: false,
      schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } satisfies SimpleSchema,
      async run() {
        ran = true
        return { ok: true }
      },
    }
    const result = await run(createRegistry([spy]), 'spy', {})
    expect(ran).toBe(false)
    expect(result.failure).toBe('bad-args')
  })
})

describe('effectful tools are gated', () => {
  it('refuses an effectful tool without permission', async () => {
    const r = createRegistry([okTool('deploy', 'shipped', true)])
    const result = await run(r, 'deploy', {})
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('denied')
  })

  it('runs it when permitted', async () => {
    const r = createRegistry([okTool('deploy', 'shipped', true)])
    expect((await run(r, 'deploy', {}, { allowEffects: true })).ok).toBe(true)
  })

  it('checks permission BEFORE validating arguments', async () => {
    /* A malformed delete is still an attempt to delete. Reporting `bad-args`
       first would tell the caller "fix the arguments and it will run", which
       is the wrong lesson about a tool it may not use at all. */
    const gated: Tool = {
      name: 'rm',
      description: 'x',
      effectful: true,
      schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } satisfies SimpleSchema,
      async run() {
        return { ok: true }
      },
    }
    expect((await run(createRegistry([gated]), 'rm', {})).failure).toBe('denied')
  })
})

describe('a throwing tool never collapses the caller', () => {
  it('converts an exception into a typed failure', async () => {
    const bomb: Tool = {
      name: 'bomb',
      description: 'x',
      effectful: false,
      schema: { type: 'object', properties: {} } satisfies SimpleSchema,
      async run() {
        throw new Error('kaboom')
      },
    }
    const result = await run(createRegistry([bomb]), 'bomb', {})
    expect(result.ok).toBe(false)
    expect(result.error).toBe('kaboom')
    /* UNAVAILABLE, not TRANSIENT --- an exception is evidence of a bug, not
       of weather, and retrying it just reruns a deterministic crash. */
    expect(result.failure).toBe('unavailable')
  })

  it('reports a missing tool rather than throwing', async () => {
    expect((await run(createRegistry(), 'ghost', {})).failure).toBe('not-found')
  })
})

describe('retry is reserved for transient failures', () => {
  function flaky(failures: number, failure: 'transient' | 'bad-args') {
    let calls = 0
    const tool: Tool = {
      name: 'flaky',
      description: 'x',
      effectful: false,
      schema: { type: 'object', properties: {} } satisfies SimpleSchema,
      async run() {
        calls++
        return calls <= failures ? { ok: false, error: 'later', failure } : { ok: true, value: calls }
      },
    }
    return { tool, calls: () => calls }
  }

  it('retries a transient failure and succeeds', async () => {
    const f = flaky(1, 'transient')
    const result = await run(createRegistry([f.tool]), 'flaky', {}, { attempts: 3 })
    expect(result.ok).toBe(true)
    expect(f.calls()).toBe(2)
  })

  it('does NOT retry bad-args', async () => {
    /* Retrying malformed arguments reproduces them exactly. */
    const f = flaky(5, 'bad-args')
    await run(createRegistry([f.tool]), 'flaky', {}, { attempts: 5 })
    expect(f.calls()).toBe(1)
  })

  it('stops after the attempt budget', async () => {
    const f = flaky(99, 'transient')
    await run(createRegistry([f.tool]), 'flaky', {}, { attempts: 3 })
    expect(f.calls()).toBe(3)
  })
})

describe('recovery picks a different action per failure class', () => {
  it.each([
    ['transient', 'retry'],
    ['bad-args', 'fix-args'],
    ['not-found', 'try-another'],
    ['unavailable', 'try-another'],
    ['denied', 'ask-user'],
  ] as const)('%s → %s', (failure, action) => {
    expect(recover({ ok: false, failure, error: 'e' }).action).toBe(action)
  })

  it('NEVER routes around a denial', () => {
    /* A denial is a decision a human made. An agent that works around it has
       overridden that human, which is worse than failing the task. */
    expect(recover({ ok: false, failure: 'denied' }, true).action).toBe('ask-user')
  })

  it('gives up once an alternative has already been tried', () => {
    expect(recover({ ok: false, failure: 'not-found' }, true).action).toBe('give-up')
  })

  it('maps every failure class to some action', () => {
    for (const failure of ['transient', 'bad-args', 'not-found', 'unavailable', 'denied'] as const) {
      expect(recover({ ok: false, failure }).why.length).toBeGreaterThan(10)
    }
  })
})

describe('chaining', () => {
  const doubler = (name: string): Tool => ({
    name,
    description: 'doubles n',
    effectful: false,
    schema: { type: 'object', properties: { n: { type: 'number' } }, required: ['n'] } satisfies SimpleSchema,
    async run(args) {
      return { ok: true, value: (args as { n: number }).n * 2 }
    },
  })

  it('feeds each result into the next call', async () => {
    const r = createRegistry([doubler('a'), doubler('b')])
    const out = await chain(r, [
      { tool: 'a', args: () => ({ n: 3 }) },
      { tool: 'b', args: (prev) => ({ n: prev as number }) },
    ])
    expect(out.ok).toBe(true)
    expect(out.value).toBe(12)
  })

  it('stops at the first failure instead of computing on a hole', async () => {
    const r = createRegistry([doubler('a'), doubler('b')])
    let reached = false
    const out = await chain(r, [
      { tool: 'a', args: () => ({ n: 'not a number' }) },
      {
        tool: 'b',
        args: (prev) => {
          reached = true
          return { n: prev as number }
        },
      },
    ])
    expect(out.ok).toBe(false)
    expect(reached).toBe(false)
  })

  it('returns the partial trace so recovery can see how far it got', async () => {
    /* This is what makes "recover from partial state" possible rather than
       restarting the whole chain. */
    const r = createRegistry([doubler('a'), doubler('b')])
    const out = await chain(r, [
      { tool: 'a', args: () => ({ n: 3 }) },
      { tool: 'b', args: () => ({ n: 'bad' }) },
    ])
    expect(out.attempts).toHaveLength(2)
    expect(out.attempts[0]?.result.ok).toBe(true)
    expect(out.attempts[1]?.result.failure).toBe('bad-args')
  })
})

describe('registry', () => {
  it('refuses a duplicate name rather than silently replacing', () => {
    /* Silent replacement is how a test double survives into production. */
    const r = createRegistry([okTool('a', 1)])
    expect(() => r.register(okTool('a', 2))).toThrow(/already registered/)
  })

  it('selects tools by what they are for', () => {
    const r = createRegistry([calculator, ...fileTools({ read: async () => null, list: async () => [] })])
    expect(r.select('calculate a percentage')[0]?.name).toBe('calculator')
    expect(r.select('read the file the user gave me')[0]?.name).toMatch(/file/)
  })

  it('returns nothing when no tool fits', () => {
    expect(createRegistry([calculator]).select('book me a flight')).toEqual([])
  })
})

describe('file tools', () => {
  const files: Record<string, string> = {
    'notes.md': 'inflation is a rise in prices\nmeasured by CPI',
    'other.txt': 'nothing relevant here',
  }
  const source: FileSource = {
    async read(path) {
      return files[path] ?? null
    },
    async list() {
      return Object.keys(files)
    },
  }

  it('reads a provided file', async () => {
    const r = createRegistry(fileTools(source))
    const out = await run(r, 'read_file', { path: 'notes.md' })
    expect(out.ok).toBe(true)
    expect(String(out.value)).toContain('CPI')
  })

  it('reports a missing file as not-found', async () => {
    const r = createRegistry(fileTools(source))
    expect((await run(r, 'read_file', { path: 'ghost.md' })).failure).toBe('not-found')
  })

  it('finds the matching lines with their locations', async () => {
    const r = createRegistry(fileTools(source))
    const out = await run(r, 'search_files', { query: 'CPI' })
    expect(out.value).toEqual([{ path: 'notes.md', line: 2, text: 'measured by CPI' }])
  })

  it('treats "found nothing" as success, not failure', async () => {
    /* Conflating them makes recovery retry a search that correctly reported
       absence --- and then report the absence as a tool problem. */
    const r = createRegistry(fileTools(source))
    const out = await run(r, 'search_files', { query: 'zzzz' })
    expect(out.ok).toBe(true)
    expect(out.value).toEqual([])
  })
})
