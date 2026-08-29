/*
 * TURNING A SCRAPED PAGE INTO READABLE TEXT, ONCE, CORRECTLY.
 *
 * `clat.mjs` and `exams.mjs` each grew their own regex chain for this, and
 * CodeQL found the same class of mistake in both:
 *
 *   js/bad-tag-filter                           clat.mjs:40
 *   js/double-escaping                          clat.mjs:39
 *   js/incomplete-multi-character-sanitization   exams.mjs:63
 *
 * Fixing them where they surfaced would have left the third copy to be written
 * next time somebody scrapes a page. One implementation, two callers.
 *
 * NOT A SANITISER, and the distinction is load-bearing. Nothing here defends a
 * browser: the output is plain text that never re-enters a DOM. What it must do
 * is not silently corrupt a syllabus -- leaving a script body in the extracted
 * text, or inventing a `<` the page never contained.
 */

/*
 * ONE PASS, ONE PATTERN, AND THAT IS THE FIX FOR THE DOUBLE-ESCAPE.
 *
 * The old chain ran `.replace(/&amp;/g, '&')` beside `.replace(/&lt;/g, '<')`,
 * so `&amp;lt;` became `&lt;` and then `<` -- a tag the page never contained,
 * produced by the code meant to remove tags. A single scan cannot do that: the
 * regex engine continues PAST each match rather than over its replacement.
 */
const NAMED = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['rsquo', "'"],
  ['lsquo', "'"],
  ['rdquo', '"'],
  ['ldquo', '"'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['hellip', '…'],
])

/** Every HTML entity decoded exactly once. Unknown entities are left alone. */
export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      /* An unparseable or out-of-range reference is left as written. Guessing
         produces a character the page never had. */
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    const named = NAMED.get(body.toLowerCase())
    return named === undefined ? whole : named
  })
}

/*
 * `\b` AFTER THE TAG NAME, AND `\s*` BEFORE THE CLOSING BRACKET.
 *
 * `<script[\s\S]*?<\/script>` missed `</script >`, which is legal HTML that
 * browsers honour, so the script BODY survived into the extracted text and a
 * curriculum could be built out of JavaScript. `[^>]*` after the boundary
 * carries the attributes; the boundary itself is what keeps `<scriptured>`
 * from being read as a script tag and its contents silently deleted.
 */
const REMOVED_ELEMENT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const BLOCK_CLOSE = /<\/(p|div|li|h[1-6]|tr|section|article|header|footer)\s*>/gi
const LINE_BREAK = /<br\s*\/?\s*>/gi
const LIST_ITEM = /<li\b[^>]*>/gi
const ANY_TAG = /<[^>]+>/g

/** A scraped page as readable text: block elements separated, entities decoded. */
export function htmlToText(html) {
  const withoutScripts = html.replace(REMOVED_ELEMENT, ' ')
  const withBreaks = withoutScripts
    .replace(BLOCK_CLOSE, '\n')
    .replace(LINE_BREAK, '\n')
    .replace(LIST_ITEM, '\n• ')
  /* Entities are decoded AFTER the tags are gone. Decoding first would turn
     `&lt;p&gt;` into `<p>` and the tag stripper would then delete text the page
     displayed literally. */
  const text = decodeEntities(withBreaks.replace(ANY_TAG, ' '))
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}
