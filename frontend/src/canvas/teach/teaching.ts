import type { BlockRole } from '../spec/roles'
import type { Block, Lesson } from '../spec/spec'

/**
 * Whether a lesson TEACHES, as opposed to whether it renders.
 *
 * `validate.ts` already answers "is this well-formed" — a flow link that points
 * at a missing node, a pie chart with negative slices. It has nothing to say
 * about a lesson that is six well-formed paragraphs of undifferentiated text,
 * which renders perfectly and teaches nobody. That is the gap this file closes.
 *
 * MEASURED, NOT ASSUMED. The three lessons shipped in this repository have
 * prose blocks of 32, 53, 30, 54, 34 and 67 words. Five of the six exceed the
 * thirty-word chunk this file enforces. That is the finding these rules exist
 * to make loud, and it is why they are checked rather than written down.
 *
 * THE RULES ARE IN ONE FILE ON PURPOSE
 * ------------------------------------
 * Nine of them are the same rule wearing different clothes — definition first,
 * framework before detail, simple words before technical ones, summary last,
 * never mix a definition with a formula. Spread across nine call sites they can
 * each rot separately and nobody finds out. Here they are one ordering over one
 * field, and a role that reaches the wrong place is one comparison.
 *
 * WHAT IS DELIBERATELY NOT CHECKED
 * --------------------------------
 * Whether the teaching is GOOD. `llm/validation.py` draws exactly this line and
 * the reasoning carries: a score mixing countable structure with judged quality
 * produces a number that looks like a measurement and is not. A lesson can obey
 * every rule below and still teach badly. It cannot obey them and be a wall of
 * text, which is the failure actually in front of us.
 */

export interface TeachingIssue {
  path: string
  /** The rule's short name, so a caller can branch without parsing prose. */
  rule: string
  message: string
}

/**
 * The budget for one unbroken RUN of text, in words.
 *
 * WHAT THIS MEASURES, AND THE MISTAKE IT CORRECTS
 * -----------------------------------------------
 * The first version of this capped the whole BLOCK at thirty words, and that
 * was wrong. The rule is "ban more than two and a half lines or thirty words in
 * one go" — *in one go*. A block may run to two hundred words provided the
 * reader is given somewhere to breathe every two or three lines. Capping the
 * block instead of the run banned long explanations outright, which is not what
 * was asked and would have made the gate hostile to teach with.
 *
 * So the unit is the SEGMENT: a run of text between blank lines. Eight
 * segments of twenty-five words pass. One segment of thirty-one does not.
 *
 * Words are counted rather than lines because a line is a rendering fact — it
 * changes with the viewport, and a rule meaning something different on a phone
 * is not a rule. Thirty words is roughly two and a half lines at the canvas's
 * body measure, so counting words enforces the intent on every screen.
 */
export const MAX_RUN_WORDS = 30

/**
 * The definition is the one place the whole block is capped.
 *
 * It is the single sentence the learner should be able to hold, so it may not
 * be split into breathing segments and stretched — a definition delivered in
 * four instalments is not a definition. Less than thirty is fine. More is not.
 */
export const MAX_DEFINITION_WORDS = 30

/**
 * An example gets less room than an ordinary chunk, because its job is
 * narrower: isolate one rule. "No long stories" is the requirement, and twenty
 * words is not enough room for a story.
 */
export const MAX_EXAMPLE_WORDS = 20

/** Blocks made of sentences. These carry the word budget. */
const TEXT_KINDS = new Set(['prose', 'callout'])

/**
 * What counts as showing rather than telling.
 *
 * `equation` and `metric` are deliberately absent. Both are legitimate content,
 * but neither answers "show me how this fits together" — the requirement names
 * graph, chart, flowchart and table, and a lesson whose only non-prose block is
 * a single number has not represented its concept.
 */
const REPRESENTATION_KINDS = new Set(['chart', 'table', 'flow', 'figure', 'simulation'])

/* -------------------------------------------------------------------------- */
/* Small text helpers                                                          */
/* -------------------------------------------------------------------------- */

export function words(text: string): string[] {
  return text.trim().split(/\s+/).filter((w) => w.length > 0)
}

function firstSentence(text: string): string {
  const [first] = text.trim().split(/(?<=[.!?])\s+/)
  return first ?? text.trim()
}

/**
 * Words too common to anchor anything.
 *
 * Short on purpose. A long stopword list starts deciding which nouns matter,
 * and the length filter below already removes most function words — this only
 * needs to catch the long ones that survive it.
 */
