/* M3 — RETRIEVAL. "LOADING A LESSON RETURNS EXACTLY THAT LESSON'S MEMORY,
 * COMPLETE AND DETERMINISTIC."
 *
 * One sentence, four separable promises, and a proof for each:
 *
 *   EXACTLY        what comes back is byte for byte what went in. Not a value
 *                  that prints the same -- the same value. `0` is not `"0"`,
 *                  `null` is not `{}`, `false` is not missing.
 *   THAT LESSON'S  the record named is the record returned, never a
 *                  neighbour's, however many neighbours there are and however
 *                  awkwardly they are named.
 *   COMPLETE       nothing is dropped on the way through, whatever shape the
 *                  content happens to have.
 *   DETERMINISTIC  the same question gets the same answer every time it is
 *                  asked, and asking does not change the answer.
 *
 * WHY THIS DRIVES THE PRODUCT OVER A SOCKET RATHER THAN CALLING `read()`.
 *
 *   `live.test.ts` already argues this and the argument is not repeated here:
 *   a student never calls a function, she loads a page, and everything between
 *   the socket and the row -- the router, the query parsing, the identity
 *   substitution, the JSON encoding of the response -- is where retrieval has
 *   actually gone wrong before. A store-level proof would have been green
 *   throughout. So the HTTP proofs are the primary ones here.
 *
 *   Two things cannot be reached over HTTP, and both are stated where they are
 *   used rather than hidden: a value containing a CYCLE cannot be serialised by
 *   the caller, so it can never leave a browser; and a record over
 *   `MAX_RECORD_BYTES` is stopped by the transport's own body ceiling before
 *   the record layer ever sees it. Those two get a store-level proof, on a real
 *   SQLite file, for the same reason the rest get an HTTP one: it is the only
 *   surface where the question can be asked at all.
 *
 * WHY THE VALUES ARE DRAWN AND NOT LISTED.
 *
 *   A hand-picked list proves the store handles the cases whoever wrote the
 *   list thought of. `generate.test.ts` draws over the whole storable type --
 *   `null`, `0`, empty strings, empty containers, `Number.MAX_SAFE_INTEGER`,
 *   nested arrays and objects, keys called `__proto__` and `constructor` and
 *   `""`. Every failure below prints its seed, so a counterexample is a
 *   reproduction and not an anecdote.
 *
 *   The hand-picked cases are still here, in their own proof, and they are not
 *   redundant: they are the values a NAIVE store mangles specifically, and
 *   pinning them by name means a regression says WHICH promise broke rather
 *   than "draw 271 failed".
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  aBrowser,
  aTemporaryDirectory,
  startLiveServer,
  type Browser,
  type LiveServer,
} from './live.test.ts'
import { anIdentityPart, aStorableValue, DRAWS, seededRandom } from './generate.test.ts'
import { MAX_RECORD_BYTES, NotStorable, toStoredText } from './record.ts'
import { canvasMemory, type CanvasMemory } from './store.ts'
import { sqliteMemoryStore, type MemoryStore } from './sqliteStore.ts'

/* -------------------------------------------------------------------------- */
/* The numbers this file uses, each with the reason it is that number.         */
/* -------------------------------------------------------------------------- */

/** One tab, so every neighbour proof differs by LESSON and nothing else. */
const ONE_TAB = 'the-tab-this-student-has-open'

/** A lesson nobody has opened. Never written to, anywhere in this file. */
const A_LESSON_NOBODY_HAS_STUDIED = 'a-lesson-nobody-has-studied'

/**
 * How many lessons one student keeps side by side.
 *
 * Two would pass against a store that returns the most recent write, which is
 * the exact defect this proof exists to catch. A dozen makes "it happened to
 * come back right" an unlikely accident rather than a coin toss.
 */
const NEIGHBOURING_LESSONS = 12

/** How many times in a row the same question is asked. */
const REPEATED_READS = 25

/** The field counts a "many fields" record is proved at. Sizes, not one size. */
const FULL_RECORD_FIELD_COUNTS: readonly number[] = [1, 7, 20]

/**
 * Deep enough that anything recursive with a modest limit gives up, and well
 * inside what JSON itself can carry.
 */
const NESTING_DEPTH = 60

/** Comfortably past the ceiling, so the refusal is about size and not rounding. */
const OVER_THE_LIMIT_BY = 64

/** A bound, so a broken generator fails loudly instead of spinning forever. */
const MOST_DRAWS_LOOKING_FOR_LESSON_IDS = 10_000

/**
 * Seeds. Named, fixed, and printed on every failure.
 *
 * One per proof rather than one shared, so that adding a draw to one proof
 * cannot silently change which values a different proof sees.
 */
const SEED_ROUNDTRIP = 20_250_301
const SEED_NEIGHBOURS = 20_250_302
const SEED_COMPLETENESS = 20_250_303
const SEED_DEAD_CHECK = 20_250_304

/** Generous, because CI is slower than a laptop and a timeout is not a finding. */
const A_GENEROUS_TIMEOUT_MS = 120_000

