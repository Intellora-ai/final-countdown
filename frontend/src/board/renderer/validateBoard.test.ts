/* THE VALIDATOR'S CONTRACT, AS TESTS.
 *
 * Every rule the validator claims is asserted here, DOM-free. The high-value
 * assertions are the negative ones: unknown keys REFUSED (not stripped),
 * unknown types PRESERVED (not dropped), failures that still carry their
 * notices, and the five real fixtures passing with zero notices — which is
 * what keeps "repaired" meaning something.
 */
import { describe, it, expect } from 'vitest'
import { validateBoard, validatedTypes } from './validateBoard'
import { registeredTypes } from './blockRegistry'
import { ALL_BLOCK_TYPES, type BoardSource, type LearningBoard } from '../types/learningBoard'
import { CHANGE_OF_STATE_BOARD } from '../fixtures/change-of-state'
import { MATHS_QUADRATIC_BOARD } from '../fixtures/maths-quadratic'
import { HISTORY_TIMELINE_BOARD } from '../fixtures/history-timeline'
import { DATA_LESSON_BOARD } from '../fixtures/data-lesson'
import { BIOLOGY_CELL_BOARD } from '../fixtures/biology-cell'
import { EMPTY_BOARD } from '../fixtures/empty-board'
import { BROKEN_BOARD } from '../fixtures/broken-board'

function base(over: Record<string, unknown> = {}): BoardSource {
  return { type: 'learning_board', version: 1, id: 'b', title: 'T', blocks: [], ...over }
}

function block(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'x1', type: 'explanation', content: 'Some content.', ...over }
}

describe('root validation', () => {
  it('fails a non-object, a wrong type, a wrong version, a missing title and missing blocks', () => {
    expect(validateBoard(null).status).toBe('failed')
    expect(validateBoard('board').status).toBe('failed')
    expect(validateBoard(base({ type: 'dashboard' })).status).toBe('failed')
    expect(validateBoard(base({ version: 2 })).status).toBe('failed')
    expect(validateBoard(base({ title: '   ' })).status).toBe('failed')
    expect(validateBoard(base({ blocks: undefined })).status).toBe('failed')
  })

  it('refuses a board-level unknown key rather than stripping it — and says so in the notices too', () => {
    const r = validateBoard(base({ theme: 'dark' }))
    expect(r.status).toBe('failed')
    if (r.status === 'failed') {
      expect(r.error).toContain("'theme'")
      expect(r.notices.some((n) => n.message.includes("'theme'"))).toBe(true)
    }
  })

  it('collects safe root repairs BEFORE a fatal root error — the ordering contract', () => {
    const r = validateBoard(base({ layout: 'spiral', theme: 'dark' }))
    expect(r.status).toBe('failed')
    const messages = r.notices.map((n) => n.message)
    const repairIdx = messages.findIndex((m) => m.includes("'grid'"))
    const fatalIdx = messages.findIndex((m) => m.includes("'theme'"))
    expect(repairIdx).toBeGreaterThanOrEqual(0)
    expect(fatalIdx).toBeGreaterThan(repairIdx)
  })

  it('a failed board still carries the notices collected before the failure', () => {
    const r = validateBoard(base({ layout: 'circular', connectors: 'not-a-list' }))
    expect(r.status).toBe('failed')
    /* the layout repair AND the fatal itself */
    expect(r.notices.length).toBeGreaterThanOrEqual(2)
  })

  it('notice order is contractual: root repairs, root fatals, blocks in source order, connectors in source order', () => {
    const good = validateBoard(base({
      blocks: [
        { id: 'a', type: 'explanation', content: 'ok', layout: { width: 'enormous' } },
        { id: 'b', type: 'quiz', prompt: 'q?', options: [{ id: 'x', label: 'X' }] },
      ],
      connectors: [{ id: 'c', from: 'a', to: 'ghost' }],
    }))
    if (good.status === 'failed') throw new Error('unexpected fail')
    const msgs = good.notices.map((n) => n.message)
    const iWidth = msgs.findIndex((m) => m.includes('unrecognised width'))
    const iQuiz = msgs.findIndex((m) => m.includes('at least two options'))
    const iConn = msgs.findIndex((m) => m.includes("'ghost'"))
    expect(iWidth).toBeGreaterThanOrEqual(0)
    expect(iQuiz).toBeGreaterThan(iWidth)     // block a before block b
    expect(iConn).toBeGreaterThan(iQuiz)      // connectors last
  })

  it('accepts a valid empty board as ok — emptiness is a fact, not an error', () => {
    const r = validateBoard(base())
    expect(r.status).toBe('ok')
    if (r.status !== 'failed') expect(r.board.blocks).toEqual([])
  })

  it('repairs an unrecognised layout mode to grid, with a notice', () => {
    const r = validateBoard(base({ layout: 'spiral' }))
    expect(r.status).toBe('repaired')
    if (r.status !== 'failed') expect(r.board.layout).toBe('grid')
  })

  it('truncates beyond 24 blocks, with a notice naming both numbers', () => {
    const blocks = Array.from({ length: 30 }, (_, i) => block({ id: 'b' + i }))
    const r = validateBoard(base({ blocks }))
    expect(r.status).toBe('repaired')
    if (r.status !== 'failed') expect(r.board.blocks).toHaveLength(24)
    expect(r.notices.some((n) => n.message.includes('24') && n.message.includes('30'))).toBe(true)
  })
})