const STOPWORDS = new Set([
  /*
   * SHORT FUNCTION WORDS ARE LISTED, NOT FILTERED BY LENGTH.
   *
   * The first version kept only words of four letters or more, which removed
   * function words for free and removed the topic along with them. Measured
   * before the fix: "What is DNA?", "What is pH?" and "What is tax?" all
   * produced an EMPTY anchor set, and `checkOpensOnTheTopic` returns without
   * checking when the anchor is empty — so the pleasantry it exists to catch
   * walked straight through on every short-word subject. Only long-word topics
   * like "logarithm" were ever protected.
   *
   * A rule that silently does nothing on a whole class of subjects is worse
   * than no rule: it reports PASS. So the length floor drops to two and the
   * function words are named instead.
   */
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do',
  'does', 'doing', 'for', 'from', 'get', 'got', 'had', 'has', 'have', 'he',
  'her', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me',
  'my', 'no', 'not', 'of', 'on', 'or', 'our', 'ours', 'out', 'own', 'she',
  'so', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'to', 'too', 'up', 'us', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with',
  'would', 'could', 'should', 'because', 'between', 'about', 'been', 'here',
  'your',
])

/**
 * Lowercased, plural-stripped, so "tenses" anchors "tense".
 *
 * The plural strip applies only from four letters up. Below that it does harm:
 * "gas" would anchor as "ga" and "bus" as "bu", so a gas lesson would fail to
 * match its own subject. Three-letter words are kept whole.
 */
function contentWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of words(text)) {
    const word = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (word.length < 2 || STOPWORDS.has(word)) continue
    out.add(word.length >= 4 && word.endsWith('s') ? word.slice(0, -1) : word)
  }
  return out
}

/** The sentences a block puts in front of a reader. Empty for a diagram. */
function readableText(block: Block): string {
  switch (block.kind) {
    case 'prose':
    case 'callout':
      return block.body
    case 'misconception':
      return block.why
    case 'summary':
      return block.mentalModel

    /*
     * A REASONING BLOCK IS TEXT, AND IT WAS INVISIBLE TO EVERY TEXT RULE.
     *
     * This returned `''` for `reasoning`, so the length rule never measured a
     * derivation and `checkBodyOutweighsHeadings` counted ZERO body words for a
     * lesson led by one. A lesson whose whole argument is a reasoning block was
     * therefore told "the lesson is a contents page: the teaching has to be in
     * the text, not in the titles" — about a block that is nothing but text.
     *
     * The same class of false alarm as the `heading === 0` case fixed earlier
     * in this branch. That fix closed one half and left this half open.
     *
     * Every field a reader actually reads is joined here. The step separator is
     * a blank line on purpose: `segments()` splits on exactly that, so each
     * step is measured as its own run rather than the whole derivation being
     * counted as one 200-word block and refused for it.
     */
    case 'reasoning':
      return [
        block.claim,
        ...block.steps.map((s) => `${s.expression} ${s.because}`),
        block.therefore,
      ].join('\n\n')

    default:
      return ''
  }
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The shortest block that still owes the reader a marked word.
 *
 * A four-word example has no important word to pull out — everything in it is
 * the point. Ten words is where a block starts having a shape a reader can
 * skim past, and skimming past is what the mark exists to prevent.
 */
export const MARK_REQUIRED_ABOVE_WORDS = 10

/**
 * R1a — INTEGRITY. A term marked but absent from the body it belongs to.
 *
 * ALWAYS RUNS, at every level. This is not a judgement about teaching quality:
 * a term named and missing is a defect in the block itself, and it is one the
 * author can always fix by editing the text they wrote.
 */
function checkMarkedTermsExist(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    if (block.kind !== 'prose' && block.kind !== 'callout') return

    const body = block.body.toLowerCase()
    block.terms.forEach((term, t) => {
      if (!body.includes(term.text.toLowerCase())) {
        out.push({
          path: `blocks[${i}].terms[${t}]`,
          rule: 'marked-term-absent',
          message:
            `"${term.text}" is marked ${term.mark} but does not appear in the block's own ` +
            `body, so the reader will never see it marked while the author believes they marked it`,
        })
      }
    })
  })
}

