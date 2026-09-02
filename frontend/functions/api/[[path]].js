/**
 * THE ONE THING A STATIC PREVIEW CANNOT DO: ANSWER /api.
 *
 * The built canvas fetches `/api/ask`, `/api/situation` and the rest by
 * relative path -- the same origin it was served from. In development Vite
 * proxies those to the API server on 8787 (see `vite.config.ts`). On a
 * Cloudflare Pages preview there is no Vite, so this function stands where the
 * proxy stood: every request under /api/* is forwarded, unchanged, to the API
 * origin the Pages project names in its `API_ORIGIN` variable.
 *
 * NO ORIGIN, HONEST ANSWER. Without `API_ORIGIN` this answers 503 with the
 * same sentence the API itself uses when it has no tutor configured, so the
 * canvas shows its own "not configured" path rather than a blank or a proxy
 * error page. The product's honesty rules do not get suspended on a preview.
 *
 * UNVERIFIED AT THE TIME OF WRITING: see `.github/workflows/preview.yml`.
 * The first preview that answers an ask is this file's proof.
 */
export async function onRequest(context) {
  const origin = (context.env.API_ORIGIN ?? '').trim().replace(/\/+$/, '')
  if (origin === '') {
    return new Response(
      JSON.stringify({ error: 'the tutor is not configured on this preview: set API_ORIGIN on the Pages project' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  }

  const incoming = new URL(context.request.url)
  const target = `${origin}${incoming.pathname}${incoming.search}`

  /* The request is forwarded as it came: method, headers (the identity cookie
   * included) and body. `redirect: 'manual'` so a redirect from the API is
   * handed back to the browser rather than followed on its behalf. */
  const forwarded = new Request(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method === 'GET' || context.request.method === 'HEAD' ? undefined : context.request.body,
    redirect: 'manual',
  })
  return fetch(forwarded)
}