/* -------------------------------------------------------------------------- */
/* Everything opened is closed, and everything written to disk is removed.     */
/* -------------------------------------------------------------------------- */

const startedServers: LiveServer[] = []
const openedStores: MemoryStore[] = []
const temporaryDirectories: string[] = []

afterAll(async () => {
  /* Servers first: a listening socket outlives the process otherwise and the
   * whole suite hangs at the end, which reads as a broken test rather than a
   * missing close. */
  for (const server of startedServers) await server.close()
  for (const store of openedStores) store.close()
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** A real server on a real port, registered for close. */
async function aLiveServer(options: { readonly memoryPath?: string } = {}): Promise<LiveServer> {
  const server = await startLiveServer(options.memoryPath === undefined ? {} : { memoryPath: options.memoryPath })
  startedServers.push(server)
  /* `startLiveServer` puts `memory.db` inside a temp directory of its own; the
   * directory is what has to go, not just the file, because SQLite leaves a
   * `-wal` and a `-shm` beside it. */
  temporaryDirectories.push(join(server.memoryPath, '..'))
  return server
}

/**
 * The store, spoken to directly, on a real file.
 *
 * USED ONLY WHERE HTTP CANNOT ASK THE QUESTION. A cycle cannot be serialised by
 * a caller and a record over the ceiling is refused by the transport first, so
 * those two proofs have no HTTP form. Everything else in this file goes over
 * the socket.
 *
 * `log` is silenced: it is proved where it belongs, and four hundred lines of
 * "memory written" would bury the one line that says which draw failed.
 */
function aMemoryOnDisk(path?: string): { readonly memory: CanvasMemory; readonly path: string } {
  let file = path
  if (file === undefined) {
    const directory = aTemporaryDirectory()
    temporaryDirectories.push(directory)
    file = join(directory, 'memory.db')
  }
  const store = sqliteMemoryStore(file)
  openedStores.push(store)
  return { memory: canvasMemory({ store, log: () => {} }), path: file }
}

/* -------------------------------------------------------------------------- */
/* Helpers that say what "exactly" means.                                      */
/* -------------------------------------------------------------------------- */

/**
 * The exact text a value is.
 *
 * `toEqual` answers "are these the same value". This answers "is this the same
 * ENCODING" -- same keys, same order, same number formatting. A store that
 * rebuilt an object from parts would pass the first and fail this one, and
 * byte-for-byte is the promise that was made.
 */
function asExactText(value: unknown): string {
  const text = JSON.stringify(value)
  return text === undefined ? '<nothing JSON can carry>' : text
}

/** A short, safe rendering of a value for a failure message. */
const MOST_CHARACTERS_IN_A_FAILURE_MESSAGE = 200
function describeValue(value: unknown): string {
  const text = asExactText(value)
  return text.length <= MOST_CHARACTERS_IN_A_FAILURE_MESSAGE
    ? text
    : `${text.slice(0, MOST_CHARACTERS_IN_A_FAILURE_MESSAGE)}… (${text.length} chars)`
}

/** An object built so that awkward keys are OWN KEYS and not a prototype swap. */
function anObjectWithKeys(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  /* `out['__proto__'] = v` runs the setter on Object.prototype and sets the
   * PROTOTYPE, so the key never exists and the hazard is never tested.
   * `Object.fromEntries` defines the property instead. This distinction is the
   * whole reason a `__proto__` proof can be vacuous without anyone noticing. */
  return Object.fromEntries(entries) as Record<string, unknown>
}

/** A chain `depth` levels deep, with something identifiable at the bottom. */
function aNestOf(depth: number): unknown {
  let inner: unknown = { bottom: 'the deepest thing in this record' }
  for (let level = depth; level > 0; level -= 1) inner = { level, inner }
  return inner
}

/**
 * Lesson ids that name genuinely DIFFERENT lessons.
 *
 * TWO RULES FROM `key.ts` ARE OBEYED HERE RATHER THAN TESTED HERE, AND SAYING
 * WHY MATTERS. An id that is only whitespace names nobody and is refused; two
 * ids that TRIM to the same string are ONE lesson by that file's own contract.
 * Keeping either would make this proof accuse the store of a collision the key
 * layer promised and delivered -- that promise is M2's subject, not M3's.
 *
 * The hazards are REQUIRED rather than hoped for: if the generator ever stops
 * producing an id containing the key separator or a percent sign, this throws
 * instead of quietly proving less than it claims.
 */
function distinctLessonIds(rng: () => number, howMany: number, seed: number): readonly string[] {
  const byTrimmedForm = new Map<string, string>()
  let sawTheSeparator = false
  let sawAPercent = false

  for (let attempt = 0; attempt < MOST_DRAWS_LOOKING_FOR_LESSON_IDS; attempt += 1) {
    const drawn = anIdentityPart(rng)
    const trimmed = drawn.trim()
    if (trimmed === '' || byTrimmedForm.has(trimmed)) continue
    /* THE TRIMMED FORM IS WHAT IS USED, NOT THE RAW DRAW.
     *
     * `key.ts` refuses an id that begins or ends with whitespace outright --
     * it used to trim silently, which merged two different tabs into one box
     * and lost the first one's work. This proof is about LESSON ISOLATION over
     * many distinct ids, not about which ids are well formed, and an id the key
     * layer legitimately refuses would fail this test for a reason that has
     * nothing to do with the thing it proves.
     *
     * Nothing is softened by this. Every hazard the generator produces still
     * reaches the store -- the separator ":", percent signs, emoji, quotes,
     * long strings. Only the whitespace EDGES are dropped, and those are
     * asserted as refused in `m2-isolation.test.ts`, which is their subject. */
    byTrimmedForm.set(trimmed, trimmed)
    if (trimmed.includes(':')) sawTheSeparator = true
    if (trimmed.includes('%')) sawAPercent = true
    if (byTrimmedForm.size >= howMany && sawTheSeparator && sawAPercent) break
  }

  if (byTrimmedForm.size < howMany || !sawTheSeparator || !sawAPercent) {
    throw new Error(
      `seed=${seed}: the generator stopped producing the lesson ids this proof needs — ` +
        `${byTrimmedForm.size} distinct, separator=${sawTheSeparator}, percent=${sawAPercent}`,
    )
  }
  return [...byTrimmedForm.values()]
}

/** Write over HTTP and insist the server said it saved. */
async function saved(browser: Browser, lessonId: string, record: unknown, where: string): Promise<void> {
  const response = await browser.writeMemory({ tabId: ONE_TAB, lessonId, record })
  expect(response, `${where}: the write itself was refused`).toEqual({ status: 200, body: { saved: true } })
}

/** Read over HTTP and insist the server answered, returning the record itself. */
async function loaded(browser: Browser, lessonId: string, where: string): Promise<unknown> {
  const response = await browser.readMemory({ tabId: ONE_TAB, lessonId })
  expect(response.status, `${where}: a read is never an error`).toBe(200)
  return response.body['record']
}

/* ========================================================================== */
/* 1. EXACTLY — byte for byte, with no coercion anywhere on the way.          */
/* ========================================================================== */

describe('M3 · exactly what went in is what comes back', () => {
  it('returns every drawn value unchanged, through the real server', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)
    const rng = seededRandom(SEED_ROUNDTRIP)

    /* Counted so that a generator collapsing to one shape cannot make this
     * proof pass while covering a single corner of the type. */
    const shapesSeen = new Set<string>()

    for (let draw = 0; draw < DRAWS; draw += 1) {
      const value = aStorableValue(rng)
      const lessonId = `drawn-lesson-${draw}`
      const where = `seed=${SEED_ROUNDTRIP} draw=${draw} value=${describeValue(value)}`

      shapesSeen.add(
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
      )

      await saved(student, lessonId, value, where)
      const read = await loaded(student, lessonId, where)

      expect(read, `${where}: the value changed on the way through`).toEqual(value)
      expect(asExactText(read), `${where}: the value came back re-encoded`).toBe(asExactText(value))
    }

    /* The proof about the proof. Without this, a generator returning `"a"`
     * forever would report four hundred green round trips. */
    expect(
      [...shapesSeen].sort(),
      `seed=${SEED_ROUNDTRIP}: the draws did not span the storable type`,
    ).toEqual(['array', 'boolean', 'null', 'number', 'object', 'string'])
  }, A_GENEROUS_TIMEOUT_MS)

  it('does not coerce the values a careless store mangles', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    /* EVERY ONE OF THESE IS A REAL FAILURE MODE, NOT DECORATION.
     *
     *   0 / false / ""   falsy. A store using `value || fallback` loses them.
     *   null             a store that "normalises" it hands back {} or "".
     *   [] / {}          a store that treats empty as absent returns nothing.
     *   big integers     a store that round-trips through a float loses digits.
     *   a JSON string    a store that parses twice hands back an object.
     *   ":" and "%"      the key separator and its escape, INSIDE the content.
     *                    A store that builds its key from the record, or that
     *                    percent-decodes what it stored, corrupts these.
     *   "   "            content is not an identifier. `key.ts` trims IDS; a
     *                    store that trims CONTENT has edited a student's work.
     *   __proto__ etc.   ordinary keys that a naive merge drops or, far worse,
     *                    acts on.
     */
    const hazards: readonly (readonly [string, unknown])[] = [
      ['the number zero', 0],
      ['a negative number', -1],
      ['false', false],
      ['true', true],
      ['null', null],
      ['the empty string', ''],
      ['a string of only spaces', '   '],
      ['the empty array', []],
      ['the empty object', {}],
      ['the largest safe integer', Number.MAX_SAFE_INTEGER],
      ['the smallest safe integer', -Number.MAX_SAFE_INTEGER],
      ['a string that is itself JSON', '{"record":{"saved":true},"n":[0,false,null]}'],
      ['a string full of key separators and percent signs', 'a:b%3Ac%%::%25:'],
      ['an array of every falsy shape at once', [0, false, null, '', [], {}]],
      [
        'an object whose keys are the dangerous ones',
        anObjectWithKeys([
          ['__proto__', { polluted: true }],
          ['constructor', 'not a constructor'],
          ['toString', 0],
          ['', 'the empty key'],
          [':', 'the separator as a key'],
          ['valueOf', null],
        ]),
      ],
      ['a record nested far deeper than anything real', aNestOf(NESTING_DEPTH)],
      ['containers holding only empty containers', { a: [], b: {}, c: [[], {}], d: { e: {} } }],
    ]

    for (const [name, value] of hazards) {
      const lessonId = `hazard-${name}`
      await saved(student, lessonId, value, name)
      const read = await loaded(student, lessonId, name)

      expect(read, `${name}: came back as a different value`).toEqual(value)
      /* The stricter half. `toEqual` would accept a rebuilt object with the
       * keys in a new order; this would not, and byte-for-byte was the promise. */
      expect(asExactText(read), `${name}: came back re-encoded`).toBe(asExactText(value))
      expect(typeof read, `${name}: came back as a different type`).toBe(typeof value)
    }

    /* Storing a key called `__proto__` must store a KEY. If the store or the
     * response encoder ever assigns it instead of defining it, this is where a
     * silent prototype poisoning of the whole process shows up. */
    const dangerous = await loaded(student, 'hazard-an object whose keys are the dangerous ones', 'proto')
    expect(Object.keys(dangerous as object)).toContain('__proto__')
    expect(({} as Record<string, unknown>)['polluted'], 'reading a record polluted Object.prototype').toBeUndefined()
  }, A_GENEROUS_TIMEOUT_MS)

  /* ------------------------------------------------------------------------ */

  it('PINS A HOLE: the round-trip assertion in record.ts cannot fire, and values JSON cannot carry are coerced rather than refused', () => {
    /* THIS TEST ASSERTS BEHAVIOUR THAT IS WRONG, ON PURPOSE, AND SAYS SO.
     *
     * `record.ts` line 76 reads `if (back !== text) throw new NotStorable(...)`
     * and its docblock claims that check is what catches `undefined`, a
     * function, a `Map`, a `Date`, `NaN` and a cycle. Measured, four of those
     * six are not caught by it at all, and the check itself is unreachable:
     * `text` is always the OUTPUT of `JSON.stringify`, and re-encoding a parse
     * of canonical JSON reproduces it exactly, for every input. `undefined` and
     * a function are caught one branch earlier, by `text === undefined`; a
     * cycle is caught by the `try` around `JSON.stringify`. Nothing is left for
     * line 76 to catch.
     *
     * The consequence is real and it is a COERCION, which is the one thing this
     * layer promises never to do: a `Date` is stored as a string, a `NaN` as
     * `null`, a `Map` as `{}`, and a key whose value is `undefined` is dropped.
     * None can arrive over HTTP -- JSON has no Date and no NaN -- so no learner
     * is affected today, and the in-process caller is the canvas, which could
     * hand `write()` any of them tomorrow.
     *
     * PINNED, NOT ACCEPTED. When `record.ts` refuses these instead of coercing
     * them, THIS TEST MUST GO RED and must be replaced by its opposite:
     *   expect(() => toStoredText(new Date(0))).toThrow(NotStorable)
     * Rewriting it then is finishing the job. Deleting it to keep a suite green
     * is not.
     */
    const coercedRatherThanRefused: readonly (readonly [string, unknown, string])[] = [
      ['a Date', new Date(0), '"1970-01-01T00:00:00.000Z"'],
      ['NaN', Number.NaN, 'null'],
      ['Infinity', Number.POSITIVE_INFINITY, 'null'],
      ['a Map', new Map([['a', 1]]), '{}'],
      ['a key whose value is undefined', { kept: 1, lost: undefined }, '{"kept":1}'],
      ['a key whose value is a function', { kept: 1, lost: () => 1 }, '{"kept":1}'],
    ]

    for (const [name, value, whatIsActuallyStored] of coercedRatherThanRefused) {
      expect(() => toStoredText(value), `${name}: is now refused — close this pin`).not.toThrow()
      expect(toStoredText(value), `${name}: stored as something other than the pinned form`).toBe(
        whatIsActuallyStored,
      )
    }

    /* And the general statement, drawn rather than listed: for every value the
     * generator produces, and for every hand-picked hazard above, re-encoding a
     * parse is a fixed point. That is why line 76 is dead code and why no test
     * anywhere could be written to catch its removal. */
    const rng = seededRandom(SEED_DEAD_CHECK)
    for (let draw = 0; draw < DRAWS; draw += 1) {
      const value = aStorableValue(rng)
      const text = JSON.stringify(value)
      expect(
        JSON.stringify(JSON.parse(text)),
        `seed=${SEED_DEAD_CHECK} draw=${draw}: re-encoding a parse changed the text, so record.ts:76 IS reachable and this pin is stale`,
      ).toBe(text)
    }

    /* The two branches that DO refuse something, so this file is not merely a
     * complaint: they are asserted, in pairs, alongside the pin. */
    expect(() => toStoredText(undefined)).toThrow(NotStorable)
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(() => toStoredText(cyclic)).toThrow(NotStorable)
  })
})

