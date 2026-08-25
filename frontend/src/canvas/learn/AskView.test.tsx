// @vitest-environment jsdom
/* Ask anything.
 *
 * THE REQUIREMENT, IN THE OWNER'S OWN TERMS
 *   The same screen, the same responses, the same memory -- a new session, and
 *   it is NOT called a learning canvas. So this is not a second teaching
 *   surface with its own rules; it is the teaching screen with a free question
 *   in place of a planned concept.
 *
 *   That is why the checks below are mostly about SAMENESS: a question is
 *   taught by the canvas exactly as a concept is, a doubt inside it escalates
 *   the same way, and nothing advances without an answer.
 */

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AskView } from './AskView'
import { gasPressure } from '../lessons/gasPressure'
import type { AlmanacClient } from '../../almanac/client'

afterEach(cleanup)

function open(client: Partial<AlmanacClient>) {
  return render(
    <MemoryRouter initialEntries={['/quick-question']}>
      <AskView almanac={client as AlmanacClient} />
    </MemoryRouter>,
  )
}

async function askThat(text: string) {
  const field = screen.getByLabelText(/ask anything/i)
  await act(async () => {
    fireEvent.change(field, { target: { value: text } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
  })
}

describe('starting from a question', () => {
  it('invites a question before anything else is on screen', async () => {
    open({ lessonForQuestion: vi.fn() })
    expect(await screen.findByLabelText(/ask anything/i)).toBeInTheDocument()
  })

  it('is never called a learning canvas, anywhere on the screen', async () => {
    /* Named explicitly by the owner. The word is a description of the machinery
     * and means nothing to the person using it. */
    const { container } = open({ lessonForQuestion: vi.fn() })
    expect(container.textContent?.toLowerCase()).not.toContain('canvas')
  })

  it('sends the question as asked, and teaches the answer through the canvas', async () => {
    const lessonForQuestion = vi.fn().mockResolvedValue({ ok: true, lesson: gasPressure })
    open({ lessonForQuestion, ask: vi.fn() })

    await askThat('why does a balloon pop in the sun?')

    expect(lessonForQuestion).toHaveBeenCalledWith('why does a balloon pop in the sun?')
    expect(await screen.findByText(gasPressure.question)).toBeInTheDocument()
  })

  it('teaches with the SAME controls as a planned concept', async () => {
    /* The one box that both answers and asks. If this screen grew its own
     * controls it would be a second teaching surface pretending to be the
     * first, and the two would drift. */
    const lessonForQuestion = vi.fn().mockResolvedValue({ ok: true, lesson: gasPressure })
    open({ lessonForQuestion, ask: vi.fn() })
    await askThat('why does a balloon pop in the sun?')
    await screen.findByText(gasPressure.question)

    expect(screen.getByLabelText('Answer the question, or ask one of your own')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })

  it('does nothing on an empty question rather than asking for nothing', async () => {
    const lessonForQuestion = vi.fn()
    open({ lessonForQuestion })
    await askThat('   ')
    expect(lessonForQuestion).not.toHaveBeenCalled()
  })
})

describe('when it cannot answer', () => {
  it('says so, and leaves the question in the box to try again', async () => {
    const lessonForQuestion = vi.fn().mockResolvedValue({ ok: false, reason: 'the model could not be reached' })
    open({ lessonForQuestion })

    await askThat('why is the sky blue?')

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reached/i)
    expect((screen.getByLabelText(/ask anything/i) as HTMLInputElement).value).toBe('why is the sky blue?')
  })

  it('never teaches a stored lesson for a question it was not asked', async () => {
    /* The concept screen falls back to a stored lesson only when the ids match.
     * A free question has no id at all, so there is nothing it could honestly
     * fall back TO. */
    const lessonForQuestion = vi.fn().mockResolvedValue({ ok: false, reason: 'offline' })
    const { container } = open({ lessonForQuestion })
    await askThat('why does a balloon pop?')
    await screen.findByRole('alert')

    expect(container.textContent).not.toContain(gasPressure.question)
  })
})

describe('a new session each time', () => {
  it('replaces the previous answer when a second question is asked', async () => {
    /* A new session, in the owner's words. The previous answer is not stacked
     * beneath the new one: they asked something else. */
    const second = { ...gasPressure, id: 'second', question: 'A completely different lesson' }
    const lessonForQuestion = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, lesson: gasPressure })
      .mockResolvedValueOnce({ ok: true, lesson: second })
    open({ lessonForQuestion, ask: vi.fn() })

    await askThat('first question?')
    await screen.findByText(gasPressure.question)

    const field = screen.getByLabelText(/ask anything/i)
    await act(async () => {
      fireEvent.change(field, { target: { value: 'second question?' } })
      fireEvent.submit(field.closest('form') as HTMLFormElement)
    })

    await waitFor(() => expect(screen.queryByText(second.question)).toBeInTheDocument())
    expect(screen.queryByText(gasPressure.question)).toBeNull()
  })
})
