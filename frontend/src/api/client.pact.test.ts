/**
 * P8-T2 — the consumer contract: what the canvas actually needs from the API.
 *
 * HOW THIS DIFFERS FROM SCHEMATHESIS, WHICH IS THE WHOLE POINT
 * -----------------------------------------------------------
 * Schemathesis asks: does the API obey its OWN schema, for any input?
 * Pact asks:         does the API give this consumer what it actually needs?
 *
 * Those come apart in one specific and expensive way. Suppose `SkillMastery`
 * loses its `state` field and the OpenAPI document is updated in the same
 * commit. Schemathesis stays green -- the API obeys its schema, which no longer
 * mentions `state`. Every response still validates. And the canvas, which reads
 * `state` to decide what to render, breaks in a browser.
 *
 * Pact catches exactly that, because the contract records what the CONSUMER
 * read, not what the provider promised.
 *
 * WHY THE ASSERTIONS ARE ON MATCHERS AND NOT ON LITERAL VALUES
 * -----------------------------------------------------------
 * `like("x")` records "a string is required here", not "the value must be x".
 * A contract pinned to literal values would fail the first time the provider's
 * fixture data changed, which teaches everyone to regenerate contracts without
 * reading them -- and a contract nobody reads enforces nothing.
 *
 * The exception is `state`, pinned to a member of its enum, because the canvas
 * branches on the VALUE there rather than merely on the type.
 */

import { MatchersV3, PactV3 } from '@pact-foundation/pact'
import { describe, expect, it } from 'vitest'

import {
  getHealth,
  getMastery,
  getNextAction,
  listConcepts,
  requestLesson,
} from './client'

const { atLeastOneLike, eachLike, string, integer, decimal } = MatchersV3

/**
 * Contracts land in `pacts/` at the repository root, committed.
 *
 * Committed for the same reason `openapi.json` is: a contract regenerated on
 * every run agrees with the code by construction and can never tell a reviewer
 * that this change altered what the consumer needs.
 */
/**
 * A FRESH provider per interaction, not one shared across the file.
 *
 * `PactV3` ACCUMULATES interactions on the builder, and `executeTest` expects
 * every interaction registered so far to be received during that one run. With
 * a shared instance the sixth test still expected the fifth test's
 * `POST /lessons` and failed with "the following request was expected but not
 * received" -- a failure that looks like a broken client and is a misuse of the
 * builder.
 *
 * Each contract file is merged by consumer/provider name, so separate
 * instances still produce one `learning-canvas-learning-os.json`.
 */
function contract(): PactV3 {
  return new PactV3({
    consumer: 'learning-canvas',
    provider: 'learning-os',
    // `import.meta.url`, not `path.resolve(__dirname, ...)`.
    //
    // This file is type-checked by the BROWSER tsconfig, which has no Node
    // types: `__dirname` is undefined there and `node:path` has no `resolve`,
    // so the obvious spelling failed typecheck with TS2304 and TS2339. Adding
    // @types/node to a browser config to satisfy one test file would hand every
    // component in the project a Node global it must never use.
    //
    // `new URL(relative, import.meta.url)` is ESM-native, typed in the browser
    // lib, and resolves against this file exactly as __dirname would.
    // `decodeURIComponent`, and it is not decoration.
    //
    // `URL.pathname` is PERCENT-ENCODED, so a checkout under a directory whose
    // name contains a space resolves to `.../final%20countdown/...` -- a path
    // that does not exist. Three existing tests in src/websearch and
    // src/practice have this bug today and fail locally for exactly that
    // reason while passing in CI, where the runner path has no spaces.
    //
    // `fileURLToPath` from node:url is the canonical fix and cannot be used
    // here: this file is type-checked by the browser tsconfig, which has no
    // Node types. Decoding does the same job with no new dependency.
    dir: decodeURIComponent(new URL('../../../pacts', import.meta.url).pathname),
    logLevel: 'warn',
  })
}

