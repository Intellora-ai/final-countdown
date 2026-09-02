/**
 * READING WHAT IS INSIDE A TOPIC. Read-only, by design.
 *
 * THE RUNTIME NEVER WRITES A KNOWLEDGE MODEL. Curriculum knowledge is canonical
 * content: it is generated offline, checked, versioned and committed, and a
 * change to it shows up in a diff a person can argue with. Student state --
 * what she has been taught, what she has said, what is on her canvas -- lives
 * in the database and changes constantly. Mixing the two would mean a student's
 * session could quietly rewrite what a topic contains for everybody.
 *
 * So this file loads files and nothing else. There is no `save`, and there is
 * not going to be one.
 *
 * A CANDIDATE IS NEVER RETURNED. `status: 'candidate'` means "produced and not
 * yet checked by a person". The whole point of the layer is that no component,
 * including a model, is the sole source of truth for what a topic contains, and
 * a candidate is exactly a model's unchecked word.
 */

import { KnowledgeFile, type KnowledgeModel } from './schema'

/**
 * Every knowledge file in the repository, read at build time.
 *
 * UNDER `src/data/`, BESIDE THE GENERATED CURRICULUM, and not under
 * `frontend/data/`. That second directory is gitignored -- correctly, because
 * it holds the identity secret and a student's real work -- so canonical
 * curriculum knowledge placed there would never be version-controlled, never
 * appear in a diff, and never be reviewable. Which half of the product a file
 * belongs to decides where it lives: this is canonical content, so it lives
 * with the curriculum.
 *
 * `eager` because these are small, static, and needed the moment a canvas
 * opens: a student who has waited for a lesson should not then wait for the
 * list of what the lesson is about.
 */
const FILES = import.meta.glob('../data/knowledge/**/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>

/** Built once. A malformed file is REPORTED, never silently skipped. */
function readAll(): { models: Map<string, KnowledgeModel>; broken: string[] } {
  const models = new Map<string, KnowledgeModel>()
  const broken: string[] = []
  for (const [path, contents] of Object.entries(FILES)) {
    const parsed = KnowledgeFile.safeParse(contents)
    if (!parsed.success) {
      broken.push(`${path}: ${parsed.error.issues[0]?.message ?? 'unreadable'}`)
      continue
    }
    for (const model of parsed.data.models) {
      /* LAST ONE WINS, AND THAT IS A BUG WORTH SEEING rather than a merge
         worth doing: two files claiming one topic means the generator ran
         twice into different places, and quietly merging them would hide it. */
      if (models.has(model.topicId)) broken.push(`${path}: ${model.topicId} is described twice`)
      models.set(model.topicId, model)
    }
  }
  return { models, broken }
}

const LOADED = readAll()

/**
 * What is inside this topic, or null if nothing verified is known about it.
 *
 * NULL IS AN ORDINARY ANSWER, not a failure. Most of the 3,995 topics have no
 * model yet, and a canvas for one of them opens and teaches exactly as it
 * always did -- it simply says nothing about scope rather than inventing some.
 */
export function knowledgeFor(topicId: string): KnowledgeModel | null {
  const found = LOADED.models.get(topicId)
  if (found === undefined) return null
  return found.status === 'verified' ? found : null
}

/** Files that would not parse. Empty is the expected state; see `load.test.ts`. */
export function brokenKnowledgeFiles(): readonly string[] {
  return LOADED.broken
}

/** How many topics have a checked model. Used by the tests and the build report. */
export function knownTopicCount(): number {
  let n = 0
  for (const model of LOADED.models.values()) if (model.status === 'verified') n += 1
  return n
}