/**
 * R1b — QUALITY. A block worth reading has a word worth remembering.
 *
 * Marking was optional, and optional meant absent: the first draft of the
 * logarithms lesson left four of its six text blocks unmarked, so the page was
 * a uniform grey wall exactly where it claimed to be teaching.
 *
 * ARC-ONLY, AND THIS SPLIT IS A BUG FIX, NOT A RELAXATION.
 *
 * This rule and `marked-term-absent` used to live in one function, so both ran
 * at every level — including `'answer'`. That broke the doubt feature in the
 * product, not merely in tests. `doubt.ts`'s `captionNote` assembles a block
 * out of the author's caption and **never invents text**, so it cannot add a
 * marked term at all; any caption over ten words made `buildAnswer` return
 * null and the resolver refuse. Measured on live content: three captions of
 * 23, 17 and 13 words.
 *
 * A rule an honest caller is structurally unable to satisfy is not a standard,
 * it is a trap. Demanding a bold word is a judgement about a lesson someone
 * WROTE; it has no business being applied to a reply the software ASSEMBLED.
 *
 * Graded by length, not applied blindly — see `MARK_REQUIRED_ABOVE_WORDS`.
 */
function checkSomethingIsMarked(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    if (block.kind !== 'prose' && block.kind !== 'callout') return

    /* An example is the illustration, not new vocabulary. Its important word is
       the whole of it, and demanding a bold term inside "log₁₀ 1000 = 3" would
       have the author bolding a number to satisfy a checker. */
    if (block.role === 'example') return

    if (block.terms.length > 0) return
    if (words(block.body).length <= MARK_REQUIRED_ABOVE_WORDS) return

    out.push({
      path: `blocks[${i}]`,
      rule: 'nothing-marked',
      message:
        `this block marks no important word, so nothing in it survives a skim. ` +
        `Mark the term worth remembering as "key", or the one that separates two ` +
        `confusable things as "distinction"`,
    })
  })
}

/**
 * A run of text between blank lines. Where the reader gets to breathe.
 *
 * This is the unit the whole length rule is built on, and it is why a body
 * carries its own blank lines rather than the renderer inventing breaks: only
 * the author knows where one idea stops and the next begins. A renderer
 * splitting on sentence count would break mid-thought and call it spacing.
 */
export function segments(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** R3, R8, R12, R13 — nothing arrives in one unbroken run bigger than a reader holds. */
function checkRunLengths(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    const text = readableText(block)
    if (text === '') return

    /* The definition is capped whole: it is one idea, and splitting it into
       instalments to fit the budget would defeat the point of having one. */
    if (block.role === 'definition') {
      const count = words(text).length
      if (count > MAX_DEFINITION_WORDS) {
        out.push({
          path: `blocks[${i}]`,
          rule: 'definition-too-long',
          message:
            `the definition is ${count} words, and the cap is ${MAX_DEFINITION_WORDS}. ` +
            `Fewer is fine; more is not. This is the sentence the learner has to be able to hold`,
        })
      }
      if (segments(text).length > 1) {
        out.push({
          path: `blocks[${i}]`,
          rule: 'definition-split-up',
          message:
            'the definition is broken across a blank line. It is one idea and arrives in one piece; ' +
            'the material that needs room belongs in the blocks after it',
        })
      }
      return
    }

    const budget = block.role === 'example' ? MAX_EXAMPLE_WORDS : MAX_RUN_WORDS
    segments(text).forEach((run, s) => {
      const count = words(run).length
      if (count <= budget) return
      out.push({
        path: `blocks[${i}]`,
        rule: 'run-too-long',
        message:
          `${count} words with no break, and the limit is ${budget} in one go. ` +
          `The block may be as long as it needs to be — put a blank line in every two or three ` +
          `lines so the reader has somewhere to breathe. Offending run: "${run.slice(0, 60)}…"` +
          (s === 0 ? '' : ` (run ${s + 1})`),
      })
    })
  })
}

/**
 * R4 — the first sentence names the topic.
 *
 * A SHAPE, NOT A BANNED-WORD LIST.
 *
 * The obvious check is a list: "great question", "wow", "sure", "certainly".
 * A list is exactly as good as the imagination of whoever last edited it and
 * fails silently — an invented pleasantry nobody thought of walks straight
 * through. "Splendid enquiry, dear scholar!" is on no list anywhere and is
 * caught here, because it shares no word with what the lesson is about.
 *
 * The anchor is deliberately wide — the question, the block's own title, and
 * every declared technical term — because a gate that cries wolf gets switched
 * off, and then it enforces nothing at all.
 */
