import { describe, expect, it } from 'vitest'

import { authorConcept } from './concept'
import type { LessonModel } from './authorLesson'

/*
 * DOES THE PER-CONCEPT UNIT ACTUALLY MOVE THE NUMBER?
 *
 * The baseline this exists to beat, measured rather than assumed:
 *
 *   authorLesson, whole lesson, qwen2.5:7b, six subjects -> 0 of 6, mean 223.5s
 *
 * Three prompt structures were tried against that and all three measured zero,
 * which is the evidence that the UNIT was the wall rather than the wording.
 * `concept.ts` changes the unit. This measures whether that was right.
 *
 * WHY THIS IS A REAL `.test.ts` AND NOT A `.probe.ts`
 * ---------------------------------------------------
 * The previous probe was named `authoring.probe.ts`. Vitest's include patterns
 * never matched it, so it collected NOTHING, exited quietly, and was reported
 * as "running" for hours while measuring nothing at all. A measuring tool that
 * cannot run is worse than none, because it produces confidence instead of
 * numbers.
 *
 * So it is collected like every other test, typechecked like every other test,
 * and SKIPS loudly when no model is configured. CI has no model, so CI skips
 * it; a laptop with `VITE_PROBE_ENDPOINT` set runs it. The skip is visible in
 * the run output either way.
 *
 * HOW TO RUN IT
 *
 *   VITE_PROBE_ENDPOINT=https://api.groq.com/openai/v1/chat/completions \
 *   VITE_PROBE_MODEL=llama-3.3-70b-versatile \
 *   VITE_PROBE_KEY=<your key> \
 *   npx vitest run src/canvas/teach/conceptProbe.test.ts
 *
 * The key is read from the environment and never written to this repository.
 */

function env(name: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  return typeof v === 'string' ? v : ''
}

const ENDPOINT = env('VITE_PROBE_ENDPOINT')
const MODEL = env('VITE_PROBE_MODEL') || 'llama-3.3-70b-versatile'
const KEY = env('VITE_PROBE_KEY')

/**
 * Six questions, one per subject kind, because "any topic" is the claim.
 *
 * Deliberately the SAME six the whole-lesson probe used. A different set would
 * make the two numbers incomparable, and the comparison is the entire point.
 */
const QUESTIONS = [
  'Why does adding a partner change the old partners profit share?',
  'Why does a rise in price usually lower the quantity demanded?',
  'How does a bill become a law in India?',
  'Why is the derivative of x squared equal to 2x?',
  'Why does heating a gas raise its pressure?',
  'What makes a hypothesis testable rather than merely plausible?',
]

/** An OpenAI-compatible chat call. Groq, Cerebras, OpenRouter and Mistral all speak it. */
function httpModel(): LessonModel {
  return async (system, user) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        /* Temperature 0 so two runs differ because the CODE changed, not
           because the sampler did. */
        temperature: 0,
        /*
         * A BUDGET, BECAUSE THE DEFAULT ONE TRUNCATES THE JSON MID-OBJECT.
         *
         * `CanvasRoute.tsx` already records this exact failure beside its own
         * call: "the default 1024 tokens truncates the JSON mid-object — which
         * arrives as 'no JSON object at all' and reads as a model failure
         * rather than a budget one."
         *
         * Measured here, twice, before that comment was read: six questions,
         * six refusals, all of them "the reply contained no JSON object" — and
         * not one a teaching failure. A truncated object has an opening brace
         * and no matching close, so `extractJson` correctly returns null and
         * the probe reports a model that cannot teach when what actually
         * happened is that it was cut off mid-sentence.
         *
         * A concept is far smaller than a lesson, so 2000 is generous rather
         * than tight -- the point is that a budget EXISTS, not its exact size.
         */
        max_tokens: 2000,
      }),
    })
    if (!response.ok) throw new Error(`${MODEL}: HTTP ${response.status}`)
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return String(body.choices?.[0]?.message?.content ?? '')
  }
}

describe.skipIf(ENDPOINT === '')('the per-concept unit, against a real model', () => {
  it(
    'measures how many questions produce a concept that passes the gate',
    async () => {
      const outcomes: { question: string; ok: boolean; seconds: number; why: string }[] = []

      for (const question of QUESTIONS) {
        const startedAt = Date.now()
        const result = await authorConcept(httpModel(), question)
        const seconds = (Date.now() - startedAt) / 1000
        outcomes.push({
          question,
          ok: result.ok,
          seconds,
          why: result.ok
            ? ''
            : (result.unreachable ?? result.issues.map((i) => `${i.path}: ${i.message}`).join(' | ')),
        })
      }

      const passed = outcomes.filter((o) => o.ok).length
      const mean = outcomes.reduce((a, o) => a + o.seconds, 0) / outcomes.length

      console.log(`\n=== PER-CONCEPT (${MODEL}) ===`)
      console.log(`  passed the gate : ${passed}/${outcomes.length}`)
      console.log(`  mean seconds    : ${mean.toFixed(1)}`)
      console.log(`  BASELINE        : 0/6, mean 223.5s (authorLesson, whole lesson, qwen2.5:7b)`)
      for (const o of outcomes) {
        console.log(`  ${(o.ok ? 'PASS' : 'REFUSED').padEnd(8)} ${o.seconds.toFixed(1).padStart(6)}s  ${o.question}`)
        if (o.why) console.log(`      ${o.why.slice(0, 200)}`)
      }
      console.log('  A neutral result is a REVERT: complexity that bought nothing is maintained forever.')

      /*
       * Asserts only that the measurement HAPPENED, and this is deliberate.
       * A probe that goes red when a model has a bad day is a probe that gets
       * switched off, and then it measures nothing at all. The numbers above
       * are the finding; a human reads them and decides keep or revert.
       */
      expect(outcomes).toHaveLength(QUESTIONS.length)
    },
    /* Six sequential model calls. Generous, because a timeout that fires
       mid-run destroys the measurement rather than reporting it. */
    30 * 60 * 1000,
  )
})

describe('the probe cannot silently measure nothing', () => {
  /*
   * THE GUARD THE LAST PROBE DIDN'T HAVE.
   *
   * `authoring.probe.ts` was reported as running for hours while vitest was
   * never collecting it. This file is collected -- it is running right now, or
   * you would not be reading this result -- so the only remaining failure mode
   * is a silent skip. That is what this makes visible.
   */
  it('states whether it is configured, so a skip is never mistaken for a pass', () => {
    const configured = ENDPOINT !== ''
    console.log(
      configured
        ? `probe CONFIGURED: ${MODEL}`
        : 'probe SKIPPED: VITE_PROBE_ENDPOINT is unset, so no model was measured',
    )
    expect(typeof configured).toBe('boolean')
  })
})
