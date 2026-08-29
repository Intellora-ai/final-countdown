import type { Lesson } from '../spec/spec'
import { groundingPreamble, type Source } from './grounding'
import { validateLesson, type Issue } from '../spec/validate'
import {
  MARK_REQUIRED_ABOVE_WORDS,
  MAX_DEFINITION_WORDS,
  MAX_EXAMPLE_WORDS,
  MAX_RUN_WORDS,
} from './teaching'

/**
 * Ask a model to teach something, and refuse the answer if it does not teach.
 *
 * WHAT WAS MISSING, AND WHY IT WAS THE WHOLE BLOCKER
 * --------------------------------------------------
 * The teaching shape was fully built and fully enforced, and NOTHING PRODUCED
 * IT. Every lesson on the canvas was a hand-written TypeScript file. The local
 * model — Ollama, through `agent/ports/httpModel` — answered the tutor in plain
 * prose and had no idea a `LessonSpec` existed. So "ask for any subject and
 * learn it" was true of the renderer and false of the product.
 *
 * This closes that loop: a question in, a validated lesson out, and a refusal
 * when the model does not meet the rules.
 *
 * THE PROMPT AND THE GATE CANNOT DRIFT ON THE NUMBERS
 * --------------------------------------------------
 * Every budget quoted to the model is INTERPOLATED from the constant the
 * checker uses. Change `MAX_RUN_WORDS` and the instruction changes with it.
 * That is not merely tidy: a prompt saying "40 words" against a gate enforcing
 * 30 produces a model that fails constantly and an operator who blames the
 * model.
 *
 * The rest of the drift is handled by the architecture rather than by
 * discipline. The model's output goes through `validateLesson`, which runs the
 * same `checkTeaching` the hand-written lessons face. A rule the prompt forgets
 * to mention is still enforced — the model simply fails it and gets told which
 * one, by name, on the repair pass. The gate is the specification; the prompt
 * is a courtesy.
 *
 * SUBJECT-NEUTRAL BY CONSTRUCTION
 * -------------------------------
 * Nothing below names a subject. The roles are the shape of explaining — anchor
 * on the known, define, name the notation, show the classification, earn the
 * rule, bound it, summarise — and they carry a proof in mathematics, a causal
 * chain in geography and a mechanism in biology without changing.
 */

/** What a caller needs from a model. One turn, text in, text out. */
export interface LessonModel {
  /**
   * `priorAssistant` is what the model returned last time. Supplying it on a
   * repair turns "fix these problems" into a correction of a document the model
   * can actually see; omitting it makes the same message a complaint about
   * something it has never read, and it regenerates from scratch.
   */
  (system: string, user: string, priorAssistant?: string): Promise<string>
}

export type AuthorResult =
  | { ok: true; lesson: Lesson; attempts: number }
  /*
   * `unreachable` SEPARATES TWO OUTCOMES A LEARNER MUST NEVER SEE CONFLATED.
   *
   * "the model answered and what it wrote does not teach" and "nothing
   * answered" want different words on screen: one is try again, the other is
   * this model cannot write lessons. Without this field the caller has only
   * `ok: false` and guesses -- which is how a learner gets told their question
   * was answered badly when it was never asked.
   *
   * Found by `chaos/dependencyChaos.test.ts` rather than by reading the code:
   * under a refused connection and under a 503, this function THREW, so the
   * caller could not distinguish them at all.
   */
  | { ok: false; issues: Issue[]; attempts: number; raw: string; unreachable?: string }

/**
 * The rules, phrased for a model rather than for a checker.
 *
 * Kept as one string and not assembled from the rule functions, because those
 * are written to DETECT a violation and this has to DESCRIBE the thing to
 * build. The two are genuinely different jobs; pretending one can be generated
 * from the other produces instructions like "the first sentence shares a
 * content word with the question", which is a true statement about the check
 * and useless as guidance.
 */
