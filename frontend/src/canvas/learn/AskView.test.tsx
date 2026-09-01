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

/**
 * WHAT `/api/ask` ACTUALLY SENDS BACK. Not a fixture written to suit this file.
 *
 * Captured on 2026-09-01 by running the shipped server -- `node
 * dist-server/index.js` with `GROQ_API_KEY` set, provider `groq`, model
 * `openai/gpt-oss-120b` -- and posting `{"question":"photosynthesis"}` to
 * `http://127.0.0.1:8787/api/ask`. HTTP 200 in 37.7s. Copied verbatim.
 *
 * WHY IT MATTERS THAT THIS IS THE REAL REPLY AND `gasPressure` IS NOT.
 * `gasPressure` is a hand-authored lesson that ships in `src/canvas/lessons/`
 * and clears the STRICTEST teaching level. Every existing test on this screen
 * feeds it that, so every one of them passed while the screen refused every
 * answer a real server ever produced. Measured through the real gates:
 *
 *   validateLesson(reply, { teaching: 'answer' })  -> ok
 *   validateLesson(reply, { teaching: 'lesson' })  -> refused, four rules:
 *       does-not-open-on-the-topic, nothing-marked,
 *       material-before-the-definition, nothing-is-shown
 *
 * `server/handler.ts` judges `/api/ask` at `'answer'` and says why: a reply to
 * one free question owes no opening definition and no closing progression.
 * `AskView` judges it at `'answer'` for the same reason. `TeachView` then
 * re-judged it at `'lesson'`, because it was handed no level and `'lesson'` is
 * the default -- so the answer cleared two gates and was refused by the third.
 */
const WHAT_THE_SERVER_REALLY_ANSWERS = {
  "id": "photosynthesis-lesson",
  "question": "photosynthesis",
  "subject": "Biology",
  "blocks": [
    {
      "id": "a-note",
      "emphasis": "supporting",
      "tone": "neutral",
      "role": "support",
      "depth": "core",
      "kind": "prose",
      "body": "I could not put all of this together properly, so this is the part of it I was able to check. Ask me again if it looks wrong.",
      "terms": []
    },
    {
      "id": "def",
      "emphasis": "supporting",
      "tone": "neutral",
      "role": "definition",
      "depth": "core",
      "kind": "prose",
      "body": "Photosynthesis is the process by which green plants turn sunlight into chemical energy.",
      "terms": [
        {
          "text": "Photosynthesis",
          "mark": "key"
        }
      ]
    },
    {
      "id": "importance",
      "emphasis": "supporting",
      "tone": "neutral",
      "role": "support",
      "depth": "core",
      "kind": "callout",
      "body": "Without photosynthesis, most life on Earth would have no food or oxygen.",
      "terms": [
        {
          "text": "oxygen",
          "mark": "key"
        }
      ]
    },
    {
      "id": "where",
      "emphasis": "supporting",
      "tone": "neutral",
      "role": "component",
      "depth": "core",
      "kind": "prose",
      "body": "Photosynthesis mainly happens in the chloroplasts of leaf cells, where the pigment chlorophyll captures light.",
      "terms": [
        {
          "text": "chloroplasts",
          "mark": "key"
        },
        {
          "text": "chlorophyll",
          "mark": "key"
        }
      ]
    },
    {
      "id": "summary",
      "emphasis": "supporting",
      "tone": "neutral",
      "role": "summary",
      "depth": "core",
      "kind": "summary",
      "progression": [
        "Remember photosynthesis makes food and oxygen from CO₂ and water.",
        "It occurs in chloroplasts using chlorophyll.",
        "The main products are glucose and O₂."
      ],
      "mentalModel": "Plants turn light into sugar and release oxygen."
    }
  ],
  "relations": [],
  "technicalTerms": []
}

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

describe('the answer a real server actually sends', () => {
  it('is taught, not refused for owing an arc a free answer never owed', async () => {
    const lessonForQuestion = vi
      .fn()
      .mockResolvedValue({ ok: true, lesson: WHAT_THE_SERVER_REALLY_ANSWERS })
    open({ lessonForQuestion, ask: vi.fn() })

    await askThat('photosynthesis')

    /* The refusal wording is `TeachView`'s own. Asserting on it rather than on
       an absence means this cannot pass by the screen having gone blank. */
    expect(
      document.body.textContent,
      'the answer cleared the server gate and this screen’s gate, and was then ' +
        'refused by the view that was supposed to teach it',
    ).not.toContain('This lesson was refused')

    /* TAUGHT, not merely not-refused. The definition the model wrote has to be
       on her screen, and the box has to be there for the next question. */
    /* Read off the whole page, not by element. A marked term is its own node,
       so the sentence the model wrote is never one element -- `Photosynthesis`
       carries `mark: "key"` in the reply above. The question being asked is
       whether the words are on her screen, and this asks exactly that. */
    await waitFor(() =>
      expect(
        document.body.textContent,
        'the definition the model wrote never reached her screen',
      ).toContain('Photosynthesis is the process by which green plants turn sunlight'),
    )
    expect(
      screen.getByLabelText('Answer the question, or ask one of your own'),
      'she was shown an answer she cannot ask anything about',
    ).toBeInTheDocument()
  })
})