describe('block-level rules', () => {
  it('drops a block carrying an unknown key, naming the field — refused, not stripped', () => {
    const r = validateBoard(base({ blocks: [block({ style: { color: 'red' } })] }))
    expect(r.status).toBe('repaired')
    if (r.status !== 'failed') expect(r.board.blocks).toHaveLength(0)
    expect(r.notices.some((n) => n.message.includes("'style'"))).toBe(true)
  })

  it('preserves an unknown block type as UnknownBlockData instead of dropping it', () => {
    const r = validateBoard(base({ blocks: [{ id: 'f1', type: 'holographic_projection', title: 'X' }] }))
    expect(r.status).toBe('repaired')
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(1)
    expect(r.board.blocks[0]).toEqual({
      type: 'unknown', id: 'f1', originalType: 'holographic_projection',
      message: 'This block type is not available in this version of the board.',
    })
  })

  it('synthesizes a missing id and refuses a duplicate one', () => {
    const r = validateBoard(base({ blocks: [block({ id: undefined }), block({ id: 'dup' }), block({ id: 'dup' })] }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(2)
    expect(r.board.blocks[0].id).toBe('explanation-1')
    expect(r.notices.some((n) => n.message.includes('unique'))).toBe(true)
  })

  it('repairs an invalid width hint to the default, and refuses unknown layout keys', () => {
    const r1 = validateBoard(base({ blocks: [block({ layout: { width: 'enormous' } })] }))
    if (r1.status === 'failed') throw new Error('unexpected fail')
    expect(r1.board.blocks[0]).not.toHaveProperty('layout')
    const r2 = validateBoard(base({ blocks: [block({ layout: { width: 'wide', x: 40 } })] }))
    expect(r2.notices.some((n) => n.message.includes("'x'"))).toBe(true)
  })

  it('pads and trims ragged table rows, and truncates past 50 rows with the counting notice', () => {
    const r = validateBoard(base({
      blocks: [{
        id: 't', type: 'table', columns: ['A', 'B'],
        rows: [...Array.from({ length: 60 }, () => ['1']), ['1', '2', '3']],
      }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const t = r.board.blocks[0]
    if (t.type !== 'table') throw new Error('expected table')
    expect(t.rows).toHaveLength(50)
    expect(t.rows[0]).toEqual(['1', '—'])
    expect(r.notices.some((n) => n.message === 'Showing 50 of 61 rows.')).toBe(true)
  })

  it('drops quizzes that cannot be answered: one option, or no correct flag', () => {
    const one = validateBoard(base({ blocks: [{ id: 'q', type: 'quiz', prompt: 'P?', options: [{ id: 'a', label: 'A' }] }] }))
    if (one.status === 'failed') throw new Error('unexpected fail')
    expect(one.board.blocks).toHaveLength(0)
    const none = validateBoard(base({ blocks: [{ id: 'q', type: 'quiz', prompt: 'P?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }))
    if (none.status === 'failed') throw new Error('unexpected fail')
    expect(none.board.blocks).toHaveLength(0)
  })

  it('rejects a simulation that is not kelvin — P ∝ T is false in celsius', () => {
    const r = validateBoard(base({ blocks: [{ id: 's', type: 'simulation', kind: 'particle-box', unit: 'C', minTemp: 0, maxTemp: 100, initialTemp: 20 }] }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(0)
    expect(r.notices.some((n) => n.message.includes('kelvin'))).toBe(true)
  })
})

describe('image sources', () => {
  const img = (src: unknown, alt: unknown = 'described') =>
    validateBoard(base({ blocks: [{ id: 'i', type: 'image', src, alt }] }))

  it('accepts data:image URIs, relative paths and bare asset names', () => {
    for (const src of ['data:image/svg+xml,abc', './local.png', 'assets/x.png', 'x.png']) {
      const r = img(src)
      if (r.status === 'failed') throw new Error('unexpected fail')
      expect(r.board.blocks, src).toHaveLength(1)
    }
  })

  it('refuses external, protocol-relative and javascript sources', () => {
    for (const src of ['https://example.com/x.png', 'http://example.com/x.png', '//cdn.example.com/x.png', 'javascript:alert(1)', 'data:text/html,<script>']) {
      const r = img(src)
      if (r.status === 'failed') throw new Error('unexpected fail')
      expect(r.board.blocks, src).toHaveLength(0)
    }
  })

  it('drops an image without alt text — describability is not optional', () => {
    const r = img('data:image/svg+xml,abc', '   ')
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(0)
    expect(r.notices.some((n) => n.message.includes('alt'))).toBe(true)
  })
})

describe('chart edge cases', () => {
  it('drops an empty chart with a notice', () => {
    const r = validateBoard(base({ blocks: [{ id: 'c', type: 'pie_chart', data: [] }] }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(0)
  })

  it('falls back to a table when every pie value is unusable, with the promised notice', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'pie_chart', title: 'Broken', data: [
        { label: 'NaN', value: Number.NaN },
        { label: 'Negative', value: -1 },
      ] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const t = r.board.blocks[0]
    if (t.type !== 'table') throw new Error('expected a table fallback')
    expect(r.notices.some((n) => n.message === 'Chart data was incomplete, so a table is shown.')).toBe(true)
    /* NaN reaches the table as an em-dash, and a negative — unusable in a pie,
     * but a real reading — is kept as the number it is. */
    expect(t.rows).toEqual([['NaN', '—'], ['Negative', -1]])
  })

  it('keeps valid points and drops invalid ones with a notice', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', points: [
        { x: 0, y: 1 }, { x: 1, y: Number.POSITIVE_INFINITY }, { x: 2, y: 3 },
      ] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const c = r.board.blocks[0]
    if (c.type !== 'line_chart') throw new Error('expected line_chart')
    expect(c.points).toHaveLength(2)
  })

  it('truncates an over-long string and says so — the cap had no test until now', () => {
    /* MAX_STRING is 4000. A board that ships 5000 characters keeps the first
     * 4000 and the learner is told, rather than quietly reading a sentence
     * that stops mid-word for no stated reason. */
    const long = 'a'.repeat(5000)
    const r = validateBoard(base({ blocks: [{ id: 'e', type: 'explanation', content: long }] }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const e = r.board.blocks[0]
    if (e.type !== 'explanation') throw new Error('expected explanation')
    expect(e.content).toHaveLength(4000)
    expect(r.status).toBe('repaired')
    expect(r.notices.some((n) => n.message === 'An explanation was truncated to 4000 characters.')).toBe(true)
  })

  it('leaves a string exactly at the cap alone', () => {
    const exact = 'b'.repeat(4000)
    const r = validateBoard(base({ blocks: [{ id: 'e', type: 'explanation', content: exact }] }))
    expect(r.status).toBe('ok')
    expect(r.notices).toEqual([])
  })

  it('falls back to a table when every line y is unusable, keeping the labels', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', title: 'Readings', xLabel: 'Hour', yLabel: 'Temp',
        points: [
          { x: 'Mon', y: Number.NaN },
          { x: 'Tue', y: 'warm' },
        ] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const t = r.board.blocks[0]
    if (t.type !== 'table') throw new Error('expected a table fallback')
    /* The axis labels become the column headings — the learner keeps the
     * meaning of each column, not just the values. NaN is shown as an
     * em-dash: "NaN" is a floating-point term, not a reading. */
    expect(t.columns).toEqual(['Hour', 'Temp'])
    expect(t.rows).toEqual([['Mon', '—'], ['Tue', 'warm']])
    expect(r.notices.some((n) => n.message === 'Chart data was incomplete, so a table is shown.')).toBe(true)
  })

  it('names the columns X and Y when a broken line chart declared no axis labels', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', points: [{ x: 1, y: null }] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const t = r.board.blocks[0]
    if (t.type !== 'table') throw new Error('expected a table fallback')
    expect(t.columns).toEqual(['X', 'Y'])
  })

  it('omits a line chart whose points have no readable x at all', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', points: [{ y: 1 }, { nope: true }] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    /* Nothing survives that a table could show: no labels, no values. */
    expect(r.board.blocks).toHaveLength(0)
    expect(r.notices.some((n) => n.message === 'A chart had no usable data and was omitted.')).toBe(true)
  })

  it('does not apply a highlight to a line chart that became a table', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', highlightIndex: 0, points: [{ x: 'a', y: Number.NaN }] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const t = r.board.blocks[0]
    expect(t.type).toBe('table')
    /* The fallback returns before the highlight check, so no notice claims a
     * highlight was removed from a chart that no longer exists. */
    expect(r.notices.some((n) => n.message === 'A chart highlight pointed at a missing point and was removed.')).toBe(false)
  })

  it('accepts negatives in bar charts and a single line point — both are legal charts', () => {
    const bar = validateBoard(base({ blocks: [{ id: 'b', type: 'bar_chart', data: [{ label: 'loss', value: -5 }, { label: 'gain', value: 5 }] }] }))
    expect(bar.status).toBe('ok')
    const line = validateBoard(base({ blocks: [{ id: 'l', type: 'line_chart', points: [{ x: 0, y: 7 }] }] }))
    expect(line.status).toBe('ok')
  })

  it('removes a highlight that points at a dropped point', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'line_chart', highlightIndex: 5, points: [{ x: 0, y: 1 }] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const c = r.board.blocks[0]
    if (c.type !== 'line_chart') throw new Error('expected line_chart')
    expect(c).not.toHaveProperty('highlightIndex')
  })

  it('shortens an unreadably long chart label', () => {
    const r = validateBoard(base({
      blocks: [{ id: 'c', type: 'pie_chart', data: [{ label: 'x'.repeat(100), value: 5 }] }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    const c = r.board.blocks[0]
    if (c.type !== 'pie_chart') throw new Error('expected pie_chart')
    expect(c.data[0].label.length).toBeLessThanOrEqual(60)
    expect(c.data[0].label.endsWith('…')).toBe(true)
  })
})

describe('connectors', () => {
  it('keeps a connector whose ends exist and removes a dangling one, naming the route', () => {
    const r = validateBoard(base({
      blocks: [block({ id: 'a' }), block({ id: 'b' })],
      connectors: [
        { id: 'ok', from: 'a', to: 'b', kind: 'reference' },
        { id: 'bad', from: 'a', to: 'ghost' },
      ],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.connectors).toHaveLength(1)
    expect(r.notices.some((n) => n.message.includes("'ghost'"))).toBe(true)
  })

  it('refuses unknown connector keys and downgrades unknown kinds', () => {
    const r = validateBoard(base({
      blocks: [block({ id: 'a' }), block({ id: 'b' })],
      connectors: [
        { id: 'c1', from: 'a', to: 'b', colour: 'red' },
        { id: 'c2', from: 'a', to: 'b', kind: 'mystical' },
      ],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.connectors).toHaveLength(1)
    expect(r.board.connectors![0]).not.toHaveProperty('kind')
  })
})

describe('presentation smuggling — known schemas', () => {
  const KEYS = ['html', 'component', 'dangerouslySetInnerHTML', 'className', 'css', 'font', 'color']
  it.each(KEYS)("drops a known block carrying '%s' and names the field", (key) => {
    const r = validateBoard(base({ blocks: [block({ [key]: 'payload' })] }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks).toHaveLength(0)
    expect(r.notices.some((n) => n.message.includes(`'${key}'`))).toBe(true)
  })
})

describe('presentation smuggling — unknown types', () => {
  it('an unknown type is reduced to id/originalType/message; NO payload survives in any form', () => {
    const r = validateBoard(base({
      blocks: [{
        id: 'u1', type: 'hologram',
        html: '<script>alert(1)</script>', css: 'body{}', style: { color: 'red' },
        component: 'Evil', payload: { deep: { nested: 'data' } },
      }],
    }))
    if (r.status === 'failed') throw new Error('unexpected fail')
    expect(r.board.blocks[0]).toEqual({
      id: 'u1', type: 'unknown', originalType: 'hologram',
      message: 'This block type is not available in this version of the board.',
    })
    /* Nothing from the payload is reachable anywhere in the validated board. */
    expect(JSON.stringify(r.board)).not.toContain('script')
    expect(JSON.stringify(r.board)).not.toContain('Evil')
    expect(JSON.stringify(r.board)).not.toContain('nested')
  })
})

describe('the invalid-board fixture', () => {
  it('fails with BOTH notices — the repair collected first, the fatal second — and no board', async () => {
    const { INVALID_BOARD } = await import('../fixtures/invalid-board')
    const r = validateBoard(INVALID_BOARD)
    expect(r.status).toBe('failed')
    if (r.status !== 'failed') return
    const msgs = r.notices.map((n) => n.message)
    expect(msgs.findIndex((m) => m.includes("'grid'"))).toBe(0)
    expect(msgs.findIndex((m) => m.includes("'theme'"))).toBe(1)
    expect(r.error).toContain("'theme'")
  })
})

/* The per-fixture sweep — "validates with zero notices", "is labelled
 * fixture", "the registry can draw every block" — moved to
 * fixtures/fixtures.test.ts, where it iterates the MANIFEST. It used to be a
 * hand-written list of five boards here, which meant a sixth fixture could be
 * added and covered by nothing while this file still went green.
 *
 * What stays below are the checks that need a specific board and specific
 * expected wording: the empty state, the nine planted faults, the root
 * refusal, and the block-type breadth of the reference board. A generic loop
 * cannot assert those messages, and asserting them is the point. */
describe('the fixtures', () => {
  it('the empty board validates ok with zero blocks', () => {
    const r = validateBoard(EMPTY_BOARD as BoardSource)
    expect(r.status).toBe('ok')
    if (r.status !== 'failed') expect(r.board.blocks).toHaveLength(0)
  })

  it('the broken board is repaired, renders something, and reports every planted fault', () => {
    const r = validateBoard(BROKEN_BOARD)
    expect(r.status).toBe('repaired')
    if (r.status === 'failed') throw new Error('unexpected fail')
    /* Survivors: repaired explanation, preserved unknown, repaired table,
     * chart-as-table. Dropped: styled callout, duplicate-id callout, external
     * image, alt-less image, one-option quiz. */
    expect(r.board.blocks.map((b) => b.type).sort()).toEqual(['explanation', 'table', 'table', 'unknown'])
    /* The valid connector survives; the dangling one is gone. */
    expect(r.board.connectors).toHaveLength(1)
    const messages = r.notices.map((n) => n.message).join(' | ')
    for (const fragment of [
      "no id", "'style'", "holographic_projection", 'did not match the columns',
      'a table is shown', 'external or unsafe', 'at least two options', "'ghost-block'",
      'ids must be unique', 'alt text',
    ]) {
      expect(messages).toContain(fragment)
    }
  })

  it('the reference fixture composes at least seven distinct representations', () => {
    const kinds = new Set(CHANGE_OF_STATE_BOARD.blocks.map((b) => b.type))
    expect(kinds.size).toBeGreaterThanOrEqual(7)
    expect(CHANGE_OF_STATE_BOARD.connectors!.length).toBeGreaterThanOrEqual(2)
  })
})

describe('parity — validator, registry, catalogue', () => {
  it('the validator map, the registry and ALL_BLOCK_TYPES agree exactly', () => {
    expect(validatedTypes().sort()).toEqual([...ALL_BLOCK_TYPES].sort())
    expect(registeredTypes().sort()).toEqual([...ALL_BLOCK_TYPES].sort())
  })
})