export function teachingSystemPrompt(): string {
  return [
    'You write LESSONS as strict JSON. You never write prose replies, never use markdown,',
    'and never wrap the JSON in a code fence. Output one JSON object and nothing else.',
    '',
    'You may be asked about ANY subject: mathematics, history, biology, grammar, cooking,',
    'law, music, or a general question with no subject at all. The shape below does not',
    'change between them.',
    '',
    'THE SHAPE',
    '{ "id": kebab-case, "question": the question you are answering, "subject": optional,',
    '  "technicalTerms": [{ "term": word, "introducedIn": block id }],',
    '  "blocks": [...], "relations": [...] }',
    '',
    /*
     * EVERY ENUM IS WRITTEN OUT, BECAUSE "..." IS AN INVITATION TO INVENT.
     *
     * Measured: asked to teach "admission of partners", a local qwen2.5:7b
     * produced a well-shaped lesson that was refused for THREE schema faults,
     * none of them about teaching --
     *
     *   relations[].kind = "explains"        (not one of the four legal kinds)
     *   blocks[].columns[] used "id"         (the field is "key")
     *   the lesson id was not kebab-case
     *
     * The first is the instructive one. This prompt used to print
     * `"kind": ...` and never say what the values were, so the model filled the
     * gap with a plausible word. That is not the model guessing badly; it is
     * the contract declining to state itself. A schema the author cannot see
     * is one the author will invent.
     */
    'IDs. Every id -- the lesson id and every block id -- must be lowercase',
    'kebab-case: a-z, 0-9 and hyphens only. No spaces, no capitals, no underscores.',
    '',
    'RELATIONS. `kind` is EXACTLY one of these four words and nothing else:',
    '  "supports"     B is evidence for A',
    '  "derives"      A comes FROM B',
    '  "contrasts"    A and B are the two sides of a difference',
    '  "exemplifies"  A is an example of B',
    'There is no "explains", no "relates", no "leads-to". Use the closest of the four.',
    '',
    'Each block: { "id", "kind", "title", "emphasis", "tone", "role", "depth", ...fields }',
    '  emphasis: primary | supporting | aside',
    '  tone:     neutral | insight | warning | result',
    '  depth:    core | deeper',
    '  role:     anchor | definition | notation | framework | classification | component',
    '            | rule | restriction | contrast | misconception | example | summary | support',
    '',
    'KIND AND ROLE ARE DIFFERENT FIELDS. DO NOT PUT A ROLE IN `kind`.',
    '  `kind` is WHAT THE BLOCK IS  -- how it is drawn.',
    '  `role` is WHAT IT IS FOR     -- its job in the teaching.',
    'A block can be kind "prose" with role "definition". "definition" is NOT a kind.',
    '',
    '`kind` is EXACTLY one of these twelve, and nothing else:',
    '  prose  callout  misconception  reasoning  summary  metric',
    '  equation  table  chart  flow  simulation  figure',
    '',
    'BLOCK KINDS AND THEIR FIELDS',
    '  prose / callout      body (string), terms: [{ text, mark: "key" | "distinction" }]',
    '  misconception        wrong, correct, why, counterexample (optional)',
    '  reasoning            mode: "why" | "worked", claim, therefore,',
    '                       steps: [{ expression, latex (optional), because }]  — 2 to 10',
    '  summary              progression: [string, ...] (2+), mentalModel',
    '  table                columns: [{ key, label, type }], rows, caption',
    '                       `key` is the field name, NOT `id`. type is one of',
    '                       "text" | "number" | "percent" | "currency". Every',
    '                       row is an object whose keys are the column keys.',
    '  chart                chartType, series: [{name,colorIndex,points:[{x,y}]}], caption',
    '  flow                 nodes: [{id,label,tone}], links: [{from,to}], caption',
    '  equation             latex, highlight: [string], caption',
    '',
    'THE RULES. These are CHECKED. A lesson that breaks one is refused.',
    '',
    ` 1. LENGTH. No unbroken run of text may exceed ${MAX_RUN_WORDS} words. A block may be`,
    '    long, but you must put a blank line ("\\n\\n") every two or three lines. Write',
    '    long bodies as several short runs separated by blank lines.',
    ` 2. DEFINITION. Exactly one block with role "definition", at most ${MAX_DEFINITION_WORDS} words,`,
    '    in ONE run with no blank line, and it must contain none of your technicalTerms.',
    '    Define in the simplest correct words. The technical word comes later.',
    ' 3. ORDER. Only "anchor" blocks may come before the definition. Then: framework',
    '    before classification, classification before component, summary last in the core.',
    ' 4. OPENING. The first sentence must name the topic. Never open with a greeting,',
    '    an apology, or praise for the question.',
    ` 5. MARK WORDS. Any prose/callout over ${MARK_REQUIRED_ABOVE_WORDS} words must mark at least one term`,
    '    in "terms". Use "key" for a word to remember, "distinction" for a word that',
    '    separates two things that get confused. The marked text must appear in the body.',
    ' 6. TECHNICAL WORDS. List them in technicalTerms with the block that earns each one.',
    '    A term must not appear anywhere before that block.',
    /* Rule 7 was "declare any ambiguous word". It is gone because the CHECK is
       gone: it refused six of seven ordinary English sentences, so it was
       removed from `teaching.ts`. Leaving the instruction here would make this
       list say "These are CHECKED" about something that is not, which is the
       drift this file's header warns against. Numbering closes up rather than
       leaving a hole, so the list reads as what it is. */
    ' 7. SHOW SOMETHING. Every few blocks include a table, chart, flow or figure that fits,',
    '    and connect it with a relation to a text block near it. Never decorative.',
    ' 8. EARN RULES. If any block has role "rule", include a reasoning block with',
    '    mode "why" that derives one of them from something simpler. Every step needs',
    '    its "because". Never assert a rule you do not justify.',
    ' 9. ARROWS. Never type "->" or an arrow into prose. Order and cause go in a flow block.',
    `10. EXAMPLES. role "example" blocks: at most ${MAX_EXAMPLE_WORDS} words, and exactly one`,
    '    "exemplifies" relation pointing at the single thing they illustrate.',
    '11. MISTAKES. Use a misconception block for the error people actually make. Give the',
    '    wrong form, the correct form, why, and where possible a counterexample with',
    '    concrete numbers or a concrete case.',
    '12. ENDING. The core ends with a "summary" block: an ordered progression of 2+ steps',
    '    and a one-sentence mentalModel.',
    '',
    'DEPTH IS OPT-IN, AND THIS MATTERS MORE THAN LENGTH.',
    'Mark depth "core" for the blocks that ANSWER THE QUESTION ASKED, and stop there.',
    'Everything you could go on to — further laws, proofs, edge cases, harder worked',
    'examples — is depth "deeper", and every deeper block comes AFTER the summary.',
    'The learner is asked by name before any of it is shown. Do not deliver a chapter',
    'to someone who asked one question.',
    '',
    'NEVER include colour, size, spacing, position, width, height, alignment or CSS in',
    'any field. You decide what exists and what it means. The software decides how it looks.',
  ].join('\n')
}

