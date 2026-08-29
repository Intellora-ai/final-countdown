/**
 * CURRICULUM EXTRACTOR
 *
 * Turns one official syllabus document into structured data, and records the
 * page every item came from.
 *
 * THE DESIGN POINT: IT REFUSES TO GUESS
 *     CBSE does not use one table layout. Four genuinely different shapes were
 *     found across the 37 documents, and one of them (Accountancy) has no
 *     "COURSE STRUCTURE" heading at all. A parser keyed on a single shape
 *     returns an empty list for the others and reports success, which reads
 *     downstream as "this subject has no units" rather than "this parser could
 *     not read this document".
 *
 *     So every document is classified first, and anything without a parser for
 *     its shape arrives as a named entry in `needsReview`. An empty `units`
 *     array is never allowed to mean two different things.
 *
 * WHY THE MARKS ARE ADDED UP
 *     Each document prints its own Total. Summing the parsed rows and comparing
 *     is a free correctness check the document itself supplies: a missed or
 *     misread row shows up as arithmetic that does not balance.
 *
 * WHY BOTH FORMATIVE LISTS SURVIVE
 *     Class X Science names its formative-only topics twice, in two places that
 *     disagree. Keeping only one silently picks a winner. Both are extracted
 *     and the disagreement is reported for a human.
 */

/* Longest-first so the alternation cannot settle on a short prefix. */
const ROMAN = 'XIII|XIV|XVI{0,3}|XII|XI|VIII|VII|VI|IV|IX|III|II|I|X|V'

/* CBSE numbers its unit tables three ways across the 37 documents:
 *   Class X Science      "I    Natural Phenomena       12"
 *   Class XI Mathematics "I.   Sets and Functions      23"   <- trailing dot
 *   Class XI Chemistry   "1    Structure of Atom        9"   <- Arabic
 * The trailing dot is not cosmetic: without it the senior Mathematics syllabus
 * parses as zero units and the subject silently disappears from the app. */
const UNIT_ROW = new RegExp(String.raw`^\s*(${ROMAN})\.?\s{2,}(\S.*?)\s{2,}(\d{1,3})\s*$`)
const ARABIC_UNIT_ROW = /^\s*(\d{1,2})\.?\s{2,}(\S.*?)\s{2,}(\d{1,3})\s*$/
const TOTAL_ROW = /^\s*total\s{2,}(\d{1,3})\s*$/i
/* A Grand Total sums theory plus internal assessment; it is not the total of
 * any one table, so it must not be used to validate one. */
const SUMMARY_ROW = /^\s*(?:grand\s+total|internal\s+assessment)\b/i
/* Any line that begins with a unit number and a title. */
const NUMBERED_ROW = new RegExp(String.raw`^\s*(?:${ROMAN}|\d{1,2})\.?\s{2,}\S.{2,}$`)

/**
 * A numbered row that carries NO marks of its own.
 *
 * This is deliberately defined as "numbered, and not a row with marks" rather
 * than as its own pattern. Written as one regex it also matched rows that DO
 * have marks, because "ALPHA    10" satisfies a trailing `\S.{2,}` just as well
 * as "ALPHA" does — which quietly turned every good row into evidence of a
 * spanning table.
 */
function isNumberedWithoutMarks(line) {
  if (!NUMBERED_ROW.test(line)) return false
  return !UNIT_ROW.test(line) && !ARABIC_UNIT_ROW.test(line)
}
const SPANNING = 'marks span rows: a numbered row carries no marks of its own'

const FORMATIVE_TRIGGER = 'assessed only formatively'
const FORMATIVE_PARA_START = 'The following topics are included'
const NOTE_TRIGGER = 'Note for Teachers'

/** Split pdftotext output into numbered pages. */
export function toPages(text) {
  const raw = String(text).split('\f')
  while (raw.length > 0 && raw[raw.length - 1].trim() === '') raw.pop()
  return raw.map((body, i) => ({ page: i + 1, text: body }))
}

export function findCourseStructurePages(pages) {
  return pages.filter((p) => p.text.toUpperCase().includes('COURSE STRUCTURE')).map((p) => p.page)
}

/**
 * Read the Roman-numeral Unit/Marks table off one page.
 * Total and Internal-assessment rows do not begin with a Roman numeral, so they
 * are excluded by the shape of the row rather than by a list of their names.
 */
/**
 * Rejoin a marks column that pdftotext put on its own line.
 *
 * A vertically centred table cell is emitted below its row:
 *     II.    Algebra
 *                                 10
 * The 10 is Algebra's marks. Without this, Class XII Mathematics parses as six
 * markless rows and the whole subject is refused as unreadable.
 *
 * The join is deliberately narrow. It fires only when the previous line is a
 * numbered row that carried no marks, or a bare Total / Internal assessment
 * label. That keeps it from laundering a genuinely spanning table — Business
 * Studies has another numbered row on the next line, not a bare number, so it
 * stays refused.
 */