function checkOpensOnTheTopic(lesson: Lesson, out: TeachingIssue[]): void {
  const first = lesson.blocks[0]
  if (first === undefined) return

  const text = readableText(first)
  if (text === '') return

  const anchor = contentWords(lesson.question)
  for (const t of lesson.technicalTerms) for (const w of contentWords(t.term)) anchor.add(w)
  if (first.title !== undefined) for (const w of contentWords(first.title)) anchor.add(w)
  if (anchor.size === 0) return

  const opening = contentWords(firstSentence(text))
  if ([...opening].some((w) => anchor.has(w))) return

  out.push({
    path: 'blocks[0]',
    rule: 'does-not-open-on-the-topic',
    message:
      `the first sentence — "${firstSentence(text)}" — names nothing the lesson is about. ` +
      `Teaching starts on the first word: state the topic, the doubt or the question`,
  })
}

/**
 * R5 — framework before detail, definition first, summary last.
 *
 * The five ordering rules collapse into four comparisons because every block
 * declares its job. `definition` opens, `framework` precedes anything it frames,
 * `classification` precedes the components it lists, `summary` closes.
 */
function checkArc(lesson: Lesson, out: TeachingIssue[]): void {
  const roleAt = lesson.blocks.map((b) => b.role)
  const firstOf = (role: BlockRole): number => roleAt.indexOf(role)
  const lastOf = (role: BlockRole): number => roleAt.lastIndexOf(role)

  const definitions = roleAt.filter((r) => r === 'definition').length
  if (definitions === 0) {
    out.push({
      path: 'blocks',
      rule: 'no-definition',
      message:
        'no block is the definition. The simplest correct sentence about the topic comes first, ' +
        'before any classification and before any technical term',
    })
  } else if (definitions > 1) {
    out.push({
      path: 'blocks',
      rule: 'many-definitions',
      message: `${definitions} blocks claim to be the definition; a topic has one simplest wording`,
    })
  } else {
    /*
     * ANCHORS MAY COME FIRST, AND NOTHING ELSE MAY.
     *
     * The strongest pattern in both reference explanations: open on ground the
     * learner already holds, turn THAT into the question, and let the
     * definition arrive as the answer. "Look at 2³ = 8 — you already know the
     * base is 2" before "a logarithm is…".
     *
     * Requiring the definition at index 0 outright forbade that, which made
     * every lesson start on unfamiliar ground. Anchors are the one exception,
     * and they are bounded: everything before the definition must be an anchor.
     */
    const at = firstOf('definition')
    const before = roleAt.slice(0, at)
    const intruder = before.findIndex((r) => r !== 'anchor')
    if (intruder !== -1) {
      out.push({
        path: `blocks[${intruder}]`,
        rule: 'material-before-the-definition',
        message:
          `a "${before[intruder]}" block comes before the definition. Only an anchor may — ` +
          `something the learner already knows, used to raise the question the definition answers`,
      })
    }
  }

  const framework = firstOf('framework')
  if (framework !== -1) {
    for (const role of ['classification', 'component', 'contrast', 'misconception'] as const) {
      const at = firstOf(role)
      if (at !== -1 && at < framework) {
        out.push({
          path: `blocks[${at}]`,
          rule: 'detail-before-framework',
          message:
            `a ${role} block arrives before the framework it hangs from. ` +
            `Give the simple mental model first, then the detail`,
        })
      }
    }
  }

  const classification = firstOf('classification')
  const component = firstOf('component')
  if (classification !== -1 && component !== -1 && component < classification) {
    out.push({
      path: `blocks[${component}]`,
      rule: 'component-before-classification',
      message: 'a component is taught before the list it belongs to, so the reader cannot place it',
    })
  }

  const summaries = roleAt.filter((r) => r === 'summary').length
  if (summaries === 0) {
    out.push({
      path: 'blocks',
      rule: 'no-summary',
      message:
        'the lesson stops rather than ending. After the full system, close with the progression ' +
        'and the one sentence worth keeping',
    })
  } else if (summaries > 1) {
    out.push({
      path: 'blocks',
      rule: 'many-summaries',
      message: `${summaries} summary blocks; a lesson ends once`,
    })
  } else {
    /*
     * THE SUMMARY CLOSES THE CORE, NOT THE FILE.
     *
     * The rule used to be "the summary is the last block", and that made depth
     * impossible to offer: anything the lesson could go on to would have had to
     * sit before the conclusion, which means the learner meets it whether they
     * asked for it or not.
     *
     * So the summary ends the CORE — the answer to the question actually
     * asked — and `deeper` material follows it, reached only by saying yes to
     * a named offer at the checkpoint.
     */
    const at = lastOf('summary')
    const lastCore = lesson.blocks.map((b) => b.depth).lastIndexOf('core')

    if (lesson.blocks[at]?.depth !== 'core') {
      out.push({
        path: `blocks[${at}]`,
        rule: 'summary-is-not-core',
        message:
          'the summary is marked as deeper material. It closes the answer the learner asked for, ' +
          'so it belongs in the core',
      })
    } else if (at !== lastCore) {
      out.push({
        path: `blocks[${at}]`,
        rule: 'summary-does-not-close-the-core',
        message:
          'core material comes after the summary, so the answer carries on after it has ended. ' +
          'Anything past the summary is deeper material the learner has to be offered by name',
      })
    }

    const firstDeeper = lesson.blocks.findIndex((b) => b.depth === 'deeper')
    if (firstDeeper !== -1 && firstDeeper < lastCore) {
      out.push({
        path: `blocks[${firstDeeper}]`,
        rule: 'deeper-material-inside-the-core',
        message:
          'deeper material is mixed into the core, so the learner meets it without being asked. ' +
          'Everything offered beyond the answer comes after the summary',
      })
    }
  }
}

