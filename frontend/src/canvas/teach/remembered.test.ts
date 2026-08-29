import { describe, expect, it } from 'vitest'

import {
  NOTHING_REMEMBERED,
  forget,
  keyFor,
  recall,
  remember,
  type DraftStore,
  type Remembered,
} from './remembered'

/**
 * What survives a reload, and what a bad record may never do.
 *
 * NO jsdom AND NO GLOBAL. Every function takes its store, so these are pure
 * tests of the reading and writing rules rather than tests of an environment.
 * The default path — reaching for the real `localStorage` — is exercised where
 * it actually matters, in `TeachView.test.tsx`, against a component.
 *
 * THE HALF THAT MATTERS IS THE READING. A written record is under this code's
 * control. A record being READ is not: it may have been written by another
 * version of this file, by another tab, or by hand, and it survives a deploy.
 * Every case below that starts from a hostile string is asking the same
 * question — can a bad record reach the learner as anything other than a fresh
 * lesson.
 */

/** A store, and a window onto what it holds. Four lines, as the type intends. */
function store(seed: Record<string, string> = {}): DraftStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

/** A store where every operation raises, the way a blocked origin behaves. */
const blocked: DraftStore = {
  getItem() {
    throw new Error('site data is blocked')
  },
  setItem() {
    throw new Error('site data is blocked')
  },
  removeItem() {
    throw new Error('site data is blocked')
  },
}

const FULL: Remembered = {
  draft: 'i think it is about the base rate',
  revealed: 3,
  pending: [{ at: 0, beatId: 'beat-2', text: 'why does precision fall?', shown: ['b1'] }],
}

describe('what is remembered', () => {
  it('comes back exactly as it went in', () => {
    const disk = store()
    remember('lesson-a', FULL, disk)
    expect(recall('lesson-a', disk)).toEqual(FULL)
  })

  it('is kept per lesson, so one lesson never answers with another one\'s draft', () => {
    const disk = store()
    remember('lesson-a', FULL, disk)
    expect(recall('lesson-b', disk)).toEqual(NOTHING_REMEMBERED)
    expect(Object.keys(disk.data)).toEqual([keyFor('lesson-a')])
  })

  it('leaves nothing behind when there is nothing worth keeping', () => {
    const disk = store()
    remember('lesson-a', FULL, disk)
    remember('lesson-a', NOTHING_REMEMBERED, disk)
    expect(disk.data, 'a spent record kept a row for every lesson ever opened').toEqual({})
  })

  it('forgets on request', () => {
    const disk = store()
    remember('lesson-a', FULL, disk)
    forget('lesson-a', disk)
    expect(recall('lesson-a', disk)).toEqual(NOTHING_REMEMBERED)
  })
})

describe('a record that cannot be trusted', () => {
  it('reads as a fresh lesson when it is not JSON at all', () => {
    expect(recall('lesson-a', store({ [keyFor('lesson-a')]: '{"draft":' }))).toEqual(
      NOTHING_REMEMBERED,
    )
  })

  it('reads as a fresh lesson when it is JSON of the wrong kind', () => {
    for (const raw of ['null', '[]', '"a string"', '7', 'true']) {
      expect(recall('lesson-a', store({ [keyFor('lesson-a')]: raw })), raw).toEqual(
        NOTHING_REMEMBERED,
      )
    }
  })

  it('falls back field by field, so one bad field does not cost the others', () => {
    /* The draft is the thing the learner typed. A corrupt `revealed` must not
       take it away with it. */
    const raw = JSON.stringify({ draft: 'half a sentence', revealed: 'nine', pending: 'no' })
    expect(recall('lesson-a', store({ [keyFor('lesson-a')]: raw }))).toEqual({
      draft: 'half a sentence',
      revealed: 1,
      pending: [],
    })
  })

  it('refuses a place in the lesson that is not a whole number of beats', () => {
    for (const revealed of [0, -4, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
      const raw = JSON.stringify({ draft: '', revealed, pending: [] })
      expect(recall('lesson-a', store({ [keyFor('lesson-a')]: raw })).revealed, String(revealed)).toBe(1)
    }
  })

  it('drops only the questions that are malformed, and keeps the rest', () => {
    const raw = JSON.stringify({
      draft: '',
      revealed: 2,
      pending: [
        { at: 0, beatId: 'beat-1', text: 'a good one' },
        { at: 1, beatId: 'beat-1' },
        { at: 2, beatId: '', text: 'no beat' },
        { at: -1, beatId: 'beat-1', text: 'negative key' },
        { at: 3, beatId: 'beat-1', text: '   ' },
        'not an object',
        null,
      ],
    })
    expect(recall('lesson-a', store({ [keyFor('lesson-a')]: raw })).pending).toEqual([
      { at: 0, beatId: 'beat-1', text: 'a good one', shown: [] },
    ])
  })

  it('bounds how many questions a record may re-issue', () => {
    /*
     * THE ONE THAT COSTS MONEY. Every restored question is re-asked on mount.
     * A record holding a thousand of them -- from a hand edit, a different
     * version, or corruption -- would fire a thousand model calls the moment
     * the page opened. The view only ever writes one, so anything above the
     * bound is already evidence the record is not ours.
     */
    const many = Array.from({ length: 400 }, (_unused, index) => ({
      at: index,
      beatId: 'beat-1',
      text: `question ${index}`,
    }))
    const raw = JSON.stringify({ draft: '', revealed: 1, pending: many })
    expect(recall('lesson-a', store({ [keyFor('lesson-a')]: raw })).pending.length).toBeLessThanOrEqual(8)
  })
})

describe('a store that is not there, or refuses', () => {
  it('remembers nothing rather than throwing', () => {
    expect(recall('lesson-a', undefined)).toEqual(NOTHING_REMEMBERED)
    expect(recall('lesson-a', blocked)).toEqual(NOTHING_REMEMBERED)
  })

  it('writes nothing rather than throwing', () => {
    expect(() => remember('lesson-a', FULL, blocked)).not.toThrow()
    expect(() => remember('lesson-a', FULL, undefined)).not.toThrow()
    expect(() => forget('lesson-a', blocked)).not.toThrow()
  })

  it('ignores a lesson with no id, which is what a refused lesson has', () => {
    const disk = store()
    remember('', FULL, disk)
    expect(disk.data).toEqual({})
    expect(recall('', disk)).toEqual(NOTHING_REMEMBERED)
  })
})
