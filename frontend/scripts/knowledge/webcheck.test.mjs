import { describe, expect, it } from 'vitest'

import { checkConcept, checkModels } from './webcheck.mjs'

/**
 * DOES THE WEB RECOGNISE THIS CONCEPT?
 *
 * The owner's requirement, in their words: a generated concept must be
 * "accurate + existing" and "as per syllabus cirriculum latest". `verify.mjs`
 * proves a concept was QUOTED from the syllabus page, which is evidence the
 * words were read. This asks the different question: is the IDEA one that
 * teachers, textbooks and examiners recognise, or did the model coin it?
 *
 * The results below are shaped like what a real engine returns -- a url, a
 * title and a snippet -- because that is what `select.ts` and `openweb.ts`
 * hand around.
 */

let siteCounter = 0
/** Each page from a DIFFERENT site unless one is named, which is the real case. */
const page = (title, snippet, site) =>
  ({ url: `https://${site ?? `site${(siteCounter += 1)}.example`}/${encodeURIComponent(title.slice(0, 8))}`, title, snippet })

describe('a concept the world has heard of', () => {
  it('is recognised when several results name it', async () => {
    const out = await checkConcept(
      { id: 'sine', name: 'The sine function' },
      'mathematics', '10',
      async () => [
        page('Sine function - Wikipedia', 'The sine function relates an angle to a ratio of sides.'),
        page('Trigonometry: the sine function', 'How the sine function is defined for an acute angle.'),
        page('Plumbers in Bedford', 'Emergency callout, 24 hours.'),
      ],
    )
    expect(out.verdict).toBe('recognised')
    expect(out.where?.length ?? 0).toBeGreaterThan(0)
  })
})

describe("a concept the model appears to have coined", () => {
  it('is reported when nothing names it', async () => {
    const out = await checkConcept(
      { id: 'x', name: 'Retrograde trigonometric inversion' },
      'mathematics', '10',
      async () => [
        page('Trigonometry - Wikipedia', 'Trigonometry studies angles and side lengths.'),
        page('Inverse trigonometric functions', 'Arcsine, arccosine and arctangent.'),
      ],
    )
    expect(out.verdict, 'a coined concept was accepted because the topic words appeared').toBe('unrecognised')
  })

  it('is not rescued by results that share only one of its words', async () => {
    /* The weak version of this check accepts a result matching ANY word, which
       makes "Historical Use of Biotechnology" match a page about history and
       stops the check checking anything. */
    const out = await checkConcept(
      { id: 'x', name: 'Historical use of biotechnology' },
      'science', '10',
      async () => [
        page('A history of the Roman Empire', 'Historical accounts of Rome.'),
        page('Biotechnology today', 'Modern industrial biotechnology.'),
      ],
    )
    expect(out.verdict).toBe('unrecognised')
  })

  it('is recognised when results really do name the whole thing', async () => {
    const out = await checkConcept(
      { id: 'x', name: 'Historical use of biotechnology' },
      'science', '10',
      async () => [
        page('The historical use of biotechnology', 'Fermentation and selective breeding through history.'),
        page('Biotechnology: a historical use of microbes', 'Cheese, beer and wine.'),
      ],
    )
    expect(out.verdict).toBe('recognised')
  })
})

describe('a search that did not answer is not evidence of absence', () => {
  it('says so when nothing returned is about the concept at all', async () => {
    /* MEASURED on the live instance: "Web Servers" and "POP3" -- both plainly
       real -- came back with nothing naming them, because the engines were
       rate-limited and answered with unrelated pages. Calling that
       "unrecognised" condemns a real concept on a network problem, which is
       the same mistake as reading a failed canvas read as an empty canvas. */
    const out = await checkConcept(
      { id: 'x', name: 'Web servers' }, 'computer applications', '10',
      async () => [
        page('Fifth Circuit Court of Appeal - State of Louisiana', 'Public access to court records.'),
        page('Fresno CA Crime, Police & Arrest News', 'Find crime and police news.'),
      ],
    )
    expect(out.verdict, 'a rate-limited search was read as the web not knowing the concept').toBe('could-not-check')
  })

  it('still says unrecognised when the results ARE about the area but never name it', async () => {
    /* The distinction that matters: results about trigonometry that never
       mention this supposed concept are a real answer, and the answer is no. */
    const out = await checkConcept(
      { id: 'x', name: 'Retrograde trigonometric inversion' }, 'mathematics', '10',
      async () => [
        page('Trigonometry - Wikipedia', 'Trigonometry studies angles and side lengths.'),
        page('Inverse trigonometric functions', 'Arcsine, arccosine and arctangent.'),
      ],
    )
    expect(out.verdict).toBe('unrecognised')
  })

  it('says so when the search returned nothing whatsoever', async () => {
    const out = await checkConcept({ id: 'x', name: 'Web servers' }, 'computing', '10', async () => [])
    expect(out.verdict).toBe('could-not-check')
  })
})

