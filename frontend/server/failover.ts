/**
 * WHEN ONE VENDOR SAYS NO, ASK THE NEXT ONE.
 *
 * THE DEFECT THIS FIXES, MEASURED ON THIS MACHINE. Groq's free tier is 200,000
 * tokens per DAY. The account reached `Used 198032, Requested 2950` during one
 * afternoon of ordinary use, and from that moment every lesson failed:
 *
 *   {"error":"the model could not be reached (429 tokens/rate_limit_exceeded)"}
 *
 * `chooseProvider` picks the first vendor with a key and stops, so there was no
 * second chance even for an operator holding four other keys. The product had
 * one account's daily budget between it and teaching nothing at all.
 *
 * WHY A WRAPPER AND NOT A RETRY. `groq.ts` already retries -- twice, with the
 * pauses the vendor asks for, inside one host. That is the right mechanism for
 * a blip and the wrong one for exhaustion: a budget that is spent is still
 * spent fourteen seconds later, and every retry against it costs the learner
 * time to learn nothing. Exhaustion is not a slower failure, it is a different
 * failure, and the only thing that fixes it is a different host.
 *
 * WHAT IT DOES NOT DO. It does not race them, does not spread load, and does
 * not "pick the best". The first configured vendor is the one that answers, in
 * exactly the order `provider.ts` documents, and the others exist only for the
 * case where it could not. A wrapper that changed which vendor answers on a
 * healthy day would make every measurement in `CONSTRAINTS.md` unrepeatable.
 *
 * THE ONE EXCEPTION, AND IT IS NOT A HEALTHY DAY. A vendor that has just said
 * its budget is spent is moved to the BACK of the queue until the time it named
 * -- see `spentUntil`. That is still not a choice about quality: it is
 * declining to spend thirty seconds re-discovering a refusal the vendor already
 * explained. When it comes back, or when nothing else is ready, the configured
 * order returns unchanged.
 *
 * EACH CLIENT HOLDS ITS OWN CREDENTIAL AND ITS OWN HOST. This never touches a
 * key: it is handed already-built clients, and each was constructed by
 * `index.ts` with one vendor's key and one vendor's base URL. No key can reach
 * a host it was not issued for, which is the property `provider.ts` cares about
 * once several are in play.
 */

import type { Model } from './model.ts'

/** One vendor's client, and the name to blame when it is the one that failed. */
export interface Standby {
  /** `provider.vendor` -- "groq", "moonshot", "zai". Never the key. */
  readonly vendor: string
  readonly model: Model
}

/**
 * WHICH FAILURES ARE WORTH ASKING SOMEBODY ELSE ABOUT.
 *
 * NOT ALL OF THEM, and the distinction matters. A vendor that refuses because
 * OUR REQUEST is wrong -- a bad model name, a malformed body -- will be refused
 * by the next vendor for the same reason, so trying four hosts turns one fast
 * failure into four slow ones and the learner waits for every round trip.
 *
 * What IS worth moving for is a vendor that is unavailable TO US: a spent
 * budget, a rejected key, a host that is down or not answering. Those are
 * properties of that account and that machine, and another vendor genuinely may
 * not have them.
 *
 * READ OFF THE MESSAGE `groq.ts` BUILDS, which is assembled from the status and
 * the vendor's short code only -- never from the vendor's own prose. So this
 * matches strings this repository writes, not strings a vendor could change.
 */