/* ========================================================================== */
/* 2. THAT LESSON'S — never a neighbour's.                                    */
/* ========================================================================== */

describe('M3 · the lesson asked for is the lesson returned', () => {
  it('keeps many lessons for one student in one tab apart, over generated ids', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)
    const rng = seededRandom(SEED_NEIGHBOURS)
    const lessonIds = distinctLessonIds(rng, NEIGHBOURING_LESSONS, SEED_NEIGHBOURS)

    /* Each record CARRIES the id it belongs to. A cross-read is then not a
     * subtle deep-equality difference somebody has to squint at; it is a record
     * that names a different lesson. */
    const expected = new Map<string, unknown>()
    for (const lessonId of lessonIds) {
      expected.set(lessonId, { belongsTo: lessonId, work: aStorableValue(rng) })
    }

    /* ALL WRITTEN FIRST, THEN ALL READ. Writing and reading one at a time would
     * pass against a store holding exactly one record, which is the shipped
     * defect this whole layer replaces (`teachStore.ts:44`, one key for every
     * lesson there is). */
    for (const lessonId of lessonIds) {
      await saved(student, lessonId, expected.get(lessonId), `seed=${SEED_NEIGHBOURS} lesson=${JSON.stringify(lessonId)}`)
    }

    /* Read in the opposite order to the writes, so "returns the most recent" is
     * wrong on the very first read rather than right on the last. */
    for (const lessonId of [...lessonIds].reverse()) {
      const where = `seed=${SEED_NEIGHBOURS} lesson=${JSON.stringify(lessonId)}`
      const read = await loaded(student, lessonId, where)
      expect(read, `${where}: got a different lesson's memory`).toEqual(expected.get(lessonId))
      expect(asExactText(read), `${where}: came back re-encoded`).toBe(asExactText(expected.get(lessonId)))
      expect(
        (read as { belongsTo?: unknown }).belongsTo,
        `${where}: the record returned says it belongs to another lesson`,
      ).toBe(lessonId)
    }
  }, A_GENEROUS_TIMEOUT_MS)

  it('does not let a lesson written later disturb one written earlier', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    const first = { which: 'the first lesson', kept: [0, false, null, ''] }
    await saved(student, 'physics', first, 'first')

    /* A dozen more lessons for the same student and tab, every one of them a
     * chance for a store keyed on too little to overwrite the first. */
    for (let n = 0; n < NEIGHBOURING_LESSONS; n += 1) {
      await saved(student, `civics-${n}`, { which: `a later lesson ${n}` }, `later ${n}`)
    }

    expect(await loaded(student, 'physics', 'first, afterwards')).toEqual(first)
  }, A_GENEROUS_TIMEOUT_MS)
})

