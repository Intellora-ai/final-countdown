/* Refuse a cloud run BEFORE saucectl does, and say why in words.
 *
 * WHAT THIS EXISTS FOR
 *   `saucectl` answers a missing credential with "no credentials set". That is
 *   true and it is not enough: it does not say WHICH of the two is missing, and
 *   it does not say the most common cause -- that `export` only affects the
 *   terminal it was typed in, so opening a new tab, or `cd`-ing in a fresh
 *   window, silently drops both.
 *
 *   That exact confusion cost a real session: the exports were set in one
 *   terminal and the run happened in another, and the error named neither.
 *
 * IT NEVER PRINTS A VALUE.
 *   The obvious check -- `echo $SAUCE_ACCESS_KEY` -- puts the key into the
 *   terminal, into scrollback, and into any log that captures it. A key is
 *   reported here as PRESENT or MISSING and by length only. If you need to
 *   confirm you pasted the right one, compare the length, never the text.
 */

const REQUIRED = ['SAUCE_USERNAME', 'SAUCE_ACCESS_KEY']

const missing = REQUIRED.filter((name) => (process.env[name] ?? '').trim() === '')

if (missing.length === 0) {
  /* Length only. Enough to spot a truncated paste, useless to anyone reading
     over a shoulder or scraping a CI log. */
  const shape = REQUIRED.map((name) => `${name}=<set, ${process.env[name].length} chars>`).join('  ')
  process.stdout.write(`sauce preflight: ok  ${shape}\n`)
  process.exit(0)
}

process.stderr.write(
  [
    '',
    'sauce preflight: REFUSING TO RUN — credentials are not set in THIS terminal.',
    '',
    `  missing: ${missing.join(', ')}`,
    `  present: ${REQUIRED.filter((n) => !missing.includes(n)).join(', ') || '(neither)'}`,
    '',
    '  `export` only affects the terminal it was typed in. A new tab, a new',
    '  window, or a restarted shell starts with none of it — which is the usual',
    '  reason this appears right after the credentials "were already set".',
    '',
    '  Set them in the SAME terminal you run from, then re-run:',
    '',
    '      export SAUCE_USERNAME=...',
    '      export SAUCE_ACCESS_KEY=...',
    '      npm run test:sauce',
    '',
    '  To stop re-typing them, put both in a file this repo already ignores',
    '  and source it — never commit it, and never paste a key into a chat',
    '  or an issue:',
    '',
    '      printf \'export SAUCE_USERNAME=...\\nexport SAUCE_ACCESS_KEY=...\\n\' > .sauce/env.sh',
    '      source .sauce/env.sh',
    '',
    '  Checking with `echo $SAUCE_ACCESS_KEY` prints the key into your',
    '  scrollback. This script reports length instead, which is enough to spot',
    '  a truncated paste.',
    '',
  ].join('\n'),
)
process.exit(1)
