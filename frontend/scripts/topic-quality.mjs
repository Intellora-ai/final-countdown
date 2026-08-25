/**
 * TOPIC QUALITY — is this string something a student can practise?
 *
 * The curriculum under `src/data/curriculum/` is extracted from 37 official CBSE
 * PDFs. Extraction is good in places and bad in others, and the bad output does
 * not look bad: it is a string in a `name` field, exactly like a real topic.
 *
 * Measured across all four classes, 1,059 of 3,995 concepts cannot be
 * practised. A marks-table row. A teacher's instruction. Half a sentence. An
 * exam question that lost its question mark.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE CURRICULUM BUILD
 * ---------------------------------------------------
 * `scripts/curriculum/build.mjs` already has an audit, and it asks a different
 * question: did this subject produce ENOUGH concepts. That is a count. This asks
 * whether the concepts are USABLE, which a count cannot see — a subject can hit
 * every quota with 188 fragments.
 *
 * SHAPES, NOT A WORD LIST
 * -----------------------
 * Every rule asks about STRUCTURE: does this have the shape of a heading, or the
 * shape of prose someone chopped in half. A list of known-bad strings passes
 * everything nobody thought of, and needs editing every time the extractor
 * improves. Shapes survive both.
 *
 * The false-negative direction is deliberate. `To determine volume of an
 * irregular lamina` reads like an instruction and IS a real physics practical, so
 * the instruction rule is anchored to bare imperatives and lets infinitives
 * through. An earlier version without that carve-out flagged roughly 200 genuine
 * practicals, and a gate that flags real topics gets switched off.
 */

/**
 * Words that begin a continuation rather than a heading.
 *
 * A heading names a thing. These start halfway through a sentence, which is
 * what a chopped paragraph looks like: "for example", "we observe that", "the
 * best approximations to be discovered over human history".
 *
 * SPLIT IN TWO, BECAUSE CASE IS THE ONLY THING THAT SEPARATES THEM.
 *
 * `The universal law of gravitation` is a real unit in both the JEE and the
 * NEET syllabus, and one list deleted it along with 30 more like it -- plus
 * `The Solid State` and `The Living World` in the school syllabus. A determiner
 * opens an enormous number of genuine headings.
 *
 * It also opens a chopped sentence, and there the determiner is LOWER-CASE,
 * because the words that carried the capital were on the line above. That is
 * structural rather than another list entry. A connective is different again:
 * no heading has ever begun `And ...`, so those match in either case.
 */
const DETERMINER = '(?:the|a|an|its|their|which|where|when|that|this|these|those|such|it|he|she|they)'

const CONNECTIVE = '(?:for|in|with|including|and|or|but|of|as|at|by|from|we|you|us|let|e\\.g\\.?|i\\.e\\.?|etc)'

/**
 * Bare imperatives — an instruction to a teacher or a student, not a scope.
 *
 * ANCHORED TO THE BARE VERB ON PURPOSE. `To determine...` and `Determining...`
 * are how a syllabus names an experiment; `Determine...` is how it sets one.
 * Only the second is excluded, and the difference is a single word form.
 */
const IMPERATIVE =
  '(?:match|divide|create|draw|write|explain|list|state|discuss|prepare|collect|observe|note|find|solve|show|prove|calculate|identify|describe|define|name|give|make|complete|fill|choose|answer|read|study|visit|conduct|perform|record|compare|classify)'

/*
 * Words a syllabus uses to label the parts of a document or a worked example.
 * A LIST, deliberately and explicitly -- see the `bare-label` rule.
 */
const LABEL_WORDS =
  'part|unit|section|theory|chapter|paper|example|hint|proof|statement|conclusion|syllabus|day|class|note|remark|solution|answer|question|exercise|activity|summary|introduction'

/**
 * The word alone, or carrying a bare designator: "Part A", "Example 14",
 * "Class X", "Unit 1", "Day 6".
 *
 * ONE rule for both shapes. An earlier split into "alone" and "numbered" was
 * stricter than the rule it replaced and silently stopped catching "Part A",
 * because a single letter is neither a digit nor a roman numeral. Caught by an
 * existing test going red, which is the only reason it is not in the product.
 */
/*
 * The designator is a SEPARATE token, and that separator is load-bearing.
 *
 * `Solutions` is a chemistry unit in both the JEE and the NEET syllabus, and an
 * earlier version of this rule deleted it: `solution` is on the list above
 * because a worked example ends with the word, trailing letters were allowed,
 * so the plural matched the singular label. One real unit lost per exam,
 * silently, and indistinguishable from a unit that was never published.
 *
 * `Part A`, `Unit 1`, `Day 6` and a bare `Theory` still match. `Solutions`
 * does not, because it is one word and that word is not on the list.
 */
const LABEL_ALONE = new RegExp(`^(?:${LABEL_WORDS})(?:\\s+[a-z0-9ivxlc-]+)?$`, 'i')
const LABEL_NUMBERED = LABEL_ALONE

