/**
 * F1 — NO NUMBER REACHES A LEARNER UNCHECKED.
 *
 * `evaluate` and `verifyArithmetic` exist, are tested, and were wired only
 * into the agent loop -- which the canvas never calls. So the gate that
 * refuses a dangling relation would pass "2 x 3 = 7" without a murmur, and a
 * learner would copy it into her book.
 *
 * WHAT IS CHECKED: a sum the lesson states in full -- numbers, an operator,
 * an equals sign, and the answer. That is the shape a learner copies.
 *
 * WHAT IS NOT: anything with a letter in it (`a + b = c` is a formula, not a
 * sum), a date range, or a sentence with no equals sign. A step that cannot
 * be read is left alone rather than guessed at -- refusing what it cannot
 * parse would refuse every lesson with a sentence in it, and guessing would
 * be worse than not checking.
 *
 * ROUNDING IS ALLOWED WHEN IT IS SAID: "10 ÷ 3 = 3.33" is right to the places
 * it wrote. "10 ÷ 3 = 5" is wrong at any rounding.
 */
import { evaluate } from '../../agent/tools/tools'

export interface Sum {
  /** The left-hand side, ready for `evaluate`. */
  readonly expression: string
  /** What the lesson said the answer is. */
  readonly stated: number
  /** The whole thing, as the learner reads it. */
  readonly said: string
}

export interface WrongSum extends Sum {
  readonly why: string
}

/* Numbers and operators only: a letter anywhere makes it a formula, and a
   formula is not a sum, so the character class below admits no letters. */
/* The answer never swallows a full stop: "= 9." ends a sentence, and the
   learner reads the answer as 9. A decimal point must have a digit after it. */
const A_SUM = /(?<![\w.])((?:\d[\d,.]*)(?:\s*[+\-*/×÷^]\s*(?:\d[\d,.]*|\([^()]*\)))+)\s*=\s*(-?\d[\d,]*(?:\.\d+)?)(?!\w)(?!\.\d)/g

function asNumber(text: string): number {
  return Number(text.replace(/,/g, ''))
}

/** How many decimal places the answer was written to. */
function placesIn(text: string): number {
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

function words(blocks: readonly Record<string, unknown>[]): string[] {
  return blocks
    .flatMap((block) => [block['title'], block['body'], block['caption'], block['mentalModel'], block['why'], block['statement']])
    .filter((one): one is string => typeof one === 'string')
}

export function sumsIn(blocks: readonly Record<string, unknown>[]): readonly Sum[] {
  const found: Sum[] = []
  for (const said of words(blocks)) {
    for (const match of said.matchAll(A_SUM)) {
      const expression = match[1]!.trim()
      const answer = match[2]!
      /* A range ("1939-1945") has no operator a learner would call a sum, and
         reads as subtraction; require an operator that is not a lone hyphen
         between two whole numbers with no spaces. */
      if (/^\d[\d,]*-\d[\d,]*$/.test(expression.replace(/\s/g, ''))) continue
      found.push({ expression, stated: asNumber(answer), said: `${expression} = ${answer}` })
    }
  }
  return found
}

export function wrongSums(blocks: readonly Record<string, unknown>[]): readonly WrongSum[] {
  const wrong: WrongSum[] = []
  for (const sum of sumsIn(blocks)) {
    let actual: number
    try {
      actual = evaluate(sum.expression)
    } catch {
      /* Unreadable is not wrong: left alone, never guessed at. */
      continue
    }
    const places = placesIn(String(sum.stated))
    const allowed = places === 0 ? 1e-9 : 0.5 * 10 ** -places
    if (Math.abs(actual - sum.stated) <= Math.max(allowed, Math.abs(actual) * 1e-9)) continue
    wrong.push({ ...sum, why: `${sum.expression} = ${actual}, but the lesson says ${sum.stated}` })
  }
  return wrong
}
