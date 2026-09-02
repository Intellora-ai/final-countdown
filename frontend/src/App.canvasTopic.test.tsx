// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { HashRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CURRICULUM_MODULE from './data/curriculum'

/**
 * `#/canvas/<topicId>` IS THAT TOPIC'S CANVAS.
 *
 * The canvas is mocked, exactly as `App.canvasReachable.test.tsx` mocks it:
 * this proves the ROUTING -- that the app turns an address into a named topic
 * and hands it to the canvas -- not the canvas. The name matters because the
 * canvas teaches from the name; the id alone would ask the model to teach a
 * database key.
 */

const REAL_CLASS = CURRICULUM_MODULE.classes[0]

vi.mock('./canvas/CanvasRoute', () => ({
  default: (props: { topic?: { id: string; name: string | null } | null; classId?: string | null }) => (
    <div
      data-testid="the-canvas"
      data-topic-id={props.topic?.id ?? ''}
      data-topic-name={props.topic?.name ?? ''}
      data-class-id={props.classId ?? ''}
    >
      canvas
    </div>
  ),
}))

async function openAt(route: (planned: ReturnType<typeof import('./almanac/plannedCurriculum').plannedSubjects>) => string) {
  vi.resetModules()
  const { primePlannedCurriculum, plannedSubjects } = await import('./almanac/plannedCurriculum')
  await primePlannedCurriculum(REAL_CLASS)
  const planned = plannedSubjects(REAL_CLASS)
  window.location.hash = route(planned)
  const { store } = await import('./data/store')
  await store.init({
    load: () =>
      Promise.resolve({
        students: {
          stu: {
            id: 'stu', name: 'T', avatarHue: 0, cls: REAL_CLASS, stream: null,
            subjects: planned.slice(0, 2).map((s) => s.id), minutes: 120, deadlines: {}, createdAt: 1, lastActiveAt: 1,
          },
        },
        progress: { stu: {} }, activity: { stu: [] }, currentId: 'stu',
      } as never),
    subscribe: () => () => {},
    commit: () => Promise.resolve(),
    close: () => {},
  })
  const { default: App } = await import('./App')
  render(<HashRouter><App /></HashRouter>)
  return planned
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('a topic has its own canvas', () => {
  it('opens #/canvas/<topicId> as the canvas for that topic, by name', async () => {
    let topic = { id: '', name: '' }
    await openAt((planned) => {
      topic = planned[0]!.chapters[0]!.concepts[0]!
      return `#/canvas/${topic.id}`
    })
    const canvas = await screen.findByTestId('the-canvas')
    expect(canvas).toHaveAttribute('data-topic-id', topic.id)
    expect(canvas).toHaveAttribute('data-topic-name', topic.name)
  })

  it('still opens the canvas for a topic this device does not know, with the id and no name', async () => {
    await openAt(() => '#/canvas/no-such-topic')
    const canvas = await screen.findByTestId('the-canvas')
    expect(canvas).toHaveAttribute('data-topic-id', 'no-such-topic')
    expect(canvas).toHaveAttribute('data-topic-name', '')
  })

  it('tells the canvas which class the student is in', async () => {
    /* MEASURED 2026-09-03: `CanvasRoute` accepted `classId` and `App.tsx` never
       passed it, so `scopedQuery` was handed `null` for the class on every
       search and the canvas could not pitch anything at a level. A prop that
       is declared and never supplied is worse than one that is missing: it
       reads as wired. */
    await openAt((planned) => `#/canvas/${planned[0]!.chapters[0]!.concepts[0]!.id}`)
    const canvas = await screen.findByTestId('the-canvas')
    expect(canvas).toHaveAttribute('data-class-id', REAL_CLASS)
  })

  it('keeps #/canvas with no topic as the free canvas', async () => {
    await openAt(() => '#/canvas')
    expect(await screen.findByTestId('the-canvas')).toHaveAttribute('data-topic-id', '')
  })
})