/* ========================================================================== */
/* 3. NEVER STORED IS AN ANSWER, NOT AN ERROR.                                */
/* ========================================================================== */

describe('M3 · a lesson never studied answers, rather than failing', () => {
  it('answers 200 with null for a lesson never written, even beside lessons that were', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    /* Asked BEFORE anything exists and AGAIN after other lessons do, because
     * "the database is empty" and "this lesson is absent" are different facts
     * and only the second is the one being proved. */
    const onAnEmptyStore = await student.readMemory({ tabId: ONE_TAB, lessonId: A_LESSON_NOBODY_HAS_STUDIED })
    expect(onAnEmptyStore).toEqual({ status: 200, body: { record: null } })

    await saved(student, 'a lesson she did study', { real: true }, 'a real lesson')

    const besideARealOne = await student.readMemory({ tabId: ONE_TAB, lessonId: A_LESSON_NOBODY_HAS_STUDIED })
    /* The WHOLE body, not just the record: a 404, an `error` key, or an empty
     * object smuggled in beside the null would each fail here, and each is a
     * different way of telling a student something went wrong when nothing did. */
    expect(besideARealOne).toEqual({ status: 200, body: { record: null } })
  })

  it('answers undefined, not null and not a throw, at the store', () => {
    const { memory } = aMemoryOnDisk()
    const owner = { studentId: 'a-student', tabId: ONE_TAB, lessonId: A_LESSON_NOBODY_HAS_STUDIED }

    expect(memory.read(owner)).toBeUndefined()

    /* THE DISTINCTION THE STORE KEEPS AND HTTP DELIBERATELY GIVES UP.
     *
     * A student who stored `null` and a student who stored nothing are
     * different, and the store says so: `null` against `undefined`. The route
     * folds both to `null` on purpose -- `handler.ts` says why -- so the pair is
     * asserted HERE, where the difference survives, rather than being quietly
     * lost with nobody recording that it was a choice. */
    memory.write({ ...owner, lessonId: 'a lesson where null is the answer' }, null)
    expect(memory.read({ ...owner, lessonId: 'a lesson where null is the answer' })).toBeNull()
    expect(memory.read(owner)).toBeUndefined()
  })

  it('hands back a deliberately stored null over HTTP too, as a value and not as an error', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)
    await saved(student, 'a lesson where null is the answer', null, 'stored null')
    expect(await student.readMemory({ tabId: ONE_TAB, lessonId: 'a lesson where null is the answer' })).toEqual({
      status: 200,
      body: { record: null },
    })
  })
})