function worthAskingAnother(reason: string): boolean {
  const said = reason.toLowerCase()
  /* Budget: the message `groq.ts` builds says which one, and either way this
     host is done for now. */
  if (said.includes('rate_limit') || said.includes('token budget is spent')) return true
  /* Nothing answered. `groq.ts` says "no reply" for a transport failure it has
     already retried. */
  if (said.includes('no reply')) return true
  /* A named code, which no digit sniffing can imitate. */
  if (said.includes('invalid_api_key')) return true
  /*
   * A HOST THAT IS SIMPLY NOT THERE, WHICH IS WHAT `ollama.ts` SAYS IN WORDS.
   *
   * This function is documented as moving for "a host that is down or not
   * answering", and the one client that reports exactly that could not be read:
   * `ollama.ts` writes `the model could not be reached: Ollama is not answering
   * at <endpoint>` and `... did not answer within <n>ms` -- a colon and no
   * parenthesis, so the status regex below finds nothing and returns false.
   *
   * IT COSTS NOTHING TODAY AND EVERYTHING ON THE DAY SOMEBODY REORDERS. The
   * local model is last in the chain, so a false here ends a loop that was
   * ending anyway. Put it first -- for offline use, or to spare a quota -- and
   * a laptop with `ollama serve` not running breaks the loop and every hosted
   * vendor behind it goes unasked. That is the identical failure the bare-429
   * fix was written for, waiting for a one-line change to the list.
   *
   * MATCHED ON WHAT THIS REPOSITORY WRITES, like every rule above it: both
   * sentences come from `ollama.ts`, not from a vendor's prose.
   */
  if (said.includes('is not answering at') || said.includes('did not answer within')) return true

  /*
   * THE STATUS, READ FROM THE ONE PLACE IT IS WRITTEN.
   *
   * `groq.ts:618` builds exactly `the model could not be reached (<status>
   * <code>)`, so the status is the three digits immediately after that phrase
   * and nowhere else. Anchoring to the phrase -- rather than to "the first
   * parenthesis", and rather than to a substring search for "401" or "5xx" --
   * is what makes this immune to the numbers that legitimately appear in a
   * message: token counts (`Used 198403`), ports (`:11434`), model names
   * (`...-403b`), retry hints (`4m03s`).
   *
   * A message from another client is not parsed at all. `ollama.ts` writes
   * `the model could not be reached: Ollama is not answering at ...` -- a colon
   * and no parenthesis -- so it falls through to the reasons above rather than
   * having a port read out of it as an HTTP status.
   */
  const status = /could not be reached \((\d{3})[\s)]/.exec(reason)
  if (status === null) return false
  const code = Number(status[1])
  /* The key was refused, or the account cannot use this model. Another vendor's
     key is a different key. */
  if (code === 401 || code === 403) return true
  /*
   * RATE LIMITED, WHICH IS THE WHOLE REASON THIS FILE EXISTS.
   *
   * MEASURED ON THE RUNNING SERVER, and it took the product down completely:
   *
   *   [failover] gemini could not answer: the model could not be reached (429)
   *   POST /api/ask -> 502 in 31.5s
   *
   * with a Groq key configured, a Groq client built, and Groq never asked.
   *
   * WHY THE GUARD ABOVE DID NOT CATCH IT. The string tests read `rate_limit`
   * and `token budget is spent` out of the message, and those are GROQ'S short
   * codes -- every 429 case in `failover.test.ts` is written in Groq's wording,
   * `(429 tokens/rate_limit_exceeded ...)`. Gemini sends a 429 with no short
   * code at all, so the message is bare `(429)`, every string test missed, and
   * the status fell through to `code >= 500` -- false. The primary broke the
   * loop and no standby was tried.
   *
   * So the vendor whose wording was not the one the tests were written from was
   * the one vendor that could disable failover, and it is FIRST in `VENDORS`.
   * Read from the STATUS, which every vendor sends and none of them phrases:
   * 429 means this account cannot serve us right now, which is precisely the
   * "unavailable TO US" this function is documented to move for -- and another
   * vendor's quota is a different quota.
   */
  if (code === 429) return true
  /* A host that is up and failing. */
  return code >= 500
}

/**
 * Try each client in turn, and keep the FIRST reason rather than the last.
 *
 * THE FIRST ONE IS THE USEFUL ONE. The operator configured these in order and
 * meant the first to answer; if it is out of budget, that is the sentence they
 * need in order to act. "deepseek: 404 model_not_found" from the fourth standby
 * would send them to fix a vendor they were not using.
 *
 * EVERY FAILURE IS NAMED, so a silent fallback cannot hide a broken primary. A
 * product quietly running on its last standby looks identical to one running
 * fine, right up until that one is spent too.
 */
