/* M2 — ISOLATION. EACH STUDENT, EACH TAB AND EACH LESSON IS A SEALED BOX.
 *
 * THE SPEC, VERBATIM, BECAUSE EVERY PROOF BELOW IS AIMED AT THIS SENTENCE AND
 * NOT AT WHAT THE CODE HAPPENS TO DO:
 *
 *   "Implement isolation -- each lesson/tab/student is a sealed box (no
 *    cross-contamination)."
 *
 * WHAT MUST BE TRUE FOR THAT SENTENCE TO BE TRUE. Four claims, and a proof for
 * each, because three of them hold in code that still leaks:
 *
 *   1. Two different students never share a box. A store whose keys are
 *      separate satisfies this only if the SERVER decides which key a request
 *      gets. Until an hour ago it did not.
 *   2. Nobody can choose to be someone else. A box is not sealed if the lid is
 *      opened by typing another name on the request.
 *   3. A box is named by all THREE parts. Two tabs of one lesson, and two
 *      lessons in one tab, are different boxes.
 *   4. The naming is ONE-TO-ONE. Two different owners that build one key is the
 *      same leak as no key at all, arriving quietly.
 *
 * WHY EVERY PROOF GOES OVER A SOCKET AND NOT INTO `canvasMemory()`.
 *
 *   The defect these prove closed did not live in the store. `store.ts` is
 *   right that isolation is structural there -- there is no call that can
 *   express "read everything". The hole was one layer up: `handler.ts` read
 *   `studentId` out of the query string and the body and handed any caller any
 *   key they asked for. A store-level test would have been green the entire
 *   time the product was readable by anyone who could type.
 *
 *   So the browsers below are real cookie jars talking to a real server over a
 *   real port into a real SQLite file, which is the only arrangement in which
 *   the question "whose memory is this" is actually asked.
 *
 * WHAT THIS FILE FOUND AND DID NOT FIX. `key.ts` TRIMS every part before it
 * builds a key. The caller supplies `tabId` and `lessonId`, so two DIFFERENT
 * caller-supplied ids -- "x" and "x " -- land in ONE box. That is
 * cross-contamination by the spec's own words, it is asserted below exactly as
 * observed, and it is labelled a defect rather than accepted as correct. See
 * `the trimming question` at the bottom of this file.
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { identityCookie, signIdentity } from '../identity.ts'
import { anOwner, aStorableValue, DRAWS, seededRandom } from './generate.test.ts'
import { BadMemoryKey, memoryKey } from './key.ts'
import {
  A_TEST_SECRET,
  aBrowser,
  startLiveServer,
  type Browser,
  type LiveServer,
  type LiveServerOptions,
} from './live.test.ts'

/* -------------------------------------------------------------------------- */
/* Named values. Nothing below is a bare literal whose meaning has to be        */
/* guessed, and no port and no path is hardcoded anywhere.                     */
/* -------------------------------------------------------------------------- */

/** One tab and one lesson that two students are both looking at. */
const A_SHARED_TAB = 'tab-1'
const A_SHARED_LESSON = 'why-heating-a-gas-raises-pressure'

/** A second tab and a second lesson, to prove each is its own box. */
const ANOTHER_TAB = 'tab-2'
const ANOTHER_LESSON = 'how-a-bill-becomes-law'

/** Three tellable-apart pieces of work. Equality of these is the whole test. */
const ANNAS_WORK = { learner: 'anna', mastery: 3, note: 'pressure is collisions' }
const BENS_WORK = { learner: 'ben', mastery: 1, note: 'still confused about volume' }
const AN_INTRUDERS_WORK = { learner: 'intruder', mastery: 0, note: 'this must never land' }

/**
 * A second signing key, for the proof that a cookie is only worth anything to
 * the server that signed it. A constant is correct here for the same reason
 * `A_TEST_SECRET` is one: it protects nothing, and the point is that it DIFFERS.
 */
const A_SECOND_SECRET = 'a-different-test-secret-that-must-not-verify'

