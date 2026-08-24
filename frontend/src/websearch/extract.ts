/**
 * HTML IN, EVIDENCE OUT.
 *
 * WHY A HAND-WRITTEN EXTRACTOR AND NOT A PARSER LIBRARY
 * ----------------------------------------------------
 * A dependency was not approved, and this needs less than a parser provides:
 * no DOM, no selectors, no mutation — one pass that keeps text and throws away
 * markup. What it must get right is narrow and testable, and the tests say so
 * rather than the README of something else.
 *
 * WHY QUALIFIERS ARE THE POINT
 * ----------------------------
 * "Revenue may reach $120 billion" and "Revenue reached $120 billion" are
 * different claims, and only one of them is true. Extractors lose the
 * difference in two ordinary ways: by dropping inline elements along with
 * their text, so `<em>up to</em> 40%` becomes `40%`; and by inserting
 * whitespace at every tag boundary, so the hedge detaches from its number and
 * a later sentence-splitter files them separately. Inline tags are therefore
 * removed WITHOUT adding space, and only block-level elements produce a break.
 *
 * WHY SCRIPT AND COMMENT CONTENT IS DELETED, NOT JUST UNWRAPPED
 * ------------------------------------------------------------
 * Stripping `<script>` while keeping what is between the tags puts executable
 * text into the extract as if the page had said it in prose. That is the
 * cheapest possible prompt injection: no exploit, just a tag the extractor
 * half-understood. The same goes for comments, which are invisible to a human
 * reviewing the page and perfectly visible to whatever reads the extract.
 *
 * WHAT THIS DOES NOT DECIDE
 * -------------------------
 * Whether the text is trustworthy. Extraction is transport; `guard.ts` judges.
 * Keeping them apart means the injection tests do not depend on the HTML
 * parser being correct, and the parser tests do not depend on the threat model
 * being current.
 */

import { stripInvisible } from './guard'

export interface Extracted {
  title: string
  text: string
  /** ISO date the PAGE declares. Absent when it declares none — never inferred. */
  publishedAt?: string
  /** Rows of cells, per table, kept apart from the prose. */
  tables: string[][][]
}

/**
 * Elements whose CONTENT is not page content at any level.
 *
 * Scanned for by hand rather than matched with a regex — see `removeRaw`.
 */
const RAW_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
] as const

const CHROME = /<(nav|footer|aside|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/**
 * Delete comments and raw-text elements by SCANNING, not by replacing.
 *
 * This was four regexes and four failed attempts at
 * `js/incomplete-multi-character-sanitization`. The rule flags the
 * multi-character `.replace()` CALLS, not the string they produce, so no
 * amount of looping or post-processing clears it — the sink is the call.
 * The analysed merge that still reported two results contained every one of
 * those attempts, which is what finally made the point.
 *
 * A scanner has no such call. It also happens to be more correct than the
 * regexes were: `>` inside a quoted attribute no longer ends a tag, and an
 * unterminated comment or `<script>` consumes to end-of-input the way a
 * browser treats it, without a separate rule for the unclosed case.
 *
 * Returns the input with every comment and every raw element — content
 * included, closed or not — removed. Everything else, including all ordinary
 * tags, is left exactly as it was for the caller to deal with.
 */
function removeRaw(input: string): string {
  /* Lowered ONCE per call and threaded through, not recomputed per element.
     Doing it inside the per-element helper made this O(n) per raw tag, and
     inside the fixpoint loop that became O(n^2) — the 2000-level nesting test
     went from passing to 5138ms against a 5000ms bound, which is exactly the
     kind of quadratic that only shows up on adversarial input. */
  const lower = input.toLowerCase()
  let out = ''
  let i = 0

  while (i < input.length) {
    const lt = input.indexOf('<', i)
    if (lt === -1) {
      out += input.slice(i)
      break
    }
    out += input.slice(i, lt)

    if (lower.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4)
      /* Unterminated: a browser swallows the rest of the document, and so do
         we. Stopping early would surface comment text as prose. */
      i = end === -1 ? input.length : end + 3
      continue
    }

    const raw = rawElementAt(lower, lt)
    if (raw) {
      i = skipRawElement(input, lower, lt, raw)
      continue
    }

    /* An ordinary `<`. Emit it and move on by ONE character, so a `<` nested
       inside what looked like a tag gets its own turn on the next iteration. */
    out += '<'
    i = lt + 1
  }

  return out
}

