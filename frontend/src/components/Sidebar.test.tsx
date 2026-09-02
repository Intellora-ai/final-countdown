// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { Sidebar } from './Sidebar'
import { store } from '../data/store'
import { examSubjects, primeExamCurriculum } from '../almanac/examSubjects'
import { plannedSubjects, primePlannedCurriculum } from '../almanac/plannedCurriculum'
import CURRICULUM_MODULE from '../data/curriculum'
import type { DB } from '../types'

/**
 * THE SIDEBAR REACHES EVERY TOPIC, AND A TOPIC OPENS ITS OWN CANVAS.
 *
 * The product's shape is Subject -> Chapter -> Topic, one blank canvas per
 * topic. The sidebar stopped at the chapter and sent a click to a map of
 * boxes; the canvas itself was linked from nowhere in the product, reachable
 * only by typing its address. These are the clicks a student makes, driven
 * through the real component against the real generated curriculum.
 */

const STUDENT_ID = 'stu_sidebar'
const REAL_CLASS = CURRICULUM_MODULE.classes[0]
let PLANNED: ReturnType<typeof plannedSubjects> = []

function memoryAdapter(db: DB) {
  return { load: async () => db, subscribe: () => () => {}, commit: async () => {}, close: () => {} }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const named = (text: string) => new RegExp(escape(text), 'i')

beforeAll(async () => {
  await primePlannedCurriculum(REAL_CLASS)
  PLANNED = plannedSubjects(REAL_CLASS)
  const db: DB = {
    students: {
      [STUDENT_ID]: {
        id: STUDENT_ID, name: 'Test', avatarHue: 0, cls: REAL_CLASS, stream: null,
        subjects: PLANNED.slice(0, 2).map((s) => s.id), minutes: 120, deadlines: {}, createdAt: 0, lastActiveAt: 0,
      },
    },
    progress: {}, activity: {}, currentId: STUDENT_ID,
  }
  await store.init(memoryAdapter(db))
})

afterEach(cleanup)

function CanvasProbe() {
  const { topicId } = useParams()
  return <div data-testid="topic-canvas">canvas: {topicId}</div>
}

/** The shell owns which subjects are open; the sidebar is told. */
function Shell() {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return <Sidebar open={open} setOpen={setOpen} onNavigate={() => {}} />
}

function renderSidebar() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Shell />
      <Routes>
        <Route path="/today" element={<div />} />
        <Route path="/canvas/:topicId" element={<CanvasProbe />} />
        <Route path="*" element={<div data-testid="elsewhere" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Subject -> Chapter -> Topic, and a topic opens its own canvas', () => {
  it('opens a chapter to show its topics, and a chapter alone opens no screen', () => {
    renderSidebar()
    const subject = PLANNED[0]!
    const chapter = subject.chapters[0]!
    const topic = chapter.concepts[0]!

    fireEvent.click(screen.getAllByRole('button', { name: named(subject.name) })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: named(chapter.name) })[0]!)

    expect(screen.getAllByRole('button', { name: named(topic.name) }).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('topic-canvas'), 'a chapter click opened a screen by itself').toBeNull()
    expect(screen.queryByTestId('elsewhere'), 'a chapter click navigated somewhere').toBeNull()
  })

  it("opens the topic's own canvas when the topic is pressed", async () => {
    renderSidebar()
    const subject = PLANNED[0]!
    const chapter = subject.chapters[0]!
    const topic = chapter.concepts[0]!

    fireEvent.click(screen.getAllByRole('button', { name: named(subject.name) })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: named(chapter.name) })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: named(topic.name) })[0]!)

    expect(await screen.findByTestId('topic-canvas')).toHaveTextContent(topic.id)
  })
})

describe('G1 — a student sitting an entrance exam can open a topic', () => {
  /* The four syllabi were loaded by the practice screen alone, so a JEE
     student had no way into learning at all. They appear in the same
     Subject -> Chapter -> Topic shape as a class's, and every topic opens its
     own canvas: one code path, no special case. */
  it('shows the exam subjects under the class ones, and each topic opens its canvas', async () => {
    await primeExamCurriculum('clat-2027')
    const clat = examSubjects('clat-2027')[0]!
    /* The same three clicks a student makes: subject, chapter, topic. */
    function ExamShell() {
      const [open, setOpen] = useState<Record<string, boolean>>({})
      return <Sidebar open={open} setOpen={setOpen} onNavigate={() => {}} examId="clat-2027" />
    }
    render(
      <MemoryRouter initialEntries={['/today']}>
        <ExamShell />
        <Routes>
          <Route path="/today" element={<div />} />
          <Route path="/canvas/:topicId" element={<CanvasProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText(named(clat.name))).toBeTruthy()
    fireEvent.click(screen.getByText(named(clat.name)))
    fireEvent.click(screen.getByText(named(clat.chapters[0]!.name)))
    const topic = clat.chapters[0]!.concepts[0]!
    fireEvent.click(screen.getByText(named(topic.name)))
    /* The router's own probe, as the tests beside this one do: the canvas for
       that exact topic id is what rendered. */
    expect(screen.getByTestId('topic-canvas').textContent).toBe(`canvas: ${topic.id}`)
  })

  it('says why an exam has no topics rather than showing an empty space', async () => {
    await primeExamCurriculum('ipmat-2026-rohtak')
    render(
      <MemoryRouter>
        <Sidebar open={{}} setOpen={() => {}} onNavigate={() => {}} examId="ipmat-2026-rohtak" />
      </MemoryRouter>,
    )
    expect(document.body.textContent).toMatch(/pattern|no topics|syllabus/i)
  })
})