/** R6 — a technical term may not appear before the block that earns it. */
function checkTechnicalTermsArriveLate(lesson: Lesson, out: TeachingIssue[]): void {
  const indexOfBlock = new Map(lesson.blocks.map((b, i) => [b.id, i]))

  for (const declared of lesson.technicalTerms) {
    const earnedAt = indexOfBlock.get(declared.introducedIn)
    if (earnedAt === undefined) {
      out.push({
        path: 'technicalTerms',
        rule: 'term-introduced-nowhere',
        message: `"${declared.term}" says it is introduced in "${declared.introducedIn}", which is not a block`,
      })
      continue
    }

    const needle = declared.term.toLowerCase()

    /*
     * A WORD THE LEARNER USED IS ALREADY INTRODUCED — BY THEM.
     *
     * MEASURED. Against `openai/gpt-oss-120b`, five of six subjects produced a
     * passing concept. The single refusal was "How does a BILL become a law in
     * India?", refused because "bill" appeared before the block that introduced
     * it. The learner typed that word. They cannot have been confused by it —
     * it is how they asked.
     *
     * The message below states this rule's purpose: "Define in the simplest
     * correct words first; the technical word comes after the idea lands." That
     * is about a word the learner does NOT know yet. Their own vocabulary is
     * not that word.
     *
     * Without this exemption the rule fires on every correct lesson for any
     * topic whose NAME is the technical term — photosynthesis, inflation,
     * recursion, a bill — which is not a strict rule but a wrong one, and it
     * cost a whole subject.
     *
     * Word-boundary matched, not substring: "a bill" must not exempt "billion".
     */
    const askedWith = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (askedWith.test(lesson.question)) continue

    lesson.blocks.forEach((block, i) => {
      if (i >= earnedAt) return
      const haystack = `${block.title ?? ''} ${readableText(block)}`.toLowerCase()
      if (!haystack.includes(needle)) return

      out.push({
        path: `blocks[${i}]`,
        rule: block.role === 'definition' ? 'technical-term-in-definition' : 'technical-term-too-early',
        message:
          `"${declared.term}" is used before the block that introduces it. ` +
          `Define in the simplest correct words first; the technical word comes after the idea lands`,
      })
    })
  }
}

/** R7 — a definition is a sentence, not a sentence plus a formula plus a case. */
function checkDefinitionCarriesOneThing(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    if (block.role !== 'definition') return

    if (!TEXT_KINDS.has(block.kind)) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'definition-is-not-prose',
        message: `a definition is written, not drawn; this one is a ${block.kind} block`,
      })
      return
    }

    const body = readableText(block)
    if (/[=∴≈≤≥]|\\\(|\$\$/.test(body)) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'definition-mixes-in-a-formula',
        message: 'the definition carries a formula. Put the formula in its own equation block',
      })
    }
    if (/\b(for example|e\.g\.|for instance)\b/i.test(body)) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'definition-mixes-in-an-example',
        message: 'the definition carries an example. Put the example in its own block',
      })
    }
  })
}

/** R8 — an example isolates one rule, and says which. */
function checkExamplesIsolateOneRule(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    if (block.role !== 'example') return

    const links = lesson.relations.filter((r) => r.kind === 'exemplifies' && r.from === block.id)
    if (links.length !== 1) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'example-isolates-nothing',
        message:
          `an example points at ${links.length} rules via "exemplifies"; it must point at exactly one, ` +
          `or the reader cannot tell what it is an example OF`,
      })
    }
  })
}