/** The raw element opening at `lt`, if any. `lower` is the lowered input. */
function rawElementAt(lower: string, lt: number): string | null {
  for (const name of RAW_ELEMENTS) {
    const after = lt + 1 + name.length
    if (lower.startsWith(name, lt + 1) && /[\s/>]/.test(lower[after] ?? '>')) {
      return name
    }
  }
  return null
}

/** Index just past the end of the raw element opening at `lt`. */
function skipRawElement(input: string, lower: string, lt: number, name: string): number {
  const openEnd = input.indexOf('>', lt)
  if (openEnd === -1) return input.length
  /* A self-closing form has no content to skip. */
  if (input[openEnd - 1] === '/') return openEnd + 1

  const close = lower.indexOf(`</${name}`, openEnd)
  if (close === -1) return input.length
  const closeEnd = input.indexOf('>', close)
  return closeEnd === -1 ? input.length : closeEnd + 1
}

/* Elements that end a line of prose. Everything else is inline and must not
   introduce whitespace — see the note on qualifiers above. */
const BLOCK =
  /<\/?(p|div|section|article|main|h[1-6]|li|ul|ol|tr|table|thead|tbody|br|hr|blockquote|pre|dd|dt|dl|figure|figcaption|address)\b[^>]*>/gi

/**
 * A tag containing no `<` of its own — the INNERMOST tag at this point.
 *
 * `/<[^>]*>/` was here and it is the bug CodeQL flagged
 * (`js/incomplete-multi-character-sanitization`, three high alerts). Given
 * `<scr<x>ipt>`, that pattern matches from the first `<` to the first `>`,
 * swallowing `<scr` and `<x>` as ONE tag and leaving `ipt>` behind as text —
 * so the script body survived into the extract as prose.
 *
 * Excluding `<` from the body makes a match unable to span a nested tag, so
 * `<x>` is removed on its own and `<scr` + `ipt>` rejoin into a real
 * `<script>` — which the drop rule then catches on the next pass. That is why
 * this has to run in a loop rather than once.
 */
const INNERMOST_TAG = /<[^<>]*>/g

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  deg: '°',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  plusmn: '±',
  frac12: '½',
  frac14: '¼',
  sup2: '²',
  sup3: '³',
  middot: '·',
  bull: '•',
}

/**
 * Decode character references.
 *
 * An UNKNOWN entity is left exactly as written. Replacing it with a
 * placeholder, or dropping it, silently edits the page's text — and the one
 * case that matters is a bare `&` in running prose, which is not an entity at
 * all and must survive as itself.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    const b = body.toLowerCase()
    if (b.startsWith('#x')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) && code > 0 ? safeFromCode(code, whole) : whole
    }
    if (b.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? safeFromCode(code, whole) : whole
    }
    return b in NAMED ? NAMED[b] : whole
  })
}

function safeFromCode(code: number, whole: string): string {
  try {
    return String.fromCodePoint(code)
  } catch {
    return whole
  }
}

/** The most specific container that plausibly holds the article. */
function mainRegion(html: string): string {
  for (const tag of ['article', 'main']) {
    const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i').exec(html)
    if (m && m[1].trim().length > 0) return m[1]
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)
  if (body) return body[1]
  /* No <body> either. An HTML fragment is a perfectly ordinary thing to be
     handed, and refusing to read one would fail on exactly the inputs a test
     fixture is most likely to use. */
  return html
}

