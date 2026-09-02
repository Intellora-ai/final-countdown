// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { loadTeachProgress, resetTeachProgress, saveTeachProgress, type TeachProgress } from './teachStore'

/**
 * ONE MEMORY PER TOPIC, IN THIS BROWSER TOO.
 *
 * `teachStore` kept ONE record under ONE key: learn physics, then civics, and
 * the physics progress was gone. `server/memory/key.ts` names that as the
 * defect the server store exists to fix -- and the browser copy has to keep
 * the same promise, or the "fast copy" forgets what the truth remembers.
 *
 * The old file's own worry -- "a per-lesson key would grow localStorage
 * without bound" -- is answered with a cap, not by forgetting on purpose.
 */

const progress = (lessonId: string, revealed = 1): TeachProgress => ({
  lessonId, revealed, asked: [], draft: '', questionsAsked: 0, emptyAnswers: 0, struggleReported: false,
})

afterEach(() => resetTeachProgress())

describe('progress is kept per lesson', () => {
  it('remembers lesson A after lesson B was studied', () => {
    saveTeachProgress(progress('physics', 3))
    saveTeachProgress(progress('civics', 1))
    expect(loadTeachProgress('physics')?.revealed, 'studying civics erased physics').toBe(3)
    expect(loadTeachProgress('civics')?.revealed).toBe(1)
  })

  it('keeps the most recent lessons and lets the oldest go, so storage cannot grow without bound', () => {
    for (let n = 1; n <= 45; n += 1) saveTeachProgress(progress(`lesson-${n}`, n))
    expect(loadTeachProgress('lesson-45')?.revealed).toBe(45)
    expect(loadTeachProgress('lesson-6')?.revealed).toBe(6)
    expect(loadTeachProgress('lesson-1'), 'the oldest lesson was kept forever').toBeNull()
  })

  it('still answers nothing for a lesson never studied', () => {
    saveTeachProgress(progress('physics', 2))
    expect(loadTeachProgress('chemistry')).toBeNull()
  })
})
