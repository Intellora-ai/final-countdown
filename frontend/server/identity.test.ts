/* WHO THE SERVER BELIEVES A STUDENT IS — AND WHAT IT DOES WITH RUBBISH.
 *
 * WHY THIS FILE DID NOT EXIST, AND WHAT THAT COST.
 *
 *   `identity.ts` was written in Phase 1 to close a real hole: the server read
 *   `studentId` out of the request and believed it, so anyone could read anyone
 *   else's work by changing one word. The fix is right. It shipped with NO test
 *   of its own, and no test anywhere sent a cookie to the handler.
 *
 *   The cost was found by reading, not by the suite: `readCookie` calls
 *   `decodeURIComponent` on whatever arrived, and `Cookie: almanac_student=%`
 *   makes that throw `URIError`. `handle` has no try/catch, so a learner gets
 *   `{"error":"internal error"}` — a 500 caused by a stray percent sign.
 *
 *   Every proof below is written from what the module PROMISES in its own
 *   header, not from reading what it currently does.
 *
 * THE ONE RULE UNDERNEATH ALL OF THEM.
 *   A cookie arrives from the network. Nothing about it is trustworthy — not
 *   its signature, not its encoding, not that it is a cookie at all. Every
 *   input below is one a browser, a proxy, or an attacker can really send, and
 *   the only acceptable answers are "this is her" and "this is not her".
 *   "The server fell over" is never one of them.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { seededRandom } from './memory/generate.test.ts'
import {
  IDENTITY_COOKIE,
  identityCookie,
  newStudentId,
  NoIdentitySecret,
  persistSecretUnlessPresent,
  readCookie,
  resolveIdentitySecret,
  signIdentity,
  verifyIdentity,
} from './identity.ts'

/** A fixture. It protects nothing; several proofs below need a SECOND one. */
const A_SECRET = 'test-secret-not-used-anywhere-real'
const A_DIFFERENT_SECRET = 'a-completely-different-test-secret'

describe('an identity the server issued, and one it did not', () => {
  it('believes a token it signed itself', () => {
    const id = newStudentId()
    expect(verifyIdentity(signIdentity(id, A_SECRET), A_SECRET)).toBe(id)
  })

  it('does not believe the same id signed with a different key', () => {
    /* THE PAIR. A verifier that believed everything would pass the test above
     * and close no hole at all. */
    const id = newStudentId()
    expect(verifyIdentity(signIdentity(id, A_DIFFERENT_SECRET), A_SECRET)).toBeUndefined()
  })

  it('does not believe a token with one character of the signature changed', () => {
    const token = signIdentity(newStudentId(), A_SECRET)
    const flipped = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(verifyIdentity(flipped, A_SECRET)).toBeUndefined()
  })

  it('does not believe a token whose id was edited to name someone else', () => {
    /* This is the attack the whole module exists to stop: take a valid cookie,
     * change whose it says it is, keep the signature. */
    const mine = newStudentId()
    const hers = newStudentId()
    const token = signIdentity(mine, A_SECRET)
    const forged = token.replace(mine, hers)
    expect(forged).not.toBe(token)
    expect(verifyIdentity(forged, A_SECRET)).toBeUndefined()
  })

  it('gives every student a different id', () => {
    /* Two learners on one machine must not become one. 500 draws. */
    const seen = new Set(Array.from({ length: 500 }, () => newStudentId()))
    expect(seen.size).toBe(500)
  })

  it('refuses to sign or verify with no secret at all', () => {
    /* A blank secret would make every signature reproducible by anyone. The
     * module says it has no default on purpose; this is that promise. */
    expect(() => signIdentity('someone', '')).toThrow(NoIdentitySecret)
    expect(() => verifyIdentity('someone.abc', '')).toThrow(NoIdentitySecret)
  })
})