function tidy(raw: string): string {
  /* Invisible characters are removed HERE, at the single entry point every
     consumer goes through, rather than only in `guard`.
     Found by the adversarial suite: `asEvidence()` stripped them, so the
     quarantined block was clean while `Extracted.text` still carried them —
     and `text` is what ranking, snippets and any future claim extraction
     read. A defence that only covers one of two outputs covers neither, since
     an attacker picks the output. */
  return stripInvisible(decodeEntities(raw))
    /* Tabs and newlines inside a block are layout, not content. */
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/* The pass cap that used to live here is gone, and its absence is the fix.
 *
 * CodeQL kept flagging the loop as single-pass sanitization even after it was
 * rewritten as `do/while` — the analysis ran on this exact HEAD and pointed at
 * the two `result = result` chains. The rule accepts "apply repeatedly until
 * no more replacements can be performed", and the compound condition
 * `result !== previous && passes < MAX_STRIP_PASSES` is not that: it can stop
 * with replacements still available, which is precisely the unsafe case the
 * rule exists to catch. The cap did not merely obscure the fixpoint, it broke
 * it.
 *
 * Dropping it is safe because termination never depended on it. Every rule
 * only ever deletes, and the one substitution that is not a deletion replaces
 * a tag of at least three characters with a single newline, so any pass that
 * changes the string strictly shortens it. The loop therefore runs at most
 * once per character and stops on the first pass that changes nothing. */

/**
 * Strip markup from a fragment, honouring the inline/block distinction.
 *
 * Runs to a FIXPOINT rather than once. One pass is defeatable by nesting a tag
 * inside another tag's name: the removal of the inner tag is what rejoins the
 * outer one into something the drop rules recognise, and a single pass has
 * already moved on by then. Looping until the string stops changing closes
 * that, and costs one extra no-op pass on ordinary documents.
 */
/**
 * Delete every non-content construct, repeatedly, until the string stops
 * changing.
 *
 * The `do/while (result !== previous)` shape is deliberate and is the whole
 * point of this helper. An earlier version ran the same rules in a `for` loop
 * with a `break`, which behaves identically but is not recognisable as a
 * fixpoint — CodeQL flagged it as single-pass sanitization
 * (`js/incomplete-multi-character-sanitization`, "this string may still
 * contain <script"). A reader has the same problem the analyser does: with a
 * `break` in the middle you have to simulate the loop to see that it converges.
 * Stated as "repeat until nothing changes", both can see it at a glance.
 *
 * Termination is not a matter of trust: every rule only ever deletes, so each
 * pass strictly shortens the string unless it changes nothing, in which case
 * the loop exits. The pass cap is a backstop against a pathological input, not
 * the mechanism.
 */
function stripConstructs(input: string, blocksBecomeNewlines: boolean): string {
  let result = input
  let previous: string
  do {
    previous = result
    result = removeRaw(result)
    if (blocksBecomeNewlines) {
      result = result
        .replace(BLOCK, '\n')
        /* Every remaining tag is inline. Removed with NO substitution, so
           `<em>up to</em> 40%` stays `up to 40%` rather than `up to  40%`. */
        .replace(INNERMOST_TAG, '')
    }
  } while (result !== previous)
  return result
}

function toText(fragment: string): string {
  /* FINAL PASS, SINGLE CHARACTER, AND IT BELONGS HERE RATHER THAN INSIDE
   * `stripConstructs`.
   *
   * Three attempts at satisfying `js/incomplete-multi-character-sanitization`
   * by looping the multi-character replacements all failed, including the
   * uncapped `do/while` the rule's own documentation describes. The analysis
   * ran each time and kept pointing at the same chains, so "loop it" is not a
   * fix that lands here however correct it reads.
   *
   * The rule names a second accepted fix: match SINGLE characters rather than
   * the entire unsafe text. That is sound here for a reason specific to this
   * function, and would be wrong in most other places. What `toText` returns
   * is TEXT, never HTML — nothing downstream renders it — and entity decoding
   * happens after, inside `tidy()`. So by this point a literal `<` can only be
   * markup that survived, never content: `2 &lt; 3` is still `&lt;` here and
   * decodes later untouched.
   *
   * It goes in `toText` and NOT in `stripConstructs` because that helper has
   * a second caller — `extract()` uses it to pre-clean the whole document
   * BEFORE region detection, where the tags are exactly what tells `<article>`
   * from `<nav>`. Putting this there deleted every boundary and took 38 tests
   * with it.
   *
   * Removing the character makes the invariant total rather than probable: the
   * output cannot contain `<script` because it cannot contain `<`, and that
   * holds for nesting nobody has thought of yet. `>` is left alone — it cannot
   * open a tag, and a stray one is honest evidence the page was malformed. */
  return tidy(stripConstructs(fragment, true).replace(/</g, ''))
}

function readTables(html: string): string[][][] {
  const tables: string[][][] = []
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi)) {
    const rows: string[][] = []
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
      const cells: string[] = []
      for (const cell of row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
        cells.push(toText(cell[2]).replace(/\n/g, ' ').trim())
      }
      if (cells.length) rows.push(cells)
    }
    if (rows.length) tables.push(rows)
  }
  return tables
}