export function joinWrappedMarks(pageText) {
  const BARE_NUMBER = /^\s*(\d{1,3})\s*$/
  const BARE_LABEL = /^\s*(?:total|grand total|internal assessment)\s*$/i
  const out = []
  for (const line of String(pageText).split('\n')) {
    const bare = BARE_NUMBER.exec(line)
    const prev = out.length > 0 ? out[out.length - 1] : null
    if (bare && prev !== null && (isNumberedWithoutMarks(prev) || BARE_LABEL.test(prev))) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')}   ${bare[1]}`
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Split one page into unit TABLES, not just rows.
 *
 * A table is the run of numbered rows that ends at a `Total` row or at a gap of
 * two blank lines. Working per table rather than per page matters twice over:
 * a page can hold two tables with two different totals, and a table where some
 * numbered rows carry no marks is a table whose marks SPAN rows and must not be
 * read row by row.
 */
export function parseUnitTables(pageText) {
  const lines = joinWrappedMarks(pageText).split('\n')
  const tables = []
  let current = null
  let blanks = 0

  const open = () => (current ??= { rows: [], incomplete: 0, printedTotal: null })
  const close = () => {
    if (current && current.rows.length > 0) tables.push(current)
    current = null
  }

  for (const line of lines) {
    if (line.trim() === '') {
      blanks += 1
      if (blanks >= 2) close()
      continue
    }
    blanks = 0

    const total = TOTAL_ROW.exec(line)
    if (total) {
      if (current) {
        current.printedTotal = Number.parseInt(total[1], 10)
        close()
      }
      continue
    }
    if (SUMMARY_ROW.test(line)) continue

    const roman = UNIT_ROW.exec(line)
    const arabic = roman ? null : ARABIC_UNIT_ROW.exec(line)
    const m = roman ?? arabic
    if (m) {
      const title = m[2].trim()
      if (/^(total|grand total|internal assessment)$/i.test(title)) continue
      open().rows.push({ unit: m[1], title, marks: Number.parseInt(m[3], 10) })
      continue
    }

    if (isNumberedWithoutMarks(line)) {
      open().incomplete += 1
    }
  }
  close()
  return tables
}

/** Tables safe to publish: every numbered row carried its own marks. */
export function trustedTables(pageText) {
  return parseUnitTables(pageText).filter((t) => t.incomplete === 0)
}

export function parseUnitRows(pageText) {
  return trustedTables(pageText).flatMap((t) => t.rows)
}

/** The Total the document prints for itself, or null when it prints none. */
export function findPrintedTotal(pageText) {
  for (const line of String(pageText).split('\n')) {
    const m = TOTAL_ROW.exec(line)
    if (m) return Number.parseInt(m[1], 10)
  }
  return null
}

/**
 * The boxed "included but assessed only formatively" notices.
 * The boilerplate sentence is skipped; what is captured is the paragraph after
 * it, which is where the actual topic names live.
 */
export function findFormativeBlocks(pages) {
  const blocks = []
  for (const page of pages) {
    if (!page.text.includes(FORMATIVE_TRIGGER)) continue
    const lines = page.text.split('\n')
    const start = lines.findIndex((l) => l.includes(FORMATIVE_PARA_START))
    if (start === -1) {
      blocks.push({ page: page.page, text: page.text.trim() })
      continue
    }
    /* The boilerplate and the topic list are ONE paragraph, with no blank line
     * between them — checked against the real documents. So the boundary is not
     * a blank line, it is the boilerplate's closing words, "...enclosed for
     * reference". Topics run from the next line to the first blank one.
     *
     * Walking to the first blank line instead lands on the paragraph AFTER the
     * box, which on Class X Science page 4 is "Acids, Bases and Salts" — a
     * fully examinable topic that would then have been recorded as exempt. */
    let i = start
    const limit = Math.min(start + 10, lines.length)
    while (i < limit && !/reference\b/i.test(lines[i])) i += 1
    if (i >= limit) {
      /* Boilerplate did not close the way every sampled document closes it.
       * Report the whole page rather than guess at a boundary. */
      blocks.push({ page: page.page, text: page.text.trim(), boundary: 'unrecognised' })
      continue
    }
    i += 1
    const topics = []
    while (i < lines.length && lines[i].trim() !== '') {
      topics.push(lines[i].trim())
      i += 1
    }
    blocks.push({ page: page.page, text: topics.join(' ').trim() })
  }
  return blocks
}

/** The "Note for Teachers" block, which names its own, different list. */
export function findNoteForTeachers(pages) {
  const notes = []
  for (const page of pages) {
    const idx = page.text.indexOf(NOTE_TRIGGER)
    if (idx === -1) continue
    notes.push({ page: page.page, text: page.text.slice(idx).trim() })
  }
  return notes
}

/** Topic names the Note itself lists, so the two lists can be compared. */
export function topicsFromNote(noteText) {
  const m = /The topics\s+([\s\S]*?)\s+will not be assessed/i.exec(noteText)
  if (!m) return []
  return m[1]
    .split(';')
    .map((t) => t.replace(/\s+/g, ' ').replace(/^and\s+/i, '').trim())
    .filter(Boolean)
}

/* Physics-family markers. CBSE uses an en dash, an em dash and a plain hyphen
 * interchangeably inside the same document, so all three are accepted. */
const UNIT_HEADING = /^\s*Unit\s*[\u2013\u2014-]\s*([IVXL]+)\s+(.+?)(?:\s{2,}\d{1,3})?\s*$/
const CHAPTER_ROW = /^\s*Chapter\s*[\u2013\u2014-]\s*(\d{1,2})\s*:\s*(.+?)(?:\s{2,}\d{1,3})?\s*$/

/**
 * Read a table of units that each contain numbered chapters.
 *
 * PER-UNIT MARKS ARE LEFT NULL ON PURPOSE. Physics prints one mark value for a
 * GROUP of units — 23 covers Units I to IV — so no per-unit figure exists in
 * the document. Splitting the group evenly, or pinning 23 to whichever unit the
 * number happened to be printed beside, would both be inventions. The chapters
 * are the part a student actually studies, and those are unambiguous.
 */
export function parseUnitChapters(pageText) {
  const units = []
  let current = null
  for (const line of String(pageText).split('\n')) {
    const unit = UNIT_HEADING.exec(line)
    if (unit) {
      current = { unit: unit[1], title: unit[2].trim(), marks: null, chapters: [] }
      units.push(current)
      continue
    }
    const chapter = CHAPTER_ROW.exec(line)
    if (chapter && current !== null) {
      current.chapters.push({ number: Number.parseInt(chapter[1], 10), title: chapter[2].trim() })
    }
  }
  return units
}

/* "Unit-1: Theoretical Framework", "Unit 5  Understanding the Market". */
const UNIT_HEADING_LINE = /^\s*Unit\s*[-\u2013\u2014]?\s*(\d{1,2})\s*[:.]?\s+(\S.*?)\s*$/

/**
 * Read units the document names in its own body headings.
 *
 * Every row pattern above requires the line to BEGIN with the unit number.
 * Fifteen of the 37 documents instead write the word "Unit" first, which made
 * 190 unit rows across the corpus invisible — including the whole of
 * Accountancy, Sociology and Entrepreneurship.
 *
 * A unit is usually printed twice: once in the summary table and again as the
 * heading of its own section. That is one unit, so results are deduplicated on
 * number plus title, keeping the FIRST page it appeared on — which is the
 * summary table, the better citation.
 */
export function parseUnitHeadings(pages) {
  const seen = new Map()
  for (const page of pages) {
    for (const line of page.text.split('\n')) {
      const m = UNIT_HEADING_LINE.exec(line)
      if (!m) continue
      /* A marks value can share the line; it is not part of the title. */
      const title = m[2].replace(/\s{2,}\d{1,3}$/, '').replace(/\s+/g, ' ').trim()
      if (title.length < 3) continue
      const key = `${m[1]}|${title.toLowerCase()}`
      if (seen.has(key)) continue
      seen.set(key, { unit: Number.parseInt(m[1], 10), title, page: page.page })
    }
  }
  return [...seen.values()]
}

/**
 * What the app needs in order to teach: a title, a page it can be cited to, and
 * marks WHERE THE DOCUMENT ACTUALLY STATES THEM.
 *
 * Marks are only used to prioritise revision. Titles are the thing a student
 * studies. So a document whose marks column spans rows still yields its topics,
 * with `marks: null` — refusing the whole subject would lose correct data to
 * protect against a number the app can live without.
 */
export function topicsFrom(units, headings) {
  if (units.length > 0) {
    return units.map((u) => ({
      unit: u.unit,
      title: u.title,
      marks: typeof u.marks === 'number' ? u.marks : null,
      page: u.page ?? null,
      ...(u.chapters ? { chapters: u.chapters } : {}),
    }))
  }
  return headings.map((h) => ({ unit: h.unit, title: h.title, marks: null, page: h.page }))
}

/* A theme row, found ANYWHERE in the line rather than at its start.
 * History prints the section title in a left-hand column that shares the line
 * with the theme number: "TRADITIONS      5   Changing Cultural Traditions  10".
 * Anchoring to the start of the line dropped two of the seven Class XI themes. */
const THEME_ROW = /(?:^|\s)(\d{1,2})\s{2,}([A-Za-z(][^\n]*?)\s{2,}(\d{1,3})\s*$/

/**
 * Read the Section/Theme table History uses.
 *
 * Rows whose title is a running header rather than a theme — Map work, Theory
 * Total, Project work, TOTAL — are excluded by name, because unlike a unit
 * table they DO begin with something that looks like a row.
 */
export function parseThemeRows(pageText) {
  const rows = []
  for (const line of String(pageText).split('\n')) {
    const m = THEME_ROW.exec(line)
    if (!m) continue
    const title = m[2].replace(/\s+/g, ' ').trim()
    if (/^(map\b|theory total|project work|total$|grand total)/i.test(title)) continue
    if (/^introduction timeline/i.test(title)) continue
    rows.push({ theme: Number.parseInt(m[1], 10), title, marks: Number.parseInt(m[3], 10) })
  }
  return rows
}

/* Class X Social Science alone writes its chapter separator six ways:
 *   "Chapter I -T", "Chapter 2 T", "Chapter 3-. T", "Chapter 5. T",
 *   "Chapter- 1. T", "Chapter-4. T"
 * A pattern written against any one of them loses most of the subject, so the
 * dash, the dot and the spacing are all optional on both sides of the number. */
const CHAPTER_LINE = /^Chapter\s*[-\u2013\u2014]?\s*([IVX]+|\d{1,2})\s*[-\u2013\u2014.]*\s*(\S.*)$/

/** Chapter lists written in the syllabus body. Reads `pdftotext -raw` output. */
export function parseChapterRows(rawText) {
  const rows = []
  for (const line of String(rawText).split('\n')) {
    const m = CHAPTER_LINE.exec(line.trim())
    if (!m) continue
    const title = m[2].replace(/\s+/g, ' ').trim()
    /* A column header — "Chapter No. Chapter name Marks" — matches the shape of
     * a chapter row. It is excluded by what it says, not by where it sits. */
    if (/^(no\.|name|chapter)\b/i.test(title)) continue
    if (title.length < 4) continue
    rows.push({ number: m[1], title })
  }
  return rows
}

/* Short words that are complete in themselves. Used to tell a line that WRAPPED
 * mid-word from one that merely ended. */
const WHOLE_SHORT_WORDS = new Set([
  'of', 'the', 'in', 'on', 'and', 'for', 'to', 'a', 'an', 'at', 'by', 'is',
  'as', 'with', 'from', 'its', 'their', 'our', 'it',
])
const THEME_START = /^(\d{1,2})\.\s+(\S.*)$/
/* The block ends at the line that closes the hours annotation. The digits are
 * often on the PREVIOUS line ("Science (4" / "Hours)"), so the closing test is
 * a suffix check and the number is read from the rejoined title instead. */
const HOURS_CLOSES = /Hours\)\s*$/i
const HOURS_IN_TITLE = /\((\d{1,2})\s*Hours\)/i

/**
 * Read themes annotated with study hours, rejoining titles the PDF split.
 *
 * Class IX Social Science prints its theme names in a narrow table cell, and
 * the PDF's own text layer contains the pieces — "Understandin" then
 * "g Social". They are one word.
 *
 * Deciding where to put a space back is the whole problem. Two fragments are
 * glued only when BOTH sides look like a broken word: the left ends lowercase
 * and is not itself a complete short word, and the right starts lowercase and
 * does not begin with one. Without the second half of that test "Atmosphere" +
 * "and Climate" becomes "Atmosphereand"; without the first, "Shaping of" +
 * "the Earth's" becomes "Shaping ofthe".
 *
 * The hours are the reason this matters: they are the only per-topic time
 * estimate any of the 37 documents states outright.
 */
export function parseHourThemes(rawText) {
  const lines = String(rawText).split('\n').map((l) => l.trim())
  const themes = []
  let i = 0
  while (i < lines.length) {
    const start = THEME_START.exec(lines[i])
    if (!start) {
      i += 1
      continue
    }
    const parts = [start[2]]
    let j = i + 1
    let closed = HOURS_CLOSES.test(start[2])
    while (!closed && j < lines.length && j <= i + 7) {
      parts.push(lines[j])
      if (HOURS_CLOSES.test(lines[j])) closed = true
      else j += 1
    }
    if (!closed) {
      i += 1
      continue
    }

    let title = parts[0]
    for (const next of parts.slice(1)) {
      if (next === '') continue
      const lastWord = title.split(/\s+/).pop() ?? ''
      const firstWord = next.split(/\s+/)[0] ?? ''
      const glue =
        /[a-z]$/.test(title) &&
        /^[a-z]/.test(next) &&
        !WHOLE_SHORT_WORDS.has(lastWord.toLowerCase()) &&
        !WHOLE_SHORT_WORDS.has(firstWord.toLowerCase())
      title = `${title}${glue ? '' : ' '}${next}`
    }
    title = title.replace(/\s+/g, ' ').trim()
    const hours = HOURS_IN_TITLE.exec(title)
    themes.push({
      theme: Number.parseInt(start[1], 10),
      title: title.replace(HOURS_IN_TITLE, '').replace(/\s+/g, ' ').trim(),
      hours: hours ? Number.parseInt(hours[1], 10) : null,
    })
    i = j + 1
  }
  return themes
}

/**
 * Put back a space that `pdftotext -raw` dropped.
 *
 * Raw mode loses spaces at some word boundaries: "Money and Credit" comes out
 * as "Moneyand Credit". The -layout reading of the SAME document keeps them.
 * So the fix is evidence, not a dictionary: strip all whitespace from both, find
 * the title inside the layout text, and return the layout text's own spacing.
 * A guess would be a fact about English; this is a fact about the document.
 */
export function repairSpacing(title, layoutText) {
  const wanted = title.replace(/\s+/g, '').toLowerCase()
  if (wanted.length === 0) return title

  /* Compact the layout text, remembering where each surviving character came
   * from, so a match can be mapped back to the original spacing. */
  const source = String(layoutText)
  const map = []
  let compact = ''
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (/\s/.test(ch)) continue
    compact += ch.toLowerCase()
    map.push(i)
  }

  const at = compact.indexOf(wanted)
  if (at === -1) return title

  const start = map[at]
  const end = map[at + wanted.length - 1]
  return source.slice(start, end + 1).replace(/\s+/g, ' ').trim()
}

/* A book heading in a prescribed-books list is printed in capitals; a text is
 * printed in title case. That difference is the only thing separating them, so
 * it is what the parser keys on. */
const NUMBERED_LINE = /^(\d{1,2})\.\s*(\S.*)$/

/**
 * A book heading is recognised by its LEADING words being capitals, not by the
 * whole line being capitals. The Class X workbook is printed as
 * "WORDS AND EXPRESSIONS - II (WORKBOOK FOR CLASS X) - Units 1 to 4 and",
 * whose lowercase tail made a whole-line test fail, so the workbook was
 * published as if it were a twenty-ninth story.
 */
function looksLikeBookHeading(title) {
  const words = title.split(/\s+/).filter(Boolean)
  let caps = 0
  for (const word of words) {
    const letters = word.replace(/[^A-Za-z]/g, '')
    if (letters.length >= 2 && letters === letters.toUpperCase()) caps += 1
    else break
  }
  return caps >= 2
}
const SECTION_HEADING = /^([A-Z])\.\s*(Prose|Poems?|Drama|Supplementary[A-Za-z ]*)\s*$/i
const TEXT_ITEM = /^(\d{1,2})\.\s*(\S.*)$/
/* Some books list their contents with bullets rather than numbers, and the
 * SAME list mixes two different glyphs. Accepting only numbered items left
 * English Core reporting eight concepts while twenty-odd real texts sat
 * unread a few lines further down. */
const BULLET_TEXT_ITEM = /^[^\w\s]\s*(\S.*)$/
/* Where a prescribed-books list ends. */
const END_OF_BOOKS = /^(internal assessment|question paper\s*design|note\s*:)/i

/**
 * Read the prescribed literature list.
 *
 * Everything before "Prescribed Books" is question-paper numbering — "1.
 * Discursive passage of 400-450 words" — which has exactly the shape of a text
 * entry. Starting the scan at the heading is what keeps those out.
 */
export function parsePrescribedTexts(rawText) {
  const lines = String(rawText).split('\n').map((l) => l.trim())
  const startAt = lines.findIndex((l) => /^Prescribed Books/i.test(l))
  if (startAt === -1) return []

  /* Cut at the end marker FIRST. The convention test below looks for bullets,
   * and the notes that follow a book list are full of them — "(i) encourage
   * interaction..." — so measuring the untruncated text made every document
   * look bulleted and broke the numbered one. */
  const afterHeading = lines.slice(startAt + 1)
  const endsAt = afterHeading.findIndex((l) => END_OF_BOOKS.test(l))
  const body = endsAt === -1 ? afterHeading : afterHeading.slice(0, endsAt)

  /* TWO CONVENTIONS, AND THE DOCUMENT PICKS ONE.
   *
   * Class X English numbers both books and texts, telling them apart by case:
   *   "1. FIRST FLIGHT"  is the book,  "1. A Letter to God"  is a text.
   * Class XI English Core numbers only the books and bullets the texts:
   *   "1. Hornbill: English Reader..." then "- The Portrait of a Lady".
   *
   * "Hornbill:" is not in capitals, so the case rule alone recognised no book
   * at all, every bullet was skipped for want of one, and the subject reported
   * eight concepts with twenty-odd texts sitting unread. When bullets are
   * present, numbering means "book" and a bullet means "text". */
  const bulletsPresent = body.some((l) => BULLET_TEXT_ITEM.test(l) && !SECTION_HEADING.test(l))

  const texts = []
  let book = null
  let section = null
  for (const line of body) {
    if (END_OF_BOOKS.test(line)) break

    const sec = SECTION_HEADING.exec(line)
    if (sec) {
      section = sec[2].replace(/\s+/g, ' ').trim()
      continue
    }
    const numbered = NUMBERED_LINE.exec(line)
    if (numbered && (bulletsPresent || looksLikeBookHeading(numbered[2]))) {
      book = numbered[2].replace(/\s+/g, ' ').trim()
      section = null
      continue
    }
    const item = TEXT_ITEM.exec(line)
    if (item && book !== null) {
      texts.push({
        book,
        section,
        number: Number.parseInt(item[1], 10),
        title: item[2].replace(/\s+/g, ' ').trim(),
      })
      continue
    }

    const bulleted = BULLET_TEXT_ITEM.exec(line)
    if (bulleted && book !== null) {
      const title = bulleted[1].replace(/\s+/g, ' ').trim()
      if (title.length >= 3) {
        texts.push({ book, section, number: texts.length + 1, title })
      }
    }
  }
  return texts
}

/* "A Reading Skills 20 Marks" */
const SECTION_ROW = /^([A-D])\s+(\S.*?)\s+(\d{1,3})\s*Marks?\s*$/

/**
 * Read a skills-based section table.
 *
 * Class IX English names no texts at all — it points at a textbook and defines
 * sections. Those sections are its teachable structure. Sections repeat for the
 * R1 and R2 variants of the paper, so results are deduplicated by letter.
 */
export function parseSectionRows(rawText) {
  const seen = new Map()
  for (const line of String(rawText).split('\n')) {
    const m = SECTION_ROW.exec(line.trim())
    if (!m) continue
    if (seen.has(m[1])) continue
    seen.set(m[1], {
      section: m[1],
      title: m[2].replace(/\s+/g, ' ').trim(),
      marks: Number.parseInt(m[3], 10),
    })
  }
  return [...seen.values()]
}

/* The finest granularity CBSE prints: "Heading: item, item, item." */
const DETAIL_LINE = /^([A-Z][A-Za-z0-9 ,'’\-&()/]{3,60}):\s+(\S.{20,})$/

const MIN_CONCEPT_CHARS = 4
const MAX_CONCEPT_CHARS = 90

/* Pages that describe the EXAM rather than the course. Read as curriculum they
 * produce topics called "Remembering", "comparing" and "and answers. 43 54 1". */
const NON_CURRICULUM_PAGE = /QUESTION PAPER DESIGN|^\s*PRACTICALS\s*$|LIST OF EXPERIMENTS|Typology of Questions/im

/* Bloom's taxonomy verbs and administrative labels head tables about assessment
 * design, never lists of things to learn. */
/* A syllabus heading is a noun phrase — "Chemical Reactions and Equations",
 * "Metals and Non-metals". A sentence is prose that happens to contain a colon:
 * "Learning standards are organised into four levels: broad curricular aims..."
 * That one produced a topic called "Competencies". Verbs are what separate the
 * two, and a word-count limit does not work because "Control and co-ordination
 * in animals and plants" is a real seven-word heading. */
const HEADING_HAS_VERB =
  /\b(are|is|was|were|be|been|being|have|has|had|will|shall|may|can|should|must|include|includes|including|means|refers|define|defines|describe|describes|explain|explains|organised|organized|seeks|enables|helps)\b/i

/* "UNIT VII", "Unit I", "Unit-1", "Theme 3".
 *
 * These appear TWICE in the same corpus meaning different things, which is why
 * the label alone cannot decide it:
 *   - as a row of the marks table    "UNIT VII   STATISTICS AND PROBABILITY  11"
 *   - as a real body heading         "Unit 1: Some Basic Concepts, Nature of
 *                                     Matter, Laws of Chemical Combination..."
 *
 * Rejecting the label outright turned Class 10 Mathematics into a single
 * concept called STATISTICS AND PROBABILITY, and also deleted 56 real Chemistry
 * concepts. What separates them is the BODY: a table row carries one title, a
 * heading carries a list. */
const UNIT_LABEL_HEADING = /^(unit|theme|section|part)\s*[-\u2013\u2014]?\s*[ivxlcdm0-9]+$/i
const MIN_ITEMS_UNDER_A_UNIT_LABEL = 2

const NON_CURRICULUM_HEADING =
  /^(remembering|understanding|applying|analysing|analyzing|evaluating|creating|competencies|note|objectives|rationale|introduction|prescribed books|learning outcomes?|suggestive verbs)$/i

/* Two or more standalone numbers in one title means a marks column bled across
 * the cell boundary: "Structure and Function 15 IV Plant Physiology 12". One
 * number is fine — "Newton's 3 laws of motion" is a real concept. */
const MARKS_BLEED = /(?:^|\s)\d{1,3}(?:\s|$).*(?:^|\s)\d{1,3}(?:\s|$)/

/* Notation from a worked example, not a topic: "A = {x | x = 2n", "7} and B = {1". */
const WORKING_NOTATION = /[{}|=\\\\^]/

/* A fragment that continues the sentence before it, e.g. "and the smell is due
 * to ethanol". A topic name does not begin with a conjunction. */
const CONTINUES_A_SENTENCE =
  /^(and|or|but|which|that|if|when|where|because|so|then|thus|hence|while|whereas|also|its|their)\b/i

/* A bullet means the neighbouring column bled into this cell. CBSE prints
 * Content and Learning Outcomes side by side, and in -layout text they share a
 * line, so "Art and Profession" arrives as
 * "Art and . Examine the nature of Profession management as a scien". */
const COLUMN_BLEED = /[•◦⮚→➢]/

/* Learning-outcome boilerplate. Whatever it is attached to is not a topic. */
const OUTCOME_PHRASE =
  /\b(students? will|learner would|learners? will|able to|after going through|after completing)\b/i

/** Brackets that do not close mean two cells were glued together. */
function bracketsBalanced(title) {
  let depth = 0
  for (const ch of title) {
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

/** At least half the characters must be letters, or it is not a topic name. */
function mostlyLetters(title) {
  const letters = (title.match(/[A-Za-z]/g) ?? []).length
  return letters / title.length >= 0.5
}

/**
 * Split a list on commas and semicolons, but NOT inside brackets.
 *
 * "concept of pH scale (Definition relating to logarithm, not required)" is one
 * concept with an aside, not two concepts. Splitting naively on every comma
 * turns the aside into a phantom topic a student would be asked to study.
 */
function splitOutsideBrackets(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === ';') && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts
}

/**
 * Read the atomic concepts a document names inside its unit bodies.
 *
 * A unit like "Algebra, 25 marks" is not something a student sits down and
 * learns in twenty minutes. The teachable pieces are the items the syllabus
 * lists underneath it, and this is where they come from.
 *
 * A nested colon is handled by keeping only what follows it: the document
 * writes "types of chemical reactions: combination, decomposition", where the
 * concepts are "combination" and "decomposition" — the phrase before the colon
 * is a label for the group, not a thing to learn on its own.
 */
export function parseAtomicConcepts(pages) {
  const concepts = []
  for (const page of pages) {
    if (NON_CURRICULUM_PAGE.test(page.text)) continue
    const lines = page.text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const m = DETAIL_LINE.exec(lines[i].trim())
      if (!m) continue
      const heading = m[1].trim()
      if (NON_CURRICULUM_HEADING.test(heading)) continue
      if (HEADING_HAS_VERB.test(heading)) continue

      /* The list wraps. "Chemical reactions, Chemical equation, Balanced" ends
       * one line and "chemical equation, types of..." begins the next, so
       * reading a single line cuts concepts in half and loses them. Continue
       * until a blank line or the start of the next entry. */
      let body = m[2]
      let j = i + 1
      while (j < lines.length) {
        const next = lines[j].trim()
        if (next === '') break
        if (DETAIL_LINE.test(next)) break
        if (/^(unit|theme|chapter|section|note|the following topics)\b/i.test(next)) break
        body += ` ${next}`
        j += 1
      }
      i = j - 1

      const fromThisHeading = []
      for (const raw of splitOutsideBrackets(body)) {
        let title = raw.replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '').trim()
        if (title.includes(': ')) title = title.slice(title.lastIndexOf(': ') + 2).trim()
        if (title.length < MIN_CONCEPT_CHARS || title.length > MAX_CONCEPT_CHARS) continue
        if (MARKS_BLEED.test(title)) continue
        if (WORKING_NOTATION.test(title)) continue
        if (CONTINUES_A_SENTENCE.test(title)) continue
        if (!mostlyLetters(title)) continue
        if (COLUMN_BLEED.test(title)) continue
        if (OUTCOME_PHRASE.test(title)) continue
        if (!bracketsBalanced(title)) continue
        fromThisHeading.push({ title, heading, page: page.page })
      }

      /* A unit label with a single item under it is a marks-table row, not a
       * heading. With a list under it, it is a real heading. */
      if (UNIT_LABEL_HEADING.test(heading) && fromThisHeading.length < MIN_ITEMS_UNDER_A_UNIT_LABEL) {
        continue
      }
      concepts.push(...fromThisHeading)
    }
  }
  return concepts
}

/* A numbered line, in reading order. Both chapters and concepts look like
 * this; what separates them is below. */
const NUMBERED_ITEM = /^(\d{1,2})\.\s*(\S.*)$/
/* Two forms, and the difference decides what the chapter is:
 *   "UNIT III: COORDINATE GEOMETRY"      colon — the CHAPTER is the numbered
 *                                        line that follows
 *   "Unit VIII Motivation and Emotion"   no colon — the unit IS the chapter,
 *                                        and the numbered lines are concepts
 * Requiring the colon left Psychology with no chapters at all. */
const UNIT_WITH_COLON = /^UNIT\s+[IVXLC]+\s*:\s*(\S.*)$/i
const UNIT_NO_COLON = /^Unit\s+[IVXLC]+\s+(\S.*)$/
/* The Competencies column is a bullet list. Its glyph varies by document, so
 * the test is "starts with punctuation", not a list of characters. */
const COMPETENCY_BULLET = /^[^\w\s]/
/* Everything after this is books and admin, not syllabus.
 *
 * "Internal assessment" is deliberately NOT here. It is a ROW of the marks
 * table, printed on page 2 of almost every document, and treating it as the end
 * of the syllabus stopped the parser a few pages in — Psychology yielded
 * concepts from pages 2-5 of a fifteen-page document and nothing after it. Every
 * marker left in this list appears once, at the end, where it belongs. */
const END_OF_SYLLABUS = /^(prescribed books?|note for teachers?|question paper design)\b/i

function isAllCaps(text) {
  const letters = [...text].filter((c) => /[a-z]/i.test(c))
  return letters.length >= 3 && letters.every((c) => c === c.toUpperCase())
}

/**
 * Read a syllabus printed as a Content / Competencies / Explanation TABLE.
 *
 * Class 10 Mathematics is published this way. The prose extractor found nothing
 * in it, the subject produced ZERO concepts, and the build dropped it without a
 * word — a Class 10 student would simply have had no Mathematics.
 *
 * WHY READING ORDER AND NOT COLUMNS
 *     In `-layout` the three columns share every line, and there is no reliable
 *     vertical gutter to cut on: three of the seven content pages have none at
 *     all. Slicing by column produced titles with the neighbouring column
 *     welded on, like "REAL NUMBERS Develops understanding Describes of
 *     numbers". Reading order separates them: a chapter, its numbered concepts,
 *     then the bullet list that ends the block.
 *
 * TELLING A CHAPTER FROM A CONCEPT
 *     Both are printed "N. Something". A chapter is in capitals — except
 *     "Coordinate Geometry", which is not, and whose concepts were therefore
 *     filed under Arithmetic Progressions. So the first numbered line after a
 *     UNIT heading is also a chapter, whatever its case.
 */
export function parseContentTable(rawText) {
  const items = []
  let chapter = null
  let current = null
  let afterUnit = false
  let inBullets = false
  let skipping = false

  const close = () => {
    if (current !== null) {
      items.push(current)
      current = null
    }
  }

  let page = 1
  for (const raw of String(rawText).split('\n')) {
    if (raw.includes('\f')) page += raw.split('\f').length - 1
    const line = raw.replace(/\f/g, '').trim()
    if (line === '') continue

    /* NOT a break. A combined XI-XII document prints the Class XI question
     * paper design in the MIDDLE and the whole Class XII syllabus after it, so
     * stopping here threw away a full school year. Skip until the next unit or
     * capitalised chapter instead. */
    if (END_OF_SYLLABUS.test(line)) {
      close()
      skipping = true
      chapter = null
      continue
    }

    const colonUnit = UNIT_WITH_COLON.exec(line)
    if (colonUnit) {
      close()
      afterUnit = true
      inBullets = false
      skipping = false
      chapter = null
      continue
    }

    const plainUnit = UNIT_NO_COLON.exec(line)
    if (plainUnit) {
      close()
      afterUnit = false
      inBullets = false
      skipping = false
      chapter = plainUnit[1].trim()
      continue
    }

    if (COMPETENCY_BULLET.test(line) && !/^\d/.test(line)) {
      close()
      inBullets = true
      continue
    }

    const numbered = NUMBERED_ITEM.exec(line)
    if (numbered) {
      const title = numbered[2].trim()
      inBullets = false
      /* A capitalised chapter heading ends an admin section too. */
      if (skipping && !isAllCaps(title)) continue
      skipping = false
      if (isAllCaps(title) || afterUnit) {
        close()
        chapter = title
        afterUnit = false
      } else {
        close()
        current = { chapter, title, page }
      }
      continue
    }

    if (inBullets || skipping) continue

    if (current !== null) {
      current.title += ` ${line}`
    } else if (chapter !== null && isAllCaps(line)) {
      /* A chapter name wrapped onto the next line. */
      chapter += ` ${line}`
    }
  }
  close()

  const seen = new Set()
  const out = []
  for (const item of items) {
    const title = item.title.replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '')
    if (title.length < 6 || title.length > 160) continue
    const key = `${item.chapter ?? ''}|${title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ chapter: item.chapter, title, page: item.page })
  }
  return out
}

export function classifyLayout(pages) {
  const all = pages.map((p) => p.text).join('\n')

  /* Section/Theme is checked BEFORE unit rows, and the order is load bearing.
   * History numbers its themes "1  Writing and City Life   10", which is
   * indistinguishable from an Arabic unit row. Checking rows first classified
   * the whole History syllabus as a unit table and would have published its
   * themes as if they were examinable units with those marks. */
  if (/Section\s+Title/i.test(all) && /Theme\s+Title/i.test(all)) return 'section-theme-table'

  if (pages.some((p) => parseUnitRows(p.text).length > 0)) return 'unit-marks-table'

  if (/Unit\s*[–—-]\s*[IVX]+/i.test(all) && /Chapter\s*[–—-]\s*\d/i.test(all)) return 'unit-chapter-table'
  if (/^\s*Part\s+[ABC]\b/im.test(all) && /Units?\b/i.test(all)) return 'part-units-table'

  return 'unknown'
}

/**
 * Every concept the document yields, from BOTH readers.
 *
 * The prose reader handles "Heading: a, b, c" syllabuses; the content-table
 * reader handles the ones printed as a Content / Competencies table. Several
 * documents contain some of each, so both run and the results are merged,
 * deduplicated on the concept's own wording. Running only one of them is how
 * Class 10 Mathematics ended up with nothing at all.
 */
function allConcepts(pages, rawText) {
  const merged = [...parseAtomicConcepts(pages)]
  if (typeof rawText === 'string') {
    for (const item of parseContentTable(rawText)) {
      merged.push({ title: item.title, heading: item.chapter ?? 'Syllabus', page: item.page ?? null })
    }
  }
  const seen = new Set()
  return merged.filter((c) => {
    const key = c.title.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Everything read from one document, plus everything it could not read. */
export function extractDocument({ slug, text, rawText }) {
  const pages = toPages(text)
  const layout = classifyLayout(pages)
  const coursePages = findCourseStructurePages(pages)
  const needsReview = []

  /* A document may carry more than one course-structure block: the XI-XII PDFs
   * hold a separate table per school year. When no heading is present at all,
   * fall back to any page that yields unit rows, so a missing heading does not
   * by itself lose the table. */
  /* A course-structure table can start under its heading and continue onto the
   * next page — Class X Social Science prints the heading on page 1 and every
   * row on page 2. Looking only at heading pages found no rows there and
   * reported the document as having no units at all. */
  const candidatePages = coursePages.length > 0
    ? [...new Set(coursePages.flatMap((p) => [p, p + 1]))]
        .filter((p) => p <= pages.length)
        .filter((p) => coursePages.includes(p) || parseUnitTables(pages[p - 1].text).length > 0)
        .sort((a, b) => a - b)
    : pages.filter((p) => parseUnitTables(p.text).length > 0).map((p) => p.page)

  /* The unit-chapter family is read by its own parser. Its marker pair —
   * "Unit-<roman>" with "Chapter-<n>:" — is unambiguous, so every page is
   * scanned rather than only the pages under a COURSE STRUCTURE heading; the
   * Class XII table in these documents often carries no heading of its own. */
  if (layout === 'section-theme-table') {
    const themeUnits = pages.flatMap((p) =>
      parseThemeRows(p.text).map((t) => ({ unit: String(t.theme), title: t.title, marks: t.marks, page: p.page })),
    )
    return {
      slug,
      pageCount: pages.length,
      layout,
      coursePages,
      blocks: [],
      units: themeUnits,
      topics: topicsFrom(themeUnits, parseUnitHeadings(pages)),
      concepts: allConcepts(pages, rawText),
      formative: findFormativeBlocks(pages),
      notes: findNoteForTeachers(pages),
      needsReview: themeUnits.length === 0 ? ['no topics found'] : [],
    }
  }

  if (layout === 'unit-chapter-table') {
    const chapterUnits = pages.flatMap((p) =>
      parseUnitChapters(p.text).map((u) => ({ ...u, page: p.page })),
    )
    const chapterTopics = topicsFrom(chapterUnits, parseUnitHeadings(pages))
    return {
      slug,
      pageCount: pages.length,
      layout,
      coursePages,
      blocks: [],
      units: chapterUnits,
      topics: chapterTopics,
      concepts: allConcepts(pages, rawText),
      formative: findFormativeBlocks(pages),
      notes: findNoteForTeachers(pages),
      needsReview: chapterTopics.length === 0 ? [`no unit parser for layout: ${layout}`] : [],
    }
  }

  /* Only a document classified as a unit table may contribute units. A row that
   * merely LOOKS like a unit row on a Section/Theme page is not one, and
   * publishing it would put invented units in front of a student. */
  const trustsUnitRows = layout === 'unit-marks-table'

  /* Diagnose spanning across every candidate page, whatever the layout. A
   * document whose marks span rows must say so, not merely report that no
   * parser recognised it — those are different problems with different fixes. */
  for (const page of candidatePages) {
    if (parseUnitTables(pages[page - 1].text).some((t) => t.incomplete > 0)) {
      if (!needsReview.includes(SPANNING)) needsReview.push(SPANNING)
    }
  }

  const blocks = (trustsUnitRows ? candidatePages : []).map((page) => {
    const body = pages[page - 1].text
    const tables = parseUnitTables(body)

    const trusted = tables.filter((t) => t.incomplete === 0)
    for (const table of trusted) {
      const sum = table.rows.reduce((n, u) => n + u.marks, 0)
      if (table.printedTotal !== null && sum !== table.printedTotal) {
        needsReview.push(`unit marks sum to ${sum} but the document prints Total ${table.printedTotal}`)
      }
    }

    const units = trusted.flatMap((t) => t.rows)
    const printedTotal = trusted.length > 0 ? trusted[trusted.length - 1].printedTotal : null
    return { page, units, printedTotal }
  })

  const units = blocks.flatMap((b) => b.units.map((u) => ({ ...u, page: b.page })))

  if (units.length === 0) {
    needsReview.push(`no unit parser for layout: ${layout}`)
  }

  const formative = findFormativeBlocks(pages)
  const notes = findNoteForTeachers(pages)

  if (notes.length > 0 && formative.length > 0) {
    const boxed = formative.map((f) => f.text).join(' ')
    const listed = notes.flatMap((n) => topicsFromNote(n.text))
    const unmatched = listed.filter((t) => !boxed.includes(t))
    if (unmatched.length > 0) {
      needsReview.push('formative lists disagree: boxes vs Note for Teachers')
    }
  }

  let topics = topicsFrom(units, parseUnitHeadings(pages))

  /* Last resort, and only when -layout produced nothing: some documents are
   * legible only in `pdftotext -raw`. Themes are preferred over chapters
   * because they carry study hours. */
  /* Not "only when nothing was found". The raw-mode readers are consulted
   * whenever they find MORE than the layout ones did — a single unit heading
   * was otherwise enough to hide English Core's twenty prescribed texts. */
  if (typeof rawText === 'string') {
    const themes = parseHourThemes(rawText)
    const texts = themes.length > topics.length ? [] : parsePrescribedTexts(rawText)
    const chapters = Math.max(themes.length, texts.length) > topics.length ? [] : parseChapterRows(rawText)
    const sections = Math.max(themes.length, texts.length, chapters.length) > topics.length
      ? []
      : parseSectionRows(rawText)

    if (themes.length > topics.length) {
      topics = themes.map((t) => ({ unit: t.theme, title: t.title, marks: null, hours: t.hours, page: null }))
    } else if (texts.length > topics.length) {
      topics = texts.map((t) => ({
        unit: t.number, title: repairSpacing(t.title, text), marks: null, page: null,
        book: t.book, section: t.section,
      }))
    } else if (chapters.length > topics.length) {
      /* Raw mode dropped some spaces; the layout reading of the same document
       * has them. Repair before publishing, or a student is shown
       * "Moneyand Credit". */
      topics = chapters.map((c) => ({ unit: c.number, title: repairSpacing(c.title, text), marks: null, page: null }))
    } else if (sections.length > topics.length) {
      topics = sections.map((r) => ({ unit: r.section, title: r.title, marks: r.marks, page: null }))
    }
  }

  if (topics.length === 0) needsReview.push('no topics found')

  return {
    slug,
    pageCount: pages.length,
    layout,
    coursePages,
    blocks,
    units,
    topics,
    concepts: allConcepts(pages, rawText),
    formative,
    notes,
    needsReview,
  }
}