describe('verifying never falls over, whatever arrived', () => {
  it('answers "not her" for every malformed token, and never throws', () => {
    /* A token is a string from the network. Each of these is something a real
     * client, proxy or attacker can send. */
    const RUBBISH = [
      '', '   ', '.', '..', 'nodot', '.leading', 'trailing.',
      'a.b.c.d', '%', '%%', '%zz', '\u0000', '🧪.🔥',
      'a'.repeat(100_000) + '.sig',
      "'; DROP TABLE canvas_memory;--.sig",
      '<script>alert(1)</script>.sig',
    ]
    for (const token of RUBBISH) {
      expect(() => verifyIdentity(token, A_SECRET), JSON.stringify(token)).not.toThrow()
      expect(verifyIdentity(token, A_SECRET), JSON.stringify(token)).toBeUndefined()
    }
  })

  it('answers "not her" for random noise, over many draws', () => {
    const rng = seededRandom(7001)
    const ALPHABET = 'abcdef0123456789.%-_'
    for (let draw = 0; draw < 400; draw += 1) {
      const length = Math.floor(rng() * 80)
      const token = Array.from({ length }, () =>
        ALPHABET[Math.floor(rng() * ALPHABET.length)]).join('')
      expect(() => verifyIdentity(token, A_SECRET), `seed=7001 draw=${draw}`).not.toThrow()
      expect(verifyIdentity(token, A_SECRET), `seed=7001 draw=${draw}`).toBeUndefined()
    }
  })
})

describe('reading a cookie header a browser really sends', () => {
  it('finds the identity among other cookies, wherever it sits', () => {
    const token = signIdentity(newStudentId(), A_SECRET)
    const header = `theme=dark; ${IDENTITY_COOKIE}=${encodeURIComponent(token)}; lang=en`
    expect(readCookie(header, IDENTITY_COOKIE)).toBe(token)
  })

  it('does not match a cookie whose name merely ENDS with ours', () => {
    /* `evil_almanac_student` is not `almanac_student`. A suffix match here would
     * let any site that can set a cookie choose who the learner is. */
    const token = signIdentity(newStudentId(), A_SECRET)
    const header = `evil_${IDENTITY_COOKIE}=${encodeURIComponent(token)}`
    expect(readCookie(header, IDENTITY_COOKIE)).toBeUndefined()
  })

  it('reads a quoted value, because the grammar allows one', () => {
    const token = signIdentity(newStudentId(), A_SECRET)
    expect(readCookie(`${IDENTITY_COOKIE}="${encodeURIComponent(token)}"`, IDENTITY_COOKIE))
      .toBe(token)
  })

  it('survives a broken percent-escape instead of throwing', () => {
    /* THE DEFECT THIS FILE WAS WRITTEN FOR.
     *
     * `decodeURIComponent('%')` throws `URIError`. `handle` has no try/catch,
     * so a single stray percent sign in a cookie header reached a learner as
     * `{"error":"internal error"}` — a 500 from punctuation.
     *
     * A cookie the server cannot read is a cookie that proves nothing, which
     * is exactly the same answer as a cookie that was never sent. It must
     * never be an exception. */
    for (const broken of ['%', '%%', '%zz', '%E0%A4%A', 'ok%', '%f']) {
      const header = `${IDENTITY_COOKIE}=${broken}`
      expect(() => readCookie(header, IDENTITY_COOKIE), broken).not.toThrow()
    }
  })

  it('never throws on any header shape at all', () => {
    const HEADERS = [
      undefined, '', '   ', ';', ';;', '=', 'novalue', `${IDENTITY_COOKIE}`,
      `${IDENTITY_COOKIE}=`, `${IDENTITY_COOKIE}=;`, `=${IDENTITY_COOKIE}`,
      'a'.repeat(100_000), '🧪=🔥', `${IDENTITY_COOKIE}="unclosed`,
      `${IDENTITY_COOKIE}=%; other=%`,
    ]
    for (const header of HEADERS) {
      expect(() => readCookie(header, IDENTITY_COOKIE), JSON.stringify(header)).not.toThrow()
    }
  })

  it('round-trips any id the server can mint, through a real cookie header', () => {
    /* The whole chain: mint, sign, plant, read back, verify. 200 draws. */
    for (let draw = 0; draw < 200; draw += 1) {
      const id = newStudentId()
      const planted = identityCookie(signIdentity(id, A_SECRET))
      const header = planted.split(';')[0] as string
      const readBack = readCookie(header, IDENTITY_COOKIE)
      expect(readBack, `draw=${draw}`).toBeDefined()
      expect(verifyIdentity(readBack as string, A_SECRET), `draw=${draw}`).toBe(id)
    }
  })
})

