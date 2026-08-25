/**
 * P11-T3 — deterministic validation of a practice-question response.
 *
 * WHY CODE AND NOT A MODEL
 * ------------------------
 * "Is this valid JSON", "does it carry every required field at the right type",
 * "are there exactly four distinct options", "does the named correct option
 * exist" all have answers. Asking a language model would be paying for an
 * opinion about a decided question, and would make the gate's verdict depend on
 * a network call and a temperature.
 *
 * So this runs FIRST, and scoring only sees responses that survive it.
 *
 * THE CONTRACT IS THE ONE THE PRODUCT ALREADY DECLARES
 * ----------------------------------------------------
 * `src/practice/engine/modelProvider.ts` sends a `json_schema` output config
 * with `required: ['questionText','options','correctOption','fullSolution']`,
 * four options keyed A-D, and `correctOption` drawn from those keys. This
 * restates none of it by hand beyond what a checker needs; where the two could
 * drift, the test file pins the codes so a change has to be deliberate.
 *
 * EVERY problem is returned, never just the first. A validator that stops at
 * one finding turns a single bad response into as many CI rounds as it has
 * defects.
 */

/** One thing wrong, named precisely enough to act on without rerunning anything. */
export interface Finding {
  /** Stable machine code. The tests pin these; renaming one is a contract change. */
  readonly code: string
  /** Human detail. Names the FIELD, because "something is missing" is not actionable. */
  readonly detail: string
}

const REQUIRED = ['questionText', 'options', 'correctOption', 'fullSolution'] as const
const KEYS = ['A', 'B', 'C', 'D'] as const

/** Present, a string, and not just whitespace. A required field allowed to be
 *  empty is not required. */
function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parse(raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false } {
  if (typeof raw === 'string') {
    try {
      return parse(JSON.parse(raw) as unknown)
    } catch {
      /* Not swallowed: the failure becomes a `not-json` finding at the call
         site, which is a control-flow change and the reported cause. */
      return { ok: false }
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false }
  return { ok: true, value: raw as Record<string, unknown> }
}

function checkOptions(value: unknown, found: Finding[]): string[] {
  if (!Array.isArray(value)) {
    found.push({ code: 'wrong-type', detail: 'options must be an array' })
    return []
  }
  if (value.length !== KEYS.length) {
    found.push({ code: 'bad-options', detail: `options must have exactly 4 entries, found ${value.length}` })
  }

  const seen: string[] = []
  for (const [i, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      found.push({ code: 'bad-options', detail: `option ${i} is not an object` })
      continue
    }
    const option = entry as Record<string, unknown>
    const key = option['key']
    if (typeof key !== 'string' || !(KEYS as readonly string[]).includes(key)) {
      found.push({ code: 'bad-options', detail: `option ${i} has key ${String(key)}, expected one of A, B, C, D` })
    } else if (seen.includes(key)) {
      /* A duplicated key means one of A-D is unreachable, and a learner can be
         marked wrong for choosing the letter that was actually right. */
      found.push({ code: 'bad-options', detail: `option key ${key} appears more than once` })
    } else {
      seen.push(key)
    }

    if (!filled(option['text'])) {
      found.push({ code: 'bad-options', detail: `option ${i} has no text` })
    }
    /* A distractor with no rationale cannot teach anything, which is the only
       reason the product asks for one. */
    if (!filled(option['rationale'])) {
      found.push({ code: 'bad-options', detail: `option ${i} has no rationale` })
    }
  }
  return seen
}

export function validatePractice(raw: unknown): Finding[] {
  const parsed = parse(raw)
  if (!parsed.ok) {
    return [{ code: 'not-json', detail: 'response is not a JSON object' }]
  }
  const body = parsed.value
  const found: Finding[] = []

  for (const field of REQUIRED) {
    if (!(field in body)) {
      found.push({ code: 'missing-field', detail: `${field} is absent` })
    }
  }

  for (const field of ['questionText', 'fullSolution', 'correctOption'] as const) {
    const value = body[field]
    if (value === undefined) continue
    if (typeof value !== 'string') {
      found.push({ code: 'wrong-type', detail: `${field} must be a string, found ${typeof value}` })
    } else if (!filled(value)) {
      found.push({ code: 'missing-field', detail: `${field} is blank` })
    }
  }

  const keys = 'options' in body ? checkOptions(body['options'], found) : []

  const correct = body['correctOption']
  if (typeof correct === 'string' && filled(correct) && !keys.includes(correct)) {
    found.push({
      code: 'correct-option-not-an-option',
      detail: `correctOption is ${correct}, which no option carries`,
    })
  }

  return found
}
