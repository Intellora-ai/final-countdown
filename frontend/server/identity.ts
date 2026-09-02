/* WHO THE SERVER BELIEVES A STUDENT IS.
 *
 * THE DEFECT THIS CLOSES, STATED EXACTLY.
 *
 *   `handler.ts` read `studentId` out of the request body and the query string
 *   and acted on it. The browser is under the reader's control, so that value
 *   was never a fact about who was asking -- it was a sentence the caller typed.
 *   Anyone who knew or guessed another student's id could read that student's
 *   memory and mark their work done, by changing one word.
 *
 *   `memory/store.ts` claims isolation is "a guarantee, not a promise" because
 *   there is no call that can express "read everything". That claim is true of
 *   the STORE and was false of the SERVER: separate drawers are not a locked
 *   cabinet if anyone may write any name on the request.
 *
 * THE FIX, FROM THE ONE FACT THAT MATTERS.
 *
 *   The browser can change anything it sends. The server holds a secret the
 *   browser never sees. So the only values a server may trust are the ones it
 *   can prove it produced itself. That is a signature, and nothing weaker.
 *
 *   The server mints a random id, signs it, and returns it as a cookie. On the
 *   next request it verifies the signature. A forged or edited id fails
 *   verification and is not believed. There is no shared list to look up and
 *   nothing to keep in memory, so this survives a restart and a second replica
 *   with no coordination.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT -- SAID PLAINLY RATHER THAN IMPLIED.
 *
 *   It is IDENTITY: two browsers are reliably two different students, and
 *   neither can pretend to be the other. That is exactly what "each student is
 *   a sealed box" requires.
 *
 *   It is NOT AUTHENTICATION: whoever holds the cookie is that student. There
 *   is no password, so a copied cookie is a copied identity. Making that
 *   stronger means a login, which is a different piece of work and is not
 *   pretended to here.
 *
 * NO DEFAULT SECRET, ON PURPOSE.
 *
 *   A fallback secret would be in this file, and a signature anyone can
 *   reproduce is not a signature. A server with no secret configured refuses to
 *   start rather than starting with a lock that does not lock.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** The cookie the signed identity travels in. */
export const IDENTITY_COOKIE = 'almanac_student'

/**
 * The separator between the id and its signature.
 *
 * A dot, and the id is hex, so the id can never contain one. That makes the
 * split unambiguous without escaping -- the same reasoning `memory/key.ts`
 * applies to its own separator.
 */
const PART_SEPARATOR = '.'

/** Why an identity could not be established, in words an operator can act on. */
export class NoIdentitySecret extends Error {}

/**
 * A fresh student id.
 *
 * 16 random bytes. Not a counter and not derived from anything about the
 * request: two students on one machine, one behind a shared address, or one
 * arriving twice must never collide, and randomness is the only property that
 * gives that without a coordinating server.
 */
export function newStudentId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * The secret this server signs with, found or made.
 *
 * WHY THIS EXISTS RATHER THAN "REQUIRE THE ENVIRONMENT VARIABLE".
 *
 *   Requiring it was the first version and it was WRONG, measured rather than
 *   argued: the real integration suite starts the built server with no
 *   configuration at all, and `features/environment.py` says why in the
 *   assertion it fails on -- "It is supposed to start even when the model it was
 *   given cannot be reached." Someone clones the repository and runs it. A
 *   server that refuses to boot until a variable is set has not been made
 *   secure, it has been made unusable, and the person who hits it will export
 *   the first string they think of.
 *
 * WHY NOT A DEFAULT IN THIS FILE.
 *   A signature every reader of this repository can reproduce is not a
 *   signature. That restores the exact hole this module closes while looking
 *   closed, which is worse than never having tried.
 *
 * WHY NOT A FRESH RANDOM SECRET EACH BOOT.
 *   That is unguessable, and it silently destroys every identity on restart:
 *   each student becomes a new person with an empty memory, and nothing reports
 *   it. Persistence is the whole point of the phase this belongs to.
 *
 * SO: GENERATED ONCE, WRITTEN DOWN, REUSED.
 *   32 random bytes, stored beside the data it protects, readable only by the
 *   user that owns the process. Unguessable, survives restart, needs no setup.
 *
 * WHAT IT STILL CANNOT DO, SAID OUT LOUD RATHER THAN DISCOVERED.
 *   Two replicas with two separate disks generate two different files and
 *   disagree about who every student is. That case needs the environment
 *   variable, and `index.ts` says so on startup instead of leaving it to be
 *   found in production.
 */
export function resolveIdentitySecret(path: string): { secret: string; generated: boolean } {
  if (existsSync(path)) {
    const found = readFileSync(path, 'utf8').trim()
    /* An empty or truncated file is treated as absent rather than used. A
     * zero-length secret would throw on every request; a half-written one --
     * which is what a disk filling up mid-write leaves behind -- would verify
     * nothing and log nothing. Replacing it is the only safe reading. */
    if (found !== '') return { secret: found, generated: false }
  }

  const made = randomBytes(32).toString('hex')
  mkdirSync(dirname(path), { recursive: true })
  const kept = persistSecretUnlessPresent(path, made)
  return { secret: kept, generated: kept === made }
}

/**
 * Write `made` as the secret, unless another process got there first.
 *
 * `wx` -- create, and FAIL if the file exists -- is the whole point. Two
 * replicas booting together both find no file, both generate a secret, and
 * with a plain write the second one silently overwrites the first: two
 * processes, two secrets, and every cookie minted by one is "not her" to the
 * other, so a student loses her identity whenever a request lands on the
 * other server. The operating system arbitrates `wx` in one indivisible step,
 * so exactly one writer wins and the loser reads back what the winner wrote.
 *
 * A file that exists but is EMPTY is the one case the loser may overwrite: it
 * is the half-written leftover `resolveIdentitySecret` already refuses to use,
 * and rereading it forever would refuse to start with no secret at all.
 *
 * 0o600: owner read/write, nobody else. A secret world-readable on a shared
 * machine is every account on that machine able to forge every student.
 */
