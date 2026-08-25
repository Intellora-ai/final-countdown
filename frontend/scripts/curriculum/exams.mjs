/* Entrance-exam syllabi: discover the link, then parse the document.
 *
 * WHY DISCOVERY IS A FUNCTION AND NOT A CONSTANT
 *   These syllabi were reported BLOCKED for a day -- "JEE 502, CLAT 404". The
 *   sites were up the whole time. The URLs had been GUESSED from a
 *   plausible-looking path rather than read off the official index. NTA hosts
 *   every PDF under an opaque hashed filename, so a guessed URL cannot work
 *   and its 404 is indistinguishable from a withdrawn document. Only the
 *   anchor TEXT identifies a syllabus, so that is what is matched.
 *
 * WHAT THE DOCUMENTS ACTUALLY CONTAIN, which is not what summaries say:
 *   - JEE Chemistry Unit 1 is printed "UNIT I" -- a Roman numeral among
 *     twenty Arabic ones. A digits-only reader drops it silently.
 *   - JEE Chemistry has NO UNIT 15. The official PDF runs 14 -> 16. The gap is
 *     preserved rather than renumbered: renumbering would hide a real
 *     omission in the source and make a later revision undetectable.
 *   So Chemistry ships 19 units numbered up to 20, and that is correct.
 */

/** Subjects, in the only spelling the documents use. */
const SUBJECT_WORDS = ['MATHEMATICS', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY']

/** `UNIT 7:` / `UNIT I:` / `UNIT - 12.` — Roman I included on purpose.
 *  The optional leading subject word is not decoration: JEE prints its very
 *  first Mathematics unit as `MATHEMATICS UNIT 1: SETS...`, sharing the line
 *  with the subject heading. A reader anchored on `UNIT` drops that one unit
 *  and reports 13 of 14 without complaining. */
const UNIT_LINE =
  /^[ \t]*(?:(MATHEMATICS|PHYSICS|CHEMISTRY|BIOLOGY)[ \t]+)?UNIT[ \t]*[-–]?[ \t]*(\d{1,2}|I)[ \t]*[:.][ \t]*(.*)$/i

/** Where each exam's syllabus came from. `discoveredFrom` is the page the link
 *  was READ off, so a moved PDF is re-found instead of reported as blocked. */
export const EXAM_SOURCES = {
  'jee-main-2026': {
    url: 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf',
    discoveredFrom: 'https://jeemain.nta.nic.in/',
    linkText: 'Syllabus',
    sha256: '7cad9da2a12065444828f744bd9f1a93a2dd0d9bd54c32a6d92d94a769e4f905',
  },
  'neet-ug-2026': {
    url: 'https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2026/01/202601081066816297.pdf',
    discoveredFrom: 'https://neet.nta.nic.in/',
    linkText: 'Syllabus for NEET (UG)-2026 Examination',
    sha256: '8b16375b6143a29743d3392915bbed0f886d3764f2f2d17932faa0b852a3a089',
  },
}

/**
 * Links on an official page that are actually a syllabus DOCUMENT.
 *
 * Two conditions, and both are load bearing. The text must say syllabus,
 * because the hashed URL says nothing. The href must be a PDF, because a
 * page titled "Old syllabus page" also says syllabus and is not a document
 * this pipeline can read.
 *
 * Returns [] rather than a best guess when nothing matches. A best guess here
 * is exactly what produced the false "blocked" report.
 */
export function discoverSyllabusLinks(html, baseUrl) {
  const found = []
  const anchor = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const [, href, inner] of html.matchAll(anchor)) {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    if (!/syllab/i.test(text)) continue
    if (!/\.pdf(?:[?#]|$)/i.test(href)) continue
    found.push({ text, url: new URL(href, baseUrl).href })
  }
  return found
}

/** JEE Paper 2 is a different exam (B.Arch / B.Planning) and repeats the
 *  Mathematics units. Everything from its title onward is dropped. */
function paperOneOnly(text) {
  const cut = text.search(/Syllabus for JEE \(Main\) Paper 2/i)
  return cut === -1 ? text : text.slice(0, cut)
}

/** The subject a unit belongs to: the nearest subject word appearing before it,
 *  either alone on its line ("PHYSICS") or directly ahead of the unit on the
 *  same line ("MATHEMATICS UNIT 1:"). Both spellings occur in the real PDFs. */
function subjectAt(text, index) {
  const before = text.slice(0, index)
  let best = null
  for (const word of SUBJECT_WORDS) {
    // `\f` counts as a line start. JEE prints `\fCHEMISTRY\n` at a page break,
    // so a pattern anchored only on `\n` never sees that heading -- and every
    // Chemistry unit is then filed under the previous subject. That produced
    // "physics: 39", which is Physics 20 plus all 19 of Chemistry's.
    const re = new RegExp(`(?:^|[\\n\\f])[ \\t]*${word}[ \\t]*(?=$|[\\n\\f]|UNIT)`, 'gim')
    for (const m of before.matchAll(re)) {
      if (best === null || m.index > best.index) best = { index: m.index, word }
    }
  }
  return best?.word.toLowerCase() ?? null
}

/**
 * Parse `pdftotext -layout` output into `{ examId, subjects: [{ id, units }] }`.
 * Every unit carries the page it was read from, so any claim can be checked
 * against the document rather than trusted.
 */
export function parseExam(examId, raw) {
  const text = examId.startsWith('jee') ? paperOneOnly(raw) : raw
  const pages = text.split('\f')

  const bySubject = new Map()
  let offset = 0
  pages.forEach((page, pageIndex) => {
    for (const line of page.split('\n')) {
      const m = UNIT_LINE.exec(line)
      if (m) {
        const at = offset + page.indexOf(line)
        // A subject word on the unit's own line wins: it is the heading.
        const subject = (m[1] ?? '').toLowerCase() || subjectAt(text, at)
        if (subject) {
          if (!bySubject.has(subject)) bySubject.set(subject, [])
          bySubject.get(subject).push({
            number: m[2].toUpperCase() === 'I' ? 1 : Number(m[2]),
            title: m[3].trim().replace(/[:\s]+$/, ''),
            topics: [],
            source: { pdf: `${examId}.pdf`, page: pageIndex + 1 },
            _at: at,
          })
        }
      }
    }
    offset += page.length + 1
  })

  // Topics = the prose between this unit heading and the next one, split on the
  // document's own semicolons and full stops. Taken from the text rather than
  // invented, so a topic can always be traced back to its page.
  const flat = [...bySubject.values()].flat().sort((a, b) => a._at - b._at)
  flat.forEach((unit, i) => {
    const end = i + 1 < flat.length ? flat[i + 1]._at : text.length
    const body = text.slice(unit._at, end).replace(UNIT_LINE, '').replace(/\f/g, ' ')
    unit.topics = body
      .split('\n').slice(1).join(' ')
      .split(/[;.]\s/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length > 3 && s.length < 200)
    delete unit._at
  })

  return {
    examId,
    subjects: [...bySubject.entries()].map(([id, units]) => ({ id, units })),
  }
}