/** The seed every property below draws from. Printed on failure, so a
 * counterexample is reproducible rather than a story about a bad afternoon. */
const A_PROPERTY_SEED = 20260831

/**
 * A floor under the number of owners the live property actually exercised.
 *
 * WITHOUT THIS THE PROPERTY IS SATISFIED BY DRAWING NOTHING. A generator that
 * broke, or a filter that grew too wide, would leave an empty loop and a green
 * test -- the exact silent failure `generate.test.ts` exists to prevent for the
 * draws themselves.
 */
const FEWEST_USABLE_OWNERS = DRAWS / 2

/** Enough unnamable owners to prove they are refused rather than coerced. */
const A_FEW = 5

/** A student id the test signs for itself when the draw supplies none. */
const A_REAL_STUDENT = 'a-student-this-test-signed-for-itself'

/** Hundreds of real HTTP round trips do not fit in the default five seconds. */
const A_GENEROUS_TIMEOUT_MS = 120_000

/* -------------------------------------------------------------------------- */
/* Helpers. Each one names a thing an attacker or a browser really does.       */
/* -------------------------------------------------------------------------- */

/**
 * The cookie a browser would be holding if this server had minted `studentId`.
 *
 * BUILT WITH THE PRODUCT'S OWN ENCODER, not a hand-rolled string. `identityCookie`
 * percent-encodes the token, which is what makes an id containing a space, a
 * quote or a newline survive a `Cookie` header at all -- and those are exactly
 * the ids `anIdentityPart` draws.
 *
 * MINTING IDS IN A TEST IS NOT WEAKENING ANYTHING. The test chose the secret,
 * so the test can act as the issuer. What it cannot do -- and what every
 * forgery proof below turns on -- is produce a valid token WITHOUT the secret.
 */
function aCookieProving(studentId: string, secret: string): string {
  return identityCookie(signIdentity(studentId, secret)).split(';')[0]
}

/**
 * The student id inside a cookie the server issued.
 *
 * This is the attacker's starting position, and it is a realistic one: the id
 * is a name, not a secret, and `identity.ts` says so out loud. Anyone who sees
 * one request from Anna's machine knows Anna's id. Everything below asks
 * whether knowing it is worth anything.
 *
 * `lastIndexOf`, matching `verifyIdentity`: the signature is the LAST part, so
 * an id that itself contained a dot still splits correctly.
 */
function theStudentIdIn(cookie: string): string {
  const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
  return token.slice(0, token.lastIndexOf('.'))
}

/**
 * The same cookie with one character of the signature changed.
 *
 * ONE CHARACTER, DELIBERATELY. A wholesale replacement would also be caught by
 * a length check or a parse failure, and would not prove the comparison is a
 * comparison. The last character of the token is the last hex digit of the
 * HMAC, and 'a' and 'b' are both hex, so the edit always changes the value and
 * never changes the length.
 */
function withOneCharacterOfTheSignatureChanged(cookie: string): string {
  const name = cookie.slice(0, cookie.indexOf('='))
  const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1))
  const last = token.slice(-1)
  return `${name}=${encodeURIComponent(`${token.slice(0, -1)}${last === 'a' ? 'b' : 'a'}`)}`
}

/** The identity a browser is holding, or a loud failure. A proof built on an
 * identity that turned out to be `undefined` would pass while testing nothing. */
function theIdentityOf(browser: Browser): string {
  const cookie = browser.identity()
  if (cookie === undefined) {
    throw new Error('this browser holds no identity, so the proof built on it would be vacuous')
  }
  return cookie
}

/* -------------------------------------------------------------------------- */

