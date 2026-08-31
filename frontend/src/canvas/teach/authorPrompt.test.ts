import { describe, expect, it } from 'vitest'

import { teachingSystemPrompt } from './authorLesson'
import { conceptRequest } from './concept'

/*
 * EVERY JSON SHAPE SHOWN TO A MODEL MUST ITSELF BE JSON.
 *
 * THE BUG THIS EXISTS TO STOP, MEASURED
 * -------------------------------------
 * `conceptRequest` described its shape with UNQUOTED placeholders:
 *
 *     "id": kebab-case,
 *     "question": the question this step moves toward,
 *
 * Against a local qwen2.5:7b that produced, verbatim:
 *
 *     {"id": gas-partic和平}
 *
 * Twelve completion tokens, `finish_reason: "stop"`, an unquoted value, and
 * therefore not JSON. Every reply was refused as "no JSON object" — six of six,
 * across three separate runs on six different subjects. Two other genuine
 * defects were found and fixed before this one (a naive `JSON.parse` instead of
 * `extractJson`, and a missing token budget) and NEITHER moved the number,
 * because the model was being handed a broken example the whole time.
 *
 * A model shown malformed JSON emits malformed JSON. It is not guessing badly;
 * it is copying accurately.
 *
 * WHY THIS TEST COVERS BOTH AUTHORS
 * ---------------------------------
 * `authorLesson.ts` had the identical defect in its own THE SHAPE block. A
 * root cause is a bug CLASS, not a line, and a guard that covered only the file
 * where it was noticed would let the next prompt reintroduce it. Any new
 * prompt-building function belongs in the list below.
 *
 * `authorLesson.ts` already records the same lesson being learned once before,
 * beside its enum list: "This prompt used to print `"kind": ...` and never say
 * what the values were, so the model filled the gap with a plausible word. That
 * is not the model guessing badly; it is the contract declining to state
 * itself." The enums were fixed then; the unquoted placeholders were not.
 */

const PROMPTS: readonly { readonly name: string; readonly text: string }[] = [
  { name: 'conceptRequest', text: conceptRequest('Why does heating a gas raise its pressure?') },
  { name: 'teachingSystemPrompt', text: teachingSystemPrompt() },
]

/**
 * Every `{...}` run in the text, so a prompt showing several examples has all of
 * them checked rather than only the widest one.
 *
 * Brace-balanced rather than regex: a JSON object contains nested braces, and
 * `/\{[^}]*\}/` would stop at the first inner close and declare a valid example
 * broken. A checker that cries wolf on correct input gets deleted.
 */
function jsonBlocks(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1))
        start = -1
      }
      if (depth < 0) depth = 0
    }
  }
  return out
}

describe.each(PROMPTS)('$name shows the model real JSON', ({ name, text }) => {
  it('shows at least one JSON object', () => {
    /* A prompt that describes a JSON shape in prose alone gives the model
       nothing to copy, which is the failure one step earlier than the one this
       file is about. */
    expect(jsonBlocks(text).length, `${name} shows no JSON object at all`).toBeGreaterThan(0)
  })

  it('every JSON object it shows parses', () => {
    const blocks = jsonBlocks(text)
    const broken = blocks.filter((b) => {
      try {
        JSON.parse(b)
        return false
      } catch {
        return true
      }
    })
    expect(
      broken.map((b) => b.slice(0, 120)),
      `${name} shows ${broken.length} of ${blocks.length} example(s) that are not valid JSON — ` +
        'a model copies the format it is shown',
    ).toEqual([])
  })
})
