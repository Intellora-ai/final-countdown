import { describe, expect, it } from 'vitest'
import { offTopic } from './websearch/select'
import { scopedQuery } from './canvas/teach/level'
import { interpret } from './websearch/interpret'
import { CLASS_9 } from './data/curriculum/class9'
import { CLASS_10 } from './data/curriculum/class10'
import { CLASS_11 } from './data/curriculum/class11'
import { CLASS_12 } from './data/curriculum/class12'

const ALL = [
  ['9', CLASS_9], ['10', CLASS_10], ['11', CLASS_11], ['12', CLASS_12],
] as const

function names(subjects: any[]): string[] {
  const out: string[] = []
  for (const s of subjects) for (const c of s.chapters) for (const k of c.concepts) out.push(k.name)
  return out
}

const PORN = { url: 'https://example.test/a', title: 'XNXX Adult Forum', snippet: '' } as any

describe('measure', () => {
  it('bare concept names that disable offTopic', () => {
    const bad: string[] = []
    let total = 0
    for (const [, subs] of ALL) {
      for (const n of names(subs as any)) {
        total++
        if (offTopic(PORN, interpret(n)) === undefined) bad.push(n)
      }
    }
    console.log('TOTAL_CONCEPTS', total)
    console.log('BARE_DISABLED_COUNT', bad.length)
    console.log('BARE_DISABLED', JSON.stringify([...new Set(bad)].slice(0, 60)))
    expect(true).toBe(true)
  })

  it('scoped (real canvas path) concept names that disable offTopic', () => {
    const bad: string[] = []
    for (const [cls, subs] of ALL) {
      for (const n of names(subs as any)) {
        const q = scopedQuery(n, null, cls)
        if (offTopic(PORN, interpret(q)) === undefined) bad.push(`${cls}: ${n} -> ${q}`)
      }
    }
    console.log('SCOPED_DISABLED_COUNT', bad.length)
    console.log('SCOPED_DISABLED', JSON.stringify([...new Set(bad)].slice(0, 60)))
    expect(true).toBe(true)
  })
})