/**
 * The first `{...}` in the reply, parsed.
 *
 * Local models fence their JSON, apologise before it, or add a sentence after
 * it, however firmly they are told not to. Refusing those outright would make
 * the feature unusable on exactly the models it is built for, and the fix costs
 * three lines. What is NOT tolerated is a reply with no JSON at all — that is
 * returned as a failure with the raw text, because a silent empty lesson is the
 * one outcome that looks like success.
 */
export function extractJson(reply: string): unknown {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(reply.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * Keys the schema treats as DATA, where a null is the author's and must survive.
 *
 * The same boundary `validate.ts` draws for its appearance walk, drawn again
 * here for the same reason: below one of these keys the contents are the
 * lesson's subject matter, not its structure. A table cell is explicitly
 * allowed to be null (`rows: z.record(z.union([string, number, null]))`), and
 * a normaliser that could not tell a missing title from an empty cell would
 * quietly delete real data.
 */
const DATA_KEYS = new Set(['rows', 'points', 'data', 'columns', 'controls', 'readouts'])

/**
 * Drop keys the model set to `null` where the schema means "absent".
 *
 * MEASURED, TWICE, ON A REAL MODEL. Asked to teach "admission of partners",
 * qwen2.5:7b returned a structurally sound lesson that was refused for eight
 * faults, seven of them identical:
 *
 *     blocks.0.title — Expected string, received null
 *     blocks.2.title — Expected string, received null
 *     ... six more, plus blocks.5.caption
 *
 * `title` and `caption` are `.optional()`, which in zod means ABSENT, not
 * null. The model expressed "no title" the other way round. Nothing about the
 * teaching was wrong; the lesson died on a JSON dialect difference.
 *
 * Emitting `null` for an absent optional is near-universal model behaviour, so
 * instructing it away is a losing game — the instruction has to win every time,
 * and normalising has to work once. This is lossless: for an optional field the
 * two encodings carry identical meaning.
 *
 * WHAT THIS IS NOT. It does not touch anything the gate judges. A null does not
 * become a title, an empty lesson does not become a full one, and every
 * teaching rule runs afterwards exactly as before. It is a dialect fix at the
 * model boundary, which is why it lives here and not in `validate.ts` — a
 * hand-written lesson has no excuse for a null, and the shared gate keeps
 * refusing one.
 */
/** The twelve legal block kinds, and the roles that get mistaken for them. */
const BLOCK_KINDS = new Set([
  'prose', 'callout', 'misconception', 'reasoning', 'summary', 'metric',
  'equation', 'table', 'chart', 'flow', 'simulation', 'figure',
])
const BLOCK_ROLES = new Set([
  'anchor', 'definition', 'notation', 'framework', 'classification', 'component',
  'rule', 'restriction', 'contrast', 'misconception', 'example', 'summary', 'support',
])

/**
 * A role written into `kind`, put back where it belongs.
 *
 * MEASURED, with the model's own output in hand rather than inferred from a
 * zod path. Asked to teach "admission of partners", qwen2.5:7b emitted:
 *
 *     { "id": "example", "kind": "example", "role": "example",
 *       "body": "If Partner A and B have capitals of $10,000..." }
 *
 * `example` is a legal ROLE and not a legal KIND. The model had the intent
 * exactly right and used the wrong field for the shape, which is the
 * predictable failure when two enums sit on one object and one of them is
 * printed first. Two rounds of making the prompt more explicit did not stop it.
 *
 * The repair is narrow on purpose, and only fires when the reading is
 * unambiguous: the kind is invalid, it is a legal role, and the block carries a
 * `body` — which only `prose` and `callout` do. A block with a body IS prose;
 * nothing is being guessed. `role` is filled in from the misplaced value only
 * when the model did not already set one, so an explicit role always wins.
 *
 * Anything that does not meet all three conditions is left alone and refused,
 * because a normaliser that repairs what it cannot read is how a gate stops
 * meaning anything.
 */
function repairKind(block: Record<string, unknown>): Record<string, unknown> {
  const kind = block['kind']
  if (typeof kind !== 'string') return block
  if (BLOCK_KINDS.has(kind)) return block
  if (!BLOCK_ROLES.has(kind)) return block
  if (typeof block['body'] !== 'string') return block

  return { ...block, kind: 'prose', role: block['role'] ?? kind }
}

export function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls)
  if (value === null || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === null) continue
    /* An empty string in an optional field means the same as absent, and the
       schema's `Label` requires at least one character. Measured alongside the
       nulls: the same reply carried `"title": ""`. Data keys are exempt for the
       same reason nulls are — an empty cell is the author's. */
    if (child === '' && !DATA_KEYS.has(key)) continue
    out[key] = DATA_KEYS.has(key) ? child : dropNulls(child)
  }
  return 'kind' in out ? repairKind(out) : out
}