/* ========================================================================== */
/* 4. DETERMINISTIC — the same answer every time, and reading changes nothing. */
/* ========================================================================== */

describe('M3 · the same question gets the same answer, and asking changes nothing', () => {
  it('returns byte-identical answers to the same read, over and over', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    const record = {
      mistakes: [{ at: 1, what: '' }, { at: 0, what: null }],
      mastery: 0,
      notes: 'a:b%3Ac',
      nested: aNestOf(NESTING_DEPTH),
    }
    await saved(student, 'a lesson read many times', record, 'determinism')

    const answers: string[] = []
    for (let attempt = 0; attempt < REPEATED_READS; attempt += 1) {
      const response = await student.readMemory({ tabId: ONE_TAB, lessonId: 'a lesson read many times' })
      expect(response.status).toBe(200)
      answers.push(asExactText(response.body))
    }

    /* One distinct answer, and it is the right one. A store that drifted -- a
     * cache that expired, a row rewritten by the read itself, a number
     * reformatted -- produces two entries in this set. */
    expect(new Set(answers).size, 'the same read gave more than one answer').toBe(1)
    expect(answers[0]).toBe(asExactText({ record }))
  }, A_GENEROUS_TIMEOUT_MS)

  it('leaves what is stored untouched by reading it', () => {
    const { memory, path } = aMemoryOnDisk()
    const owner = { studentId: 'a-student', tabId: ONE_TAB, lessonId: 'a lesson read many times' }
    const record = { keep: [0, false, null, '', {}], deep: aNestOf(NESTING_DEPTH) }

    memory.write(owner, record)
    const first = asExactText(memory.read(owner))
    for (let attempt = 0; attempt < REPEATED_READS; attempt += 1) {
      expect(asExactText(memory.read(owner)), `read ${attempt} differed from the first`).toBe(first)
    }

    /* AND THE ROW ITSELF, THROUGH A SECOND CONNECTION. The reads above could in
     * principle all be served from one process's own state; opening the file
     * again asks the DISK whether reading changed anything. */
    const reopened = aMemoryOnDisk(path)
    expect(asExactText(reopened.memory.read(owner))).toBe(first)
    expect(reopened.memory.read(owner)).toEqual(record)
  })

  it('gives a second server on the same file the same answer, which is what a refresh onto another replica is', async () => {
    const first = await aLiveServer()
    const student = aBrowser(first.origin)
    const record = { work: 'done', marks: [0, null, false], where: 'replica one' }
    await saved(student, 'a lesson across two servers', record, 'replica one')

    /* Same file, different process-level server, and the SAME cookie -- because
     * a student who refreshes is the same student, and a proof that used a new
     * browser would be reading a different person's (empty) memory and calling
     * that a pass. */
    const second = await aLiveServer({ memoryPath: first.memoryPath })
    const sameStudentOnTheOtherReplica = aBrowser(second.origin)
    sameStudentOnTheOtherReplica.setIdentity(student.identity())

    const response = await sameStudentOnTheOtherReplica.readMemory({
      tabId: ONE_TAB,
      lessonId: 'a lesson across two servers',
    })
    expect(response).toEqual({ status: 200, body: { record } })
    expect(asExactText(response.body['record'])).toBe(asExactText(record))
  }, A_GENEROUS_TIMEOUT_MS)
})

