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

const ANY_TAG = /<[^>]*>/g

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
  return decodeEntities(raw)
    /* Tabs and newlines inside a block are layout, not content. */
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** Strip markup from a fragment, honouring the inline/block distinction. */
function toText(fragment: string): string {
  return tidy(
    fragment
      .replace(COMMENT, '')
      .replace(DROP_WHOLE, '')
      .replace(DROP_UNCLOSED, '')
      .replace(BLOCK, '\n')
      /* Every remaining tag is inline. Removed with NO substitution, so
         `<em>up to</em> 40%` stays `up to 40%` rather than `up to  40%`. */
      .replace(ANY_TAG, ''),
  )
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
     and reshape every region found afterwards. */
  const clean = html.replace(COMMENT, '').replace(DROP_WHOLE, '')

  const region = mainRegion(clean)
  const withoutChrome = region.replace(CHROME, '')

  return {
    title: readTitle(clean, withoutChrome),
    text: toText(withoutChrome),
    ...(readPublished(html) ? { publishedAt: readPublished(html) } : {}),
    tables: readTables(withoutChrome),
  }
}