/**
 * WHEN A VENDOR SAID ITS BUDGET WAS SPENT, AND WHEN IT COMES BACK.
 *
 * A daily budget does not refill because a new request arrived. Without this,
 * every question for the rest of the day asked the spent primary FIRST, waited
 * out `groq.ts`'s retry loop -- two pauses, up to thirty seconds each -- and
 * only then reached the standby that could have answered at once. The learner
 * pays that dead time on every single question, and no single-call test can see
 * it because the cost only exists across requests.
 *
 * PER `failover()`, NOT MODULE-LEVEL, and the difference is not academic: a
 * module-level map is shared by every set of standbys in the process, so one
 * set's exhausted vendor would reorder another's, and nothing could construct a
 * fresh wrapper with a clean slate. Keyed by vendor name, holding one
 * timestamp, never persisted: a restart forgets, which is correct, because a
 * restart is also the moment an operator may have fixed the account.
 *
 * IT ONLY EVER SKIPS. A vendor believed spent is moved to the back of the
 * queue, not removed -- see `order` below -- so if every vendor is spent the
 * request is still made and still answered or still fails honestly. A cache
 * that could refuse to try would be a cache that can invent an outage.
 */
type SpentUntil = Map<string, number>

/**
 * How long a vendor that said its budget is spent should be stood down for.
 *
 * THE VENDOR'S OWN NUMBER FIRST. `groq.ts` carries `try again in 7m4.224s`
 * through when the vendor states it, and that is better than any guess.
 *
 * WHEN IT SAYS NOTHING, WHICH BUDGET IT WAS DECIDES. `groq.ts` distinguishes
 * two, and they are not the same length of problem: a per-DAY ceiling is over
 * for the session, while a per-MINUTE one clears in seconds -- Groq's headers
 * put the minute bucket's reset at `577ms`. Standing a healthy primary down for
 * an hour because it had one busy minute would spend the rest of the day on
 * standbys, or fail outright for an operator who has none.
 */
const SHORT_TERM_STAND_DOWN_MS = 60_000
/** Fewer tokens than one concept reserves (see `Vendor.conceptTokens`): not enough for the next question. */
const LOW_WATER_TOKENS = 4_000
const DAILY_STAND_DOWN_MS = 60 * 60_000

function comesBackIn(reason: string): number {
  const fallback = /short-term token budget/i.test(reason)
    ? SHORT_TERM_STAND_DOWN_MS
    : DAILY_STAND_DOWN_MS
  const said = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(reason)
  if (said === null) return fallback
  const ms =
    Number(said[1] ?? 0) * 3_600_000 + Number(said[2] ?? 0) * 60_000 + Number(said[3] ?? 0) * 1000
  return ms > 0 ? ms : fallback
}

/** Configured order, except that anything believed spent goes last. */
function order(
  standbys: readonly Standby[],
  spentUntil: SpentUntil,
  now: number,
): readonly Standby[] {
  /* NEARLY OUT IS OUT, FOR ORDERING. A vendor that reported fewer tokens than
     one concept needs, with its reset still ahead, is asked last -- before it
     has to refuse, not after. It comes back on its own when the reset passes
     or the next reply says otherwise. */
  const standing = (s: Standby): boolean => {
    if ((spentUntil.get(s.vendor) ?? 0) > now) return false
    const left = s.model.budgetLeft?.() ?? null
    return left === null || left.resetInMs <= 0 || left.remainingTokens >= LOW_WATER_TOKENS
  }
  const ready = standbys.filter(standing)
  if (ready.length === 0 || ready.length === standbys.length) return standbys
  return [...ready, ...standbys.filter((s) => !standing(s))]
}

async function firstThatAnswers<T>(
  standbys: readonly Standby[],
  spentUntil: SpentUntil,
  what: string,
  run: (model: Model) => Promise<T> | undefined,
): Promise<T> {
  let firstReason = ''
  const tried: string[] = []

  for (const standby of order(standbys, spentUntil, Date.now())) {
    /*
     * `run` IS CALLED INSIDE THE TRY, AND IT WAS NOT.
     *
     * A client can throw SYNCHRONOUSLY -- before it ever returns a promise --
     * and this codebase has one that does: `createGroqModel` validates its key
     * and its fetch eagerly and throws for a blank key. Calling `run` above the
     * `try` let that exception leave `firstThatAnswers` untouched, so a primary
     * that could not serve at all skipped every standby: the one class of
     * failure this whole file exists for was the one class it could not catch.
     */
    try {
      const attempt = run(standby.model)
      /* A client that does not implement this call at all is not a failure to
         report -- it simply cannot serve it, and the next one may. */
      if (attempt === undefined) {
        tried.push(`${standby.vendor}: no ${what}`)
        continue
      }
      return await attempt
    } catch (thrown) {
      const reason = thrown instanceof Error ? thrown.message : String(thrown)
      if (firstReason === '') firstReason = reason
      /* Remembered, so the next question does not start by waiting for this
         one to fail again. See `spentUntil`. */
      if (reason.toLowerCase().includes('budget is spent')) {
        spentUntil.set(standby.vendor, Date.now() + comesBackIn(reason))
      }
      tried.push(`${standby.vendor}: ${reason}`)
      console.warn(`[failover] ${standby.vendor} could not answer: ${reason}`)
      if (!worthAskingAnother(reason)) break
    }
  }

  /* Every configured host was asked and none answered. The first reason leads,
     because it is the primary's, and the roll-call follows so an operator can
     see that the standbys were genuinely tried and what each of them said. */
  throw new Error(
    firstReason === ''
      ? `no configured model can ${what} (${tried.join('; ')})`
      : `${firstReason} (tried ${tried.length}: ${tried.join('; ')})`,
  )
}

