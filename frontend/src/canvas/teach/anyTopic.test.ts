import { describe, expect, it } from 'vitest'

import { authorConcept } from './concept'
import {
  implausiblyFast,
  itemTable,
  neverReached,
  summarise,
  type ItemVerdict,
  type SeedRun,
} from './matrix'
import type { LessonModel } from './authorLesson'

/*
 * ANY TOPIC. NOT SIX TOPICS.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `conceptProbe.test.ts` measures six questions across six subjects. Six is a
 * SAMPLE, and a sample can never establish a universal -- "any topic" is not a
 * score, it is a property. This file is the closest checkable approximation:
 * a matrix that deliberately reaches OUTSIDE anything the repository has ever
 * seen, so a curriculum lock, a topic whitelist, or a pre-authored-lesson
 * requirement would show up as a refusal here and nowhere else.
 *
 * THE BUG CLASS IT GUARDS
 * -----------------------
 * "A valid educational request refused because the topic is outside the
 * predefined curriculum or knowledge model." That must never silently return.
 *
 * Searched before writing this, and recorded because a negative result is a
 * finding: `grep -rniE "syllabus|curriculum|unsupported|whitelist"` across
 * `src/canvas` returns prose comments and rendering code only. There is no
 * topic lookup, no chapter list and no supported-subject check anywhere in the
 * authoring path. The gate is `validateLesson` + `conceptIssues`, and both
 * judge SHAPE, never subject.
 *
 * So the refusals measured so far were never curriculum locks. This matrix
 * exists to keep it that way, and to catch the day somebody adds one.
 *
 * WHAT COUNTS AS A PASS
 * ---------------------
 * A concept that clears the gate. NOT "the model said something" -- that is
 * the failure this whole codebase exists to prevent.
 *
 * A refusal is only acceptable when its reason is about SHAPE. A refusal whose
 * reason mentions the subject, the syllabus, or a missing lesson is the bug,
 * and the assertion below names it.
 */

function env(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  return typeof v === 'string' ? v : ''
}

const ENDPOINT = env('VITE_PROBE_ENDPOINT')
const MODEL = env('VITE_PROBE_MODEL') || 'openai/gpt-oss-120b'
const KEY = env('VITE_PROBE_KEY')

/**
 * The matrix. Every row is a kind of request, not a subject — the point is the
 * SHAPE of the ask, because a system that only handles "what is X?" is a
 * lesson generator, not a teacher.
 */
const MATRIX: readonly { readonly kind: string; readonly ask: string }[] = [
  { kind: 'known syllabus topic', ask: 'Why does heating a gas raise its pressure?' },
  { kind: 'unknown topic', ask: 'Teach me Rust ownership.' },
  { kind: 'new subject', ask: 'Explain this legal concept: consideration in contract law.' },
  { kind: 'random technical', ask: 'What is a Fourier transform?' },
  { kind: 'non-textbook', ask: 'How does a CPU execute an instruction?' },
  { kind: 'very simple', ask: 'Teach me percent.' },
  { kind: 'very advanced', ask: 'Teach me something about topology.' },
  { kind: 'cross-domain', ask: 'Connect entropy in physics to entropy in information theory.' },
  { kind: 'code question', ask: 'Why does a SQL query with GROUP BY reject a bare column?' },
  { kind: 'problem solving', ask: 'How do I solve a quadratic by completing the square?' },
  { kind: 'misconception', ask: 'Why is it wrong to say heavier objects fall faster?' },
  { kind: 'why question', ask: 'Why does inflation happen?' },
  { kind: 'how question', ask: 'How does gradient descent find a minimum?' },
  { kind: 'teach me', ask: 'Teach me Bayesian inference.' },
  { kind: 'prerequisite', ask: 'What should I learn before studying relativity?' },
  { kind: 'curiosity', ask: 'Why is the sky blue at noon and red at sunset?' },
]

/**
 * THE SEEDS, AND WHY THERE IS A LIST RATHER THAN NONE.
 *
 * Before this existed, `authorConcept` derived the route seed from the
 * question and the harness had no way to name it. Two things then moved
 * between runs -- the change under test, and the route -- and no arithmetic
 * afterwards separates them. That is why the previous two 14/16 results could
 * not be compared: one run, asked two questions at once.
 *
 * Held still, the comparisons become single-variable:
 *
 *   same seed, before vs after   measures the change, nothing else
 *   different seeds, same code   measures route variance, nothing else
 *
 * `VITE_PROBE_SEEDS=1,2,3` runs three. One seed is one sample of a randomised
 * system, so a run of one reports a standard deviation of 0 and that 0 means
 * "not measured", never "no variance".
 */
