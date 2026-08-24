import { useMemo } from 'react'

import {
  CHAPTER_BY_ID,
  CHAPTER_OF_TOPIC,
  SUBJECT_BY_ID,
  SUBJECT_OF_CHAPTER,
  TOPIC_BY_ID,
} from './curriculum'
import {
  QUESTION_CHOICES,
  TIMER_CHOICES,
  chapterCoverageOf,
  chapterLastPracticed,
  usePracticeStore,
  type Selection,
} from './store'

/**
 * What opens when a node is clicked.
 *
 * ONE PANEL FOR BOTH KINDS OF NODE
 * --------------------------------
 * A chapter and a topic are different sizes of the same request — "set me some
 * questions on this" — so they get one panel rather than two that drift apart.
 * The only difference is the subtitle and how many topics the session draws
 * from, both derived below.
 *
 * THE 15 CAP IS NOT ENFORCED HERE
 * -------------------------------
 * The input's `max` is a courtesy to the pointer; the real clamp is in the
 * store, so no route into it can launch a 200-question session. This is the
 * kind of rule that must not live only in the control that happens to be on
 * screen today.
 */

export function PracticePanel() {
  const selection = usePracticeStore((state) => state.selection)
  const select = usePracticeStore((state) => state.select)
  const settings = usePracticeStore((state) => state.settings)
  const setSettings = usePracticeStore((state) => state.setSettings)
  const launch = usePracticeStore((state) => state.launch)

  const lastPracticed = usePracticeStore((state) => {
    if (!state.selection) return 0
    if (state.selection.kind === 'chapter') return chapterLastPracticed(state, state.selection.id)
    return state.progress[state.selection.id]?.lastPracticedAt ?? 0
  })

  /* Derived, not selected — a selector must never build an object. */
  const progress = usePracticeStore((state) => state.progress)
  const coverage = useMemo(
    () => (selection?.kind === 'chapter' ? chapterCoverageOf(progress, selection.id) : null),
    [progress, selection],
  )

  const open = selection !== null

  /*
   * ESCAPE IS NOT HANDLED HERE ANY MORE.
   *
   * This had its own `window` keydown listener, and so did the session stub.
   * Two listeners on the same target, neither aware of the other, and the stub
   * only ever opens with a selection behind it — so one Escape ran both and
   * closed two layers at once. Ownership now sits with `PracticeView`, which is
   * the only place that can see the whole stack and therefore the only place
   * that can close exactly one of it.
   */

  return (
    <aside className="pm-panel" aria-label="Practice setup" aria-hidden={!open}>
      {selection && (
        <>
          <header className="pm-panel-head">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p className="pm-breadcrumb">{subtitleOf(selection)}</p>
                <h2 className="pm-panel-title">{titleOf(selection)}</h2>
              </div>
              <button
                type="button"
                className="pm-close"
                aria-label="Close practice setup"
                onClick={() => select(null)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <p className="pm-panel-meta">
              Last practised <strong>{relativeTime(lastPracticed)}</strong>
              {coverage && coverage.total > 0 && (
                <>
                  {' · '}
                  {coverage.done}/{coverage.total} topics
                </>
              )}
            </p>
          </header>

          <div className="pm-panel-body">
            {/* -- Timer ------------------------------------------------- */}
            <div className="pm-row">
              <span className="pm-row-label">Timer</span>
              <button
                type="button"
                role="switch"
                className="pm-switch"
                aria-checked={settings.timerEnabled}
                aria-label="Use a timer"
                onClick={() => setSettings({ timerEnabled: !settings.timerEnabled })}
              >
                <span aria-hidden />
              </button>
            </div>

            {/* Durations only exist once the timer is on. Showing them greyed
                out would invite clicking something that does nothing. */}
            <div className="pm-durations" aria-hidden={!settings.timerEnabled}>
              {TIMER_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="pm-duration"
                  tabIndex={settings.timerEnabled ? 0 : -1}
                  aria-pressed={settings.timerMinutes === minutes}
                  onClick={() => setSettings({ timerMinutes: minutes })}
                >
                  {minutes}m
                </button>
              ))}
            </div>

            {/* -- Questions --------------------------------------------- */}
            <div className="pm-questions">
              <div className="pm-row">
                <span className="pm-row-label">Questions</span>
                <span className="pm-row-value">{settings.questionCount}</span>
              </div>

              {/* Three buttons, not a slider.
                  The slider let a learner ask for 7 questions, which the store
                  now snaps away anyway - so the control was offering a choice
                  the product does not have. It reads the same as the timer
                  durations above it, which were always a choice of five. */}
              <div className="pm-durations" role="group" aria-label="Number of questions">
                {QUESTION_CHOICES.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className="pm-duration"
                    aria-pressed={settings.questionCount === count}
                    onClick={() => setSettings({ questionCount: count })}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <footer className="pm-panel-foot">
            <button type="button" className="pm-start" onClick={launch}>
              Start practice
            </button>
            <p className="pm-summary">
              {settings.questionCount} question{settings.questionCount === 1 ? '' : 's'}
              {settings.timerEnabled ? ` · ${settings.timerMinutes} minutes` : ' · untimed'}
            </p>
          </footer>
        </>
      )}
    </aside>
  )
}

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

function titleOf(selection: NonNullable<Selection>): string {
  if (selection.kind === 'chapter') return CHAPTER_BY_ID.get(selection.id)?.name ?? 'Chapter'
  return TOPIC_BY_ID.get(selection.id)?.name ?? 'Topic'
}

/** Breadcrumb: which subject, and for a topic, which chapter it came from. */
function subtitleOf(selection: NonNullable<Selection>): string {
  if (selection.kind === 'chapter') {
    const chapter = CHAPTER_BY_ID.get(selection.id)
    const subject = SUBJECT_BY_ID.get(SUBJECT_OF_CHAPTER.get(selection.id) ?? '')
    return [subject?.name, chapter ? `Chapter ${chapter.number}` : null].filter(Boolean).join(' · ')
  }

  const chapterId = CHAPTER_OF_TOPIC.get(selection.id)
  const chapter = chapterId ? CHAPTER_BY_ID.get(chapterId) : undefined
  const subject = SUBJECT_BY_ID.get(chapterId ? (SUBJECT_OF_CHAPTER.get(chapterId) ?? '') : '')
  return [subject?.name, chapter ? `Chapter ${chapter.number}` : null].filter(Boolean).join(' · ')
}

/**
 * "3 days ago", or "never".
 *
 * Deliberately coarse. A learner does not need "2 days, 4 hours"; they need to
 * know whether this is stale.
 */
export function relativeTime(epochMillis: number, now: number = Date.now()): string {
  if (!epochMillis) return 'never'

  const seconds = Math.max(0, Math.round((now - epochMillis) / 1000))
  if (seconds < 90) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`

  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`

  const months = Math.round(days / 30)
  return months === 1 ? 'a month ago' : `${months} months ago`
}