/** ISO-8601-ish and actually parseable, or nothing. */
function usableDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const value = raw.trim()
  if (!/^\d{4}-\d{2}(-\d{2})?/.test(value)) return undefined
  return Number.isFinite(Date.parse(value)) ? value : undefined
}

function readPublished(html: string): string | undefined {
  const meta = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']article:published_time["']/i,
    /<meta[^>]+name=["'](?:date|pubdate|publish-date|dc\.date)["'][^>]+content=["']([^"']+)["']/i,
  ]
  for (const re of meta) {
    const hit = usableDate(re.exec(html)?.[1])
    if (hit) return hit
  }

  for (const script of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    /* Read by pattern rather than JSON.parse: real pages ship LD+JSON with
       trailing commas and stray newlines often enough that a parse failure
       would lose the date on documents a browser reads fine. */
    const hit = usableDate(/"datePublished"\s*:\s*"([^"]+)"/i.exec(script[1])?.[1])
    if (hit) return hit
  }

  return usableDate(/<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1])
}

function readTitle(html: string, region: string): string {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(region) ?? /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html)
  if (h1) {
    const text = toText(h1[1]).replace(/\n/g, ' ').trim()
    if (text) return text
  }
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)
  return title ? toText(title[1]).replace(/\n/g, ' ').trim() : ''
}

/**
 * Read a fetched document.
 *
 * Total: any input produces an `Extracted`. Malformed markup is the normal
 * case on the open web, not an error condition, and a thrown parse error here
 * would take down a search over one bad page.
 */
export function extract(html: string): Extracted {
  if (!html || typeof html !== 'string') return { title: '', text: '', tables: [] }

  /* Comments and script bodies go first, before anything reads structure:
     a comment can otherwise contain something that looks like a closing tag
     and reshape every region found afterwards.

     Through the same fixpoint helper as `toText`, not a single pass. This ran
     as one `.replace()` chain and CodeQL was right about it: region detection
     reads this string, so a `<script>` surviving here can carry a fake
     `</article>` and move the boundary of what counts as the article. Tags
     are left alone at this stage — only whole non-content constructs go —
     because the structure is still needed to find the region. */
  const clean = stripConstructs(html, false)

  const region = mainRegion(clean)
  const withoutChrome = region.replace(CHROME, '')

  return {
    title: readTitle(clean, withoutChrome),
    text: toText(withoutChrome),
    ...(readPublished(html) ? { publishedAt: readPublished(html) } : {}),
    tables: readTables(withoutChrome),
  }
}