const SEEDS: readonly number[] = (env('VITE_PROBE_SEEDS') || '1')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n))

/** Words that would mean the system refused for the WRONG reason. */
const CURRICULUM_EXCUSES = /syllabus|curriculum|not supported|unsupported|no lesson|outside the|not in (our|the) (list|catalog|database)|unknown subject/i

function httpModel(): LessonModel {
  return async (system, user, prior) => {
    const messages: { role: string; content: string }[] = [{ role: 'system', content: system }]
    if (prior !== undefined) messages.push({ role: 'assistant', content: prior })
    messages.push({ role: 'user', content: user })
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0, max_tokens: 2000 }),
    })
    if (r.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 15_000))
      return httpModel()(system, user, prior)
    }
    if (!r.ok) throw new Error(`${MODEL}: HTTP ${r.status}`)
    const b = (await r.json()) as { choices?: { message?: { content?: string } }[] }
    return String(b.choices?.[0]?.message?.content ?? '')
  }
}

describe.skipIf(ENDPOINT === '')('any topic, not six topics', () => {
  it(
    'teaches across the whole matrix, and never refuses for a curriculum reason',
    async () => {
      /*
       * HEARTBEAT FIRST, AND THE RUN DOES NOT START WITHOUT ONE.
       *
       * A model id is a hard dependency on a third party who can retire it
       * without telling anyone, and nothing here was taking its pulse. When
       * `llama-3.3-70b-versatile` was withdrawn, every one of sixteen items
       * came back `HTTP 404` and the suite reported PASS -- the withdrawal
       * COLOURED the result instead of stopping it.
       *
       * `system-design-primer` states the shape: heartbeats between the active
       * and the passive server, and the passive takes over when the heartbeat
       * stops. There is no passive model here yet, so this does the half that
       * matters most -- it refuses to report a number it cannot stand behind.
       *
       * One trivial prompt, before sixteen expensive ones.
       */
      try {
        await httpModel()('Reply with the single word: ok', 'ok')
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        throw new Error(
          `heartbeat failed, so no measurement was attempted: ${why}\n` +
            `The configured model is ${MODEL}. A withdrawn or misspelled model ` +
            `id looks exactly like a system that cannot teach, and the whole ` +
            `point of stopping here is that those two must never be confused.`,
        )
      }

      const started = Date.now()
      const runs: SeedRun[] = []

      for (const seed of SEEDS) {
        const items: ItemVerdict[] = []
        for (const row of MATRIX) {
          try {
            const r = await authorConcept(httpModel(), row.ask, [], [], seed)
            items.push({
              item: `[${row.kind}] ${row.ask}`,
              ok: r.ok,
              why: r.ok ? '' : r.issues.map((i) => `${i.path}: ${i.message}`).join(' | '),
              // `authorConcept` already distinguishes "nothing answered" from
              // "the answer was refused" and carries the provider's own message
              // here. Dropping it is what turned `HTTP 404: that model does not
              // exist` into `the model could not be reached`.
              unreachable: r.ok ? undefined : r.unreachable,
            })
          } catch (error) {
            items.push({
              item: `[${row.kind}] ${row.ask}`,
              ok: false,
              why: '',
              unreachable: error instanceof Error ? error.message : String(error),
            })
          }
        }
        runs.push({ seed, items })
      }

      /*
       * THE TABLE IS THE EVIDENCE. THE TOTAL IS A HEADLINE.
       *
       * Printed on every run, per seed, because the earlier 2-fixed/2-broken
       * finding lived only in the per-item detail and the identical ratios
       * erased it.
       */
      const spread = summarise(runs)
      console.log(`\n=== ANY TOPIC (${MODEL}) ===`)
      for (const run of runs) {
        console.log(`\n  --- seed ${run.seed} ---`)
        console.log(
          itemTable(run.items)
            .split('\n')
            .map((line) => `  ${line.slice(0, 260)}`)
            .join('\n'),
        )
      }
      console.log(
        `\n  taught : ${spread.passes.join(', ')} of ${MATRIX.length}` +
          ` over ${SEEDS.length} seed(s)` +
          `  mean ${spread.mean.toFixed(2)} +/- ${spread.std.toFixed(2)}`,
      )

      const results = runs.flatMap((run) =>
        run.items.map((item) => ({ ask: item.item, ok: item.ok, why: item.why })),
      )

      /*
       * THE ASSERTION THAT MATTERS, AND IT IS NOT THE SCORE.
       *
       * A shape refusal is the gate working -- it is why nothing untaught
       * reaches a learner. A CURRICULUM refusal is the bug: the system
       * declining because it has never seen the subject before. The score is
       * printed for a human to read; this is what fails the build.
       */
      const curriculumRefusals = results.filter((r) => !r.ok && CURRICULUM_EXCUSES.test(r.why))
      expect(
        curriculumRefusals.map((r) => `${r.ask} -> ${r.why}`),
        'a valid educational request was refused for a curriculum reason',
      ).toEqual([])

      /*
       * AND THE RUN HAS TO HAVE HAPPENED.
       *
       * This is NOT the score creeping back in. The check above can only fire
       * on words in a refusal, and "the model could not be reached" has none of
       * them -- so a run where nothing answered satisfied it completely. That
       * is what happened: sixteen items, sixteen `HTTP 404`s because the model
       * id in the config had been withdrawn, and a green suite.
       *
       * A shape refusal still passes, as it must. Only the ABSENCE of an answer
       * fails, because a run that measured nothing is not evidence either way.
       */
      const unreached = neverReached(runs)
      expect(
        unreached.map((v) => `${v.item} -> ${v.unreachable ?? ''}`),
        'the model was never reached, so this run measured nothing at all',
      ).toEqual([])

      /*
       * AND IT HAS TO HAVE TAKEN LONG ENOUGH TO BE REAL.
       *
       * The check above catches the failure already seen, because the provider
       * announced it. This catches the ones that will not announce themselves
       * -- a cache, a fake left wired in, a mock answering instantly -- because
       * all of them produce individually plausible output and only the
       * arithmetic gives them away. The run that prompted all of this took
       * 972ms for sixteen items.
       */
      const elapsed = Date.now() - started
      const attempted = runs.flatMap((run) => run.items)
      expect(
        implausiblyFast(attempted, elapsed),
        `${attempted.length} generations finished in ${elapsed}ms, which is too ` +
          `fast to have happened; nothing was really measured`,
      ).toBe(false)
    },
    45 * 60 * 1000,
  )
})