describe('the cookie the server plants', () => {
  it('cannot be read by page scripts, or sent from another site', () => {
    /* Both flags are load-bearing and the module says why: HttpOnly stops one
     * injected script harvesting a classroom's identities; SameSite stops a
     * link in a chat window acting as the student who clicks it. */
    const planted = identityCookie(signIdentity(newStudentId(), A_SECRET))
    expect(planted).toContain('HttpOnly')
    expect(planted).toContain('SameSite=Lax')
    expect(planted).toContain('Path=/')
    expect(planted).toMatch(/Max-Age=\d+/)
  })

  it('survives a token containing characters a cookie may not carry raw', () => {
    /* The value is encoded, so a separator inside it cannot end the cookie
     * early and smuggle in flags of its own. */
    const planted = identityCookie('a b;c,d=e')
    const value = planted.slice(planted.indexOf('=') + 1, planted.indexOf(';'))
    expect(value).not.toContain(' ')
    expect(decodeURIComponent(value)).toBe('a b;c,d=e')
  })

  it('is Secure only when the deployment says it terminates TLS', () => {
    /* Both directions, because both are load-bearing: `Secure` on a plain-HTTP
     * development server means every request arrives with no cookie and mints
     * a new student; no `Secure` behind TLS means a bearer cookie the browser
     * will also send in the clear to the same host. */
    const token = signIdentity(newStudentId(), A_SECRET)
    expect(identityCookie(token)).not.toMatch(/;\s*Secure\b/)
    expect(identityCookie(token, { secure: false })).not.toMatch(/;\s*Secure\b/)
    expect(identityCookie(token, { secure: true })).toMatch(/;\s*Secure\b/)
    /* The flag is appended, never spliced into the value. */
    expect(identityCookie(token, { secure: true })).toContain(`${IDENTITY_COOKIE}=${encodeURIComponent(token)}; `)
  })
})

describe('the secret file, when two servers boot at once', () => {
  /* The race, made deterministic: process A found no file and generated a
   * secret; before it could write, process B did the same and won. What A must
   * do is USE B's secret, not overwrite it -- otherwise two servers sign with
   * two keys and a student is "not her" on every other request. */
  it('keeps the secret another process wrote first, instead of overwriting it', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'identity-')), 'secret')
    const theirs = 'b'.repeat(64)
    writeFileSync(path, `${theirs}\n`, { encoding: 'utf8' })

    const mine = 'a'.repeat(64)
    expect(persistSecretUnlessPresent(path, mine)).toBe(theirs)
    expect(readFileSync(path, 'utf8').trim(), 'the winner’s secret was overwritten').toBe(theirs)
  })

  it('writes its own secret when it really is first', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'identity-')), 'secret')
    const mine = 'a'.repeat(64)
    expect(persistSecretUnlessPresent(path, mine)).toBe(mine)
    expect(readFileSync(path, 'utf8').trim()).toBe(mine)
  })

  it('replaces an empty file, which is a half-written secret and not a secret', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'identity-')), 'secret')
    writeFileSync(path, '', { encoding: 'utf8' })
    const mine = 'a'.repeat(64)
    expect(persistSecretUnlessPresent(path, mine)).toBe(mine)
    expect(readFileSync(path, 'utf8').trim()).toBe(mine)
  })

  it('two resolutions of the same absent path agree, and the file says why', () => {
    /* The whole function, end to end: whoever resolves second reads the first
     * one's secret back, and reports that it did not generate. */
    const path = join(mkdtempSync(join(tmpdir(), 'identity-')), 'nested', 'secret')
    const first = resolveIdentitySecret(path)
    const second = resolveIdentitySecret(path)
    expect(first.generated).toBe(true)
    expect(second.generated).toBe(false)
    expect(second.secret).toBe(first.secret)
    expect(readFileSync(path, 'utf8').trim()).toBe(first.secret)
  })
})
