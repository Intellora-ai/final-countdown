// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import PracticeView from './PracticeView'
import { CURRICULUM } from './curriculum'
import { DEFAULT_VIEWPORT, useViewportStore } from './viewport'
import { isChapterOpen, usePracticeStore } from './store'

/**
 * What the map does to a keypress, a click, and a caret.
 *
 * These are the claims that cannot be made without a DOM: which element is
 * focused, what order Tab walks in, and whether one keystroke closed one thing
 * or two. Every one of them was a defect that the store's own tests could not
 * have caught, because none of them is a store question.
 */

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test fixture missing: ${what}`)
  return value
}

const subject = must(CURRICULUM[0], 'the first subject')
const chapter = must(subject.chapters[0], 'the first subject’s chapter 1')
const firstTopic = must(chapter.topics[0], `${chapter.id} topic 0`)
const secondTopic = must(chapter.topics[1], `${chapter.id} topic 1`)

const chapterName = new RegExp(`^Chapter ${chapter.number}, ${escapeRegExp(chapter.name)}\\.`)

/** `PracticeView` measures itself with one; jsdom has none. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  Reflect.set(globalThis, 'ResizeObserver', StubResizeObserver)
  usePracticeStore.setState({
    pinnedChapterIds: [],
    hoveredChapterId: null,
    selection: null,
    progress: {},
    settings: { timerEnabled: false, timerMinutes: 10, questionCount: 10 },
    launchedFrom: null,
  })
  useViewportStore.setState({ viewport: DEFAULT_VIEWPORT })
})

afterEach(cleanup)

const chapterButton = () => screen.getByRole('button', { name: chapterName })

/** `focus()` is not a `fireEvent`, so React's handlers do not flush on their own. */
function focusOn(element: HTMLElement): void {
  act(() => element.focus())
}

describe('Escape closes exactly one layer', () => {
  it('leaves the setup panel open when it dismisses the session', () => {
    render(<PracticeView />)

    fireEvent.click(chapterButton())
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))

    expect(usePracticeStore.getState().launchedFrom).not.toBeNull()

    fireEvent.keyDown(document.body, { key: 'Escape' })

    const state = usePracticeStore.getState()
    expect(state.launchedFrom).toBeNull()
    // The two things the same keystroke used to take with it.
    expect(state.selection).toEqual({ kind: 'chapter', id: chapter.id })
    expect(state.pinnedChapterIds).toContain(chapter.id)
  })

  it('walks out one layer per press', () => {
    render(<PracticeView />)

    fireEvent.click(chapterButton())
    fireEvent.click(screen.getByRole('button', { name: 'Start practice' }))

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(usePracticeStore.getState().launchedFrom).toBeNull()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(usePracticeStore.getState().selection).toBeNull()
    expect(usePracticeStore.getState().pinnedChapterIds).toContain(chapter.id)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(usePracticeStore.getState().pinnedChapterIds).not.toContain(chapter.id)
  })
})

describe('a keyboard can reach a chapter’s topics', () => {
  it('renders each chapter immediately before its own topics', () => {
    const { container } = render(<PracticeView />)

    const nodes = [...container.querySelectorAll('[data-node]')]
    const owner = nodes.indexOf(chapterButton())
    const topic = nodes.findIndex(
      (node) => node.getAttribute('aria-label')?.startsWith(`${firstTopic.name},`) ?? false,
    )

    expect(owner).toBeGreaterThanOrEqual(0)
    expect(topic).toBe(owner + 1)
  })

  it('gives an open fan one tab stop, not one per topic', () => {
    const { container } = render(<PracticeView />)

    focusOn(chapterButton())

    const fan = [...container.querySelectorAll(`[data-chapter="${chapter.id}"].pm-topic`)]
    expect(fan.length).toBe(chapter.topics.length)
    expect(fan.filter((node) => node.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('moves into the fan with an arrow key and along it with another', () => {
    render(<PracticeView />)

    const owner = chapterButton()
    focusOn(owner)

    fireEvent.keyDown(owner, { key: 'ArrowDown' })
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      new RegExp(`^${escapeRegExp(firstTopic.name)},`),
    )

    fireEvent.keyDown(must(document.activeElement ?? undefined, 'the focused topic'), {
      key: 'ArrowRight',
    })
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      new RegExp(`^${escapeRegExp(secondTopic.name)},`),
    )
  })

  it('keeps the fan open while focus is inside it', () => {
    render(<PracticeView />)

    const owner = chapterButton()
    focusOn(owner)
    fireEvent.keyDown(owner, { key: 'ArrowDown' })

    // The chapter blurred on the way in. Its topics must not have shut behind
    // the caret — an `aria-hidden` element with the focus is a dead end.
    expect(isChapterOpen(usePracticeStore.getState(), chapter.id)).toBe(true)
    expect(document.activeElement?.getAttribute('aria-hidden')).toBe('false')
  })

  it('activates a topic from the keyboard', () => {
    render(<PracticeView />)

    const owner = chapterButton()
    focusOn(owner)
    fireEvent.keyDown(owner, { key: 'ArrowDown' })
    fireEvent.click(must(document.activeElement ?? undefined, 'the focused topic'))

    expect(usePracticeStore.getState().selection).toEqual({ kind: 'topic', id: firstTopic.id })
  })
})

describe('the session dialog is as modal as it claims', () => {
  const launch = () => {
    render(<PracticeView />)
    fireEvent.click(chapterButton())
    const start = screen.getByRole('button', { name: 'Start practice' })
    focusOn(start)
    fireEvent.click(start)
    return start
  }

  it('takes focus when it opens', () => {
    launch()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to the map' }))
  })

  it('pulls focus back when something outside takes it', () => {
    launch()

    focusOn(chapterButton())

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Back to the map' }))
  })

  it('returns focus to whatever opened it', () => {
    const start = launch()

    fireEvent.click(screen.getByRole('button', { name: 'Back to the map' }))

    expect(usePracticeStore.getState().launchedFrom).toBeNull()
    expect(document.activeElement).toBe(start)
  })
})

describe('a chapter’s panel and the map agree', () => {
  it('opens and selects together, then collapses and deselects together', () => {
    render(<PracticeView />)

    fireEvent.click(chapterButton())
    expect(chapterButton()).toHaveAttribute('aria-expanded', 'true')
    expect(usePracticeStore.getState().selection).toEqual({ kind: 'chapter', id: chapter.id })

    fireEvent.click(chapterButton())
    const state = usePracticeStore.getState()
    // Neither half may move without the other: a collapsed chapter with a panel
    // still describing it is a panel describing something nobody can see.
    expect(state.pinnedChapterIds).not.toContain(chapter.id)
    expect(state.selection).toBeNull()
  })
})

describe('Continue practising reads and writes committed state', () => {
  it('pins the topic’s chapter rather than hovering it', () => {
    usePracticeStore.setState({
      progress: { [firstTopic.id]: { lastPracticedAt: 1000, attempts: 3, correct: 2 } },
    })

    render(<PracticeView />)
    fireEvent.click(screen.getByRole('button', { name: firstTopic.name }))

    const state = usePracticeStore.getState()
    expect(state.selection).toEqual({ kind: 'topic', id: firstTopic.id })
    expect(state.pinnedChapterIds).toContain(chapter.id)
    expect(state.hoveredChapterId).toBeNull()
  })

  it('leaves the chapter open once the pointer moves on', () => {
    usePracticeStore.setState({
      progress: { [firstTopic.id]: { lastPracticedAt: 1000, attempts: 3, correct: 2 } },
    })

    render(<PracticeView />)
    fireEvent.click(screen.getByRole('button', { name: firstTopic.name }))

    // Exactly what crossing the map does: the pointer's opinion changes.
    usePracticeStore.getState().hoverChapter(null)

    expect(isChapterOpen(usePracticeStore.getState(), chapter.id)).toBe(true)
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
