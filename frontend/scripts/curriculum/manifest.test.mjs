/* Tests for manifest.mjs — the list of official syllabus documents.
 *
 * DESIRED OUTCOME
 *   Every document the curriculum is built from is an official board
 *   publication, named once, fetched safely, and attributable to a class.
 *
 * WHAT MUST BE TRUE
 *   1. Every source is served over https from the official CBSE academic host.
 *      A coaching site's summary is not a syllabus.
 *   2. Every slug is filename-safe, so fetch.mjs can never be talked into
 *      writing outside its output directory.
 *   3. Slugs are unique. A duplicate silently overwrites another subject's PDF.
 *   4. Every source declares which classes it covers, so a Class 9 student is
 *      never planned against a Class 12 document.
 *   5. The core academic subjects a student can actually pick are all present.
 */

import { describe, expect, it } from 'vitest'
import { MANIFEST } from './manifest.mjs'

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/
const VALID_CLASSES = [9, 10, 11, 12]

describe('the manifest is official and safe', () => {
  it('is not empty', () => {
    expect(MANIFEST.length).toBeGreaterThan(0)
  })

  it('serves every source over https from cbseacademic.nic.in', () => {
    const offHost = MANIFEST
      .filter((s) => !s.url.startsWith('https://cbseacademic.nic.in/'))
      .map((s) => `${s.slug} -> ${s.url}`)
    expect(offHost).toEqual([])
  })

  it('gives every source a filename-safe slug', () => {
    const unsafe = MANIFEST.filter((s) => !SAFE_SLUG.test(s.slug)).map((s) => s.slug)
    expect(unsafe).toEqual([])
  })

  it('gives every source a unique slug', () => {
    const seen = new Map()
    const dupes = []
    for (const s of MANIFEST) {
      if (seen.has(s.slug)) dupes.push(s.slug)
      seen.set(s.slug, true)
    }
    expect(dupes).toEqual([])
  })

  it('points every source at a 2026-27 curriculum PDF', () => {
    const wrongYear = MANIFEST
      .filter((s) => !s.url.endsWith('_2026-27.pdf'))
      .map((s) => `${s.slug} -> ${s.url}`)
    expect(wrongYear).toEqual([])
  })
})

describe('every source is attributable to a class', () => {
  it('declares a non-empty classes array on every source', () => {
    const missing = MANIFEST.filter((s) => !Array.isArray(s.classes) || s.classes.length === 0)
    expect(missing.map((s) => s.slug)).toEqual([])
  })

  it('uses only classes 9, 10, 11 and 12', () => {
    const bad = []
    for (const s of MANIFEST) {
      for (const c of s.classes ?? []) {
        if (!VALID_CLASSES.includes(c)) bad.push(`${s.slug}: ${c}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('names a human-readable subject on every source', () => {
    const missing = MANIFEST.filter((s) => typeof s.subject !== 'string' || s.subject.length === 0)
    expect(missing.map((s) => s.slug)).toEqual([])
  })
})

describe('coverage of the subjects a student can pick', () => {
  const slugs = () => MANIFEST.map((s) => s.slug)

  it('covers the Class 9 and 10 core: maths, science, social science, english', () => {
    for (const slug of ['maths-ix', 'maths-x', 'science-x', 'social-science-ix', 'social-science-x', 'english-ix', 'english-x']) {
      expect(slugs()).toContain(slug)
    }
  })

  it('covers the Class 11 and 12 sciences: physics, chemistry, biology, maths', () => {
    for (const slug of ['physics', 'chemistry', 'biology', 'maths-senior']) {
      expect(slugs()).toContain(slug)
    }
  })

  it('covers the Class 11 and 12 commerce stream: accountancy, business studies, economics', () => {
    for (const slug of ['accountancy', 'business-studies', 'economics', 'applied-maths']) {
      expect(slugs()).toContain(slug)
    }
  })

  it('covers the Class 11 and 12 humanities stream: history, geography, political science', () => {
    for (const slug of ['history', 'geography', 'political-science', 'sociology', 'psychology']) {
      expect(slugs()).toContain(slug)
    }
  })

  it('covers legal studies, because CLAT candidates take it', () => {
    expect(slugs()).toContain('legal-studies')
  })

  it('covers computer science and informatics practices', () => {
    expect(slugs()).toContain('computer-science')
    expect(slugs()).toContain('informatics-practices')
  })
})
