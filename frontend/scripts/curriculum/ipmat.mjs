/* IPMAT (IIM Rohtak), read off the institute's own admissions FAQ.
 *
 * THERE IS NO SYLLABUS PAGE. The IPM programme page carries no test pattern at
 * all. The pattern is inside the admissions FAQ, and the PDF the page most
 * obviously offers -- "IPMAT 2026 Summary" -- is candidate STATISTICS. Anyone
 * re-fetching this without the note below will take that file and record the
 * wrong thing entirely.
 *
 * IIM ROHTAK ONLY. IIM Indore runs a different paper with a different shape,
 * and its site did not answer. The gap is carried in the data rather than left
 * for a student to find out in an exam hall.
 */

export const IPMAT_SOURCE = {
  url: 'https://www.iimrohtak.ac.in/panel/assets/IPM%2008_FAQ_2026.pdf',
  discoveredFrom: 'https://www.iimrohtak.ac.in/ipm.php',
  linkText: 'IPM 08_FAQ_2026.pdf',
  sha256: '688b4e81d0fbf03f1c926eecf31bc41206877c1975470178fb7673bfea15e7ae',
  note:
    'The test pattern is in the admissions FAQ, not on the programme page. Do NOT use "IPMAT 2026 Summary.pdf" from the same page: that file is candidate statistics, not a syllabus.',
}

const SECTION_NAMES = ['Quantitative Ability', 'Logical Reasoning', 'Verbal Ability']

function firstNumber(text, pattern) {
  const match = pattern.exec(text)
  return match === null ? null : Number(match[1])
}

export function parseIpmat(text) {
  const sections = SECTION_NAMES.map((name) => {
    /* The count sits on the same line as the name in the printed table. */
    const line = new RegExp(`${name}\\s+(\\d+)`).exec(text)
    return { id: name.toLowerCase().replace(/\s+/g, '-'), name, questions: line === null ? null : Number(line[1]) }
  })

  const legal = /Legal Reasoning\s+(\d+)\s+(\d+)\s*minutes/.exec(text)

  return {
    examId: 'ipmat-2026-rohtak',
    institute: 'IIM Rohtak',
    covers: 'The IPM Aptitude Test set by IIM Rohtak.',
    notCovered:
      'IIM Indore runs a separate IPMAT with a different structure. It is not described here, and its site did not answer when this was built.',
    sections,
    questions: sections.reduce((total, s) => total + (s.questions ?? 0), 0),
    minutes: firstNumber(text, /(\d+)\s*minutes/),
    marksPerQuestion: firstNumber(text, /Each question will carry (\d+) marks/),
    negativeMarking: firstNumber(text, /negative marking of (\d+) mark/),
    optional:
      legal === null
        ? null
        : {
            name: 'Legal Reasoning',
            questions: Number(legal[1]),
            minutes: Number(legal[2]),
            appliesWhen: 'the candidate also chose the Integrated Programme in Law (IPL)',
          },
  }
}
