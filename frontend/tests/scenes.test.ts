import { describe, expect, it } from 'vitest'
import { lessonSchema } from '../src/lesson'

// Each case exercises a different scene shape, position, label, and color.
// This tests the public lesson contract rather than implementation details.
describe('native SVG scene contract', () => {
  for (let index = 0; index < 100; index++) {
    it(`accepts unique scene ${index + 1}`, () => {
      const x = 40 + (index % 10) * 90
      const y = 40 + Math.floor(index / 10) * 65
      const color = `#${((index * 2654435761) >>> 0).toString(16).padStart(8, '0').slice(-6)}`
      const type: 'rect' | 'circle' | 'line' | 'text' = index % 4 === 0 ? 'rect' : index % 4 === 1 ? 'circle' : index % 4 === 2 ? 'line' : 'text'
      const element = type === 'rect'
        ? { type, x, y, width: 100 + index, height: 40 + index % 20, label: `Box ${index}`, color }
        : type === 'circle'
          ? { type, x, y, radius: 12 + index % 30, label: `Point ${index}`, color }
          : type === 'line'
            ? { type, x1: x, y1: y, x2: x + 80, y2: y + 20, label: `Link ${index}`, color }
            : { type, x, y, label: `Text ${index}`, color }
      const lesson = lessonSchema.parse({ title: `Scene ${index}`, explanation: 'A validated visual scene.', blocks: [{ kind: 'scene', title: `Unique scene ${index}`, width: 1200, height: 800, elements: [element] }] })
      expect(lesson.blocks[0]).toMatchObject({ kind: 'scene', title: `Unique scene ${index}` })
    })
  }
})
