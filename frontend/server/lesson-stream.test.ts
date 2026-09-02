import { describe, expect, it } from 'vitest'

import { lessonStream, type StreamEvent } from './lessonStream.ts'
import { gasPressure } from '../src/canvas/lessons/gasPressure.ts'
import { validateLesson } from '../src/canvas/spec/validate.ts'

/**
 * WORDS APPEAR AS THEY ARE WRITTEN. NEVER ALL AT ONCE.
 *
 * The owner's decision (2026-09-02). Today a lesson is one JSON document,
 * validated whole and shown whole: time-to-first-word equals time-to-full-
 * answer, 6-30 s of a blank stage by this repository's own measurements.
 *
 * A model writing constrained JSON writes the lesson in order -- `blocks[0]`
 * closes before `blocks[1]` opens, and a prose block's `body` is a string
 * that grows character by character. This is the reader that turns that
 * order into events:
 *
 *   text      a delta of a `body` string inside the block being written --
 *             shown at once, provisionally, because prose is text
 *   block     a block whose closing brace has arrived AND which passed its
 *             own schema and structural check -- shown for good
 *   rejected  a complete block that failed its own check -- never shown
 *   complete  the whole document, with the whole-lesson verdict
 *   error     the text was not a lesson document at all
 *
 * It is a scanner, not a parser: string-aware brace depth, nothing more, so
 * it can run on every chunk of a stream without re-reading what came before.
 */

const whole = JSON.stringify(gasPressure)
/* A `block` event carries the block AS THE RENDERER RECEIVES IT -- through the
   schema, with its defaults filled in (`depth: "core"`, `role: "support"`) --
   which is what `validateLesson` hands `TeachView` today. So the expectation is
   the normalised block, not the raw fixture. */
const checked = validateLesson(gasPressure)
if (!checked.ok) throw new Error('the fixture lesson does not validate: ' + JSON.stringify(checked.issues))
const normalised = checked.lesson.blocks

function feed(text: string, chunk: number): StreamEvent[] {
  const stream = lessonStream()
  const events: StreamEvent[] = []
  for (let at = 0; at < text.length; at += chunk) events.push(...stream.push(text.slice(at, at + chunk)))
  events.push(...stream.end())
  return events
}

describe('a lesson read as it is written', () => {
  it('emits every block, in order, each once, whatever the chunk size', () => {
    for (const chunk of [1, 7, 64, whole.length]) {
      const blocks = feed(whole, chunk).filter((e): e is Extract<StreamEvent, { type: 'block' }> => e.type === 'block')
      expect(blocks.map((e) => e.blockIndex), `chunk ${chunk}`).toEqual(gasPressure.blocks.map((_, i) => i))
      expect(blocks.map((e) => e.block), `chunk ${chunk}`).toEqual(normalised)
    }
  })

  it('streams the words of a prose body before its block closes, and they add up to the body', () => {
    const events = feed(whole, 5)
    const proseIndex = gasPressure.blocks.findIndex((b) => b.kind === 'prose')
    const body = (gasPressure.blocks[proseIndex] as { body: string }).body
    const deltas = events.filter((e): e is Extract<StreamEvent, { type: 'text' }> => e.type === 'text' && e.blockIndex === proseIndex)
    expect(deltas.length, 'no text arrived before the block closed').toBeGreaterThan(1)
    expect(deltas.map((e) => e.text).join('')).toBe(body)
    const firstText = events.findIndex((e) => e.type === 'text' && e.blockIndex === proseIndex)
    const blockDone = events.findIndex((e) => e.type === 'block' && e.blockIndex === proseIndex)
    expect(firstText, 'text came after the block it belongs to').toBeLessThan(blockDone)
  })

  it('ends with the whole lesson and its verdict', () => {
    const done = feed(whole, 16).find((e): e is Extract<StreamEvent, { type: 'complete' }> => e.type === 'complete')
    expect(done).toBeDefined()
    expect(done?.ok).toBe(true)
    expect(done?.lesson).toEqual(gasPressure)
  })

  it('keeps a block that fails its own check off the screen, and says why', () => {
    const broken = { ...gasPressure, blocks: [{ ...(gasPressure.blocks.find((b) => b.kind === 'flow') ?? gasPressure.blocks[0]), id: 'floating', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], links: [{ from: 'a', to: 'nowhere' }] }, ...gasPressure.blocks] }
    const events = feed(JSON.stringify(broken), 9)
    const first = events.find((e) => e.type === 'rejected' || (e.type === 'block' && e.blockIndex === 0))
    expect(first?.type, 'a block with dangling edges was shown').toBe('rejected')
    expect(events.filter((e) => e.type === 'block').map((e) => (e as { blockIndex: number }).blockIndex)).toEqual(
      gasPressure.blocks.map((_, i) => i + 1),
    )
  })

  it('is not fooled by braces and quotes inside strings', () => {
    const tricky = {
      ...gasPressure,
      blocks: [{ ...gasPressure.blocks.find((b) => b.kind === 'prose')!, body: 'She said "wait {here}" and \\ left [it].' }],
    }
    const events = feed(JSON.stringify(tricky), 3)
    const block = events.find((e): e is Extract<StreamEvent, { type: 'block' }> => e.type === 'block')
    expect((block?.block as { body?: string } | undefined)?.body).toBe('She said "wait {here}" and \\ left [it].')
    const deltas = events.filter((e): e is Extract<StreamEvent, { type: 'text' }> => e.type === 'text')
    expect(deltas.map((e) => e.text).join('')).toBe('She said "wait {here}" and \\ left [it].')
  })

  it('reports text that is not a lesson document as an error, never as a lesson', () => {
    const events = feed('I am not JSON at all, sorry.', 4)
    expect(events.some((e) => e.type === 'error')).toBe(true)
    expect(events.some((e) => e.type === 'block' || e.type === 'complete')).toBe(false)
  })
})
