import { describe, expect, it } from 'vitest'

import {
  addNode,
  build,
  EMPTY_WORLD,
  explain,
  extract,
  impactOf,
  inconsistencies,
  prerequisitesOf,
  reach,
  relate,
  type Relation,
} from './world'

const rel = (from: string, kind: Relation['kind'], to: string): Relation => ({
  from, kind, to, strength: 0.8, because: 'test',
})

describe('extraction reads direction from the sentence', () => {
  it('reads "A causes B" forwards', () => {
    const [r] = extract('heating causes expansion.')
    expect(r?.from).toBe('heating')
    expect(r?.to).toBe('expansion')
    expect(r?.kind).toBe('causes')
  })

  it('reads "A is caused by B" BACKWARDS', () => {
    /* Direction is the part that is easy to get wrong and expensive when
       wrong: reasoning will act on either reading. */
    const [r] = extract('expansion is caused by heating.')
    expect(r?.from).toBe('heating')
    expect(r?.to).toBe('expansion')
  })

  it('reads "A consists of B" as B part-of A', () => {
    const [r] = extract('an atom consists of protons.')
    expect(r?.kind).toBe('part-of')
    expect(r?.from).toBe('protons')
    expect(r?.to).toBe('atom')
  })

  it.each([
    ['pressure depends on temperature.', 'depends-on'],
    ['vaccination prevents infection.', 'prevents'],
    ['a catalyst enables the reaction.', 'enables'],
    ['budget constrains scope.', 'constrains'],
    ['fermentation precedes distillation.', 'precedes'],
    ['a sparrow is similar to a robin.', 'similar-to'],
    ['LIFO differs from FIFO.', 'differs-from'],
  ])('reads %s as %s', (text, kind) => {
    expect(extract(text)[0]?.kind).toBe(kind)
  })

  it('splits on sentence boundaries before matching', () => {
    /* A greedy pattern over a paragraph captures half of one sentence and half
       of the next, relating two things never mentioned together. */
    const rs = extract('Heating causes expansion. Pressure depends on volume.')
    expect(rs).toHaveLength(2)
    expect(rs[0]?.to).toBe('expansion')
    expect(rs[1]?.from).toBe('pressure')
  })

  it('takes only the first relation per clause', () => {
    /* Several patterns fire on "A causes B because C"; taking them all
       produces overlapping, wrong pairs. */
    expect(extract('heating causes expansion because of kinetic energy.')).toHaveLength(1)
  })

  it('finds nothing in prose with no relations', () => {
    expect(extract('The sky was a pleasant colour that afternoon.')).toEqual([])
  })

  it('does not blow up on a long clause with no sentence terminator', () => {
    /* CATASTROPHIC BACKTRACKING, MEASURED.
     *
     * Every pattern here is `(.+?)\s+verb\s+(.+)` --- unbounded captures on
     * BOTH sides of a literal. When the literal is absent the engine tries
     * every split point, and `extract` only splits on sentence terminators, so
     * a clause with no full stop is unbounded input to that.
     *
     * Timed before the fix, on text a user could paste:
     *     2,000 clauses ->     909ms
     *     8,000 clauses ->  15,076ms
     *    20,000 clauses -> 100,340ms
     *
     * That is a denial of service on user-controlled text, in a function that
     * runs on every turn. The budget below is deliberately generous --- the
     * failure mode is 100 SECONDS, so anything near a second still catches it. */
    const hostile = 'why does '.repeat(20000)
    const started = Date.now()
    expect(() => extract(hostile)).not.toThrow()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('the fast pre-filter never rejects a clause a pattern would have matched', () => {
    /* THE RISK THE PRE-FILTER INTRODUCES.
     *
     * `extract` now rejects clauses with no relation verb before trying the
     * twenty patterns --- that is what took 20,000 hostile clauses from 17.5s
     * to nothing. But the filter is a SECOND list of verbs, and a second list
     * drifts: a verb added to a pattern and forgotten here means that relation
     * silently stops being extracted, with no error and no failing test
     * anywhere else.
     *
     * So every relation kind is exercised through the real `extract`. This
     * fails the moment the two lists disagree in the direction that loses
     * data. */
    const sentences: [string, string][] = [
      ['heating causes expansion.', 'causes'],
      ['debt leads to default.', 'causes'],
      ['friction results in heat.', 'causes'],
      ['expansion is caused by heating.', 'causes'],
      ['the delay is due to traffic.', 'causes'],
      ['pressure depends on temperature.', 'depends-on'],
      ['baking requires flour.', 'depends-on'],
      ['rainfall affects yield.', 'affects'],
      ['weather influences turnout.', 'affects'],
      ['vaccination prevents infection.', 'prevents'],
      ['firewall blocks traffic.', 'prevents'],
      ['a catalyst enables the reaction.', 'enables'],
      ['the licence allows redistribution.', 'enables'],
      ['budget constrains scope.', 'constrains'],
      ['bandwidth limits throughput.', 'constrains'],
      ['fermentation precedes distillation.', 'precedes'],
      ['the engine is part of the car.', 'part-of'],
      ['an atom consists of protons.', 'part-of'],
      ['a sparrow is similar to a robin.', 'similar-to'],
      ['LIFO differs from FIFO.', 'differs-from'],
    ]
    for (const [sentence, kind] of sentences) {
      const found = extract(sentence)
      expect(found.length, `pre-filter or pattern dropped: "${sentence}"`).toBe(1)
      expect(found[0]?.kind, sentence).toBe(kind)
    }
  })

  it('still extracts from a long clause that DOES contain a relation', () => {
    /* The fix must bound the work, not silently stop reading real input. */
    const padded = `${'context word '.repeat(200)}heating causes expansion.`
    expect(extract(padded).some((r) => r.kind === 'causes')).toBe(true)
  })
})

describe('the graph answers questions a pile of sentences cannot', () => {
  const w = build(
    'heating causes molecular motion. molecular motion causes collisions. collisions cause pressure. pressure depends on volume.',
  )

  it('chains causes transitively', () => {
    expect(reach(w, 'heating', 'causes')).toContain('pressure')
  })

  it('gives the shortest causal explanation', () => {
    /* Breadth-first, because a longer chain to the same place is a worse
       explanation of it. */
    expect(explain(w, 'heating', 'pressure')).toEqual([
      'heating', 'molecular motion', 'collisions', 'pressure',
    ])
  })

  it('returns null when there is no causal path', () => {
    expect(explain(w, 'volume', 'heating')).toBeNull()
  })

  it('does NOT chain similarity', () => {
    /* Chaining it is how a graph drifts from "sparrow is like a robin" to
       "sparrow is like an aeroplane" in four hops. */
    const s = build('a sparrow is similar to a robin. a robin is similar to an eagle. an eagle is similar to a plane.')
    expect(reach(s, 'sparrow', 'similar-to')).not.toContain('plane')
    expect(reach(s, 'sparrow', 'similar-to')).toContain('robin')
  })

  it('treats similarity as symmetric', () => {
    const s = build('LIFO is similar to a stack.')
    expect(reach(s, 'stack', 'similar-to')).toContain('lifo')
  })
})

describe('impact: what breaks if this changes', () => {
  it('follows causes, affects, enables and constrains', () => {
    const w = build('heating causes expansion. expansion affects density.')
    expect(impactOf(w, 'heating')).toEqual(expect.arrayContaining(['expansion', 'density']))
  })

  it('follows depends-on BACKWARDS', () => {
    /* If B depends on A, changing A hits B. Following the edge forwards would
       report what A needs, which is the opposite question. */
    const w = relate(EMPTY_WORLD, rel('report', 'depends-on', 'database'))
    expect(impactOf(w, 'database')).toContain('report')
    expect(impactOf(w, 'report')).not.toContain('database')
  })

  it('reports nothing for an isolated node', () => {
    expect(impactOf(addNode(EMPTY_WORLD, { id: 'x', label: 'x', kind: 'entity', attributes: {} }), 'x')).toEqual([])
  })
})

describe('prerequisites: what must hold first', () => {
  it('follows depends-on forwards and precedes backwards', () => {
    let w = relate(EMPTY_WORLD, rel('integration', 'depends-on', 'limits'))
    w = relate(w, rel('algebra', 'precedes', 'integration'))
    const pre = prerequisitesOf(w, 'integration')
    expect(pre).toContain('limits')
    expect(pre).toContain('algebra')
  })
})

describe('inconsistency detection', () => {
  it('catches enables and prevents on the same pair', () => {
    let w = relate(EMPTY_WORLD, rel('catalyst', 'enables', 'reaction'))
    w = relate(w, rel('catalyst', 'prevents', 'reaction'))
    const found = inconsistencies(w)
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain('both')
    expect(found[0]?.relations).toHaveLength(2)
  })

  it('catches similar-to and differs-from in EITHER direction', () => {
    /* Both are symmetric, so the clash holds whichever way round it was
       stated. */
    let w = relate(EMPTY_WORLD, rel('lifo', 'similar-to', 'fifo'))
    w = relate(w, rel('fifo', 'differs-from', 'lifo'))
    expect(inconsistencies(w).length).toBeGreaterThan(0)
  })

  it('reports a causal cycle as feedback rather than as an error', () => {
    /* Feedback loops are real. What is wrong is treating one as a plain
       chain, so it is surfaced to be looked at, not rejected. */
    let w = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    w = relate(w, rel('b', 'causes', 'a'))
    const found = inconsistencies(w)
    expect(found.some((i) => i.message.includes('feedback'))).toBe(true)
  })

  it('a causal cycle does not hang the transitive walk', () => {
    let w = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    w = relate(w, rel('b', 'causes', 'a'))
    expect(() => reach(w, 'a', 'causes')).not.toThrow()
  })

  it('finds nothing wrong with a consistent graph', () => {
    expect(inconsistencies(build('heating causes expansion. expansion affects density.'))).toEqual([])
  })
})

describe('building the graph', () => {
  it('creates the nodes a relation refers to', () => {
    const w = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    expect(w.nodes.has('a')).toBe(true)
    expect(w.nodes.has('b')).toBe(true)
  })

  it('MERGES attributes rather than clobbering the node', () => {
    /* Two statements about one thing are two facts about one thing. */
    let w = addNode(EMPTY_WORLD, { id: 'gas', label: 'gas', kind: 'entity', attributes: { state: 'gaseous' } })
    w = addNode(w, { id: 'gas', label: 'gas', kind: 'entity', attributes: { compressible: 'yes' } })
    expect(w.nodes.get('gas')?.attributes).toEqual({ state: 'gaseous', compressible: 'yes' })
  })

  it('reinforces a repeated relation instead of duplicating it', () => {
    let w = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    w = relate(w, rel('a', 'causes', 'b'))
    expect(w.relations).toHaveLength(1)
    expect(w.relations[0]?.strength).toBeGreaterThan(0.8)
  })

  it('keeps two different relations between the same pair', () => {
    let w = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    w = relate(w, rel('a', 'precedes', 'b'))
    expect(w.relations).toHaveLength(2)
  })

  it('never mutates the world it was given', () => {
    const before = relate(EMPTY_WORLD, rel('a', 'causes', 'b'))
    const snapshot = before.relations.length
    relate(before, rel('b', 'causes', 'c'))
    expect(before.relations).toHaveLength(snapshot)
  })

  it('traces every relation back to the sentence that produced it', () => {
    /* An inference with no provenance cannot be argued with. */
    for (const r of build('heating causes expansion.').relations) {
      expect(r.because).toContain('stated')
    }
  })
})