/** R9 — every lesson shows something, and nothing shown is decoration. */
function checkRepresentations(lesson: Lesson, out: TeachingIssue[]): void {
  const shown = lesson.blocks.filter((b) => REPRESENTATION_KINDS.has(b.kind))
  if (shown.length === 0) {
    out.push({
      path: 'blocks',
      rule: 'nothing-is-shown',
      message:
        'the lesson is all words. Every concept gets one representation — a chart, a table, ' +
        'a flow or a figure — chosen because it fits, never for decoration',
    })
  }

  const touched = new Set(lesson.relations.flatMap((r) => [r.from, r.to]))
  lesson.blocks.forEach((block, i) => {
    if (!REPRESENTATION_KINDS.has(block.kind)) return
    if (touched.has(block.id)) return
    out.push({
      path: `blocks[${i}]`,
      rule: 'representation-is-decoration',
      message:
        `the ${block.kind} "${block.id}" is joined to nothing by a relation, so nothing in the ` +
        `lesson refers to it. A representation earns its place or it is decoration`,
    })
  })
}

/**
 * A CHART THAT MISREPRESENTS ITS DATA IS WRONG AT EVERY LEVEL.
 *
 * A CHUNK rule, not an arc rule, and the placement is the argument. This was
 * first written inside `checkRepresentations`, which only runs when a full
 * lesson arc is required -- so a doubt answer could carry a bar chart of a
 * curve and nothing would say so. Whether bars claim the gaps between values
 * carry no meaning is a fact about ONE BLOCK and its own numbers. It does not
 * become true because the surrounding blocks form an arc.
 *
 * Its former neighbours are arc-gated for real reasons: `nothing-is-shown`
 * counts blocks across a whole lesson, and `representation-is-decoration`
 * reads the relation graph. Both are statements about a COMPOSED lesson. This
 * one is a statement about a chart.
 */
function checkChartFitsItsData(lesson: Lesson, out: TeachingIssue[]): void {
/*
 * R9b — THE CHART MUST FIT THE DATA, NOT SATISFY R9.
 *
 * `nothing-is-shown` demands a representation and its own message says one
 * "chosen because it fits". Nothing enforced the fitting half, so the
 * cheapest way to satisfy R9 was to bolt on whatever chart came to mind --
 * and a rule satisfiable by the wrong answer teaches a model to give the
 * wrong answer.
 *
 * The registry already records when a type is the wrong choice.
 * `REPRESENTATIONS.bar.avoidWhen` reads "the x axis is continuous — use a
 * line", and that is the case checked here. It is the one `avoidWhen` that
 * is mechanically decidable: `points.x` is `number | string`, so numbers ARE
 * the continuous axis. The rest of the registry's advice is prose aimed at a
 * human, and a gate that guessed at it would cry wolf.
 *
 * Why it matters to a learner: bars claim the gaps between them carry no
 * meaning. On a continuous axis the gaps are the whole point, so a bar chart
 * of a curve states something false about the data while passing every other
 * check in this file.
 */
lesson.blocks.forEach((block, i) => {
  if (block.kind !== 'chart') return
  const chart = block as { chartType?: string; series?: { points?: { x?: unknown }[] }[] }
  if (chart.chartType !== 'bar') return
  const points = (chart.series ?? []).flatMap((s) => s.points ?? [])
  /* EVERY x numeric, not merely one. A single numeric label among categories
     is a category that happens to be a number ("2024"), and refusing that
     would be the false positive that gets a gate switched off. */
  if (points.length === 0 || !points.every((p) => typeof p.x === 'number')) return
  out.push({
    path: `blocks[${i}]`,
    rule: 'chart-fights-its-data',
    message:
      `the chart "${block.id}" draws bars over a continuous axis. Bars say the gaps between ` +
      'values carry no meaning; on a numeric axis they carry all of it. Use a line',
  })
})
}

/** R10 — confusable things are put side by side, not described apart. */
function checkContrastsSitSideBySide(lesson: Lesson, out: TeachingIssue[]): void {
  const contrasts = lesson.relations.filter((r) => r.kind === 'contrasts')
  if (contrasts.length === 0) return

  /*
   * `tabular` BELONGS HERE, AND LEAVING IT OUT WAS A BUG IN THIS RULE.
   *
   * `billBecomesLaw` ships `chambers` — `as: 'comparisonTable'`, whose payload
   * shape is `tabular`. That is a side-by-side comparison by construction, and
   * this rule refused the lesson for not comparing two things while it was
   * visibly comparing them.
   *
   * The failure mode worth naming: a narrow rule does not merely miss a case,
   * it pushes the author to rewrite good content around the checker. The rule
   * moved, not the lesson.
   */
  const sideBySide = lesson.blocks.some(
    (b) =>
      b.kind === 'table' ||
      (b.kind === 'figure' && (b.data.shape === 'matrix' || b.data.shape === 'tabular')),
  )
  if (sideBySide) return

  out.push({
    path: 'relations',
    rule: 'contrast-without-a-comparison',
    message:
      'two things are contrasted but nothing puts them side by side. A difference described in ' +
      'two separate paragraphs is a difference the reader has to hold in their head',
  })
}

