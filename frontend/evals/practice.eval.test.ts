/**
 * P11-T4/T5 — the evaluation gate for practice-question generation.
 *
 * OFFLINE BY DEFAULT, AND THAT IS ENFORCED RATHER THAN INTENDED
 * ------------------------------------------------------------
 * Every input is a recorded fixture, so this costs nothing and returns the same
 * verdict every run. `fetch` is replaced with a throwing stub for the duration
 * of the suite, so a future edit that reaches for a live provider fails here
 * instead of quietly adding a bill to every pull request. A comment saying "this
 * runs offline" is a promise; the stub is a guard.
 *
 * NO NEW METRICS
 * --------------
 * `precision` and `citationSupports` already exist in `src/websearch`. Writing a
 * second scorer would give this repository two numbers that mean almost the same
 * thing, disagree at the edges, and force every future reader to work out which
 * one to trust.
 *
 * DETERMINISTIC FIRST, ALWAYS
 * ---------------------------
 * `validatePractice` decides structure. Only the responses that survive it are
 * scored for whether their solution is supported by the cited source. A model is
 * never the only judge of anything decidable.
 *
 * THE ORACLE IS THE DATASET, NOT THE CODE
 * ---------------------------------------
 * Each case states what must happen -- `accept`, and where it applies
 * `supported` -- written from the requirement. Scoring measures agreement with
 * THAT. A baseline recorded from whatever the code returned on the day would
 * test only that the code equals itself.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { citationSupports, precision } from '../src/websearch/quality'
import baseline from '../../ci/baselines/llm.json'
import dataset from './practice/cases.json'
import { validatePractice } from './validators/practice'

interface Case {
  readonly id: string
  readonly why: string
  readonly accept: boolean
  readonly supported?: boolean
  readonly source: string
  readonly response: unknown
}

const CASES = dataset.cases as readonly Case[]

const realFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error(
      'The practice evaluation made a network call. It is fixture-driven on ' +
        'purpose: a live provider would cost money on every pull request and ' +
        'would make the verdict depend on a temperature.',
    )
  }) as typeof fetch
})
afterAll(() => {
  globalThis.fetch = realFetch
})

describe('practice-question evaluation', () => {
  it('carries both verdicts, so neither threshold is vacuous', () => {
    /*
     * A dataset of only-bad cases is passed by a validator that rejects
     * everything; a dataset of only-good cases is passed by one that accepts
     * everything. Precision reaches 1.0 against either, which is why the shape
     * of the dataset is asserted before any score derived from it.
     */
    expect(CASES.filter((c) => c.accept).length).toBeGreaterThan(0)
    expect(CASES.filter((c) => !c.accept).length).toBeGreaterThan(0)
  })

  it('every case explains why it is in the set', () => {
    /* A fixture nobody can justify is the one that gets deleted to go green. */
    for (const c of CASES) expect(c.why.length, c.id).toBeGreaterThan(30)
  })

  it('structural agreement does not fall below the baseline', () => {
    const judged = CASES.map((c) => (validatePractice(c.response).length === 0) === c.accept)

    /* Named individually before the aggregate: a single ratio tells you the
       suite got worse, never which case changed its mind. */
    for (const [i, c] of CASES.entries()) {
      expect(judged[i], `${c.id}: ${c.why}`).toBe(true)
    }

    const score = precision(judged)
    expect(score).toBeDefined()
    expect(score).toBeGreaterThanOrEqual(baseline.practice.structuralPrecision)
  })

  it('citation agreement does not fall below the baseline', () => {
    const stated = CASES.filter((c) => typeof c.supported === 'boolean')
    expect(stated.length).toBeGreaterThan(1)

    const judged = stated.map((c) => {
      const body = c.response as { fullSolution?: unknown }
      const claim = typeof body.fullSolution === 'string' ? body.fullSolution : ''
      return citationSupports(claim, c.source) === c.supported
    })

    for (const [i, c] of stated.entries()) {
      expect(judged[i], `${c.id}: ${c.why}`).toBe(true)
    }

    const score = precision(judged)
    expect(score).toBeDefined()
    expect(score).toBeGreaterThanOrEqual(baseline.practice.citationPrecision)
  })

  it('every accepted case is rejected once any required field is removed', () => {
    /*
     * THE SWEEP, and it is what makes six fixtures worth more than six checks.
     *
     * Six hand-written cases can only ever catch six defects. Deleting each
     * required field from each accepted case turns them into 4 x N derived
     * cases that no one had to write, and every one of them must be REJECTED.
     *
     * It is also the honest reading of "more examples, not a second suite":
     * the same validator, the same fixtures, more inputs. A separate nightly
     * suite would be a second thing to maintain and the one nobody reads.
     */
    const required = ['questionText', 'options', 'correctOption', 'fullSolution'] as const
    let checked = 0

    for (const c of CASES.filter((x) => x.accept)) {
      const body = c.response
      if (typeof body !== 'object' || body === null) continue

      for (const field of required) {
        const spoiled: Record<string, unknown> = { ...(body as Record<string, unknown>) }
        delete spoiled[field]
        expect(
          validatePractice(spoiled).length,
          `${c.id} without ${field} was accepted, so the field is not required in practice`,
        ).toBeGreaterThan(0)
        checked += 1
      }
    }

    /* A loop over an empty list passes silently and proves nothing, which is the
       same vacuity the dataset-shape test guards against one level up. */
    expect(checked).toBeGreaterThanOrEqual(required.length)
  })

  it('the baseline is not being rewritten by the run it judges', () => {
    /*
     * The failure mode this whole file exists to avoid: a gate that regenerates
     * its own expectations cannot fail, and reads as coverage while proving
     * that the code equals itself. The numbers are pinned here so a silent edit
     * to the baseline file is a failing test rather than a quieter gate.
     */
    expect(baseline.practice.structuralPrecision).toBe(1)
    expect(baseline.practice.citationPrecision).toBe(1)
    expect(baseline.practice.cases).toBe(CASES.length)
  })
})
