import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { CHAPTER_BY_ID, TOPIC_BY_ID, topicsOfChapter } from './curriculum'
import { usePracticeStore } from './store'

/** Everything the browser will hand focus to inside the card. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where "Start practice" lands, until the question screen exists.
 *
 * DELIBERATELY A STUB, AND IT SAYS SO
 * -----------------------------------
 * The session screen is a separate design that has not been done yet. This
 * placeholder states what it *would* have launched — the exact scope, count and
 * timer — so the setup panel above it can be judged now without anyone
 * mistaking this for a finished feature. A stub that pretended to be a quiz
 * would be worse than no stub.
 *
 * IT REALLY IS A MODAL, SO IT IS MADE TO BE ONE
 * ---------------------------------------------
 * `aria-modal="true"` was here with nothing behind it. That attribute is not a
 * description — it tells assistive technology to ignore everything outside this
 * node, so a screen-reader user who pressed Tab landed on the panel's timer
 * switch and the map's chapter buttons while their software insisted those did
 * not exist. Two ways out of that: drop the claim, or make it true.
 *
 * Made true, because this genuinely is modal and nothing else on the screen is.
 * It covers the whole surface with a scrim, it is the *result* of an action
 * rather than an aid to one, there is nothing behind it worth reaching, and it
 * offers exactly one way on. (The setup panel, by contrast, is a side panel you
 * are meant to use WITH the map — which is why it has never claimed modality
 * and must not start.) So focus is trapped while it is open and handed back to
 * whatever opened it when it closes.
 *
 * Escape is not handled here — see the note in `PracticeView`.
 */

export function SessionStub() {
  const launchedFrom = usePracticeStore((state) => state.launchedFrom)
  const settings = usePracticeStore((state) => state.settings)
  const dismiss = usePracticeStore((state) => state.dismissLaunch)

  const cardRef = useRef<HTMLDivElement | null>(null)
  const open = launchedFrom !== null

  useEffect(() => {
    if (!open) return

    const opener = document.activeElement
    const card = cardRef.current
    focusFirst(card)

    /*
     * Tab is trapped by the keydown handler below; this catches everything
     * else — a click on the scrim, a screen reader's own navigation, a stray
     * `focus()` from elsewhere. Without it "trapped" would mean "trapped
     * against one key".
     */
    const onFocusIn = (event: FocusEvent) => {
      const inside = cardRef.current
      if (!inside || (event.target instanceof Node && inside.contains(event.target))) return
      focusFirst(inside)
    }
    document.addEventListener('focusin', onFocusIn)

    return () => {
      // Removed BEFORE focus goes back, or the guard above would snatch it
      // straight out of the map again.
      document.removeEventListener('focusin', onFocusIn)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [open])

  /* Wrapping at both ends, so Tab and Shift+Tab cycle the card instead of
     walking out of a dialog that told assistive tech there is no "out". */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const card = cardRef.current
    if (!card) return

    const stops = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (!first || !last) {
      event.preventDefault()
      return
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  if (!launchedFrom) return null

  const scope =
    launchedFrom.kind === 'chapter'
      ? (CHAPTER_BY_ID.get(launchedFrom.id)?.name ?? 'this chapter')
      : (TOPIC_BY_ID.get(launchedFrom.id)?.name ?? 'this topic')

  const drawnFrom = launchedFrom.kind === 'chapter' ? topicsOfChapter(launchedFrom.id).length : 1

  return (
    <div
      className="pm-session"
      role="dialog"
      aria-modal="true"
      aria-label="Practice session"
      onKeyDown={onKeyDown}
    >
      <div ref={cardRef} className="pm-session-card">
        <p className="pm-session-eyebrow">Session ready</p>
        <h2 className="pm-session-title">{scope}</h2>

        <dl className="pm-stats">
          <div>
            <dt>Questions</dt>
            <dd>{settings.questionCount}</dd>
          </div>
          <div>
            <dt>Timer</dt>
            <dd>{settings.timerEnabled ? `${settings.timerMinutes} min` : 'Off'}</dd>
          </div>
          <div>
            <dt>Drawn from</dt>
            <dd>
              {drawnFrom} topic{drawnFrom === 1 ? '' : 's'}
            </dd>
          </div>
        </dl>

        <p className="pm-session-note">
          The question screen is the next thing to design. Everything above is real and saved —
          this is where it will open.
        </p>

        <button type="button" className="pm-session-back" onClick={dismiss}>
          Back to the map
        </button>
      </div>
    </div>
  )
}

/**
 * Focus the first thing in the card, or the card itself.
 *
 * Replaces the `autoFocus` that used to be on the back button: the effect has
 * to know where focus went in order to trap it, and two mechanisms racing to
 * place the same focus is how a dialog ends up focusing nothing.
 */
function focusFirst(card: HTMLElement | null): void {
  if (!card) return
  const first = card.querySelector<HTMLElement>(FOCUSABLE)
  if (first) {
    first.focus()
    return
  }
  card.tabIndex = -1
  card.focus()
}
