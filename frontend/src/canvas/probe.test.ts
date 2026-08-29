/*
 * TEMPORARY PROBE — deliberately failing, to answer one question with
 * evidence rather than by reading YAML: does a red frontend suite BLOCK a
 * merge? Deleted as soon as the answer is recorded.
 */
import { expect, it } from 'vitest'

it('fails on purpose to test the merge gate', () => {
  expect(1).toBe(2)
})