export function persistSecretUnlessPresent(path: string, made: string): string {
  try {
    writeFileSync(path, `${made}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return made
  } catch (error) {
    if ((error as { code?: unknown }).code !== 'EEXIST') throw error
    const theirs = readFileSync(path, 'utf8').trim()
    if (theirs !== '') return theirs
    writeFileSync(path, `${made}\n`, { encoding: 'utf8', mode: 0o600 })
    return made
  }
}

/** The signature for an id under this secret. */
function signatureFor(studentId: string, secret: string): string {
  return createHmac('sha256', secret).update(studentId).digest('hex')
}

/**
 * The token to hand back to the browser: the id and its proof.
 *
 * The id is readable, which is deliberate. It is not a secret -- it is a name.
 * What the browser cannot do is produce a DIFFERENT name with a valid proof.
 */
export function signIdentity(studentId: string, secret: string): string {
  if (secret === '') throw new NoIdentitySecret('an identity secret is required')
  return `${studentId}${PART_SEPARATOR}${signatureFor(studentId, secret)}`
}

/**
 * The id this token proves, or `undefined` if it proves nothing.
 *
 * RETURNS UNDEFINED RATHER THAN THROWING. An absent, expired or tampered cookie
 * is the ordinary case on a first visit, not an exceptional one, and the caller
 * responds to all three the same way: mint a new identity.
 */
export function verifyIdentity(token: string, secret: string): string | undefined {
  if (secret === '') throw new NoIdentitySecret('an identity secret is required')

  /* `lastIndexOf`, not `indexOf`: the signature is the LAST part, so an id that
   * somehow contained a separator could not shift the split. */
  const cut = token.lastIndexOf(PART_SEPARATOR)
  if (cut <= 0 || cut === token.length - 1) return undefined

  const studentId = token.slice(0, cut)
  const offered = token.slice(cut + 1)
  const expected = signatureFor(studentId, secret)

  /* CONSTANT TIME. A plain `===` returns faster the earlier it finds a
   * difference, and that timing is measurable across enough requests -- it
   * hands an attacker the signature one character at a time. Both sides are
   * fixed-length hex here, so a length check first is safe and is required:
   * `timingSafeEqual` throws on a length mismatch. */
  if (offered.length !== expected.length) return undefined
  if (!timingSafeEqual(Buffer.from(offered), Buffer.from(expected))) return undefined

  return studentId
}

/**
 * Read one cookie out of a raw `Cookie` header.
 *
 * WRITTEN OUT RATHER THAN SPLIT ON ";" AND TRUSTED. A header carries many
 * cookies, values may be quoted, and a name that merely ENDS WITH ours must not
 * match -- `evil_almanac_student` is not `almanac_student`. Matching on the
 * exact name after the split is what makes that impossible.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const pair of header.split(';')) {
    const cut = pair.indexOf('=')
    if (cut === -1) continue
    if (pair.slice(0, cut).trim() !== name) continue
    const raw = pair.slice(cut + 1).trim()
    /* A quoted value is legal in the grammar and arrives from some clients. */
    const unquoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
      ? raw.slice(1, -1)
      : raw

    /* A VALUE THAT CANNOT BE DECODED IS NOT A COOKIE THIS SERVER PLANTED.
     *
     * `decodeURIComponent` THROWS on a broken percent-escape -- `%`, `%zz`, a
     * truncated `%E0%A4%A`. This line used to let that escape, and `handle` has
     * no try/catch, so a single stray percent sign in a request header reached
     * a learner as `{"error":"internal error"}`. A 500 from punctuation, on a
     * header the learner never typed and cannot see.
     *
     * Returning `undefined` is not swallowing the failure -- it is the honest
     * answer. `identityCookie` percent-encodes what it plants, so a value that
     * will not decode was not produced here; it proves nothing about who is
     * asking, which is exactly what "no cookie at all" also means. The caller
     * already handles that: it mints a fresh identity. Two indistinguishable
     * situations get the one answer that is true of both. */
    try {
      return decodeURIComponent(unquoted)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * The `Set-Cookie` value that plants a signed identity.
 *
 * EVERY FLAG HERE IS LOAD-BEARING.
 *   HttpOnly  page scripts cannot read it, so one injected script cannot
 *             harvest a whole classroom's identities.
 *   SameSite=Lax  another site cannot make the browser send it, which is what
 *             stops a link in a chat window acting as the student who clicks it.
 *   Path=/    every route under this server, and nothing outside it.
 *   Max-Age   a year. A student who comes back next term is still herself; a
 *             cookie with no expiry is discarded by some browsers on close,
 *             which would silently lose her memory every evening.
 *
 * `Secure` is NOT set by default and that is deliberate: this server is served
 * over plain HTTP on a development machine, and a `Secure` cookie is dropped on
 * the floor there -- every request would arrive with no identity and mint a new
 * one. The deployment that terminates TLS asks for it explicitly, through
 * `secure: true` (set from `IDENTITY_COOKIE_SECURE` in `index.ts`), because a
 * bearer cookie a browser will also send over plain HTTP to the same host is a
 * bearer cookie anyone on that network can read.
 */
export function identityCookie(token: string, options: { secure?: boolean } = {}): string {
  const year = 365 * 24 * 60 * 60
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${year}`
  return `${IDENTITY_COOKIE}=${encodeURIComponent(token)}; ${flags}${options.secure ? '; Secure' : ''}`
}