describe('one site is not the web', () => {
  it('refuses a concept only one page has ever named', async () => {
    /* A single page can be a mirror, a scrape, or a generated study-notes site.
       The same rule the claim-check applies to a fact -- do two INDEPENDENT
       sources agree -- asked here about whether the name exists at all. Found
       by a mutation that dropped the threshold to one and survived. */
    const out = await checkConcept(
      { id: 'x', name: 'Retrograde trigonometric inversion' }, 'mathematics', '10',
      async () => [page('Retrograde trigonometric inversion explained', 'A guide to retrograde trigonometric inversion.')],
    )
    expect(out.verdict).toBe('unrecognised')
  })

  it('refuses a concept named three times by the SAME site', async () => {
    const out = await checkConcept(
      { id: 'x', name: 'Retrograde trigonometric inversion' }, 'mathematics', '10',
      async () => [
        page('Retrograde trigonometric inversion', 'retrograde trigonometric inversion', 'notesfarm.example'),
        page('More on retrograde trigonometric inversion', 'retrograde trigonometric inversion', 'notesfarm.example'),
        page('Retrograde trigonometric inversion quiz', 'retrograde trigonometric inversion', 'notesfarm.example'),
      ],
    )
    expect(out.verdict, 'one content farm counted as the whole web').toBe('unrecognised')
  })
})

describe('when the check cannot be made', () => {
  it('says so rather than condemning the concept', async () => {
    /* AN OUTAGE IS NOT A VERDICT. Reporting "the web has never heard of this"
       because the network was down would condemn a real concept on no evidence,
       which is the same mistake the canvas store makes impossible for a
       student's work one layer up. */
    const out = await checkConcept(
      { id: 'sine', name: 'The sine function' }, 'mathematics', '10',
      async () => { throw new Error('the search provider answered 503') },
    )
    expect(out.verdict).toBe('could-not-check')
    expect(out.verdict).not.toBe('unrecognised')
  })

  it('says so for a name with nothing searchable in it', async () => {
    const out = await checkConcept({ id: 'x', name: 'The' }, 'mathematics', '10', async () => [])
    expect(out.verdict).toBe('unjudgeable')
  })
})

describe('the concept name is searched alone', () => {
  it('does not pad the query with the subject or the class', async () => {
    /* THIS TEST ASSERTED THE OPPOSITE AN HOUR AGO, and the measurement is why
       it changed. On the live instance, for one real concept:

         "Fundamental Theorem of Arithmetic"                       2 sites name it
         "Fundamental Theorem of Arithmetic mathematics"           0, top hit a
                                                                   Louisiana appeals court
         "Fundamental Theorem of Arithmetic mathematics class 10"  0, top hit a
                                                                   Chinese game forum

       The extra words do not narrow the search, they replace it. Exactly the
       finding that moved the reading level out of the question and into its own
       field in `server/openweb.ts` -- reached twice because I did not carry the
       lesson across the first time. */
    const asked = []
    await checkConcept({ id: 'r', name: 'Reflexive relations' }, 'mathematics', '12', async (q) => { asked.push(q); return [] })
    expect(asked).toEqual(['Reflexive relations'])
  })
})

describe('reporting, never promoting', () => {
  it('counts what was recognised and leaves the model alone', async () => {
    const model = {
      topicId: 't', topicName: 'A topic', curriculum: 'cbse-class-10', subjectId: 'mathematics',
      generatedBy: 'ollama/gemma3:12b',
      concepts: [{ id: 'sine', name: 'The sine function' }, { id: 'x', name: 'Retrograde inversion' }],
    }
    /* A REALISTIC ENGINE: it always returns something. Returning `[]` for the
       coined concept would now be read as "the search did not answer", which is
       correct -- a real engine hands back seven to thirteen results for almost
       any string, so an empty response says more about the engine than about
       the concept, and the safe reading is that a person should look. */
    const [report] = await checkModels([model], async (q) =>
      q.includes('sine')
        ? [page('Sine function', 'the sine function'), page('Sine', 'about the sine function')]
        : [page('Inverse trigonometric functions', 'Arcsine and arccosine.'),
           page('Retrograde motion in astronomy', 'Apparent retrograde motion of planets.')],
    )
    expect(report.recognised).toBe(1)
    expect(report.unrecognised, 'a coined concept whose area IS covered was not reported').toBe(1)
    /* Nothing here changes a status. A person promotes. */
    expect(model.concepts).toHaveLength(2)
    expect(report).not.toHaveProperty('status')
  })
})
