import React from 'react'
import { Link } from 'react-router-dom'
import { createAlmanacClient, type AlmanacClient } from '../../almanac/client'
import { validateLesson } from '../spec/validate'
import type { Lesson } from '../spec/spec'
import { TeachView } from '../teach/TeachView'

/**
 * Ask anything.
 *
 * THE SAME SCREEN, not a second one. A free question replaces a planned
 * concept and everything after that is identical: the answer is a lesson, it
 * is taught by the canvas, the one box both answers and asks, and a doubt
 * inside it escalates exactly as it does anywhere else.
 *
 * That sameness is the requirement, and it is why this file is short. A screen
 * that grew its own controls would be a second teaching surface pretending to
 * be the first, and the two would drift apart within a month.
 *
 * IT IS NEVER CALLED A LEARNING CANVAS. That name describes the machinery and
 * means nothing to the person using it.
 *
 * NO STORED FALLBACK, DELIBERATELY. The concept screen can fall back to a
 * stored lesson because the ids match. A free question has no id, so there is
 * nothing it could honestly fall back to -- and teaching a stored lesson for a
 * question nobody asked is the failure this project keeps guarding against.
 */
export function AskView({ almanac }: { almanac?: AlmanacClient } = {}) {
  const client = React.useMemo(() => almanac ?? createAlmanacClient(), [almanac])

  const [draft, setDraft] = React.useState('')
  const [asking, setAsking] = React.useState(false)
  const [lesson, setLesson] = React.useState<Lesson | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)

  function submit(): void {
    const question = draft.trim()
    /* Nothing is asked for nothing. An empty submit is someone pressing Enter,
       not someone asking. */
    if (question === '' || asking) return

    setAsking(true)
    setProblem(null)
    /* Cleared here, so a second question replaces the first rather than
       stacking beneath it. They asked something else; this is a new session. */
    setLesson(null)

    void client.lessonForQuestion(question).then((result) => {
      setAsking(false)
      if (!result.ok) {
        setProblem(result.reason)
        return
      }
      const checked = validateLesson(result.lesson)
      if (!checked.ok) {
        setProblem('The answer that came back could not be trusted, so it was not shown.')
        return
      }
      setLesson(checked.lesson)
    })
  }

  return (
    <div className="td-wrap" data-shell="pad">
      <h1 className="td-h1">Ask anything</h1>
      <p className="td-sub">Any question, on any subject. It does not have to be today's work.</p>

      <form
        className="lc-teach__ask"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          className="lc-teach__input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Ask anything"
          placeholder="What do you want to know?"
        />
        <button className="lc-teach__button" type="submit">Ask</button>
      </form>

      {asking && <p className="td-sub" role="status">Working on an answer…</p>}

      {problem !== null && (
        /* The question stays in the box on purpose: retyping it after a failed
           network call is a punishment for something that was not their fault. */
        <p className="td-sub" role="alert" style={{ color: 'var(--destructive)' }}>{problem}</p>
      )}

      {lesson !== null && (
        <TeachView lesson={lesson} mode="2d" ask={(question) => client.ask(question)} />
      )}

      <p className="td-sub">
        <Link to="/today">Back to today</Link>
      </p>
    </div>
  )
}
