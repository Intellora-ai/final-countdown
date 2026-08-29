/* Tests for extract.mjs — turning an official syllabus PDF into structured data.
 *
 * DESIRED OUTCOME
 *   Every unit, chapter and topic the app teaches can be traced to the exact
 *   page of the exact published document it came from, and anything the parser
 *   could not read confidently is REPORTED rather than quietly dropped.
 *
 * WHY THE FIXTURES ARE TEXT, NOT PDFs
 *   The PDFs are large binaries and are gitignored, so a test that read them
 *   would pass on this machine and fail on a fresh clone. The fixtures here are
 *   the real `pdftotext -layout` output of the real documents, committed as
 *   plain text: reviewable in a diff, identical everywhere.
 *
 * WHY FOUR FIXTURES AND NOT ONE
 *   CBSE does not use one table layout. Four genuinely different shapes were
 *   found in the 37 documents, and a parser written against one of them
 *   silently mangles the other three:
 *     - maths-x, science-x, biology  a Roman-numeral Unit/Marks table
 *     - physics                      units containing numbered chapters
 *     - accountancy                  Part A/B/C sections, no COURSE STRUCTURE
 *     - history                      Section/Theme with multi-line cells
 *   The accountancy document has no "COURSE STRUCTURE" heading at all. A parser
 *   that keys on that string returns nothing for it and reports success.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  toPages,
  findCourseStructurePages,
  parseUnitRows,
  findFormativeBlocks,
  findNoteForTeachers,
  classifyLayout,
  parseUnitChapters,
  parseUnitHeadings,
  parseThemeRows,
  parseChapterRows,
  parseHourThemes,
  parsePrescribedTexts,
  parseSectionRows,
  repairSpacing,
  parseAtomicConcepts,
  parseContentTable,
  extractDocument,
} from './extract.mjs'

function fixture(slug) {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${slug}.pages.txt`, import.meta.url)), 'utf8')
}

/* `pdftotext -raw` output. Some CBSE tables put each cell on its own line in
 * -layout mode with the text broken mid-word; -raw keeps the reading order and
 * is the only mode those documents are legible in. */