/**
 * One `Model` that speaks for several.
 *
 * `chat` and `nextPart` are declared unconditionally rather than mirrored from
 * the standbys, and that is deliberate: `handler.ts` branches on whether `chat`
 * EXISTS to choose the concept path over the whole-lesson path, and a wrapper
 * whose `chat` appeared and disappeared with its primary would move the product
 * between two different teaching paths depending on which vendor was healthy.
 * A standby that cannot chat is skipped inside, where it costs a line in the
 * roll-call instead of a change of route.
 */
export function failover(standbys: readonly Standby[]): Model {
  if (standbys.length === 0) {
    throw new Error('failover was given no models')
  }
  /* One vendor needs no wrapper, and wrapping it would put this file's
     roll-call sentence in front of every single-vendor failure. */
  if (standbys.length === 1) return standbys[0]!.model

  /*
   * DECLARED FROM THE WHOLE SET, ONCE -- NOT PER VENDOR, AND NOT ALWAYS.
   *
   * `handler.ts` branches on whether `chat` EXISTS to choose the concept path
   * over `authorLesson`, so this must not flicker with which vendor is healthy
   * -- that would move a learner between two teaching paths minute to minute.
   * Declaring it unconditionally fixed the flicker and broke the other half:
   * when NO configured vendor can chat, the router saw a function, took the
   * concept path, and the learner got "no configured model can answer" for a
   * request the whole-lesson path would have served.
   *
   * Computed once, from every standby, at construction. The set does not change
   * while the process runs, so the answer is stable for the router AND honest:
   * absent means genuinely nobody can, which is exactly what the router needs
   * in order to fall back.
   */
  const someoneCanChat = standbys.some((s) => typeof s.model.chat === 'function')
  const someoneCanNextPart = standbys.some((s) => typeof s.model.nextPart === 'function')

  /* One map per wrapper. See `spentUntil`. */
  const spentUntil: SpentUntil = new Map()

  return {
    lesson: (brief) =>
      firstThatAnswers(standbys, spentUntil, 'write a lesson', (m) => m.lesson(brief)),
    ...(someoneCanChat
      ? {
          chat: (system: string, user: string, priorAssistant?: string, budget?: number) =>
            firstThatAnswers(standbys, spentUntil, 'answer', (m) =>
              m.chat?.(system, user, priorAssistant, budget),
            ),
        }
      : {}),
    /* STREAMING NEVER CHANGES WHO TEACHES. The vendor order is the vendor
       order: a vendor without `chatStream` still answers first if it is first,
       and its whole reply is handed over as one piece. Only a vendor that can
       stream streams. Anything else would send every canvas question to the
       laptop the moment the cloud vendor lacked streaming. */
    ...(someoneCanChat
      ? {
          chatStream: (
            system: string,
            user: string,
            onDelta: (text: string) => void,
            priorAssistant?: string,
            budget?: number,
          ) =>
            firstThatAnswers(standbys, spentUntil, 'answer', (m) =>
              m.chatStream !== undefined
                ? m.chatStream(system, user, onDelta, priorAssistant, budget)
                : m.chat?.(system, user, priorAssistant, budget).then((whole) => {
                    onDelta(whole)
                    return whole
                  }),
            ),
        }
      : {}),
    ...(someoneCanNextPart
      ? {
          nextPart: (brief: Parameters<Model['lesson']>[0]) =>
            firstThatAnswers(standbys, spentUntil, 'write the next part', (m) =>
              m.nextPart?.(brief),
            ),
        }
      : {}),
  }
}
