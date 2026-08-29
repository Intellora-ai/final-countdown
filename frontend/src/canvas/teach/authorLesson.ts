import type { Lesson } from '../spec/spec'
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
  | { ok: false; issues: Issue[]; attempts: number; raw: string }

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
export async function authorLesson(
  model: LessonModel,
  question: string,
): Promise<AuthorResult> {
  const system = teachingSystemPrompt()

  const first = await model(system, `Teach this: ${question}`)
  const firstParsed = extractJson(first)
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
  const second = await model(system, repairRequest(question, firstIssues), first)
  const secondParsed = extractJson(second)
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