function rawFixture(slug) {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${slug}.raw.txt`, import.meta.url)), 'utf8')
}

describe('toPages — page numbers must be real', () => {
  it('splits on the form feed pdftotext emits between pages', () => {
    const pages = toPages('one\fTWO\fthree')
    expect(pages.map((p) => p.text)).toEqual(['one', 'TWO', 'three'])
  })

  it('numbers pages from 1, because a citation of "page 0" helps nobody', () => {
    expect(toPages('a\fb').map((p) => p.page)).toEqual([1, 2])
  })

  it('drops the trailing empty page pdftotext leaves after the last form feed', () => {
    expect(toPages('a\fb\f')).toHaveLength(2)
  })

  it('counts the real documents correctly', () => {
    expect(toPages(fixture('maths-x'))).toHaveLength(10)
    expect(toPages(fixture('science-x'))).toHaveLength(9)
    expect(toPages(fixture('biology'))).toHaveLength(15)
    expect(toPages(fixture('physics'))).toHaveLength(23)
    expect(toPages(fixture('accountancy'))).toHaveLength(16)
    expect(toPages(fixture('history'))).toHaveLength(18)
  })
})

describe('findCourseStructurePages', () => {
  it('finds the single course structure page in Class X Mathematics', () => {
    expect(findCourseStructurePages(toPages(fixture('maths-x')))).toEqual([3])
  })

  it('finds the single course structure page in Class X Science', () => {
    expect(findCourseStructurePages(toPages(fixture('science-x')))).toEqual([4])
  })

  it('finds BOTH blocks in a combined XI-XII document', () => {
    /* Biology is one PDF covering two school years. A parser that stops at the
     * first match teaches Class XII students the Class XI course. */
    expect(findCourseStructurePages(toPages(fixture('biology')))).toEqual([3, 9])
    expect(findCourseStructurePages(toPages(fixture('history')))).toEqual([3, 9])
  })

  it('returns empty for a document that has no such heading', () => {
    /* Evidence first: a function that always returns [] also returns [] here. */
    expect(findCourseStructurePages(toPages(fixture('biology')))).toEqual([3, 9])
    expect(findCourseStructurePages(toPages(fixture('accountancy')))).toEqual([])
  })
})

describe('parseUnitRows — the Roman-numeral Unit/Marks table', () => {
  it('reads all seven Class X Mathematics units with exact names and marks', () => {
    const pages = toPages(fixture('maths-x'))
    expect(parseUnitRows(pages[2].text)).toEqual([
      { unit: 'I', title: 'NUMBER SYSTEMS', marks: 6 },
      { unit: 'II', title: 'ALGEBRA', marks: 20 },
      { unit: 'III', title: 'COORDINATE GEOMETRY', marks: 6 },
      { unit: 'IV', title: 'GEOMETRY', marks: 15 },
      { unit: 'V', title: 'TRIGONOMETRY', marks: 12 },
      { unit: 'VI', title: 'MENSURATION', marks: 10 },
      { unit: 'VII', title: 'STATISTICS AND PROBABILITY', marks: 11 },
    ])
  })

  it('reads all five Class X Science units with exact names and marks', () => {
    const pages = toPages(fixture('science-x'))
    expect(parseUnitRows(pages[3].text)).toEqual([
      { unit: 'I', title: 'Chemical Substances-Nature and Behaviour', marks: 25 },
      { unit: 'II', title: 'World of Living', marks: 25 },
      { unit: 'III', title: 'Natural Phenomena', marks: 12 },
      { unit: 'IV', title: 'Effects of Current', marks: 13 },
      { unit: 'V', title: 'Natural Resources', marks: 5 },
    ])
  })

  it('reads the Class XI Biology units', () => {
    const pages = toPages(fixture('biology'))
    expect(parseUnitRows(pages[2].text)).toEqual([
      { unit: 'I', title: 'Diversity of Living Organisms', marks: 15 },
      { unit: 'II', title: 'Structural Organization in Plants and Animals', marks: 10 },
      { unit: 'III', title: 'Cell: Structure and Function', marks: 15 },
      { unit: 'IV', title: 'Plant Physiology', marks: 12 },
      { unit: 'V', title: 'Human Physiology', marks: 18 },
    ])
  })

  it('never returns a Total row as if it were a unit', () => {
    const pages = toPages(fixture('science-x'))
    const titles = parseUnitRows(pages[3].text).map((r) => r.title.toLowerCase())
    expect(titles).not.toContain('total')
    expect(titles).not.toContain('grand total')
    expect(titles).not.toContain('internal assessment')
  })

  it('parsed marks add up to the printed total', () => {
    /* An arithmetic check the document itself provides. If the rows sum to
     * something other than 80, a row was misread or missed. */
    const mathsRows = parseUnitRows(toPages(fixture('maths-x'))[2].text)
    expect(mathsRows.reduce((n, r) => n + r.marks, 0)).toBe(80)

    const scienceRows = parseUnitRows(toPages(fixture('science-x'))[3].text)
    expect(scienceRows.reduce((n, r) => n + r.marks, 0)).toBe(80)

    const bioRows = parseUnitRows(toPages(fixture('biology'))[2].text)
    expect(bioRows.reduce((n, r) => n + r.marks, 0)).toBe(70)
  })

  it('returns nothing for a page with no unit table rather than inventing rows', () => {
    expect(parseUnitRows(toPages(fixture('maths-x'))[0].text)).toEqual([])
  })
})

describe('parseUnitRows — numbering styles CBSE actually uses', () => {
  it('reads Roman numerals written with a trailing dot (Class XI Mathematics)', () => {
    /* Senior Mathematics prints "I."  not "I". A regex anchored on a bare
     * numeral silently returns zero units for the whole subject. */
    const pages = toPages(fixture('maths-senior'))
    expect(parseUnitRows(pages[1].text)).toEqual([
      { unit: 'I', title: 'Sets and Functions', marks: 23 },
      { unit: 'II', title: 'Algebra', marks: 25 },
      { unit: 'III', title: 'Coordinate Geometry', marks: 12 },
      { unit: 'IV', title: 'Calculus', marks: 8 },
      { unit: 'V', title: 'Statistics and Probability', marks: 12 },
    ])
  })

  it('reads Arabic-numbered unit tables (Class XI Chemistry)', () => {
    /* Chemistry numbers its units 1..9 rather than I..IX. Same table, different
     * numerals. */
    const pages = toPages(fixture('chemistry'))
    expect(parseUnitRows(pages[1].text)).toEqual([
      { unit: '1', title: 'Some Basic Concepts of Chemistry', marks: 7 },
      { unit: '2', title: 'Structure of Atom', marks: 9 },
      { unit: '3', title: 'Classification of Elements and Periodicity in Properties', marks: 6 },
      { unit: '4', title: 'Chemical Bonding and Molecular Structure', marks: 7 },
      { unit: '5', title: 'Chemical Thermodynamics', marks: 9 },
      { unit: '6', title: 'Equilibrium', marks: 7 },
      { unit: '7', title: 'Redox Reactions', marks: 4 },
      { unit: '8', title: 'Organic Chemistry: Some basic Principles and', marks: 11 },
      { unit: '9', title: 'Hydrocarbons', marks: 10 },
    ])
  })

  it('both styles add up to their printed totals', () => {
    const maths = parseUnitRows(toPages(fixture('maths-senior'))[1].text)
    expect(maths.reduce((n, r) => n + r.marks, 0)).toBe(80)
    const chem = parseUnitRows(toPages(fixture('chemistry'))[1].text)
    expect(chem.reduce((n, r) => n + r.marks, 0)).toBe(70)
  })

  it('never mixes Roman and Arabic rows from one table', () => {
    /* A page holding both a Roman unit table and Arabic content numbering would
     * otherwise return each unit twice and double the marks. */
    const rows = parseUnitRows(toPages(fixture('maths-x'))[2].text)
    const styles = new Set(rows.map((r) => (/^[0-9]+$/.test(r.unit) ? 'arabic' : 'roman')))
    expect([...styles]).toEqual(['roman'])
  })

  it('does not treat a numbered prose line with no marks column as a unit', () => {
    expect(parseUnitRows('1.     Sets\n2.     Relations and Functions')).toEqual([])
  })
})

describe('findFormativeBlocks — topics taught but not examined', () => {
  it('finds every formative box in Class X Science with its page', () => {
    const blocks = findFormativeBlocks(toPages(fixture('science-x')))
    expect(blocks.map((b) => b.page)).toEqual([4, 5, 6])
  })

  it('captures the topic named in the first box', () => {
    const blocks = findFormativeBlocks(toPages(fixture('science-x')))
    expect(blocks[0].text).toContain('Periodic Classification of Elements')
  })

  it('captures Evolution from the World of Living box', () => {
    const blocks = findFormativeBlocks(toPages(fixture('science-x')))
    expect(blocks[1].text).toContain('Evolution')
  })

  it('finds the formative boxes in Biology too', () => {
    expect(findFormativeBlocks(toPages(fixture('biology'))).map((b) => b.page)).toEqual([6, 11])
  })

  it('finds none in a document that has none', () => {
    /* Evidence first: a stub that finds nothing anywhere also finds nothing here. */
    expect(findFormativeBlocks(toPages(fixture('science-x')))).toHaveLength(3)
    expect(findFormativeBlocks(toPages(fixture('maths-x')))).toEqual([])
  })
})

describe('findNoteForTeachers — the second, disagreeing list', () => {
  it('finds the note in Class X Science on page 6', () => {
    const notes = findNoteForTeachers(toPages(fixture('science-x')))
    expect(notes.map((n) => n.page)).toEqual([6])
  })

  it('captures the note naming Heredity and Evolution, which the boxes do not', () => {
    /* This is the contradiction inside the official document. Both lists must
     * survive extraction so a human can decide which governs. Dropping either
     * one silently picks a winner. */
    const notes = findNoteForTeachers(toPages(fixture('science-x')))
    expect(notes[0].text).toContain('Heredity and Evolution')
    expect(notes[0].text).toContain('Periodic Classification of Elements')
  })

  it('finds none in a document without one', () => {
    /* Evidence first: see the note above about stubs. */
    expect(findNoteForTeachers(toPages(fixture('science-x')))).toHaveLength(1)
    expect(findNoteForTeachers(toPages(fixture('maths-x')))).toEqual([])
  })
})

describe('a marks column that wraps onto its own line', () => {
  it('reads Class XII Mathematics, where every mark sits on the line below its unit', () => {
    /* pdftotext puts a vertically centred table cell on its own line:
     *     II.    Algebra
     *                              10
     * The 10 IS Algebra's marks. Treating the row as markless would have
     * refused the entire Class XII Mathematics syllabus as unreadable. */
    const pages = toPages(fixture('maths-senior'))
    expect(parseUnitRows(pages[6].text)).toEqual([
      { unit: 'I', title: 'Relations and Functions', marks: 8 },
      { unit: 'II', title: 'Algebra', marks: 10 },
      { unit: 'III', title: 'Calculus', marks: 35 },
      { unit: 'IV', title: 'Vectors and Three - Dimensional Geometry', marks: 14 },
      { unit: 'V', title: 'Linear Programming', marks: 5 },
      { unit: 'VI', title: 'Probability', marks: 8 },
    ])
  })

  it('adds up to the printed total once the wrap is joined', () => {
    const rows = parseUnitRows(toPages(fixture('maths-senior'))[6].text)
    expect(rows.reduce((n, r) => n + r.marks, 0)).toBe(80)
  })

  it('does not attach a wrapped number to a row that already has marks', () => {
    const text = ['  I    ALPHA    10', '   20', '       Total    10'].join('\n')
    expect(parseUnitRows(text)).toEqual([{ unit: 'I', title: 'ALPHA', marks: 10 }])
  })

  it('does not rescue a genuinely spanning table', () => {
    /* Business Studies has no bare-number line; the next line is another
     * numbered row. The wrap fix must not launder that into per-row marks. */
    const doc = extractDocument({ slug: 'business-studies', text: fixture('business-studies') })
    expect(doc.units).toEqual([])
  })
})

describe('marks that span several rows are refused, never guessed', () => {
  it('refuses Class XI Business Studies, where one mark value covers two units', () => {
    /* The document prints:
     *     1  Nature and Purpose of Business      16
     *     2  Forms of Business Organisations
     * The 16 is for units 1 AND 2 together. Reading it as unit 1's marks tells
     * a student unit 2 is worth nothing. The totals still add to 80, so an
     * arithmetic check alone would have passed this. */
    const doc = extractDocument({ slug: 'business-studies', text: fixture('business-studies') })
    expect(doc.units).toEqual([])
    expect(doc.needsReview).toContain('marks span rows: a numbered row carries no marks of its own')
  })

  it('refuses Class X Social Science, where a section total sits on one chapter row', () => {
    const doc = extractDocument({ slug: 'social-science-x', text: fixture('social-science-x') })
    expect(doc.units).toEqual([])
    expect(doc.needsReview).toContain('marks span rows: a numbered row carries no marks of its own')
  })

  it('still accepts Class XI Mathematics, where every row carries its own marks', () => {
    const doc = extractDocument({ slug: 'maths-senior', text: fixture('maths-senior') })
    const xi = doc.blocks.find((b) => b.page === 2)
    expect(xi.units).toHaveLength(5)
    expect(doc.needsReview).not.toContain('marks span rows: a numbered row carries no marks of its own')
  })

  it('still accepts Class XI Chemistry, where every row carries its own marks', () => {
    const doc = extractDocument({ slug: 'chemistry', text: fixture('chemistry') })
    const xi = doc.blocks.find((b) => b.page === 2)
    expect(xi.units).toHaveLength(9)
    expect(doc.needsReview).not.toContain('marks span rows: a numbered row carries no marks of its own')
  })

  it('validates each table on a page against its own Total, not the page total', () => {
    /* A page can hold two tables, each closing with its own Total row. */
    const twoTables = [
      '  I    ALPHA    10',
      '  II   BETA     20',
      '       Total    30',
      '  III  GAMMA    40',
      '  IV   DELTA     5',
      '       Total    45',
    ].join('\n')
    const doc = extractDocument({ slug: 'two-tables', text: twoTables })
    expect(doc.units).toHaveLength(4)
    expect(doc.needsReview).toEqual([])
  })

  it('ignores a Grand Total that follows a table it does not belong to', () => {
    const withGrand = [
      '  I    ALPHA    40',
      '  II   BETA     30',
      '       Total    70',
      '       Internal assessment    30',
      '       Grand Total   100',
    ].join('\n')
    const doc = extractDocument({ slug: 'grand', text: withGrand })
    expect(doc.units).toHaveLength(2)
    expect(doc.needsReview).toEqual([])
  })
})

describe('parseUnitChapters — units that contain numbered chapters', () => {
  it('reads all ten Class XI Physics units with their chapters', () => {
    /* Physics prints its marks per GROUP of units (23 covers Units I-IV), so
     * per-unit marks do not exist in the document and are left null rather than
     * invented. The chapters are what a student actually studies. */
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    expect(units.map((u) => u.unit)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])
  })

  it('reads unit titles without dragging the marks column into them', () => {
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    expect(units[7]).toMatchObject({ unit: 'VIII', title: 'Thermodynamics' })
  })

  it('groups every chapter under the right unit', () => {
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    const kinematics = units.find((u) => u.unit === 'II')
    expect(kinematics.chapters).toEqual([
      { number: 2, title: 'Motion in a Straight Line' },
      { number: 3, title: 'Motion in a Plane' },
    ])
    const bulkMatter = units.find((u) => u.unit === 'VII')
    expect(bulkMatter.chapters.map((c) => c.number)).toEqual([8, 9, 10])
  })

  it('strips a marks value that shares a line with a chapter title', () => {
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    const rigidBody = units.find((u) => u.unit === 'V')
    expect(rigidBody.chapters).toEqual([
      { number: 6, title: 'System of Particles and Rotational Motion' },
    ])
  })

  it('finds all fourteen Class XI Physics chapters, the NCERT count', () => {
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    const numbers = units.flatMap((u) => u.chapters.map((c) => c.number))
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it('leaves per-unit marks null, because the document does not state them', () => {
    const units = parseUnitChapters(toPages(fixture('physics'))[1].text)
    expect(units.every((u) => u.marks === null)).toBe(true)
  })

  it('returns nothing for a page with no unit-chapter table', () => {
    expect(parseUnitChapters(toPages(fixture('maths-x'))[0].text)).toEqual([])
  })
})

describe('extractDocument uses the chapter parser for that family', () => {
  it('gives Physics its units instead of reporting it unreadable', () => {
    const doc = extractDocument({ slug: 'physics', text: fixture('physics') })
    expect(doc.layout).toBe('unit-chapter-table')
    expect(doc.units.length).toBeGreaterThanOrEqual(10)
    expect(doc.needsReview).not.toContain('no unit parser for layout: unit-chapter-table')
  })

  it('records the chapters on the units it returns', () => {
    const doc = extractDocument({ slug: 'physics', text: fixture('physics') })
    const total = doc.units.reduce((n, u) => n + (u.chapters?.length ?? 0), 0)
    expect(total).toBeGreaterThanOrEqual(14)
  })
})

describe('parseUnitHeadings — the syllabus body names its own units', () => {
  it('reads units written as "Unit-1: Title", which no row pattern catches', () => {
    /* Every row pattern above requires the line to START with the numeral.
     * Fifteen of the 37 documents instead write "Unit-1: Theoretical Framework",
     * so 190 unit rows across the corpus were invisible. */
    const headings = parseUnitHeadings(toPages(fixture('accountancy')))
    expect(headings).toContainEqual({ unit: 1, title: 'Theoretical Framework', page: 2 })
    expect(headings).toContainEqual({ unit: 2, title: 'Accounting Process', page: 2 })
  })

  it('deduplicates a unit that appears in both the table and the body', () => {
    /* "Unit-2: Accounting Process" is printed on page 2 in the summary table and
     * again on page 3 as the body heading. It is one unit, not two. */
    const headings = parseUnitHeadings(toPages(fixture('accountancy')))
    expect(headings).toHaveLength(13)
  })

  it('keeps the first page a unit was seen on, so the citation is the table', () => {
    const headings = parseUnitHeadings(toPages(fixture('accountancy')))
    expect(headings.find((h) => h.unit === 2 && h.title === 'Accounting Process').page).toBe(2)
  })

  it('collapses the runs of spaces pdftotext leaves inside a justified title', () => {
    /* Entrepreneurship page 2 prints "Entrepreneurship      as   Innovation". */
    const headings = parseUnitHeadings(toPages(fixture('entrepreneurship')))
    const titles = headings.map((h) => h.title)
    expect(titles).not.toContain('Entrepreneurship      as   Innovation   and')
    expect(titles.some((t) => t.startsWith('Entrepreneurship as Innovation'))).toBe(true)
  })

  it('strips a marks value sharing the line with the title', () => {
    const headings = parseUnitHeadings(toPages(fixture('entrepreneurship')))
    expect(headings).toContainEqual({ unit: 5, title: 'Understanding the Market', page: 2 })
  })

  it('reads all eighteen Sociology units across both school years', () => {
    expect(parseUnitHeadings(toPages(fixture('sociology')))).toHaveLength(18)
  })

  it('finds none in a document that does not use the form', () => {
    /* Evidence first: a stub returning [] would pass this alone. */
    expect(parseUnitHeadings(toPages(fixture('accountancy')))).toHaveLength(13)
    expect(parseUnitHeadings(toPages(fixture('science-x')))).toEqual([])
  })
})

describe('topics — what the app actually needs to teach', () => {
  it('gives Accountancy topics instead of reporting it unreadable', () => {
    const doc = extractDocument({ slug: 'accountancy', text: fixture('accountancy') })
    expect(doc.topics.length).toBe(13)
    expect(doc.needsReview).not.toContain('no topics found')
  })

  it('gives Sociology topics even though its marks table is unreadable', () => {
    const doc = extractDocument({ slug: 'sociology', text: fixture('sociology') })
    expect(doc.topics.length).toBe(18)
  })

  it('prefers the marks-bearing units when the table WAS trustworthy', () => {
    /* Chemistry prints both a clean unit table and body headings. The table is
     * the better source because it carries marks, so topics come from it. */
    const doc = extractDocument({ slug: 'chemistry', text: fixture('chemistry') })
    expect(doc.topics.every((t) => typeof t.marks === 'number')).toBe(true)
    expect(doc.topics.length).toBe(doc.units.length)
  })

  it('records marks as null rather than inventing them when the table spans', () => {
    const doc = extractDocument({ slug: 'business-studies', text: fixture('business-studies') })
    expect(doc.units).toEqual([])
    expect(doc.topics.length).toBeGreaterThan(0)
    expect(doc.topics.every((t) => t.marks === null)).toBe(true)
  })

  it('every topic cites the page it came from', () => {
    const doc = extractDocument({ slug: 'accountancy', text: fixture('accountancy') })
    expect(doc.topics.every((t) => Number.isInteger(t.page) && t.page >= 1)).toBe(true)
  })
})

describe('parseThemeRows — the Section/Theme family', () => {
  it('reads all seven Class XI History themes with their marks', () => {
    /* Themes 5 and 6 share their line with the section title printed to the
     * left ("TRADITIONS        5   Changing Cultural Traditions   10"), so a
     * pattern anchored to the start of the line silently drops them. */
    expect(parseThemeRows(toPages(fixture('history'))[2].text)).toEqual([
      { theme: 1, title: 'Writing and City Life', marks: 10 },
      { theme: 2, title: 'An Empire Across Three Continents', marks: 10 },
      { theme: 3, title: 'Nomadic Empires', marks: 10 },
      { theme: 4, title: 'The Three orders', marks: 10 },
      { theme: 5, title: 'Changing Cultural Traditions', marks: 10 },
      { theme: 6, title: 'Displacing Indigenous Peoples', marks: 10 },
      { theme: 7, title: 'Paths to Modernisation', marks: 15 },
    ])
  })

  it('adds up to the theory total once map work is counted', () => {
    const rows = parseThemeRows(toPages(fixture('history'))[2].text)
    expect(rows.reduce((n, r) => n + r.marks, 0)).toBe(75)
  })

  it('does not mistake a date range in brackets for a theme row', () => {
    /* "Introduction Timeline I (6 MYA TO 1 BCE)" contains a number and text but
     * ends in a bracket, not a marks column. */
    const titles = parseThemeRows(toPages(fixture('history'))[2].text).map((r) => r.title)
    expect(titles.some((t) => t.includes('Timeline'))).toBe(false)
  })

  it('does not treat Total or Map rows as themes', () => {
    const titles = parseThemeRows(toPages(fixture('history'))[2].text).map((r) => r.title.toLowerCase())
    expect(titles).not.toContain('map work of the related themes')
    expect(titles).not.toContain('theory total')
  })

  it('gives History topics instead of reporting it unreadable', () => {
    const doc = extractDocument({ slug: 'history', text: fixture('history') })
    expect(doc.layout).toBe('section-theme-table')
    expect(doc.topics.length).toBeGreaterThanOrEqual(7)
    expect(doc.needsReview).not.toContain('no topics found')
  })

  it('every History topic carries its marks and its page', () => {
    const doc = extractDocument({ slug: 'history', text: fixture('history') })
    expect(doc.topics.every((t) => typeof t.marks === 'number' && Number.isInteger(t.page))).toBe(true)
  })
})

describe('parseChapterRows — chapter lists in the syllabus body', () => {
  it('reads all twenty-one Class X Social Science chapters', () => {
    /* One document, six different separator styles:
     *   Chapter I -Title      Chapter 2 Title       Chapter 3-. Title
     *   Chapter 5. Title      Chapter- 1. Title     Chapter-4. Title
     * A pattern written against any one of them loses most of the subject. */
    const rows = parseChapterRows(rawFixture('social-science-x'))
    expect(rows).toHaveLength(21)
  })

  it('reads the first chapter with its Roman number and clean title', () => {
    const rows = parseChapterRows(rawFixture('social-science-x'))
    expect(rows[0]).toEqual({ number: 'I', title: 'The Rise of Nationalism in Europe' })
  })

  it('reads a chapter written with no dash at all', () => {
    const rows = parseChapterRows(rawFixture('social-science-x'))
    expect(rows).toContainEqual({ number: '2', title: 'Nationalism in India' })
  })

  it('reads a chapter whose dash comes BEFORE the number', () => {
    const rows = parseChapterRows(rawFixture('social-science-x'))
    expect(rows).toContainEqual({ number: '1', title: 'Development' })
  })

  it('does not treat a bare "Chapter No." column header as a chapter', () => {
    const rows = parseChapterRows(rawFixture('social-science-x'))
    const titles = rows.map((r) => r.title.toLowerCase())
    expect(titles).not.toContain('name marks')
    expect(titles).not.toContain('no. chapter name marks')
  })

  it('does not treat a bare "Chapter 7" with no title as a chapter', () => {
    const rows = parseChapterRows('Chapter 7\nChapter III\n')
    expect(rows).toEqual([])
  })
})

describe('parseHourThemes — themes annotated with study hours', () => {
  it('reads all sixteen Class IX Social Science themes', () => {
    expect(parseHourThemes(rawFixture('social-science-ix'))).toHaveLength(16)
  })

  it('rejoins a title the PDF broke in the middle of a word', () => {
    /* The document's own text layer contains "Understandin" and "g Social" as
     * separate fragments. They are one word. */
    const themes = parseHourThemes(rawFixture('social-science-ix'))
    expect(themes[0]).toEqual({ theme: 1, title: 'Understanding Social Science', hours: 4 })
  })

  it('does NOT glue fragments that are already whole words', () => {
    /* "Shaping of" + "the Earth's" must not become "Shaping ofthe". */
    const themes = parseHourThemes(rawFixture('social-science-ix'))
    expect(themes[1].title).toBe('Shaping of the Earth\u2019s Surface')
  })

  it('does not glue when the NEXT fragment starts with a common word', () => {
    /* "Atmosphere" + "and Climate" must not become "Atmosphereand". */
    const themes = parseHourThemes(rawFixture('social-science-ix'))
    expect(themes[2]).toEqual({ theme: 3, title: 'Atmosphere and Climate', hours: 7 })
  })

  it('captures the study hours, which the planner needs for time estimates', () => {
    const themes = parseHourThemes(rawFixture('social-science-ix'))
    expect(themes.map((t) => t.hours)).toEqual([4, 8, 7, 9, 9, 9, 9, 7, 8, 7, 7, 9, 8, 10, 8, 6])
  })

  it('totals 125 instructional hours across both parts', () => {
    const themes = parseHourThemes(rawFixture('social-science-ix'))
    expect(themes.reduce((n, t) => n + t.hours, 0)).toBe(125)
  })

  it('finds none in a document that does not annotate hours', () => {
    expect(parseHourThemes(rawFixture('social-science-ix'))).toHaveLength(16)
    expect(parseHourThemes('some prose with no themes')).toEqual([])
  })
})

describe('rawText unlocks documents that -layout cannot read', () => {
  it('gives Class X Social Science its chapters', () => {
    const doc = extractDocument({
      slug: 'social-science-x',
      text: fixture('social-science-x'),
      rawText: rawFixture('social-science-x'),
    })
    expect(doc.topics).toHaveLength(21)
    expect(doc.needsReview).not.toContain('no topics found')
  })

  it('gives Class IX Social Science its themes and their hours', () => {
    const doc = extractDocument({
      slug: 'social-science-ix',
      text: fixture('social-science-ix'),
      rawText: rawFixture('social-science-ix'),
    })
    expect(doc.topics).toHaveLength(16)
    expect(doc.topics[0].hours).toBe(4)
  })
})

describe('repairSpacing — raw mode loses spaces, layout mode keeps them', () => {
  it('restores a space lost inside a chapter title', () => {
    /* `pdftotext -raw` emits "Moneyand Credit". The SAME document read with
     * -layout says "Money and Credit". The correct string is evidence from the
     * document itself, so no dictionary and no guessing is involved. */
    const layout = fixture('social-science-x')
    expect(repairSpacing('Moneyand Credit', layout)).toBe('Money and Credit')
  })

  it('restores a space lost at a word boundary with no case change to hint at it', () => {
    const layout = fixture('social-science-x')
    expect(repairSpacing('Globalisation and the IndianEconomy', layout))
      .toBe('Globalisation and the Indian Economy')
  })

  it('leaves an already-correct title untouched', () => {
    const layout = fixture('social-science-x')
    expect(repairSpacing('Nationalism in India', layout)).toBe('Nationalism in India')
  })

  it('returns the title unchanged when the document does not contain it', () => {
    expect(repairSpacing('Something Not In This Document', fixture('social-science-x')))
      .toBe('Something Not In This Document')
  })

  it('collapses a match that the layout text wrapped across two lines', () => {
    expect(repairSpacing('AlphaBeta', 'some text Alpha\n   Beta more text')).toBe('Alpha Beta')
  })
})

describe('parsePrescribedTexts — the literature a student actually reads', () => {
  it('reads all twenty-eight Class X English texts', () => {
    /* 9 prose + 10 poems in FIRST FLIGHT, 9 in FOOTPRINTS WITHOUT FEET. These
     * are the atomic teaching units for English; the marks table describes
     * question types, not content. */
    expect(parsePrescribedTexts(rawFixture('english-x'))).toHaveLength(28)
  })

  it('records the book and section each text belongs to', () => {
    const texts = parsePrescribedTexts(rawFixture('english-x'))
    expect(texts[0]).toEqual({ book: 'FIRST FLIGHT', section: 'Prose', number: 1, title: 'A Letter to God' })
  })

  it('keeps poems separate from prose within the same book', () => {
    const texts = parsePrescribedTexts(rawFixture('english-x'))
    const poems = texts.filter((t) => t.section === 'Poems')
    expect(poems).toHaveLength(10)
    expect(poems[0].title).toBe('Dust of Snow')
  })

  it('reads a title printed with no space after its number', () => {
    /* The document prints "10.For Anne Gregory". */
    const texts = parsePrescribedTexts(rawFixture('english-x'))
    expect(texts.map((t) => t.title)).toContain('For Anne Gregory')
  })

  it('does not treat the workbook line as a text', () => {
    const titles = parsePrescribedTexts(rawFixture('english-x')).map((t) => t.title)
    expect(titles.some((t) => t.includes('WORDS AND EXPRESSIONS'))).toBe(false)
  })

  it('ignores the numbered question-paper items printed before the book list', () => {
    const titles = parsePrescribedTexts(rawFixture('english-x')).map((t) => t.title)
    expect(titles.some((t) => t.startsWith('Discursive passage'))).toBe(false)
  })
})

describe('parseSectionRows — skills-based syllabuses', () => {
  it('reads the four Class IX English sections with their marks', () => {
    /* Class IX English names no texts at all; it points at a textbook and
     * defines skill sections. Those sections ARE its teachable structure. */
    expect(parseSectionRows(rawFixture('english-ix'))).toEqual([
      { section: 'A', title: 'Reading Skills', marks: 20 },
      { section: 'B', title: 'Writing Skills and Grammar', marks: 30 },
      { section: 'C', title: 'Language through Literature', marks: 30 },
      { section: 'D', title: 'Internal Assessment', marks: 20 },
    ])
  })

  it('adds up to 100 marks', () => {
    const rows = parseSectionRows(rawFixture('english-ix'))
    expect(rows.reduce((n, r) => n + r.marks, 0)).toBe(100)
  })

  it('finds none in a document with no section table', () => {
    expect(parseSectionRows(rawFixture('english-ix'))).toHaveLength(4)
    expect(parseSectionRows('prose with no sections')).toEqual([])
  })
})

describe('English is no longer unreadable', () => {
  it('gives Class X English its texts', () => {
    const doc = extractDocument({ slug: 'english-x', text: fixture('english-x'), rawText: rawFixture('english-x') })
    expect(doc.topics).toHaveLength(28)
    expect(doc.needsReview).not.toContain('no topics found')
  })

  it('gives Class IX English its sections', () => {
    const doc = extractDocument({ slug: 'english-ix', text: fixture('english-ix'), rawText: rawFixture('english-ix') })
    expect(doc.topics).toHaveLength(4)
    expect(doc.needsReview).not.toContain('no topics found')
  })
})

describe('a document that cannot be read is refused, not approximated', () => {
  it('returns no topics and says so when nothing recognisable is present', () => {
    const doc = extractDocument({ slug: 'opaque', text: 'nothing structured here', rawText: 'nothing structured here' })
    expect(doc.topics).toEqual([])
    expect(doc.needsReview).toContain('no topics found')
  })

  it('does not invent topics from a table whose cells are wrapped past recovery', () => {
    /* This is the Physical Education shape: a title column split one word per
     * line, interleaved with other columns, in BOTH -layout and -raw output.
     * Every reconstruction attempt produced titles like
     * "Changing Trends and Careers in Physical Educationaims, and gy-based",
     * so the document is reported unreadable instead. */
    const mangled = [
      'Unit    Unit Name &         Specific',
      'No.       Topics            learning',
      'Unit   Changing         . To make the',
      '1      Trendsand         students',
      '       Careers in        understand',
    ].join('\n')
    const doc = extractDocument({ slug: 'wrapped-cells', text: mangled, rawText: mangled })
    expect(doc.topics).toEqual([])
    expect(doc.needsReview).toContain('no topics found')
  })
})

describe('parseAtomicConcepts — splitting a unit into teachable pieces', () => {
  it('splits a "Heading: a, b, c" body into one concept per item', () => {
    const text = 'Chemical Reactions and Equations: Chemical reactions, Chemical equation, Balanced chemical equation.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual([
      'Chemical reactions',
      'Chemical equation',
      'Balanced chemical equation',
    ])
  })

  it('keeps only the item after a nested colon', () => {
    /* "types of chemical reactions: combination" is not a concept called
     * "types of chemical reactions: combination". The concept is "combination". */
    const text = 'Reactions: types of chemical reactions: combination, decomposition.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual([
      'combination',
      'decomposition',
    ])
  })

  it('records the heading each concept came from', () => {
    const text = 'Acids, Bases and Salts: neutralization, pH scale.'
    const concepts = parseAtomicConcepts(toPages(text))
    expect(concepts[0].heading).toBe('Acids, Bases and Salts')
  })

  it('records the page each concept came from', () => {
    const text = 'page one has nothing\fReactions: alpha reaction, beta reaction, gamma reaction.'
    expect(parseAtomicConcepts(toPages(text))[0].page).toBe(2)
  })

  it('drops a fragment too short to be a concept', () => {
    const text = 'Reactions: a, meaningful concept name, b.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['meaningful concept name'])
  })

  it('drops a fragment too long to be one concept', () => {
    const long = 'x'.repeat(120)
    const text = `Reactions: short concept, ${long}.`
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['short concept'])
  })

  it('does not split on a comma inside brackets', () => {
    /* "(Definition relating to logarithm not required)" is an aside on the
     * concept before it, not two more concepts. */
    const text = 'Scale: concept of pH scale (Definition relating to logarithm, not required), importance.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toContain('concept of pH scale (Definition relating to logarithm, not required)')
  })

  it('reads real detail out of the Class X Science document', () => {
    const concepts = parseAtomicConcepts(toPages(fixture('science-x')))
    expect(concepts.length).toBeGreaterThanOrEqual(30)
    expect(concepts.map((c) => c.title)).toContain('Balanced chemical equation')
  })

  it('finds nothing in a document with no detail lines', () => {
    expect(parseAtomicConcepts(toPages(fixture('science-x'))).length).toBeGreaterThan(0)
    expect(parseAtomicConcepts(toPages('just prose, no headings with colons here'))).toEqual([])
  })
})

describe('atomic concepts exclude everything that is not curriculum', () => {
  it('ignores a page describing the question paper, not the course', () => {
    /* Class X Mathematics page 8 is a Question Paper Design table. Read as
     * curriculum it produced topics called "Remembering", "comparing" and
     * "and answers. 43 54 1". */
    const text = [
      'QUESTION PAPER DESIGN',
      'Remembering: Exhibit memory of previously learned material by recalling facts, terms.',
    ].join('\n')
    expect(parseAtomicConcepts(toPages(text))).toEqual([])
  })

  it('ignores a Bloom\u2019s taxonomy heading even off such a page', () => {
    const text = 'Understanding: Demonstrate understanding of facts and ideas by organizing, comparing.'
    expect(parseAtomicConcepts(toPages(text))).toEqual([])
  })

  it('drops a title carrying a marks column that bled in', () => {
    /* "Structure and Function 15 IV Plant Physiology 12 V Human Physiology 18"
     * is three table cells, not one concept. */
    const text = 'Cell: Structure and Function 15 IV Plant Physiology 12 V Human Physiology, real concept here.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toEqual(['real concept here'])
  })

  it('keeps a concept that legitimately contains one number', () => {
    const text = 'Topic: Newton\u2019s 3 laws of motion, another good concept name.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toContain('Newton\u2019s 3 laws of motion')
  })

  it('ignores the practical list, which is not the taught syllabus', () => {
    const text = ['PRACTICALS', 'Experiment: finding the pH of the following samples using paper.'].join('\n')
    expect(parseAtomicConcepts(toPages(text))).toEqual([])
  })

  it('still reads the real Class X Science concepts after the exclusions', () => {
    const titles = parseAtomicConcepts(toPages(fixture('science-x'))).map((c) => c.title)
    expect(titles).toContain('Balanced chemical equation')
    expect(titles).toContain('Reactivity series')
    expect(titles).not.toContain('Competencies')
  })

  it('no surviving concept is shorter than four characters', () => {
    const concepts = parseAtomicConcepts(toPages(fixture('chemistry')))
    expect(concepts.length).toBeGreaterThan(50)
    expect(concepts.every((c) => c.title.length >= 4)).toBe(true)
  })
})

describe('a concept must read like a topic, not like working', () => {
  it('rejects set and algebra notation from a worked example', () => {
    /* The advanced-level reading material is full of solved problems.
     * "A = {x | x = 2n" and "7} and B = {1" are steps in an answer, not topics. */
    const text = 'Sets: A = {x | x = 2n, 7} and B = {1, a genuine topic name.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['a genuine topic name'])
  })

  it('rejects a sentence fragment that starts with a conjunction', () => {
    const text = 'Alcohols: ethanol and its properties, and the smell is due to ethanol.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toEqual(['ethanol and its properties'])
  })

  it('rejects a title that is mostly symbols and digits', () => {
    const text = 'Ions: 2+ 3- 4 5 6, Hydrogen Bonding and its effects.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title))
      .toEqual(['Hydrogen Bonding and its effects'])
  })

  it('keeps a chemistry topic that legitimately contains a formula word', () => {
    const text = 'Bonding: Hydrogen Bonding, Modern Periodic Law and the Present Form.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toContain('Hydrogen Bonding')
    expect(titles).toContain('Modern Periodic Law and the Present Form')
  })

  it('leaves the real Class XI Chemistry concepts intact', () => {
    const titles = parseAtomicConcepts(toPages(fixture('chemistry'))).map((c) => c.title)
    /* The document uses a straight apostrophe here and a curly one elsewhere. */
    expect(titles).toContain("Dalton's Atomic Theory")
    expect(titles).toContain('Mole Concept and Molar Masses')
  })

  it('every surviving concept is at least half letters', () => {
    const concepts = parseAtomicConcepts(toPages(fixture('biology')))
    expect(concepts.length).toBeGreaterThan(50)
    for (const c of concepts) {
      const letters = (c.title.match(/[A-Za-z]/g) ?? []).length
      expect(letters / c.title.length, c.title).toBeGreaterThanOrEqual(0.5)
    }
  })
})

describe('the learning-outcomes column must not bleed into a concept', () => {
  it('rejects a title carrying a bullet from the next column', () => {
    /* Business Studies prints Content and Learning Outcomes side by side. In
     * -layout text the columns share a line, so "Art and Profession" picks up
     * "• Examine the nature of management as a science". */
    const text = 'Nature: Art and • Examine the nature of Profession management, real concept name.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['real concept name'])
  })

  it('rejects a title carrying an outcome phrase', () => {
    const text = 'Vouchers: the students will be Meaning, preparation of vouchers.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['preparation of vouchers'])
  })

  it('rejects a title with an unbalanced bracket', () => {
    /* "cash book with bank decrease) on the assets" is the tail of one cell
     * glued to the head of another. */
    const text = 'Books: cash book with bank decrease) on the assets, subsidiary books.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title)).toEqual(['subsidiary books'])
  })

  it('keeps a title whose brackets are balanced', () => {
    const text = 'Scale: concept of pH scale (not required), importance of pH.'
    const titles = parseAtomicConcepts(toPages(text)).map((c) => c.title)
    expect(titles).toContain('concept of pH scale (not required)')
  })

  it('leaves the real Class X Science concepts intact after every rule', () => {
    const titles = parseAtomicConcepts(toPages(fixture('science-x'))).map((c) => c.title)
    expect(titles).toContain('Balanced chemical equation')
    expect(titles).toContain('Reactivity series')
    expect(titles).toContain('Corrosion and its prevention')
  })
})

describe('a unit label is not a teaching heading', () => {
  it('rejects "UNIT VII" as a heading', () => {
    /* This is a row of the marks table, not a topic. Read as curriculum it
     * turned the whole Class 10 Mathematics syllabus into a single "concept"
     * called STATISTICS AND PROBABILITY. */
    const text = 'UNIT VII: STATISTICS AND PROBABILITY, and some other list items here'
    expect(parseAtomicConcepts(toPages(text))).toEqual([])
  })

  it('rejects "Unit I" and "Unit-1" too, when only one thing follows', () => {
    expect(parseAtomicConcepts(toPages('Unit I: Chemical Substances and their behaviour today'))).toEqual([])
    expect(parseAtomicConcepts(toPages('Unit-1: Theoretical Framework of accounting today'))).toEqual([])
  })

  it('KEEPS a unit label that heads a real list', () => {
    /* Chemistry writes its syllabus this way. Rejecting the label outright
     * deleted 56 real concepts from Class XI Chemistry. */
    const text = 'Unit 1: Some Basic Concepts of Chemistry, Nature of Matter, Laws of Chemical Combination'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title))
      .toEqual(['Some Basic Concepts of Chemistry', 'Nature of Matter', 'Laws of Chemical Combination'])
  })

  it('rejects a Theme label the same way', () => {
    expect(parseAtomicConcepts(toPages('Theme 3: Nomadic Empires and their movements'))).toEqual([])
  })

  it('still accepts a real heading that merely starts with a word like Units', () => {
    const text = 'Units and Measurements: dimensional analysis, significant figures.'
    expect(parseAtomicConcepts(toPages(text)).map((c) => c.title))
      .toEqual(['dimensional analysis', 'significant figures'])
  })
})

describe('parseContentTable — syllabuses printed as a Content table', () => {
  /* Class 10 Mathematics is published as a Content / Competencies / Explanation
   * TABLE, not as "Heading: a, b, c" prose. The prose extractor found nothing,
   * the subject produced ZERO concepts, and it was dropped from the build
   * without a word. A Class 10 student would have had no Mathematics at all.
   *
   * In `-layout` the three columns share every line and there is no reliable
   * vertical gutter — three of the seven content pages have none, so slicing by
   * column produced titles with the Competencies text welded on. Reading order
   * (`-raw`) separates them cleanly: chapter, its numbered concepts, then the
   * bullet list that ends the block. */

  it('reads the Class 10 Mathematics concepts the prose parser could not see', () => {
    const items = parseContentTable(rawFixture('maths-x'))
    expect(items.length).toBeGreaterThanOrEqual(28)
  })

  it('reads concepts with their real wording', () => {
    const titles = parseContentTable(rawFixture('maths-x')).map((i) => i.title)
    expect(titles).toContain('Zeros of a polynomial')
    expect(titles).toContain('Motivation for studying Arithmetic Progression')
    expect(titles).toContain('Classical definition of probability')
  })

  it('groups concepts under the chapter they belong to', () => {
    const items = parseContentTable(rawFixture('maths-x'))
    const zeros = items.find((i) => i.title === 'Zeros of a polynomial')
    expect(zeros?.chapter).toBe('POLYNOMIALS')
  })

  it('stops at the prescribed books list', () => {
    /* "Mathematics - Textbook for class X - NCERT Publication" is a book, not
     * something to study. Four of them were arriving as concepts of
     * PROBABILITY. */
    const titles = parseContentTable(rawFixture('maths-x')).map((i) => i.title)
    expect(titles.some((t) => t.includes('NCERT Publication'))).toBe(false)
    expect(titles.some((t) => t.includes('Laboratory Manual'))).toBe(false)
  })

  it('does not treat a bullet from the competencies column as a concept', () => {
    const text = ['1. REAL NUMBERS', '1. Fundamental Theorem of Arithmetic', '\u2022 Develops understanding of numbers'].join('\n')
    const titles = parseContentTable(text).map((i) => i.title)
    expect(titles).toEqual(['Fundamental Theorem of Arithmetic'])
  })

  it('treats an ALL CAPS numbered line as a chapter, not a concept', () => {
    const text = ['1. REAL NUMBERS', '1. Fundamental Theorem of Arithmetic'].join('\n')
    const items = parseContentTable(text)
    expect(items).toHaveLength(1)
    expect(items[0].chapter).toBe('REAL NUMBERS')
  })

  it('treats the first numbered line after a UNIT heading as a chapter even in title case', () => {
    /* Class 10 Maths writes "Coordinate Geometry" in title case where every
     * other chapter is in capitals. Without the UNIT rule its concepts were
     * filed under Arithmetic Progressions. */
    const text = ['UNIT III: COORDINATE GEOMETRY', '1. Coordinate Geometry', '1. Review: Concepts of coordinate geometry'].join('\n')
    const items = parseContentTable(text)
    expect(items[0].chapter).toBe('Coordinate Geometry')
  })

  it('joins a concept that wraps across lines', () => {
    const text = ['1. ALGEBRA', '1. Pair of linear equations in', 'two variables and graphical', 'method of their solution'].join('\n')
    expect(parseContentTable(text)[0].title)
      .toBe('Pair of linear equations in two variables and graphical method of their solution')
  })

  it('finds nothing in a document with no numbered content table', () => {
    expect(parseContentTable(rawFixture('maths-x')).length).toBeGreaterThan(20)
    expect(parseContentTable('just prose, nothing numbered at all here')).toEqual([])
  })
})

describe('the end-of-syllabus marker must not fire in the marks table', () => {
  it('keeps reading past an "Internal Assessment" row near the top', () => {
    /* "Internal assessment  20" is a ROW of the marks table, printed on page 2
     * of almost every document. Treating it as the end of the syllabus made the
     * parser stop after a few pages: Psychology yielded concepts from pages 2-5
     * of a 15-page document and nothing after. */
    const text = [
      'Theory 70',
      'Internal assessment 30',
      '1. HUMAN DEVELOPMENT',
      '1. Meaning of development',
      '2. Factors influencing development',
    ].join('\n')
    const titles = parseContentTable(text).map((i) => i.title)
    expect(titles).toEqual(['Meaning of development', 'Factors influencing development'])
  })

  it('still stops at the prescribed books list', () => {
    const text = [
      '1. HUMAN DEVELOPMENT',
      '1. Meaning of development',
      'Prescribed Books:',
      '1. Psychology textbook for class XI - NCERT Publication',
    ].join('\n')
    expect(parseContentTable(text).map((i) => i.title)).toEqual(['Meaning of development'])
  })

  it('still stops at the question paper design', () => {
    const text = [
      '1. HUMAN DEVELOPMENT',
      '1. Meaning of development',
      'QUESTION PAPER DESIGN',
      '1. Remembering and understanding of the material previously learned',
    ].join('\n')
    expect(parseContentTable(text).map((i) => i.title)).toEqual(['Meaning of development'])
  })
})

describe('a combined XI-XII document does not end at its middle', () => {
  it('RESUMES after an admin section, because Class XII follows it', () => {
    /* A combined XI-XII document prints the Class XI question paper design in
     * the MIDDLE, then the whole Class XII syllabus. Treating that marker as the
     * end of the document threw away a full school year: Psychology stopped at
     * page 5 of 12 and Class XII got nothing at all. */
    const text = [
      '1. HUMAN DEVELOPMENT',
      '1. Meaning of development',
      'QUESTION PAPER DESIGN',
      '1. Remembering and understanding of previously learned material',
      'Unit I Variations in Psychological Attributes',
      '1. Individual differences in human functioning',
      '2. Assessment of psychological attributes',
    ].join('\n')
    const titles = parseContentTable(text).map((i) => i.title)
    expect(titles).toEqual([
      'Meaning of development',
      'Individual differences in human functioning',
      'Assessment of psychological attributes',
    ])
  })

  it('reads a unit heading written without a colon', () => {
    /* Psychology writes "Unit VIII Motivation and Emotion". The colon form is
     * Mathematics' style. Requiring the colon meant Psychology had no chapters. */
    const text = [
      'Unit VIII Motivation and Emotion',
      '1. Nature of Motivation',
      '2. Types of Motives',
    ].join('\n')
    const items = parseContentTable(text)
    expect(items[0].chapter).toBe('Motivation and Emotion')
    expect(items.map((i) => i.title)).toEqual(['Nature of Motivation', 'Types of Motives'])
  })

  it('keeps the colon form working, where the chapter comes after the unit', () => {
    const text = ['UNIT III: COORDINATE GEOMETRY', '1. Coordinate Geometry', '1. Distance formula and section formula'].join('\n')
    const items = parseContentTable(text)
    expect(items[0].chapter).toBe('Coordinate Geometry')
    expect(items[0].title).toBe('Distance formula and section formula')
  })
})

describe('prescribed texts listed as bullets, not numbers', () => {
  it('reads the Class XI English Core texts', () => {
    /* Hornbill and Snapshots list their contents with bullets. The parser only
     * accepted numbered items, so English Core reported eight concepts against
     * a floor of ten while twenty-odd real texts sat in the document. */
    const texts = parsePrescribedTexts(rawFixture('english-core'))
    expect(texts.length).toBeGreaterThanOrEqual(15)
  })

  it('records which book each text belongs to', () => {
    const texts = parsePrescribedTexts(rawFixture('english-core'))
    const portrait = texts.find((t) => t.title.startsWith('The Portrait of a Lady'))
    expect(portrait?.book).toContain('Hornbill')
  })

  it('reads a bullet glyph the document uses only sometimes', () => {
    /* The same list mixes two different bullet characters. */
    const titles = parsePrescribedTexts(rawFixture('english-core')).map((t) => t.title)
    expect(titles.some((t) => t.includes('The Adventure'))).toBe(true)
    expect(titles.some((t) => t.includes('Father to Son'))).toBe(true)
  })

  it('stops before the internal assessment block', () => {
    const titles = parsePrescribedTexts(rawFixture('english-core')).map((t) => t.title)
    expect(titles.some((t) => t.includes('Assessment of Listening'))).toBe(false)
  })

  it('does not break the numbered list it already read', () => {
    expect(parsePrescribedTexts(rawFixture('english-x'))).toHaveLength(28)
  })
})

describe('the richer reader wins, not merely the first one to find anything', () => {
  it('uses the prescribed texts when they outnumber the unit headings', () => {
    /* English Core yielded ONE topic from its unit headings and about twenty
     * prescribed texts. The raw-mode reader only ran when the count was zero,
     * so that single topic was enough to hide the whole book list, and the
     * subject stayed under the floor with its real content unread. */
    const doc = extractDocument({
      slug: 'english-core',
      text: fixture('english-core'),
      rawText: rawFixture('english-core'),
    })
    expect(doc.topics.length).toBeGreaterThanOrEqual(15)
  })

  it('does not discard a richer layout-mode result for a poorer raw one', () => {
    /* Chemistry reads cleanly in layout mode. Nothing here may take that away. */
    const doc = extractDocument({ slug: 'chemistry', text: fixture('chemistry') })
    expect(doc.topics.length).toBe(doc.units.length)
    expect(doc.topics.every((t) => typeof t.marks === 'number')).toBe(true)
  })
})

describe('classifyLayout — no document is silently unhandled', () => {
  it('classifies the Roman-numeral unit table family', () => {
    expect(classifyLayout(toPages(fixture('maths-x')))).toBe('unit-marks-table')
    expect(classifyLayout(toPages(fixture('science-x')))).toBe('unit-marks-table')
    expect(classifyLayout(toPages(fixture('biology')))).toBe('unit-marks-table')
  })

  it('classifies the unit-containing-chapters family', () => {
    expect(classifyLayout(toPages(fixture('physics')))).toBe('unit-chapter-table')
  })

  it('classifies the Part A/B/C family that has no COURSE STRUCTURE heading', () => {
    expect(classifyLayout(toPages(fixture('accountancy')))).toBe('part-units-table')
  })

  it('classifies the Section/Theme family', () => {
    expect(classifyLayout(toPages(fixture('history')))).toBe('section-theme-table')
  })

  it('says unknown rather than guessing when nothing matches', () => {
    /* Evidence first: a classifier hardcoded to 'unknown' passes this alone. */
    expect(classifyLayout(toPages(fixture('maths-x')))).toBe('unit-marks-table')
    expect(classifyLayout(toPages('just some prose with no table at all'))).toBe('unknown')
  })
})

describe('extractDocument — the whole record, and what it admits it cannot read', () => {
  it('records the slug, page count and layout', () => {
    const doc = extractDocument({ slug: 'maths-x', text: fixture('maths-x') })
    expect(doc.slug).toBe('maths-x')
    expect(doc.pageCount).toBe(10)
    expect(doc.layout).toBe('unit-marks-table')
  })

  it('attaches the source page to every unit it found', () => {
    const doc = extractDocument({ slug: 'maths-x', text: fixture('maths-x') })
    expect(doc.units).toHaveLength(7)
    for (const unit of doc.units) expect(unit.page).toBe(3)
  })

  it('separates the two class blocks in a combined XI-XII document', () => {
    const doc = extractDocument({ slug: 'biology', text: fixture('biology') })
    expect(doc.blocks.map((b) => b.page)).toEqual([3, 9])
  })

  it('reports needsReview for a layout it has no unit parser for', () => {
    /* The whole point. An unhandled layout must arrive as a named problem, not
     * as an empty units array that reads like "this subject has no units". */
    const doc = extractDocument({ slug: 'accountancy', text: fixture('accountancy') })
    expect(doc.units).toEqual([])
    expect(doc.needsReview).toContain('no unit parser for layout: part-units-table')
  })

  it('reports needsReview when the two formative lists disagree', () => {
    const doc = extractDocument({ slug: 'science-x', text: fixture('science-x') })
    expect(doc.needsReview).toContain('formative lists disagree: boxes vs Note for Teachers')
  })

  it('leaves needsReview empty for a clean document', () => {
    const doc = extractDocument({ slug: 'maths-x', text: fixture('maths-x') })
    /* Evidence first: a document nothing was read from has nothing to review. */
    expect(doc.units).toHaveLength(7)
    expect(doc.needsReview).toEqual([])
  })

  it('flags a unit table whose marks do not add up to the printed total', () => {
    const broken = [
      'COURSE STRUCTURE',
      '   Units   Unit Name        Marks',
      '     I     ALPHA              10',
      '     II    BETA               20',
      '           Total              80',
    ].join('\n')
    const doc = extractDocument({ slug: 'broken', text: broken })
    expect(doc.needsReview).toContain('unit marks sum to 30 but the document prints Total 80')
  })
})
