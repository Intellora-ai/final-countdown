/*
 * THREE CODEQL FINDINGS, ONE CAUSE: HTML PROCESSED BY HAND-ROLLED REGEX.
 *
 *   js/bad-tag-filter                        clat.mjs:40
 *   js/double-escaping                       clat.mjs:39
 *   js/incomplete-multi-character-sanitization  exams.mjs:63
 *
 * All three are the same mistake in two files, and fixing them where they
 * surfaced would leave the next copy to be written. These tests define one
 * correct implementation both files use.
 *
 * Each case is a real input a scraped page produces, not a synthetic string.
 */
import { describe, expect, it } from 'vitest'
import { decodeEntities, htmlToText } from './html.mjs'

describe('decoding entities', () => {
  /*
   * js/double-escaping. The old chain ran `&amp; -> &` alongside the other
   * replacements, so `&amp;lt;` decoded twice and became `<` -- a tag the page
   * never contained, produced by the code meant to remove tags. One pass over
   * one pattern cannot do that: `&amp;` becomes `&` and the scan continues
   * PAST it rather than over it.
   */
  it('decodes each entity exactly once', () => {
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeEntities('&amp;amp;')).toBe('&amp;')
  })

  it('decodes the entities a scraped page actually contains', () => {
    expect(decodeEntities('a&nbsp;b')).toBe('a b')
    expect(decodeEntities('Tom&#39;s')).toBe("Tom's")
    expect(decodeEntities('Tom&rsquo;s')).toBe("Tom's")
    expect(decodeEntities('R&amp;D')).toBe('R&D')
    expect(decodeEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeEntities('&quot;x&quot;')).toBe('"x"')
  })

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;')
  })

  it('decodes a numeric entity', () => {
    expect(decodeEntities('&#65;&#x42;')).toBe('AB')
  })
})

describe('turning html into readable text', () => {
  /*
   * js/bad-tag-filter. `<script[\s\S]*?<\/script>` misses `</script >` -- a
   * space before the bracket is legal HTML and browsers honour it -- so the
   * script BODY survived into the extracted text. A curriculum built from that
   * text would contain JavaScript.
   */
  it('removes a script element whose closing tag carries whitespace', () => {
    expect(htmlToText('a<script>var x = 1</script >b')).not.toContain('var x')
  })

  it('removes a script element with attributes', () => {
    expect(htmlToText('a<script type="text/javascript">evil()</script>b')).not.toContain('evil')
  })

  it('removes a style element the same way', () => {
    expect(htmlToText('a<style media="all">.x{color:red}</style >b')).not.toContain('color:red')
  })

  /* `<scriptfoo>` is not a script tag, and treating it as one would silently
     delete real content. The word boundary is what separates them. */
  it('does not treat a tag merely starting with "script" as one', () => {
    expect(htmlToText('<scriptured>Psalm</scriptured>')).toContain('Psalm')
  })

  it('keeps block elements on separate lines', () => {
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one\ntwo')
  })

  it('marks list items', () => {
    expect(htmlToText('<ul><li>a</li><li>b</li></ul>')).toContain('• a')
  })

  it('decodes entities in the extracted text', () => {
    expect(htmlToText('<p>R&amp;D</p>')).toBe('R&D')
  })

  it('collapses runs of spaces without eating newlines', () => {
    expect(htmlToText('<p>a    b</p><p>c</p>')).toBe('a b\nc')
  })

  it('returns nothing for nothing', () => {
    expect(htmlToText('')).toBe('')
  })
})
