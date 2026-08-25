/* CLAT: a skills test, read from the Consortium's own page.
 *
 * WHY NOT THE UNIT SHAPE JEE AND NEET USE
 *   Those publish numbered units of CONTENT. CLAT publishes what a candidate
 *   must be able to DO, and states outright that it tests aptitude "rather than
 *   prior knowledge". Forcing it into units would invent chapters nobody set,
 *   and a student would revise a syllabus that does not exist.
 *
 * AND IT WAS NEVER BLOCKED
 *   Reported as a dead 404 for a day. The page is at
 *   `clat-2027/ug-syllabus.html`: the wrong YEAR and the wrong path had been
 *   guessed. The site is a JavaScript application, so that link exists only in
 *   the RENDERED page -- a plain fetch of the landing page returns two hrefs
 *   and none of them is this. Guessing failed; reading the rendered page
 *   succeeded in one attempt.
 */

export const CLAT_SOURCE = {
  url: 'https://consortiumofnlus.ac.in/clat-2027/ug-syllabus.html',
  discoveredFrom: 'https://consortiumofnlus.ac.in/clat-2027/',
  linkText: 'Syllabus & Guide',
  sha256: 'e5a90081d2137504024f0155dd59c71c9d5be4f24342215d72dfdf5c84e1fd70',
  note:
    'The Consortium site is a JavaScript application: this link is present only in the RENDERED page, not in the HTML a plain fetch returns. Re-fetch it by reading the rendered page, never by constructing the path.',
}

/** The five sections, in the order the paper sets them. */
const SECTIONS = [
  { id: 'english-language', heading: 'English Language' },
  { id: 'current-affairs-general-knowledge', heading: 'Current Affairs Including General Knowledge' },
  { id: 'legal-reasoning', heading: 'Legal Reasoning' },
  { id: 'logical-reasoning', heading: 'Logical Reasoning' },
  { id: 'quantitative-techniques', heading: 'Quantitative Techniques' },
]

/** Readable text, with block tags turned into line breaks so headings and list
 *  items stay apart. */
function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n')
}

/** The first whole number after `label`, or null. Read from the page rather
 *  than assumed: every one of these is a number a student plans around. */
function numberAfter(text, pattern) {
  const match = pattern.exec(text)
  return match === null ? null : Number(match[1])
}

export function parseClat(html) {
  const text = toText(html)
  const lines = text.split('\n')

  const sections = SECTIONS.map((section, index) => {
    const start = lines.findIndex(
      (line, i) => i > 0 && line.toLowerCase() === section.heading.toLowerCase(),
    )
    const nextHeading = SECTIONS[index + 1]?.heading.toLowerCase()
    const end =
      nextHeading === undefined
        ? lines.length
        : lines.findIndex((line, i) => i > start && line.toLowerCase() === nextHeading)

    const body = lines.slice(start + 1, end === -1 ? lines.length : end)

    /* Bulleted lines are the skills; the prose before them is the description
       of what the section is. Splitting on the bullet keeps the document's own
       distinction rather than inventing one. */
    const skills = body
      .filter((line) => line.startsWith('• '))
      .map((line) => line.slice(2).replace(/[;.]$/, '').trim())
      .filter((line) => line.length > 15)

    const description = body.filter((line) => !line.startsWith('• ')).join(' ')

    return {
      id: section.id,
      name: section.heading,
      description,
      skills,
      /* Every section is built around passages of this length, and it is the
         single most useful number for practice: it sets the reading pace. */
      passageWords: numberAfter(description, /(\d{3}) words/),
    }
  })

  return {
    examId: 'clat-2027',
    questions: numberAfter(text, /(\d+) multiple-choice questions/),
    minutes: numberAfter(text, /(\d+)-hour test/) === null ? null : numberAfter(text, /(\d+)-hour test/) * 60,
    negativeMarking: numberAfter(text, /negative marking of ([\d.]+) marks/),
    sections,
  }
}