/**
 * R11 — a chain is drawn, not narrated.
 *
 * Two triggers, and the thirty-word cap is what makes the second safe: three
 * sequence words inside thirty is a chain, not a coincidence.
 */
const SEQUENCE_WORD = /\b(then|next|after that|leads to|causes|results in|so that)\b/gi

function checkChainsAreDrawn(lesson: Lesson, out: TeachingIssue[]): void {
  lesson.blocks.forEach((block, i) => {
    if (!TEXT_KINDS.has(block.kind)) return
    const body = readableText(block)

    if (/(->|→|=>)/.test(body)) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'arrow-drawn-in-prose',
        message: 'an arrow is typed into a sentence. Causal order is a flow block, where it is drawn',
      })
      return
    }

    const hits = body.match(SEQUENCE_WORD)
    if (hits !== null && hits.length >= 3) {
      out.push({
        path: `blocks[${i}]`,
        rule: 'chain-narrated-not-drawn',
        message:
          `${hits.length} sequence words in one chunk — this is a chain written out as a sentence. ` +
          `Draw it as a flow so the order is visible instead of remembered`,
      })
    }
  })
}

/*
 * THE AMBIGUOUS-WORD RULE WAS REMOVED, AND THE MEASUREMENT IS WHY.
 *
 * It held a register of words whose everyday meaning fights their technical
 * one -- right, base, power, order, matter, current, state, positive, mean --
 * and refused a lesson that used one without declaring it. The intent was
 * real: a reader meeting "right" in a geometry lesson genuinely cannot tell
 * which sense is meant, and that exact confusion produced a field named
 * `right` in this very branch.
 *
 * MEASURED, on seven ordinary English sentences inside a lesson about reading
 * tables, none of them using a technical sense of anything:
 *
 *   "In order to see this, look at the two rows."     -> REFUSED
 *   "It does not matter which one you pick first."    -> REFUSED
 *   "The current example shows the same idea again."  -> REFUSED
 *   "You state the rule, then you test it."           -> REFUSED
 *   "That is a positive sign the method is sound."    -> REFUSED
 *   "The mean of those numbers is what we want."      -> REFUSED
 *   "This works well in most cases you will meet."    -> passed
 *
 * Six false alarms out of seven. It also refused this repository's own gas
 * lesson for using "force" in a physics lesson, where the physical sense is
 * the only sense present.
 *
 * THE DEFECT IS IN THE PREMISE, NOT THE LIST. Ambiguity is a property of a
 * word IN USE, not of the word. "In order to" is not the mathematical order;
 * no list can separate those, and a longer list makes it worse rather than
 * better. This was the one rule here that was a lexical list instead of a
 * shape. It was documented as a deliberate exception, and the exception did
 * not pay.
 *
 * Its own docstring said a gate that cries wolf gets switched off. It did, six
 * times in seven -- so it is switched off deliberately rather than left to be
 * quietly ignored.
 *
 * THE NEED IS REAL AND IS MET ELSEWHERE. Knowing which sense a word carries is
 * a judgement, and judgement is what the mechanisms in
 * `docs/engineering/teaching-patterns.md` are for: self-critique against a
 * confused reader, and generating several explanations and choosing. A rule
 * can refuse a wall of text. It cannot know what a word means.
 */

/**
 * A stated rule is earned, or it is an assertion.
 *
 * THE PATTERN THIS COMES FROM, AND WHY IT IS UNIVERSAL
 * ---------------------------------------------------
 * The reference explanation does not hand over the product law. It asks "why
 * does the product law work?", derives it from the exponent laws, and then says
 * the payoff out loud: *"you are not memorising a random rule."* The second
 * reference does the same thing without a single formula — five numbered steps
 * from chemical dependence to lost productive capacity, each following from the
 * last.
 *
 * Different subjects, same move. A lesson that states rules and justifies none
 * is asking to be memorised, which is the failure both references were written
 * to avoid.
 *
 * ONE, NOT ONE EACH. Requiring a derivation per rule would push authors into
 * writing thin ones to satisfy a counter. Requiring at least one means the
 * lesson has to show the learner what being convinced looks like.
 */