function repairRequest(question: string, issues: Issue[]): string {
  return [
    `The lesson you produced for "${question}" was refused. Fix exactly these and`,
    'return the whole corrected JSON object again:',
    '',
    ...issues.slice(0, 12).map((i) => `  - ${i.path}: ${i.message}`),
    '',
    'Change only what is needed to clear these. Do not start over.',
  ].join('\n')
}

/**
 * A question in, a lesson the canvas will actually render out.
 *
 * ONE REPAIR PASS, NOT A LOOP. A model that fails the same rules twice is not
 * going to converge on the third try; it has misunderstood the shape, and
 * spending the learner's time discovering that slowly is worse than telling
 * them plainly. The failure carries the issues AND the raw reply, so the reason
 * is inspectable rather than guessed at.
 *
 * The repair pass gets the issue list, which is the difference between "try
 * again" and "your definition was 34 words and the cap is 30". `GenerateRequest`
 * in the agent makes the same distinction with `mustFix`, for the same reason.
 */
/** What a caller may bound, beyond the model itself. */
export interface AuthorOptions {
  /**
   * A budget for the WHOLE attempt, both model calls together.
   *
   * NOT per call, and that distinction is the bug this exists to fix. The
   * transport already has a per-request timeout, and `CanvasRoute` passed it
   * 240_000 -- so a value chosen as "four minutes" was really eight, because
   * this function calls the model twice. Measured in a browser: the button sat
   * on "Writing…" for over ten minutes with no error.
   *
   * A learner watching a blank button does not care which of the two calls
   * they are waiting on. They are having one wait, so there is one budget.
   *
   * Optional. Absent means no deadline of this function's own, exactly as
   * before this parameter existed.
   */
  readonly deadlineMs?: number
}