/* ========================================================================== */
/* 5. COMPLETE — nothing is dropped, whatever the shape.                      */
/* ========================================================================== */

describe('M3 · every field written comes back', () => {
  it('returns every field of a generated record, at several field counts', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)
    const rng = seededRandom(SEED_COMPLETENESS)

    for (const howManyFields of FULL_RECORD_FIELD_COUNTS) {
      /* THE FIELD SET IS DRAWN, NOT WRITTEN DOWN. A record with `whatExplained,
       * howExplained, level, mistakes, mastery, updatedAt` is one shape somebody
       * chose on one day; `record.ts` exists precisely because the store must
       * not care. Generated names are how "does not care" gets tested. */
      const names = new Set<string>()
      for (let attempt = 0; attempt < MOST_DRAWS_LOOKING_FOR_LESSON_IDS && names.size < howManyFields; attempt += 1) {
        names.add(anIdentityPart(rng))
      }
      expect(names.size, `seed=${SEED_COMPLETENESS}: the generator ran out of distinct field names`).toBe(
        howManyFields,
      )

      const record = anObjectWithKeys([...names].map((name) => [name, aStorableValue(rng)] as const))
      const lessonId = `a lesson with ${howManyFields} fields`
      const where = `seed=${SEED_COMPLETENESS} fields=${howManyFields}`

      await saved(student, lessonId, record, where)
      const read = (await loaded(student, lessonId, where)) as Record<string, unknown>

      /* Three separate claims, because "complete" can fail three ways. */
      expect(Object.keys(read).length, `${where}: a field went missing or appeared`).toBe(
        Object.keys(record).length,
      )
      for (const name of Object.keys(record)) {
        expect(Object.keys(read), `${where}: field ${JSON.stringify(name)} was dropped`).toContain(name)
        expect(read[name], `${where}: field ${JSON.stringify(name)} changed`).toEqual(record[name])
      }
      expect(asExactText(read), `${where}: the record came back re-encoded`).toBe(asExactText(record))
    }
  }, A_GENEROUS_TIMEOUT_MS)
})

