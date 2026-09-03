/**
 * THE SHELF DRIVER -- the thin, per-decision glue the equivalence engine needs.
 *
 * The engine (scripts/assurance/equivalence.mjs) is generic: it reads the
 * contract's distinguishing pairs and asks the driver to (a) seed an artifact
 * for one member of a pair and (b) issue the other member and report which
 * artifact was served. Everything shelf-specific -- how to wire the handler,
 * how to phrase a request so it reads as a given `asked`, how to read the
 * served artifact id -- lives here, and nowhere else. A second decision brings
 * its own small driver; the engine does not change.
 *
 * The wiring mirrors src/laws/intentShape.test.ts (the S9 shelf laws): a real
 * SQLite store, the real handler, the real lessons/aliases shelves.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

import { createHandler, type ModelPort, type SearchPort } from '../../../server/handler.ts'
import { subjectAliases } from '../../../server/memory/aliases.ts'
import { writtenLessons } from '../../../server/memory/lessons.ts'
import { canvasMemory } from '../../../server/memory/store.ts'
import { sqliteMemoryStore } from '../../../server/memory/sqliteStore.ts'
import type { Ask } from '../../canvas/teach/intent.ts'

const RECIPE = 'assurance-shelf-recipe'
const SECRET = 'assurance-shelf-secret-not-used-anywhere-real'
const NAMES = (subject: string) =>
  JSON.stringify({ action: 'START_LESSON', target: subject, reason: 'named the subject', sourceNeeded: false })

interface Fields { readonly subject: string; readonly asked: string }

/** A distinguishing pair's `asked` directive, mapped to the Ask kind the shelf
    stores and `readTheAsk` reads. */
function askKind(asked: string): Ask {
  switch (asked) {
    case 'explain': return 'teach'
    case 'why': return 'why'
    case 'define': return 'define'
    case 'example': return 'example'
    case 'practice': return 'practice'
    case 'compare': return 'compare'
    default: return 'teach'
  }
}

/** A phrasing that `readTheAsk` reads as the pair's `asked`. */
function phrasing(fields: Fields): string {
  switch (askKind(fields.asked)) {
    case 'why': return `why does ${fields.subject} happen`
    case 'define': return `define ${fields.subject}`
    case 'example': return `give me an example of ${fields.subject}`
    case 'practice': return `quiz me on ${fields.subject}`
    case 'compare': return `${fields.subject} vs atmospheric pressure`
    default: return `explain ${fields.subject}`
  }
}

const aLesson = (subject: string): unknown => ({ id: `l-${subject}`, blocks: [] })

interface Env {
  reinit(): void
  keep(subject: string, written: { route: string; lesson: unknown; at: string; asked: Ask }): void
  learn(context: string, said: string, subject: string): void
  freshLearner(): void
  post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>>
  close(): void
}

function makeEnv(): Env {
  const scratch = mkdtempSync(join(tmpdir(), 'assurance-shelf-'))
  let n = 0
  let store = sqliteMemoryStore(join(scratch, `db-${n}.db`))
  let lessons = writtenLessons(store, RECIPE)
  let aliases = subjectAliases(store, RECIPE)
  let cookie = ''
  const search: SearchPort = { search: async () => [] }
  const model: ModelPort = {
    lesson: async () => { throw new Error('assurance: no whole lesson is authored here') },
    decide: async () => NAMES('gravity'),
    chat: async () => { throw new Error('assurance: the writer is refused; a miss must not be a shelf hit') },
  }
  let handle = createHandler({ model, search, memory: canvasMemory({ store, log: () => {} }), identitySecret: SECRET, lessons, aliases })

  const env: Env = {
    reinit() {
      store.close()
      n += 1
      store = sqliteMemoryStore(join(scratch, `db-${n}.db`))
      lessons = writtenLessons(store, RECIPE)
      aliases = subjectAliases(store, RECIPE)
      handle = createHandler({ model, search, memory: canvasMemory({ store, log: () => {} }), identitySecret: SECRET, lessons, aliases })
      cookie = ''
    },
    keep: (subject, written) => { lessons.keep(subject, written) },
    learn: (context, said, subject) => { aliases.learn(context, said, subject, new Date().toISOString()) },
    freshLearner: () => { cookie = '' },
    post: async (path, body) => {
      const res = await handle({ method: 'POST', path, query: '', ...(cookie === '' ? {} : { cookie }), body })
      if (res.setCookie !== undefined) cookie = res.setCookie.split(';')[0] ?? ''
      return (res.body ?? {}) as Record<string, unknown>
    },
    close: () => { store.close(); rmSync(scratch, { recursive: true, force: true }); vi.unstubAllGlobals() },
  }
  return env
}

export const shelfDriver = {
  decision: 'shelf_lookup',
  async newEnv(): Promise<Env> { return makeEnv() },
  async reset(env: Env): Promise<void> { env.reinit() },
  /** Put an artifact for `a` on the shelf; return its stable id (the route). */
  async seed(env: Env, a: Fields): Promise<string> {
    const route = `route-${askKind(a.asked)}`
    env.keep(a.subject, { route, lesson: aLesson(a.subject), at: new Date().toISOString(), asked: askKind(a.asked) })
    return route
  },
  /** Ask for `b` as a fresh learner; return the served artifact id, or null if
      the writer was asked (a miss). `_seededId` lets a bugged stand-in reuse. */
  async ask(env: Env, b: Fields, _seededId: string): Promise<string | null> {
    env.freshLearner()
    env.learn('ask', phrasing(b), b.subject)
    const body = await env.post('/api/ask', { question: phrasing(b), topicId: b.subject, classId: '10' })
    return typeof body['route'] === 'string' ? (body['route'] as string) : null
  },
  close(env: Env): void { env.close() },
}