describe('the canvas needs these things from the Learning OS API', () => {
  it('needs health to report a status and the knowledge version', async () => {
    await contract()
      .given('the service is running')
      .uponReceiving('a request for service health')
      .withRequest({
        method: 'GET',
        path: '/health',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          status: string('ok'),
          database: string('not_configured'),
          knowledge_version: string('python_recursion_v1'),
        },
      })
      .executeTest(async (mock) => {
        const health = await getHealth({ baseUrl: mock.url })
        // Asserted, not merely fetched. A test that calls the client and checks
        // nothing records a contract and proves the client cannot read it.
        expect(health.knowledge_version).toBeTypeOf('string')
        expect(health.status).toBeTypeOf('string')
      })
  })

  it('needs a concept page with a total that counts the collection', async () => {
    await contract()
      .given('the curriculum has concepts')
      .uponReceiving('a request for the first page of concepts')
      .withRequest({
        method: 'GET',
        path: '/concepts',
        query: { limit: '50', offset: '0' },
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          items: eachLike({
            concept_id: string('python.recursion'),
            name: string('Recursion'),
            definition: string('A function defined in terms of itself.'),
            subskill_count: integer(3),
            prerequisites: [],
          }),
          // `total` is separate from `items.length` in the contract because the
          // canvas uses it to decide whether to paginate. A provider that
          // returned the page length here would still satisfy a contract that
          // only recorded the items.
          total: integer(2),
          limit: integer(50),
          offset: integer(0),
        },
      })
      .executeTest(async (mock) => {
        const page = await listConcepts({}, { baseUrl: mock.url })
        expect(page.items.length).toBeGreaterThan(0)
        expect(page.total).toBeTypeOf('number')
        expect(page.items[0]?.concept_id).toBeTypeOf('string')
      })
  })

  it('needs a mastery report carrying the state the canvas branches on', async () => {
    await contract()
      .given('a learner with recorded evidence exists')
      .uponReceiving("a request for a learner's mastery")
      .withRequest({
        method: 'GET',
        path: '/learners/L-contract/mastery',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          learner_id: string('L-contract'),
          skills: eachLike({
            skill_id: string('python.recursion.identify_base_case'),
            estimate: decimal(0.42),
            confidence: decimal(0.31),
            evidence_count: integer(3),
            evidence_diversity: integer(2),
            // PINNED TO THE ENUM, not merely `string`. The canvas branches on
            // this value, so "a string arrived" is not enough -- a provider
            // returning "partially_competent" would satisfy `string()` and
            // render nothing.
            state: MatchersV3.regex(
              'unknown|developing|competent|mastered',
              'developing',
            ),
            last_updated: string('2026-08-25T09:00:00Z'),
          }),
        },
      })
      .executeTest(async (mock) => {
        const report = await getMastery('L-contract', { baseUrl: mock.url })
        expect(report.skills.length).toBeGreaterThan(0)
        expect(['unknown', 'developing', 'competent', 'mastered']).toContain(
          report.skills[0]?.state,
        )
      })
  })

  it('needs the next action, including when there is no skill to teach', async () => {
    await contract()
      .given('a learner with no evidence exists')
      .uponReceiving('a request for what to teach next')
      .withRequest({
        method: 'GET',
        path: '/learners/L-contract/next',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          learner_id: string('L-contract'),
          action: string('diagnose'),
          // `null` is recorded deliberately. `skill_id` is null exactly when
          // there is nothing to teach, and the canvas branches on that. A
          // contract recording only the populated case would let the provider
          // drop the key entirely in the empty case and stay green.
          skill_id: null,
          reason: string('unevidenced'),
        },
      })
      .executeTest(async (mock) => {
        const next = await getNextAction('L-contract', { baseUrl: mock.url })
        expect(next.action).toBeTypeOf('string')
        expect(next.skill_id).toBeNull()
      })
  })

  it('needs an emitted lesson with blocks it can render', async () => {
    await contract()
      .given('the skill python.recursion.identify_base_case exists')
      .uponReceiving('a request to emit a lesson')
      .withRequest({
        method: 'POST',
        path: '/lessons',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: {
          skill_id: 'python.recursion.identify_base_case',
          question: 'Why does a recursive function need a base case?',
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          lesson_id: string('why-does-a-recursive-function-need-a-base-case'),
          target_skill: string('python.recursion.identify_base_case'),
          question: string('Why does a recursive function need a base case?'),
          // `atLeastOneLike`, not `eachLike`. A lesson with no blocks is not
          // a lesson, and a plain `like([])` is satisfied by an empty array --
          // which is exactly the response that would render a blank canvas.
          //
          // `eachLike(template, { min: 1 })` was the first attempt and threw
          // `RangeError: n must be a non-negative number`: the second argument
          // is a COUNT, not an options object. The named matcher says what is
          // meant and cannot be passed the wrong shape.
          blocks: atLeastOneLike({ kind: string('prose') }),
          // `relations` IS A MATCHER, NOT A LITERAL `[]`, AND THAT WAS A BUG.
          //
          // The first version recorded `relations: []`. A literal empty array
          // in a contract does not mean "the canvas ignores this" -- it means
          // "the provider must return an empty list". Verification failed:
          //
          //   $.relations -> Expected an empty List but received
          //                  [{"from":"prose-1","kind":"supports","to":"prose-0"}]
          //
          // The provider was right and the contract was wrong. `eachLike`
          // records the SHAPE the canvas can render without constraining how
          // many arrive, which is what the consumer actually needs.
          relations: eachLike({
            from: string('prose-0'),
            to: string('prose-1'),
            kind: string('supports'),
          }),
        },
      })
      .executeTest(async (mock) => {
        const lesson = await requestLesson(
          {
            skill_id: 'python.recursion.identify_base_case',
            question: 'Why does a recursive function need a base case?',
          },
          { baseUrl: mock.url },
        )
        expect(lesson.blocks.length).toBeGreaterThan(0)
        expect(lesson.target_skill).toBe('python.recursion.identify_base_case')
      })
  })

  it('needs a readable error when a lesson is asked for an unknown skill', async () => {
    await contract()
      .given('the skill python.recursion.not_real does not exist')
      .uponReceiving('a request to emit a lesson for an unknown skill')
      .withRequest({
        method: 'POST',
        path: '/lessons',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: {
          skill_id: 'python.recursion.not_real',
          question: 'Anything?',
        },
      })
      .willRespondWith({
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        // A STRING detail. This is the field whose TYPE was wrong before
        // Phase 7 -- it was an array under a 422 -- and the canvas shows it to
        // a person. Recording it in the contract means the provider cannot
        // change it back without failing verification.
        body: { detail: string("no subskill 'python.recursion.not_real'") },
      })
      .executeTest(async (mock) => {
        await expect(
          requestLesson(
            { skill_id: 'python.recursion.not_real', question: 'Anything?' },
            { baseUrl: mock.url },
          ),
        ).rejects.toThrow(/404/)
      })
  })
})

describe('the client itself', () => {
  it('refuses to call anything when no API is configured', async () => {
    // The default path, and the one that must not change: with VITE_API_BASE
    // unset the canvas behaves exactly as it does today. A client that silently
    // fell back to the current origin would issue requests to `/health` on the
    // app's own host.
    await expect(getHealth({ fetchImpl: fetch })).rejects.toThrow(
      /VITE_API_BASE is not set/,
    )
  })
})
