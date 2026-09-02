#!/usr/bin/env node
/**
 * DOES THIS CONCEPT ACTUALLY EXIST?
 *
 * THE OWNER'S ANSWER when asked what has to be true before a generated scope is
 * shown to a student: "web search, verify tht concepts which u make inside each
 * topic is 1. accurate + existing 2. as per syllabus cirriculum latest".
 *
 * `verify.mjs` proves a concept was QUOTED from the syllabus page. That is a
 * strong check and it is not this one. A model can quote a page correctly and
 * still assemble a concept NAME that no teacher, textbook or examiner would
 * recognise -- the quotation is evidence the words were read, not evidence the
 * idea is a real one.
 *
 * So each concept name is searched, alongside its subject, and judged on
 * whether the open web recognises it. A name nothing on the web has heard of,
 * in a subject as heavily written-about as school mathematics or biology, is
 * almost certainly the model's own coinage.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *
 *   It does not decide whether a concept is CORRECT. Nothing here can, and
 *   pretending otherwise would be worse than the gap: a green tick that means
 *   "some pages mention this" read as "this is true" is exactly the kind of
 *   false assurance the rest of this layer exists to avoid.
 *
 *   It does not promote anything. It reports; a person promotes. `status:
 *   verified` is a claim that somebody read it.
 *
 * The searcher is injected so the judgement can be tested without a network,
 * for the same reason the model is injected in `build.mjs`.
 */

/**
 * How many INDEPENDENT DOMAINS must name a concept before the web is taken to
 * recognise it.
 *
 * TWO, AND THEY MUST BE DIFFERENT SITES. One page naming something is not
 * evidence that it is a real idea: a single page can be a mirror, a scrape, a
 * generated study-notes site, or the same content syndicated twice. This is the
 * rule `websearch/quality.ts` already applies to a factual claim -- do two
 * independent sources agree -- asked here about whether a name exists at all.
 *
 * Counting RESULTS rather than domains was tried first, and a mutation dropping
 * the number from two to one survived every test, which is how the weakness was
 * found: three results from one content farm would have counted as three.
 */
const RECOGNISED_WHEN_DOMAINS = 2

/**
 * A concept's name, made comparable with a page's words.
 *
 * The same shape `select.ts` uses on a search hit: whole words, three letters
 * up, so a title matching on "the" and "of" proves nothing.
 */
function meaningfulWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SAYS_NOTHING.has(w))
}

const SAYS_NOTHING = new Set([
  'the', 'and', 'for', 'its', 'their', 'with', 'from', 'into', 'that', 'this',
  'introduction', 'concept', 'concepts', 'understanding', 'basic', 'general', 'study',
])

/**
 * Whether a result is about this concept.
 *
 * Every meaningful word of the concept has to be somewhere in the result's
 * title or snippet. A weaker test -- any word -- makes "Historical Use of
 * Biotechnology" match a page about history, and the check stops checking.
 */
function domainOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function resultKnowsIt(result, words) {
  const said = `${result.title ?? ''} ${result.snippet ?? ''} ${result.content ?? ''}`.toLowerCase()
  return words.every((w) => new RegExp(`\\b${w}\\b`).test(said))
}

/**
 * Check one concept.
 *
 * THE CONCEPT NAME IS SEARCHED ALONE, and this reverses a decision made in this
 * file an hour earlier with confident reasoning behind it. The reasoning was
 * that a bare name is ambiguous -- "Reflexive" is a relation in mathematics and
 * a pronoun in English -- so the subject and class should go into the query to
 * disambiguate. MEASURED against the live instance, on one real concept:
 *
 *   "Fundamental Theorem of Arithmetic"                    13 results, 2 sites name it,
 *                                                          top hit is the Wikipedia article
 *   "Fundamental Theorem of Arithmetic mathematics"         7 results, 0 name it,
 *                                                          top hit is a Louisiana appeals court
 *   "Fundamental Theorem of Arithmetic mathematics class 10" 10 results, 0 name it,
 *                                                          top hit is a Chinese game forum
 *
 * The extra words do not narrow the search; they change what is being searched
 * for. This is the same finding that moved the reading level out of the
 * question and into its own field in `server/openweb.ts`, arrived at twice
 * because I did not carry the lesson across.
 *
 * The ambiguity worry is real and is answered differently: a concept whose name
 * is too generic to be found on its own has a naming problem, and that is worth
 * knowing about rather than papering over.
 *
 * `subjectName` and `cls` are still taken, and still reported, so a person
 * reading the report knows what the concept belonged to.
 */
