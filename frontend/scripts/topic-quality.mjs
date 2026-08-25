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
 * A heading names a thing. These start halfway through a sentence, which is what
 * a chopped paragraph looks like: "for example", "we observe that", "the best
 * approximations to be discovered over human history".
 */
const CONTINUATION =
  '(?:for|in|with|including|and|or|but|of|as|at|by|from|the|a|an|its|their|which|where|when|that|this|these|those|such|we|you|us|let|it|he|she|they|e\\.g|i\\.e|etc)'

/**
 * Bare imperatives — an instruction to a teacher or a student, not a scope.
 *
 * ANCHORED TO THE BARE VERB ON PURPOSE. `To determine...` and `Determining...`
 * are how a syllabus names an experiment; `Determine...` is how it sets one.
 * Only the second is excluded, and the difference is a single word form.
 */
const IMPERATIVE =
  '(?:match|divide|create|draw|write|explain|list|state|discuss|prepare|collect|observe|note|find|solve|show|prove|calculate|identify|describe|define|name|give|make|complete|fill|choose|answer|read|study|visit|conduct|perform|record|compare|classify)'

const RULES = [
  /* Nothing can be named in two characters. */
  ['too-short', (t) => t.length < 3],

  /* A full stop with more text after it is a paragraph, not a title. */
  ['prose', (t) => /[.?!]\s+\S/.test(t)],

  /* "(ii)", "(a)", "(3)" — the skeleton of an exam question. */
  ['enumerated', (t) => /\(\s*(?:[ivx]+|[a-z]|\d+)\s*\)/.test(t)],

  /* A heading that runs past fourteen words stopped being a heading. */
  ['too-long', (t) => t.split(/\s+/).length > 14],

  ['continuation', (t) => new RegExp(`^${CONTINUATION}\\s`, 'i').test(t)],

  ['instruction', (t) => new RegExp(`^${IMPERATIVE}\\s`, 'i').test(t)],

  /* "Part A", "Unit 1" — a divider in the document, carrying no subject matter. */
  ['bare-label', (t) => /^(?:part|unit|section|theory|chapter|paper)\s*[a-z0-9-]*$/i.test(t)],

  /* Two bare numbers at the end is the marks column of a syllabus table. */
  ['marks-row', (t) => /\b\d+\s+\d+\s*$/.test(t)],
]

/** Every reason this string cannot be a practice topic. Empty means it can. */
export function reasonsUnusable(name) {
  const text = String(name ?? '').trim()
  return RULES.filter(([, test]) => test(text)).map(([reason]) => reason)
}

/**
 * The same question, asked the other way.
 *
 * Derived rather than reimplemented: two functions that could disagree about
 * the same fact is the drift this repository keeps paying for.
 */
export function isPractisable(name) {
  return reasonsUnusable(name).length === 0
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
