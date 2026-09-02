/**
 * A LESSON READ AS IT IS WRITTEN. See `lesson-stream.test.ts` for why.
 *
 * A string-aware scanner over the JSON a model streams, emitting:
 *   text      the growing `body` of the block being written, as real text
 *   block     a closed block that passed `validateBlock`
 *   rejected  a closed block that did not -- never shown
 *   complete  the whole document and the whole-lesson verdict
 *   done      (the route's, not the scanner's) the reply the plain route sends
 *   error     the text was never a lesson document
 *
 * It keeps the raw text, because a closed block is re-read by `JSON.parse`
 * from its own braces -- the scanner only has to know WHERE a block starts and
 * ends, never what is inside it. Depth is counted outside strings only, so a
 * brace inside a sentence is a character and nothing more.
 */

import type { Block } from '../src/canvas/spec/spec.ts'
import { validateBlock, validateLesson, type Issue } from '../src/canvas/spec/validate.ts'

export type StreamEvent =
  | { readonly type: 'text'; readonly blockIndex: number; readonly text: string }
  | { readonly type: 'block'; readonly blockIndex: number; readonly block: Block }
  | { readonly type: 'rejected'; readonly blockIndex: number; readonly issues: readonly Issue[] }
  | { readonly type: 'complete'; readonly ok: boolean; readonly lesson: unknown; readonly issues: readonly Issue[] }
  /** The route's last word: exactly the reply the plain route would have sent. */
  | { readonly type: 'done'; readonly reply: { readonly status: number; readonly body: Record<string, unknown> } }
  | { readonly type: 'error'; readonly message: string }

export interface LessonStream {
  push(chunk: string): StreamEvent[]
  end(): StreamEvent[]
}

/** The longest decodable prefix of a raw JSON string body, or null mid-escape. */
function decodeRaw(raw: string): string | null {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return null
  }
}

export function lessonStream(): LessonStream {
  let buffer = ''
  let depth = 0
  let inString = false
  let escape = false
  let started = false
  let failed = false
  let finished = false

  /* Where the blocks array lives, and the block being written inside it. */
  let inBlocks = false
  let blockStart = -1
  let blockIndex = -1
  let lastString = ''       // the string most recently closed, at the current depth
  let stringStart = -1
  let awaitingKeyColon = false // a string just closed at block-key depth; is it a key?
  let currentKey = ''
  let inBody = false        // inside the value string of a `body` key
  let bodyRaw = ''
  let bodyEmitted = ''

  const BLOCKS_DEPTH = 2    // the array under the top-level object
  const BLOCK_DEPTH = 3     // each block object

  function push(chunk: string): StreamEvent[] {
    const events: StreamEvent[] = []
    if (failed || finished) return events
    for (const ch of chunk) {
      const at = buffer.length
      buffer += ch

      if (!started) {
        if (/\s/.test(ch)) continue
        if (ch !== '{') {
          failed = true
          events.push({ type: 'error', message: 'the text is not a lesson document' })
          return events
        }
        started = true
        depth = 1
        continue
      }

      if (inString) {
        if (escape) {
          escape = false
          if (inBody) bodyRaw += ch
          continue
        }
        if (ch === '\\') {
          escape = true
          if (inBody) bodyRaw += ch
          continue
        }
        if (ch === '"') {
          inString = false
          lastString = buffer.slice(stringStart, at)
          if (inBody) {
            const decoded = decodeRaw(bodyRaw)
            if (decoded !== null && decoded.length > bodyEmitted.length) {
              events.push({ type: 'text', blockIndex, text: decoded.slice(bodyEmitted.length) })
              bodyEmitted = decoded
            }
            inBody = false
          } else if (depth === BLOCK_DEPTH && inBlocks) {
            awaitingKeyColon = true
          }
          continue
        }
        if (inBody) {
          bodyRaw += ch
          const decoded = decodeRaw(bodyRaw)
          if (decoded !== null && decoded.length > bodyEmitted.length) {
            events.push({ type: 'text', blockIndex, text: decoded.slice(bodyEmitted.length) })
            bodyEmitted = decoded
          }
        }
        continue
      }

      if (ch === '"') {
        inString = true
        stringStart = at + 1
        /* A value string right after `"body":` at block depth is the prose. */
        if (currentKey === 'body' && depth === BLOCK_DEPTH && inBlocks) {
          inBody = true
          bodyRaw = ''
          bodyEmitted = ''
          currentKey = ''
        }
        continue
      }
      if (/\s/.test(ch)) continue

      if (awaitingKeyColon) {
        awaitingKeyColon = false
        if (ch === ':') {
          currentKey = decodeRaw(lastString) ?? lastString
          continue
        }
      }
      if (ch === ':' && depth === 1 && (decodeRaw(lastString) ?? lastString) === 'blocks') {
        /* the next `[` at depth 1 opens the blocks array */
        currentKey = 'blocks'
        continue
      }

      if (ch === '{' || ch === '[') {
        depth += 1
        if (ch === '[' && depth === BLOCKS_DEPTH && currentKey === 'blocks') {
          inBlocks = true
          currentKey = ''
        } else if (ch === '{' && depth === BLOCK_DEPTH && inBlocks) {
          blockStart = at
          blockIndex += 1
          currentKey = ''
        }
        continue
      }
      if (ch === '}' || ch === ']') {
        if (ch === '}' && depth === BLOCK_DEPTH && inBlocks && blockStart >= 0) {
          const raw = buffer.slice(blockStart, at + 1)
          blockStart = -1
          let parsed: unknown
          try {
            parsed = JSON.parse(raw)
          } catch {
            events.push({ type: 'rejected', blockIndex, issues: [{ path: `blocks[${blockIndex}]`, message: 'not valid JSON' }] })
            depth -= 1
            continue
          }
          const checked = validateBlock(parsed, blockIndex)
          events.push(checked.ok ? { type: 'block', blockIndex, block: checked.block } : { type: 'rejected', blockIndex, issues: checked.issues })
        }
        if (ch === ']' && depth === BLOCKS_DEPTH && inBlocks) inBlocks = false
        depth -= 1
        continue
      }
      if (ch === ',') {
        currentKey = ''
        continue
      }
    }
    return events
  }

  function end(): StreamEvent[] {
    if (failed || finished) return []
    finished = true
    let parsed: unknown
    try {
      parsed = JSON.parse(buffer)
    } catch {
      return [{ type: 'error', message: 'the text ended before the lesson document did' }]
    }
    const verdict = validateLesson(parsed)
    return [{ type: 'complete', ok: verdict.ok, lesson: parsed, issues: verdict.ok ? [] : verdict.issues }]
  }

  return { push, end }
}