/* ========================================================================== */
/* 6. REFUSED RATHER THAN HALF-STORED.                                        */
/*                                                                            */
/* THE MOST IMPORTANT PROOF IN THIS FILE. A store that refuses a record is    */
/* honest and a person can act on it. A store that half-writes one has told a */
/* student her work is saved and will hand her a corrupted afternoon back.    */
/* ========================================================================== */

describe('M3 · a record that cannot be stored is refused, and changes nothing', () => {
  it('refuses an oversized record over HTTP and leaves the previous one exactly intact', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    const precious = {
      marker: 'the-work-that-must-survive',
      mistakes: [{ at: 0, what: '' }, { at: 1, what: null }],
      deep: aNestOf(NESTING_DEPTH),
    }
    await saved(student, 'a lesson with real work in it', precious, 'the good write')
    const before = asExactText(await loaded(student, 'a lesson with real work in it', 'before'))

    const tooBig = 'x'.repeat(MAX_RECORD_BYTES + OVER_THE_LIMIT_BY)
    const refusal = await student.writeMemory({
      tabId: ONE_TAB,
      lessonId: 'a lesson with real work in it',
      record: tooBig,
    })

    /* REFUSED, AND THE REFUSAL IS THE CALLER'S TO ACT ON.
     *
     * The status is asserted as a CLIENT error rather than pinned to 400, and
     * that is a measurement, not a shrug: `MAX_BODY_BYTES` in `index.ts` and
     * `MAX_RECORD_BYTES` in `record.ts` are both 256 KB, and a record over the
     * record ceiling is always inside a body over the body ceiling, so the
     * transport answers 413 "request too large" first and `NotStorable`'s
     * message about bytes can never reach a browser. Which of two equal
     * ceilings fires first is an implementation fact; that the write is refused
     * in words and nothing is stored is the promise. Pinning 400 here would
     * pin the fact, not the promise. The dead ceiling is reported as a finding
     * rather than asserted away.
     */
    expect(refusal.status, 'an unstorable record was not refused as the caller’s mistake').toBeGreaterThanOrEqual(400)
    expect(refusal.status, 'an unstorable record was reported as a server failure').toBeLessThan(500)
    expect(typeof refusal.body['error'], 'the refusal did not say what was wrong').toBe('string')
    expect(refusal.body['saved'], 'the refusal claimed a save').not.toBe(true)

    /* THE HALF-WRITE CHECK. Byte for byte, not merely "still an object". */
    const after = asExactText(await loaded(student, 'a lesson with real work in it', 'after'))
    expect(after, 'a refused write damaged the record that was already there').toBe(before)

    /* AND ON DISK, THROUGH A SECOND SERVER ON THE SAME FILE, because "still
     * intact" served from one process's own state is not the claim. */
    const second = await aLiveServer({ memoryPath: server.memoryPath })
    const sameStudent = aBrowser(second.origin)
    sameStudent.setIdentity(student.identity())
    const fromTheOtherReplica = await sameStudent.readMemory({
      tabId: ONE_TAB,
      lessonId: 'a lesson with real work in it',
    })
    expect(fromTheOtherReplica).toEqual({ status: 200, body: { record: precious } })
  }, A_GENEROUS_TIMEOUT_MS)

  it('refuses a write with nothing to store, in words, and keeps the previous record', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    const precious = { marker: 'still-here', mastery: 0, mistakes: [] }
    await saved(student, 'a lesson with real work in it', precious, 'the good write')

    /* A PUT that names the lesson and carries no record at all. This is the one
     * unstorable value that DOES reach `record.ts` over HTTP, so it is the one
     * that proves the order inside `store.ts`: validate, then write. If those
     * two lines were swapped, the row below would already be gone. */
    const refusal = await student.writeMemory({ tabId: ONE_TAB, lessonId: 'a lesson with real work in it' })

    expect(refusal.status, 'a write with nothing in it was not refused as a bad request').toBe(400)
    expect(typeof refusal.body['error'], 'the refusal did not say what was wrong').toBe('string')
    expect(String(refusal.body['error']).length, 'the refusal was empty words').toBeGreaterThan(0)
    expect(refusal.body['saved']).not.toBe(true)

    expect(await loaded(student, 'a lesson with real work in it', 'after')).toEqual(precious)
  }, A_GENEROUS_TIMEOUT_MS)

  it('refuses, at the store, every record that cannot survive the round trip, and leaves the disk untouched', () => {
    /* THE TWO CASES HTTP CANNOT ASK. A cycle cannot be serialised by a caller,
     * so it can never leave a browser; a record over `MAX_RECORD_BYTES` is
     * stopped by the transport's own ceiling first. Both are still real for the
     * in-process caller -- the canvas holds live objects -- so they are proved
     * on a real file rather than left unproved because HTTP cannot reach them. */
    const { memory, path } = aMemoryOnDisk()
    const owner = { studentId: 'a-student', tabId: ONE_TAB, lessonId: 'a lesson with real work in it' }

    const precious = { marker: 'the-work-that-must-survive', notes: ['', null, 0, false] }
    memory.write(owner, precious)
    const before = asExactText(memory.read(owner))
    expect(before).toBe(asExactText(precious))

    const cyclic: Record<string, unknown> = { marker: 'poison' }
    cyclic['self'] = cyclic
    const unstorable: readonly (readonly [string, unknown])[] = [
      ['a record with a cycle in it', cyclic],
      ['a record past the ceiling', 'x'.repeat(MAX_RECORD_BYTES + OVER_THE_LIMIT_BY)],
      ['nothing at all', undefined],
    ]

    for (const [name, value] of unstorable) {
      expect(() => memory.write(owner, value), `${name}: was accepted`).toThrow(NotStorable)
      /* AFTER EVERY SINGLE REFUSAL, not once at the end: a store that damaged
       * the row on the first attempt and restored it on the third would pass a
       * check made only at the end. */
      expect(asExactText(memory.read(owner)), `${name}: a refused write damaged what was there`).toBe(before)
    }

    /* And the file itself, through a connection that shares none of the first
     * one's state. */
    const reopened = aMemoryOnDisk(path)
    expect(reopened.memory.read(owner), 'a refused write reached the disk').toEqual(precious)
  })
})