function checkRulesAreEarned(lesson: Lesson, out: TeachingIssue[]): void {
  const rules = lesson.blocks.filter((b) => b.role === 'rule')
  if (rules.length === 0) return

  const earned = lesson.blocks.some((b) => b.kind === 'reasoning' && b.mode === 'why')
  if (earned) return

  out.push({
    path: 'blocks',
    rule: 'rule-stated-but-never-earned',
    message:
      `${rules.length} rule block(s), and nothing derives any of them. A rule handed over with no ` +
      `justification is a rule to be memorised. Add a reasoning block in "why" mode that shows one ` +
      `of them falling out of something the learner already accepted`,
  })
}

/** R14 — the body outweighs the headings. */
function checkBodyOutweighsHeadings(lesson: Lesson, out: TeachingIssue[]): void {
  let body = 0
  let heading = 0
  for (const block of lesson.blocks) {
    body += words(readableText(block)).length
    if (block.title !== undefined) heading += words(block.title).length
  }

  /*
   * A lesson made only of diagrams has no headings AND no body, and `0 > 0` is
   * false — so this rule reported "the headings outweigh the body" about a
   * lesson with neither. Nothing was wrong with it and the message was
   * nonsense.
   *
   * Nothing to weigh is not an imbalance. The rule fires when headings actually
   * win, which needs at least one heading word to exist.
   */
  if (heading === 0) return
  if (body > heading) return

  out.push({
    path: 'blocks',
    rule: 'headings-outweigh-the-body',
    message:
      `${heading} words of heading against ${body} of body. The lesson is a contents page: ` +
      `the teaching has to be in the text, not in the titles`,
  })
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                    */
/* -------------------------------------------------------------------------- */

export interface TeachingOptions {
  /**
   * Whether the full arc is required — definition first, summary last, one
   * representation at least.
   *
   * True for a lesson being TAUGHT. False for a doubt answer, which is a reply
   * to one question and has no business opening with a definition and closing
   * with a progression. Without this split the arc rules would refuse every
   * answer the doubt resolver produces, and the honest response to that is a
   * named scope rather than a quietly weakened rule.
   */
  arc: boolean
}

/**
 * Every teaching rule this lesson breaks, in one pass.
 *
 * All checks run rather than stopping at the first, for the reason
 * `llm/validation.py` gives: one long chunk is a rewrite, while a long chunk
 * AND a missing definition AND a decorative chart is a lesson that was never
 * shaped at all, and the caller cannot tell those apart from one message.
 */
export function checkTeaching(
  lesson: Lesson,
  options: TeachingOptions = { arc: true },
): TeachingIssue[] {
  const out: TeachingIssue[] = []

  /* Chunk rules hold everywhere, including in a doubt answer. A reply that
     arrives as a wall of text is the same failure as a lesson that does. */
  checkMarkedTermsExist(lesson, out)
  checkRunLengths(lesson, out)
  checkDefinitionCarriesOneThing(lesson, out)
  checkExamplesIsolateOneRule(lesson, out)
  checkChainsAreDrawn(lesson, out)
  checkTechnicalTermsArriveLate(lesson, out)
  checkChartFitsItsData(lesson, out)

  if (options.arc) {
    /*
     * ARC-ONLY, AND THE COUNT IS THE ARGUMENT.
     *
     * "Teaching starts on the first word" is a rule about how an AUTHOR opens
     * a lesson. An assembled reply has no authored opening: it leads with a
     * block somebody wrote for a different position in a different lesson, and
     * the only way to satisfy this rule would be to write a new first sentence
     * — which every builder in this codebase refuses to do on purpose, because
     * a resolver that cannot write a sentence about the subject cannot write a
     * wrong one.
     *
     * Held as an integrity rule it refused, measured: `buildCheckedAnswer`,
     * `buildConflictAnswer` and `buildAnswer` in `webResolver.ts`,
     * `wholeLessonStrategy` in `doubt.ts`, and — the one that shows the real
     * shape — `aloneStrategy`, which answers by showing a single block the
     * learner named. That last one fails whenever the block's first sentence
     * does not happen to repeat the question, which is most of the time.
     * Five call sites, one cause, and each "fix" was a different way of making
     * software write an opening sentence.
     *
     * Full force on a taught lesson, where an author IS writing the opening.
     */
    checkOpensOnTheTopic(lesson, out)
    checkSomethingIsMarked(lesson, out)
    checkArc(lesson, out)
    checkRulesAreEarned(lesson, out)
    checkRepresentations(lesson, out)
    checkContrastsSitSideBySide(lesson, out)
    checkBodyOutweighsHeadings(lesson, out)
  }

  return out
}