describe('the gate judges shape, never subject', () => {
  /*
   * Runs with NO model, so it guards the property in CI too.
   *
   * The whole authoring path is `authorConcept` -> `validateLesson` +
   * `conceptIssues`. Neither takes a subject, a syllabus, a chapter or a topic
   * id -- there is nowhere for a curriculum lock to live. This asserts that by
   * construction rather than by reading the code once and hoping.
   */
  it('accepts an invented subject nobody has ever taught', async () => {
    const concept = {
      id: 'zylthic-drift',
      question: 'What is zylthic drift?',
      technicalTerms: [{ term: 'drift', introducedIn: 'shown' }],
      blocks: [
        {
          id: 'says-what',
          kind: 'prose',
          emphasis: 'primary',
          tone: 'neutral',
          role: 'definition',
          depth: 'core',
          body: 'Zylthic drift is the slow sideways movement of a zylthic layer.',
          terms: [{ text: 'sideways', mark: 'key' }],
        },
        {
          id: 'shown',
          kind: 'table',
          emphasis: 'supporting',
          tone: 'neutral',
          role: 'framework',
          depth: 'core',
          columns: [
            { key: 'year', label: 'Year', type: 'text' },
            { key: 'moved', label: 'Moved', type: 'text' },
          ],
          rows: [
            { year: '1', moved: '2 cm' },
            { year: '2', moved: '4 cm' },
          ],
        },
      ],
      relations: [{ kind: 'supports', from: 'says-what', to: 'shown' }],
      checkpoint: 'How far would a zylthic layer drift in three years at that rate?',
      next: [
        { id: 'a', label: 'What makes a zylthic layer drift at all' },
        { id: 'b', label: 'How drift rate is measured over time' },
      ],
    }

    const said: string[] = []
    const model: LessonModel = async () => {
      said.push('asked')
      return JSON.stringify(concept)
    }
    const result = await authorConcept(model, 'What is zylthic drift?')

    if (!result.ok) throw new Error(`refused an invented subject: ${JSON.stringify(result.issues)}`)
    expect(result.lesson.id).toBe('zylthic-drift')
    expect(said).toHaveLength(1)
  })
})