/* ========================================================================== */
/* 7. OVERWRITE IS EXACT — the second value replaces the first, entirely.     */
/* ========================================================================== */

describe('M3 · writing again replaces, and leaves nothing of what was there', () => {
  it('replaces a record completely, with no trace of the one before it', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    const beforeMarker = 'nothing-of-this-may-survive'
    const first = anObjectWithKeys([
      ['marker', beforeMarker],
      ['mistakes', [{ at: 0, what: 'a wrong turn' }]],
      ['onlyInTheFirst', { deep: aNestOf(NESTING_DEPTH) }],
      ['__proto__', { alsoOnlyInTheFirst: true }],
    ])
    await saved(student, 'a lesson written twice', first, 'first write')
    expect(await loaded(student, 'a lesson written twice', 'after the first write')).toEqual(first)

    const second = { marker: 'this-is-the-only-thing-left', mastery: 0 }
    await saved(student, 'a lesson written twice', second, 'second write')
    const read = await loaded(student, 'a lesson written twice', 'after the second write')

    expect(read, 'the second write did not replace the first').toEqual(second)
    expect(asExactText(read)).toBe(asExactText(second))
    /* A STORE THAT MERGED WOULD PASS NEITHER OF THESE. The first is the exact
     * shape; this is the survivor check, and it is deliberately about TEXT --
     * a leftover key nested anywhere at all still shows up here. */
    expect(asExactText(read).includes(beforeMarker), 'something of the first record survived').toBe(false)
    expect(Object.keys(read as object).sort()).toEqual(['marker', 'mastery'])
  }, A_GENEROUS_TIMEOUT_MS)

  it('replaces a record with a value of an entirely different kind', async () => {
    const server = await aLiveServer()
    const student = aBrowser(server.origin)

    /* Object, then scalar, then empty container, then null. Each one is a shape
     * a store that assumes "records are objects" would mangle, and the last two
     * are the shapes a store that treats empty or null as "no change" would
     * silently refuse to apply. */
    const inTurn: readonly unknown[] = [
      { a: 1, b: [2, 3] },
      0,
      false,
      '',
      [],
      {},
      null,
      { back: 'to an object' },
    ]

    for (const value of inTurn) {
      await saved(student, 'a lesson written many times', value, describeValue(value))
      const read = await loaded(student, 'a lesson written many times', describeValue(value))
      expect(read, `${describeValue(value)}: the overwrite did not take`).toEqual(value)
      expect(asExactText(read)).toBe(asExactText(value))
    }
  }, A_GENEROUS_TIMEOUT_MS)
})