export async function authorLesson(
  model: LessonModel,
  question: string,
  sources: readonly Source[] = [],
  options: AuthorOptions = {},
): Promise<AuthorResult> {
  const system = teachingSystemPrompt()

  const endsAt = options.deadlineMs === undefined ? null : Date.now() + options.deadlineMs

  /**
   * Run a model call against whatever is left of the shared budget.
   *
   * Rejecting rather than returning a sentinel is deliberate: both call sites
   * below already catch and turn a rejection into an `unreachable` result, so a
   * timeout arrives as "nothing answered" through the same path as a refused
   * connection. That is the honest description -- a reply that never came and a
   * connection that never opened leave the learner in the same place.
   *
   * The timer is cleared on settle. A pending `setTimeout` keeps a test runner
   * alive after its assertions have passed, which turns a fast suite into one
   * that hangs at the end and gets blamed on something else.
   */
  async function withinBudget(work: Promise<string>): Promise<string> {
    if (endsAt === null) return work
    const left = Math.max(0, endsAt - Date.now())
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `no reply within the ${options.deadlineMs}ms allowed for the whole attempt`,
                ),
              ),
            left,
          )
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  /*
   * THE GATE READS SHAPE. NOTHING HERE READ TRUTH.
   *
   * `checkTeaching` has twenty-eight rules and not one is about whether a
   * sentence is correct, because shape and fact are orthogonal -- a lesson can
   * open on its topic, define in under thirty words, mark its terms, show a
   * table, close with a progression, and be entirely invented. Every check in
   * this repository passes it.
   *
   * `groundingPreamble` returns '' for an empty list, so an ungrounded call
   * behaves exactly as it did before this parameter existed. Grounding is an
   * improvement offered, never a precondition: search fails for plenty of real
   * questions, and refusing to teach when it does would turn a silent retrieval
   * failure into a silent teaching failure.
   */
  const grounding = groundingPreamble(sources)
  const ask = grounding === '' ? `Teach this: ${question}` : `${grounding}\n\nTeach this: ${question}`

  /*
   * A TRANSPORT FAILURE IS A RESULT, NOT AN EXCEPTION.
   *
   * `chatOnce` rejects on a refused connection, a 503, a DNS failure or a
   * timeout. Letting that propagate made "the dependency is down" arrive at the
   * caller in a different shape from "the lesson does not teach", and the
   * banner then described one as the other.
   */
  let first: string
  try {
    first = await withinBudget(model(system, ask))
  } catch (error) {
    return {
      ok: false,
      attempts: 1,
      raw: '',
      unreachable: error instanceof Error ? error.message : String(error),
      issues: [{ path: '(transport)', message: 'the model was never reached, so nothing was written' }],
    }
  }
  const firstParsed = dropNulls(extractJson(first))
  const firstResult = validateLesson(firstParsed)
  if (firstResult.ok) return { ok: true, lesson: firstResult.lesson, attempts: 1 }

  const firstIssues =
    firstParsed === null
      ? [{ path: '(root)', message: 'the reply contained no JSON object at all' }]
      : firstResult.issues

  /*
   * THE FIRST REPLY IS REPLAYED, AND WITHOUT IT THIS WAS NOT A REPAIR PASS.
   *
   * `repairRequest` says "return the whole corrected JSON object again" and
   * "do not start over". Both were impossible: the transport sent only
   * `[system, user]`, so the model had never seen the object it was being asked
   * to correct. It regenerated blind, and the second failure was reported as a
   * failed repair when no repair had been possible.
   */
  let second: string
  try {
    second = await withinBudget(model(system, repairRequest(question, firstIssues), first))
  } catch (error) {
    /* The dependency died between the two attempts. The first reply is still
       the most honest thing to report, so it is kept as `raw`. */
    return {
      ok: false,
      attempts: 2,
      raw: first,
      unreachable: error instanceof Error ? error.message : String(error),
      issues: [{ path: '(transport)', message: 'the model stopped answering before the repair attempt' }],
    }
  }
  const secondParsed = dropNulls(extractJson(second))
  const secondResult = validateLesson(secondParsed)
  if (secondResult.ok) return { ok: true, lesson: secondResult.lesson, attempts: 2 }

  return {
    ok: false,
    attempts: 2,
    raw: second,
    issues:
      secondParsed === null
        ? [{ path: '(root)', message: 'the reply contained no JSON object at all' }]
        : secondResult.issues,
  }
}