export async function checkConcept(concept, subjectName, cls, search) {
  const words = meaningfulWords(concept.name)
  if (words.length === 0) {
    return { name: concept.name, verdict: 'unjudgeable', why: 'the name has no words worth searching for' }
  }

  let results
  try {
    results = await search(concept.name)
  } catch (error) {
    /* AN OUTAGE IS NOT A VERDICT. Reporting "the web has never heard of this"
       because the network was down would condemn a real concept on no evidence
       at all -- the same mistake the canvas store makes impossible for a
       student's work, one layer up. */
    return { name: concept.name, verdict: 'could-not-check', why: `the search did not answer (${error.message})` }
  }

  const found = results ?? []

  /* A SEARCH THAT DID NOT ANSWER IS NOT EVIDENCE OF ABSENCE.
   *
   * MEASURED on the live instance: "Web Servers" and "POP3" -- both plainly
   * real -- came back with nothing naming them, because the engines were
   * rate-limited and returned unrelated pages. Reporting that as "the web has
   * never heard of this" would condemn a real concept on a network problem,
   * which is the same mistake as reading a failed canvas read as an empty
   * canvas. It is the reason Law D exists one layer up.
   *
   * The tell is that not one result shares even a single word with the concept.
   * Results that are about the right area but do not name this exact thing are
   * a real answer; results about Louisiana appeals courts are not an answer at
   * all. */
  const relevant = found.filter((r) => {
    const said = `${r.title ?? ''} ${r.snippet ?? ''} ${r.content ?? ''}`.toLowerCase()
    return words.some((w) => new RegExp(`\\b${w}\\b`).test(said))
  })
  if (found.length > 0 && relevant.length === 0) {
    return {
      name: concept.name,
      verdict: 'could-not-check',
      why: `the search returned ${found.length} result(s) and not one of them is about this at all, so it did not answer`,
    }
  }
  if (found.length === 0) {
    return { name: concept.name, verdict: 'could-not-check', why: 'the search returned nothing at all' }
  }

  const knowing = found.filter((r) => resultKnowsIt(r, words))
  const domains = new Set(knowing.map((r) => domainOf(r.url)).filter((d) => d !== ''))
  if (domains.size >= RECOGNISED_WHEN_DOMAINS) {
    return {
      name: concept.name,
      verdict: 'recognised',
      why: `${domains.size} independent site(s) name it`,
      where: knowing.slice(0, 2).map((r) => r.url),
    }
  }
  return {
    name: concept.name,
    verdict: 'unrecognised',
    why:
      `only ${domains.size} site(s) name it, from ${found.length} result(s) of which ${relevant.length} were on topic; ` +
      'this may be the model\'s own coinage',
  }
}

/** Check every concept of every model, and report. Promotes nothing. */
export async function checkModels(models, search) {
  const report = []
  for (const model of models) {
    const concepts = []
    for (const concept of model.concepts) {
      concepts.push(await checkConcept(concept, model.subjectId.replace(/-/g, ' '), model.curriculum.replace('cbse-class-', ''), search))
    }
    report.push({
      topicId: model.topicId,
      topicName: model.topicName,
      generatedBy: model.generatedBy,
      concepts,
      recognised: concepts.filter((c) => c.verdict === 'recognised').length,
      unrecognised: concepts.filter((c) => c.verdict === 'unrecognised').length,
    })
  }
  return report
}