const RULES = [
  /* Nothing can be named in two characters. */
  ['too-short', (t) => t.length < 3],

  /* A full stop with more text after it is a paragraph, not a title. */
  ['prose', (t) => /[.?!]\s+\S/.test(t)],

  /* "(ii)", "(a)", "(3)" — the skeleton of an exam question. */
  ['enumerated', (t) => /\(\s*(?:[ivx]+|[a-z]|\d+)\s*\)/.test(t)],

  /* A heading that runs past fourteen words stopped being a heading. */
  ['too-long', (t) => t.split(/\s+/).length > 14],

  [
    'continuation',
    (t) =>
      new RegExp(`^${CONNECTIVE}\\s`, 'i').test(t) || new RegExp(`^${DETERMINER}\\s`).test(t),
  ],

  ['instruction', (t) => new RegExp(`^${IMPERATIVE}\\s`, 'i').test(t)],

  /*
   * A DIVIDER IN THE DOCUMENT, carrying no subject matter.
   *
   * Two shapes and one list, and the list is named as a list rather than
   * dressed up as a rule:
   *
   *   shape  a structural word plus a bare number or numeral
   *          "Example 14" · "Unit 1" · "Class X" · "Day 6"
   *   shape  that same word standing alone
   *   list   the words themselves
   *
   * The list is unavoidable here and the honest thing is to say so. "Hint",
   * "Proof" and "Statement" are perfectly ordinary English nouns; nothing about
   * their SHAPE separates them from "Force" or "Ratio". What separates them is
   * that a syllabus uses them to label parts of a worked example rather than to
   * name subject matter, and that is knowledge, not structure.
   *
   * Found in a screenshot: 24 of 84 chapters on the class-10 map read
   * "Example 1", "Hint", "Statement", "Proof".
   */
  ['bare-label', (t) => LABEL_ALONE.test(t) || LABEL_NUMBERED.test(t)],

  /* Two bare numbers at the end is the marks column of a syllabus table. */
  ['marks-row', (t) => /\b\d+\s+\d+\s*$/.test(t)],
]

/**
 * Two rules are PROXIES tuned to one document style, and only one style.
 *
 * Measured over every topic string in `src/data/exams/*.ts`, `too-long` and
 * `instruction` scored 0 true positives and 123 false positives -- 57 on JEE,
 * 66 on NEET, 6 on CLAT. An exam board publishes a topic as a dense comma list
 * that runs past fourteen words, and CLAT publishes SKILLS, which are
 * imperative sentences on purpose because CLAT states outright that it tests
 * aptitude rather than a syllabus.
 *
 * Both rules keep earning their place on school syllabus, where every real
 * concept name is short and a long one means the extractor ran two lines
 * together. So the caller says which kind of document it is grading. This is a
 * real distinction between two document styles, not a carve-out for the input
 * that broke -- every rule that catches actual wreckage still fires in both.
 */
const SYLLABUS_ONLY = new Set(['too-long', 'instruction'])

/**
 * Every reason this string cannot be a practice topic. Empty means it can.
 *
 * `style` defaults to `syllabus` so an un-styled call keeps every rule. A
 * default of `exam` would silently drop two rules for every existing caller.
 */
export function reasonsUnusable(name, style = 'syllabus') {
  const text = String(name ?? '').trim()
  return RULES.filter(
    ([reason, test]) => !(style === 'exam' && SYLLABUS_ONLY.has(reason)) && test(text),
  ).map(([reason]) => reason)
}

/**
 * The same question, asked the other way.
 *
 * Derived rather than reimplemented: two functions that could disagree about
 * the same fact is the drift this repository keeps paying for.
 */
export function isPractisable(name, style = 'syllabus') {
  return reasonsUnusable(name, style).length === 0
}

/** A subject below this is broken as a whole, however the individual calls landed. */
export const USABLE_FLOOR = 0.8

/**
 * Score every subject by the share of its topics a student could practise.
 *
 * A RATIO, NOT A VERDICT PER TOPIC. No classifier gets every string right, so
 * this does not bet on one. A subject where one topic in three is unusable is
 * broken whichever way the individual calls went; a subject at 98% is fine even
 * if one call was wrong.
 */
export function auditSubjects(subjects) {
  return subjects.map((subject) => {
    const concepts = (subject.chapters ?? []).flatMap((chapter) => chapter.concepts ?? [])

    const graded = concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      reasons: reasonsUnusable(concept.name),
    }))

    const usable = graded.filter((each) => each.reasons.length === 0).length
    const total = graded.length

    /*
     * 0 of 0 is 1.0 by arithmetic and 0 by usefulness. A subject that extracted
     * nothing is the worst case, not the best, and scoring it perfect would hide
     * exactly the subjects most in need of a fix.
     */
    const ratio = total === 0 ? 0 : usable / total

    return {
      subject: subject.name,
      total,
      usable,
      ratio,
      ok: total > 0 && ratio >= USABLE_FLOOR,
      examples: graded.filter((each) => each.reasons.length > 0).slice(0, 5),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Render one line per subject, worst first, and a verdict.
 *
 * SKIPS RATHER THAN PASSES when the curriculum is absent. The generated data
 * lands from a separate build (`npm run curriculum:build`) and is not on every
 * branch. "Nothing to check" and "everything checked out" are different claims,
 * and a gate that conflates them reports PASS on an empty directory forever.
 */
export function report(reports) {
  if (reports.length === 0) {
    return { failed: false, skipped: true, text: 'TOPIC QUALITY: SKIPPED — no curriculum data present' }
  }

  const lines = []
  const worst = [...reports].sort((a, b) => a.ratio - b.ratio)

  for (const each of worst) {
    const pct = (each.ratio * 100).toFixed(1).padStart(5)
    lines.push(`  ${each.ok ? 'ok  ' : 'FAIL'}  ${pct}%  ${each.usable}/${each.total}  ${each.subject}`)
    if (!each.ok) {
      for (const example of each.examples) {
        lines.push(`          [${example.reasons.join(',')}] ${example.name.slice(0, 68)}`)
      }
    }
  }

  const failed = reports.filter((each) => !each.ok)
  lines.push('')
  lines.push(
    failed.length === 0
      ? `TOPIC QUALITY: PASS — ${reports.length} subject(s) at or above ${USABLE_FLOOR * 100}% usable`
      : `TOPIC QUALITY: FAIL — ${failed.length} of ${reports.length} subject(s) below ${USABLE_FLOOR * 100}% usable`,
  )

  return { failed: failed.length > 0, skipped: false, text: lines.join('\n') }
}
