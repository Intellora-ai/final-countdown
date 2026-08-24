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

/* Elements whose CONTENT is not page content at any level. */
const DROP_WHOLE = /<(script|style|noscript|template|svg|canvas|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

/* The same elements when the document never closes them: everything from the
   opening tag to the end is dropped, because an unterminated <script> means
   the rest of the file is script as far as any browser is concerned. */
const DROP_UNCLOSED = /<(script|style|noscript|template|svg|canvas|iframe)\b[^>]*>[\s\S]*$/i

const CHROME = /<(nav|footer|aside|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g

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
    result = result
      .replace(COMMENT, '')
      .replace(DROP_WHOLE, '')
      .replace(DROP_UNCLOSED, '')
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
  return tidy(stripConstructs(fragment, true))
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
