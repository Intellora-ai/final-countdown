/**
 * Where the Learning OS HTTP API lives, when it lives anywhere.
 *
 * WHAT THIS IS, AND HONESTLY WHAT IT IS NOT
 * -----------------------------------------
 * This is the configuration seam for `learning-os`'s HTTP surface. It reads
 * `VITE_API_BASE` and normalises it. It is NOT yet a client, and nothing in the
 * canvas calls the API today.
 *
 * That gap is deliberate and is recorded here rather than papered over. The
 * Phase 4 API exposes eight routes -- health, concepts, learners, mastery,
 * attempts, next, lessons -- and the only place the canvas currently reaches a
 * server is `teach/engineResolver.ts`, which posts to `/api/doubt`. There is no
 * `/api/doubt` on the API. Pointing this base at it would produce a 404 the
 * first time anyone set the variable, which is worse than an unwired flag:
 * an unwired flag is inert, a wrong one breaks the feature that works today.
 *
 * WHY THE SEAM SHIPS ANYWAY
 * -------------------------
 * Because the alternative is that `VITE_API_BASE` gets invented independently
 * in three files the first time three people need it, with three different
 * opinions about trailing slashes and three different empty-string behaviours.
 * One parser, one meaning, tested.
 *
 * WHAT WOULD WIRE IT
 * ------------------
 * Either a `POST /doubt` route on the API that `engineResolver` can target, or
 * async lesson loading in `CanvasRoute` so a lesson can come from
 * `POST /lessons`. Both are real work with their own tests; neither is Phase 4.
 *
 * UNSET IS THE DEFAULT AND MEANS "UNCHANGED"
 * ------------------------------------------
 * `null` is returned for unset, empty, and whitespace-only. A blank string from
 * a `.env` file is a variable somebody meant to turn off, and treating it as a
 * base URL produces requests to paths like `/health` on the current origin --
 * a silent misroute rather than a visible misconfiguration.
 */

/** The environment variable that turns the API on. */
export const API_BASE_VARIABLE = 'VITE_API_BASE'

/**
 * The configured API base, or `null` when there is not one.
 *
 * Any trailing slash is removed so callers can always write `` `${base}/health` ``
 * without producing `//health`. A double slash is not merely ugly: some
 * gateways treat it as a different path and route it somewhere else entirely.
 */
export function apiBase(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >,
): string | null {
  const raw = env[API_BASE_VARIABLE]
  if (raw === undefined) return null

  const trimmed = raw.trim()
  if (trimmed === '') return null

  return trimmed.replace(/\/+$/, '')
}

/**
 * Whether the canvas has been pointed at a real API.
 *
 * A named predicate rather than `apiBase() !== null` at each call site, so the
 * question being asked is legible and there is one place to change if
 * "configured" ever means more than "a base was supplied".
 */
export function apiConfigured(
  env?: Record<string, string | undefined>,
): boolean {
  return apiBase(env) !== null
}

/**
 * A URL for a backend path, absolute when a backend is configured.
 *
 * WHY THIS EXISTS
 * ---------------
 * `teach/engineResolver.ts` posts to the relative path `/api/doubt`, which is
 * right while one Vite process serves both the page and the route. Deployed,
 * the page is static files on a CDN and nothing on that origin answers, so
 * every doubt is a 404 that looks like the engine refusing.
 *
 * UNSET STILL MEANS RELATIVE, AND THAT IS THE POINT
 * -------------------------------------------------
 * Development must keep working with no configuration at all. So an absent
 * base returns the path untouched and the request goes to the same origin,
 * exactly as before. Only a deployment that sets the variable changes.
 *
 * THIS VALUE IS PUBLIC AND MUST STAY THAT WAY
 * -------------------------------------------
 * Every `VITE_` value is compiled into the bundle a browser downloads. A base
 * URL is fine there — it is the address of a server, not a way in. A key is
 * not, and no key belongs in any `VITE_` variable for the same reason.
 */
export function apiUrl(
  path: string,
  env?: Record<string, string | undefined>,
): string {
  const base = apiBase(env)
  if (base === null) return path
  return `${base}/${path.replace(/^\/+/, '')}`
}