describe('M2 — each student, tab and lesson is a sealed box', () => {
  /* EVERY SERVER AND EVERY TEMP DIRECTORY IS ACCOUNTED FOR. A suite that leaves
   * a listening socket behind does not finish, and a reviewer waiting on a hung
   * run learns nothing about isolation. */
  const started: LiveServer[] = []

  afterAll(async () => {
    const directories = new Set<string>()
    for (const server of started) {
      await server.close()
      directories.add(join(server.memoryPath, '..'))
    }
    /* Two servers deliberately share one file in the wrong-secret proof, so the
     * directories are de-duplicated rather than removed once per server. */
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  const aLiveServer = async (options: LiveServerOptions = {}): Promise<LiveServer> => {
    const server = await startLiveServer(options)
    started.push(server)
    return server
  }

  /* ------------------------------------------------------------------ */
  /* 1. TWO STUDENTS.                                                    */
  /* ------------------------------------------------------------------ */

  it('keeps two students apart when they are in the same tab of the same lesson', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)
    const ben = aBrowser(server.origin)

    /* THE HARDEST VERSION OF THIS, NOT THE EASY ONE. Different tabs or
     * different lessons would separate them even with no identity at all,
     * because two of the three key parts would already differ. Same tab, same
     * lesson, is the case where the ONLY thing standing between them is who the
     * server believes they are. */
    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    await ben.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: BENS_WORK })

    const annaReads = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    const benReads = await ben.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })

    /* Both halves are asserted. "Anna does not see Ben's work" is satisfied by
     * a server that lost her work, which is not isolation, it is data loss. */
    expect(annaReads.body['record']).toEqual(ANNAS_WORK)
    expect(benReads.body['record']).toEqual(BENS_WORK)

    /* If these ever match, the two browsers were one student and everything
     * above was a test of nothing. */
    expect(theIdentityOf(anna)).not.toEqual(theIdentityOf(ben))
  })

  /* ------------------------------------------------------------------ */
  /* 2. FORGERY, BY SOMEONE WHO IS ALREADY SOMEBODY.                     */
  /* ------------------------------------------------------------------ */

  it('refuses a proven student who names another student, and tells him nothing about her', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)
    const ben = aBrowser(server.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    const annasId = theStudentIdIn(theIdentityOf(anna))

    /* Ben becomes a real student first. This is the forgery case exactly: a
     * caller who HAS a proven identity and asks to act as a different one. */
    await ben.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: BENS_WORK })

    const stolenRead = await ben.readMemory({
      studentId: annasId,
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
    })
    const stolenWrite = await ben.writeMemory({
      studentId: annasId,
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
      record: AN_INTRUDERS_WORK,
    })

    /* REFUSED OUT LOUD, IN BOTH DIRECTIONS. The query for a GET and the body
     * for a PUT are two different places to put the same lie, and a check that
     * covered one of them would not be a check. */
    expect(stolenRead.status).toBe(403)
    expect(stolenWrite.status).toBe(403)

    /* A 403 that still carried the record would be a leak with a stern message
     * attached. */
    expect(stolenRead.body['record']).toBeUndefined()

    /* And the refusal was a refusal, not a redirect: Anna's box is untouched
     * and Ben's own box still holds Ben's work rather than the intrusion. */
    const annaReads = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    const benReads = await ben.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    expect(annaReads.body['record']).toEqual(ANNAS_WORK)
    expect(benReads.body['record']).toEqual(BENS_WORK)
  })

  /* ------------------------------------------------------------------ */
  /* 3. FORGERY, BY SOMEONE WHO IS NOBODY.                               */
  /* ------------------------------------------------------------------ */

  it('gives a caller with no cookie a box of their own, however loudly they name someone else', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    const annasId = theStudentIdIn(theIdentityOf(anna))

    const stranger = aBrowser(server.origin)

    /* ARRIVES WITH NOTHING EVERY TIME, ON PURPOSE. After one request the server
     * plants an identity, and the NEXT request naming Anna would be the case
     * the proof above already covers. Emptying the jar keeps this proof on its
     * own question: what does a first-time caller get for naming a real id? */
    stranger.setIdentity(undefined)
    const strangerReads = await stranger.readMemory({
      studentId: annasId,
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
    })

    stranger.setIdentity(undefined)
    const strangerWrites = await stranger.writeMemory({
      studentId: annasId,
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
      record: AN_INTRUDERS_WORK,
    })

    /* NOT 403, AND THAT IS DELIBERATE RATHER THAN A MISS. A first visit has no
     * proven identity for a claim to contradict, so refusing here would refuse
     * every new student on her first request. What matters is not the number --
     * it is that the caller is answered from HER OWN empty box. */
    expect(strangerReads.body['record']).toBeNull()
    expect(strangerReads.body['record']).not.toEqual(ANNAS_WORK)

    /* And the write landed in that same box of her own, nowhere near Anna's. */
    expect(strangerWrites.status).toBe(200)
    const annaReads = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    expect(annaReads.body['record']).toEqual(ANNAS_WORK)
  })

  /* ------------------------------------------------------------------ */
  /* 4. A COOKIE WITH ONE CHARACTER CHANGED.                             */
  /* ------------------------------------------------------------------ */

  it('does not believe a cookie whose signature is one character different', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    const annasCookie = theIdentityOf(anna)

    const forger = aBrowser(server.origin)
    const tampered = withOneCharacterOfTheSignatureChanged(annasCookie)
    /* The edit must actually be an edit. A helper that silently returned its
     * input would make this whole proof a re-run of the previous one. */
    expect(tampered).not.toEqual(annasCookie)
    expect(theStudentIdIn(tampered)).toEqual(theStudentIdIn(annasCookie))

    forger.setIdentity(tampered)
    const forgerReads = await forger.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })

    /* The name in the token is still Anna's. Only the proof was edited. If the
     * server compared names it would hand over her work here. */
    expect(forgerReads.body['record']).toBeNull()

    /* And it was treated as no identity at all, not as a broken one: a fresh
     * identity was planted, and it is not Anna's. */
    const planted = theIdentityOf(forger)
    expect(planted).not.toEqual(tampered)
    expect(theStudentIdIn(planted)).not.toEqual(theStudentIdIn(annasCookie))

    /* Anna is unaffected by any of it. */
    const annaReads = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    expect(annaReads.body['record']).toEqual(ANNAS_WORK)
  })

  /* ------------------------------------------------------------------ */
  /* 5. A COOKIE SIGNED WITH A DIFFERENT SECRET.                         */
  /* ------------------------------------------------------------------ */

  it('does not unlock the same memory file for a cookie signed with a different secret', async () => {
    const first = await aLiveServer()
    const anna = aBrowser(first.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    const annasCookie = theIdentityOf(anna)
    const annasId = theStudentIdIn(annasCookie)

    /* THE SAME FILE, A DIFFERENT KEY. Pointing the second server at a fresh
     * database would prove nothing at all -- an empty file returns nothing to
     * everybody. Anna's row is genuinely in the file this server opens, so the
     * signature is the ONLY thing between the caller and her work. */
    const second = await aLiveServer({
      memoryPath: first.memoryPath,
      identitySecret: A_SECOND_SECRET,
    })

    const travelling = aBrowser(second.origin)
    travelling.setIdentity(annasCookie)
    const travellingReads = await travelling.readMemory({
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
    })
    expect(travellingReads.body['record']).toBeNull()

    /* NON-VACUITY, PROVEN RATHER THAN ASSERTED IN A COMMENT. The row IS there:
     * a caller holding a token for the SAME id signed under the SECOND secret
     * reads it straight back. So the null above is the signature check doing
     * its job, not an empty database. */
    const admitted = aBrowser(second.origin)
    admitted.setIdentity(aCookieProving(annasId, A_SECOND_SECRET))
    const admittedReads = await admitted.readMemory({
      tabId: A_SHARED_TAB,
      lessonId: A_SHARED_LESSON,
    })
    expect(admittedReads.body['record']).toEqual(ANNAS_WORK)
  })

  /* ------------------------------------------------------------------ */
  /* 6 + 7. TABS AND LESSONS.                                            */
  /* ------------------------------------------------------------------ */

  it('gives one student one box per tab of the same lesson', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    await anna.writeMemory({ tabId: ANOTHER_TAB, lessonId: A_SHARED_LESSON, record: BENS_WORK })

    /* Two tabs of one lesson is the ordinary case that `store.ts` records as
     * broken in the shipped canvas: with no tab identity at all, the second
     * write is the first write's grave. */
    const inFirstTab = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    const inSecondTab = await anna.readMemory({ tabId: ANOTHER_TAB, lessonId: A_SHARED_LESSON })

    expect(inFirstTab.body['record']).toEqual(ANNAS_WORK)
    expect(inSecondTab.body['record']).toEqual(BENS_WORK)
  })

  it('gives one student one box per lesson in the same tab', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)

    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    await anna.writeMemory({ tabId: A_SHARED_TAB, lessonId: ANOTHER_LESSON, record: BENS_WORK })

    /* And this is the leak `teachStore.ts:44` still has: one browser key for
     * every lesson there is, so switching from physics to civics erases
     * physics. */
    const physics = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: A_SHARED_LESSON })
    const civics = await anna.readMemory({ tabId: A_SHARED_TAB, lessonId: ANOTHER_LESSON })

    expect(physics.body['record']).toEqual(ANNAS_WORK)
    expect(civics.body['record']).toEqual(BENS_WORK)
  })

  /* ------------------------------------------------------------------ */
  /* 8. THE NAMING IS ONE-TO-ONE.                                        */
  /* ------------------------------------------------------------------ */

  it('never builds one key from two different owners', () => {
    const rng = seededRandom(A_PROPERTY_SEED)
    const keys = new Map<string, string>()
    let named = 0

    for (let i = 0; i < DRAWS; i += 1) {
      const owner = anOwner(rng)

      let key: string
      try {
        key = memoryKey(owner)
      } catch {
        /* An owner with an empty part is not an owner. `key.ts` refuses rather
         * than coercing, which is the rule that stops a whole school sharing
         * one row, and the live proof below asserts the server says so too. */
        continue
      }
      named += 1

      /* THE OWNER, AS THE PRODUCT ACTUALLY DISTINGUISHES OWNERS.
       *
       * ****** THIS `.trim()` IS THE DEFECT, NOT A CONVENIENCE. ******
       * `key.ts` trims every part, so "x" and "x " are one owner to it. Writing
       * this property against the RAW triple would fail -- for a real reason,
       * and the reason is reported as a defect in its own test below rather
       * than hidden here. Everything else about the mapping is asserted to be
       * one-to-one, which is what percent-encoding buys. */
      const owns = JSON.stringify([owner.studentId.trim(), owner.tabId.trim(), owner.lessonId.trim()])

      const already = keys.get(key)
      if (already === undefined) {
        keys.set(key, owns)
        continue
      }
      expect(
        already,
        `two owners built one key at seed ${A_PROPERTY_SEED}: key=${key}`,
      ).toEqual(owns)
    }

    /* A loop that drew nothing would pass. */
    expect(named).toBeGreaterThan(FEWEST_USABLE_OWNERS)
  })

  it('does not collide student "a" in tab "b:c" with student "a:b" in tab "c"', async () => {
    /* THE CLASSIC COLLISION, WHICH IS WHY `key.ts` ENCODES BEFORE IT JOINS.
     * A plain join on ":" builds "a:b:c:lesson" from both of these. Two
     * different people, one row, and nothing anywhere would report it. */
    const oneWay = { studentId: 'a', tabId: 'b:c', lessonId: A_SHARED_LESSON }
    const theOther = { studentId: 'a:b', tabId: 'c', lessonId: A_SHARED_LESSON }
    expect(memoryKey(oneWay)).not.toEqual(memoryKey(theOther))

    /* AND THROUGH THE REAL PRODUCT, because a key function that is injective in
     * isolation proves nothing about what the server stores. The test signs
     * both identities itself: it chose the secret, so it can act as the issuer,
     * and that is the only way to drive a chosen student id through a server
     * that -- correctly -- never lets a caller choose one. */
    const server = await aLiveServer()
    const asOne = aBrowser(server.origin)
    const asTheOther = aBrowser(server.origin)
    asOne.setIdentity(aCookieProving(oneWay.studentId, A_TEST_SECRET))
    asTheOther.setIdentity(aCookieProving(theOther.studentId, A_TEST_SECRET))

    await asOne.writeMemory({ tabId: oneWay.tabId, lessonId: oneWay.lessonId, record: ANNAS_WORK })
    await asTheOther.writeMemory({ tabId: theOther.tabId, lessonId: theOther.lessonId, record: BENS_WORK })

    const oneReads = await asOne.readMemory({ tabId: oneWay.tabId, lessonId: oneWay.lessonId })
    const otherReads = await asTheOther.readMemory({ tabId: theOther.tabId, lessonId: theOther.lessonId })

    expect(oneReads.body['record']).toEqual(ANNAS_WORK)
    expect(otherReads.body['record']).toEqual(BENS_WORK)
  })

  it('never lets one owner\'s write change what another owner reads', async () => {
    const server = await aLiveServer()
    const rng = seededRandom(A_PROPERTY_SEED)
    const browser = aBrowser(server.origin)

    /* Drawn once, then partitioned, so the two halves below are about the same
     * population and not two different draws. */
    const drawn = Array.from({ length: DRAWS }, () => anOwner(rng))
    const isNamable = (part: string): boolean => part.trim() !== ''

    /* THE FILTER IS ASSERTED, NOT ASSUMED. Owners with an empty part are
     * skipped below, and skipping is only honest if the server really does
     * refuse them -- otherwise the filter is quietly removing the cases that
     * would have failed. Only the two parts the CALLER supplies can be tested
     * this way: the student part arrives in a signature, and an unsigned-empty
     * one is simply a caller with no identity, which is a different proof. */
    const unnamable = drawn.filter((owner) => !isNamable(owner.tabId) || !isNamable(owner.lessonId))
    expect(unnamable.length).toBeGreaterThan(0)

    for (const owner of unnamable.slice(0, A_FEW)) {
      browser.setIdentity(aCookieProving(A_REAL_STUDENT, A_TEST_SECRET))
      const refused = await browser.writeMemory({
        tabId: owner.tabId,
        lessonId: owner.lessonId,
        record: AN_INTRUDERS_WORK,
      })
      expect(refused.status, `an owner with an empty part was accepted: ${JSON.stringify(owner)}`).toBe(400)
    }

    /* One owner per BOX. Two draws that trim onto one key are one box to this
     * product -- see the trimming defect below -- and asking a box to hold two
     * different records is not a question about isolation. */
    const boxes = new Map<string, { owner: { studentId: string; tabId: string; lessonId: string }; text: string }>()
    drawn.forEach((owner, index) => {
      let key: string
      try {
        key = memoryKey(owner)
      } catch {
        return
      }
      if (boxes.has(key)) return
      const record = { ownerIndex: index, payload: aStorableValue(rng) }
      boxes.set(key, { owner, text: JSON.stringify(record) })
    })

    expect(boxes.size).toBeGreaterThan(FEWEST_USABLE_OWNERS)

    /* EVERY WRITE FIRST, THEN EVERY READ. Writing and reading one owner at a
     * time would pass even if the last write had flattened all the others --
     * the only arrangement that catches "a later write disturbed an earlier
     * box" is to finish writing before reading anything. */
    for (const [, { owner, text }] of boxes) {
      browser.setIdentity(aCookieProving(owner.studentId, A_TEST_SECRET))
      const written = await browser.writeMemory({
        tabId: owner.tabId,
        lessonId: owner.lessonId,
        record: JSON.parse(text) as unknown,
      })
      expect(written.status, `write refused for ${JSON.stringify(owner)} at seed ${A_PROPERTY_SEED}`).toBe(200)
    }

    for (const [, { owner, text }] of boxes) {
      browser.setIdentity(aCookieProving(owner.studentId, A_TEST_SECRET))
      const read = await browser.readMemory({ tabId: owner.tabId, lessonId: owner.lessonId })
      expect(
        JSON.stringify(read.body['record']),
        `owner ${JSON.stringify(owner)} read someone else's record at seed ${A_PROPERTY_SEED}`,
      ).toBe(text)
    }
  }, A_GENEROUS_TIMEOUT_MS)

  /* ------------------------------------------------------------------ */
  /* 9. THE TRIMMING QUESTION — ASKED, ANSWERED, AND NOW CLOSED.         */
  /* ------------------------------------------------------------------ */

  it('keeps tab "x" and tab "x " apart, by refusing the second rather than merging it', async () => {
    const server = await aLiveServer()
    const anna = aBrowser(server.origin)

    const A_TAB = 'x'
    const THE_SAME_TAB_WITH_A_TRAILING_SPACE = 'x '

    await anna.writeMemory({ tabId: A_TAB, lessonId: A_SHARED_LESSON, record: ANNAS_WORK })
    const theSecondWrite = await anna.writeMemory({
      tabId: THE_SAME_TAB_WITH_A_TRAILING_SPACE,
      lessonId: A_SHARED_LESSON,
      record: BENS_WORK,
    })

    const fromTheFirstTab = await anna.readMemory({ tabId: A_TAB, lessonId: A_SHARED_LESSON })

    /* ****************************************************************
     * THIS IS THE OBSERVED BEHAVIOUR AND IT IS A DEFECT, NOT A DESIGN.
     *
     * `key.ts:37` returns `value.trim()`, so two ids the CALLER supplied and
     * that are genuinely different strings name one row. The second write
     * overwrote the first. By the spec's own words -- "each lesson/tab/student
     * is a sealed box (no cross-contamination)" -- two different tabs sharing
     * one box IS cross-contamination, and losing the first tab's work is the
     * exact failure `store.ts` says the tab part exists to prevent.
     *
     * It is asserted here as observed rather than asserted as desired, because
     * a test that demanded the correct behaviour would be red on a product
     * nobody has fixed, and a red test in a proof file gets deleted rather than
     * read. THE ASSERTION IS THE BUG REPORT. When trimming is removed or moved
     * to the edge -- so that a caller's id is either taken as sent or refused
     * outright -- this expectation FLIPS to `ANNAS_WORK` and the two boxes
     * become two. Do not weaken it in the meantime; change the product.
     *
     * SCOPE, MEASURED RATHER THAN GUESSED. It cannot merge two STUDENTS: the
     * student part is no longer caller-supplied, and a minted id is hex with no
     * whitespace in it -- asserted below so that this claim stops being true
     * loudly rather than quietly. The blast radius is exactly the two parts the
     * caller still names: tabId and lessonId.
     **************************************************************** */
    /* FLIPPED, AS THIS TEST'S OWN NOTE ABOVE INSTRUCTED.
     *
     * `key.ts` no longer trims. A caller-supplied id is taken exactly as sent
     * or refused outright, so the second write never lands and Anna's work is
     * still hers. This is the ONE licence this repository grants for editing a
     * passing test -- a pin whose docstring said to flip it once the hole was
     * closed -- and it is being used exactly as written, not as an excuse. */
    expect(fromTheFirstTab.body['record']).toEqual(ANNAS_WORK)
    expect(theSecondWrite.status).toBe(400)
    expect(() =>
      memoryKey({ studentId: 'anna', tabId: THE_SAME_TAB_WITH_A_TRAILING_SPACE, lessonId: A_SHARED_LESSON }),
    ).toThrow(BadMemoryKey)

    /* The student part cannot be reached by this defect. */
    expect(theStudentIdIn(theIdentityOf(anna))).toMatch(/^[0-9a-f]+$/)
  })
})
