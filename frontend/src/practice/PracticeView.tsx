import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'

import { Constellation } from './Constellation'
import { PanZoom } from './PanZoom'
import { PracticePanel } from './PracticePanel'
import { SessionView } from './SessionView'
import { CHAPTER_BY_ID, CHAPTER_OF_TOPIC, TOPIC_BY_ID, type TopicId } from './curriculum'
import { buildGraph } from './layout'
import { hydratePracticeStore, recentTopicsOf, usePracticeStore } from './store'
import { fitToRect, useViewportStore, type Viewport } from './viewport'

import './practice.css'

/**
 * The practice screen.
 *
 * SCOPE
 * -----
 * Everything this route needs lives under `src/practice/`. It imports nothing
 * from `src/canvas/`, `src/components/`, `src/data/` or `src/styles/`, and
 * nothing imports it except the one route line in `App.tsx`. Deleting this
 * directory would remove the feature and change nothing else — which is the
 * property that makes it safe to add to a codebase mid-flight.
 *
 * WHY BACKGROUND-CLICK CLEARING IS HANDLED HERE
 * ---------------------------------------------
 * `PanZoom` owns the viewport and knows nothing about selection; the practice
 * selection lives in a different store. So the surface reports a background
 * press and this decides what it means, using the same `[data-node]` test
 * `PanZoom` uses, so the two agree on what counts as "the background".
 */

export default function PracticeView() {
  const select = usePracticeStore((state) => state.select)
  const rootRef = useRef<HTMLElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  /** The viewport the map opened at — what "reset view" returns to. */
  const homeRef = useRef<Viewport | null>(null)
  const [adrift, setAdrift] = useState(false)

  // Saved chapters and progress arrive one frame after first paint.
  useEffect(hydratePracticeStore, [])

  /*
   * Publish how far down the window this map starts, so its height can be the
   * space that is actually left rather than the whole parent. Re-measured on
   * resize because the dashboard's top bar wraps at narrow widths, which moves
   * the map down without the window height changing.
   */
  useEffect(() => {
    const element = rootRef.current
    if (!element) return

    const measure = () => {
      const top = element.getBoundingClientRect().top
      element.style.setProperty('--pm-offset', `${Math.max(0, Math.round(top))}px`)
    }

    measure()
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    // Observing the PARENT: the map's own height is what this sets, so
    // observing itself would be a feedback loop.
    if (element.parentElement) observer.observe(element.parentElement)

    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [])

  const fitToMap = useCallback(() => {
    const element = surfaceRef.current
    if (!element) return
    const box = element.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return

    const { bounds } = buildGraph()
    const fitted = fitToRect(bounds, box.width, box.height, 56)
    homeRef.current = fitted
    useViewportStore.getState().setViewport(fitted)
  }, [])

  /*
   * FIT ONCE — BUT ONLY ONCE THE ELEMENT ACTUALLY HAS A SIZE.
   *
   * A bare `useEffect(fitToMap, [])` looks right and silently does nothing: on
   * the first commit the surface can still measure 0 x 0, `fitToMap` returns
   * early, and nothing calls it again — so the map opens at scale 1 on the
   * origin and overflows the screen with no error anywhere. That is exactly how
   * this behaved the first time it rendered.
   *
   * The observer disconnects itself after the first real measurement. Staying
   * subscribed would re-fit on every window resize, yanking the view out from
   * under someone who had panned somewhere deliberately.
   */
  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return

    if (element.getBoundingClientRect().width > 0) {
      fitToMap()
      return
    }

    const observer = new ResizeObserver(() => {
      if (element.getBoundingClientRect().width === 0) return
      fitToMap()
      observer.disconnect()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [fitToMap])

  /*
   * WHY THE RESET CONTROL EXISTS
   * ----------------------------
   * Cursor-anchored zoom on empty space walks the map off screen, and a surface
   * with no scrollbar gives no clue how to get back — the honest failure mode is
   * a learner who concludes the page is broken. It stays invisible until the
   * view has actually moved, so the resting screen keeps its composition and the
   * button appears only when it means something.
   */
  useEffect(() => {
    const moved = (viewport: Viewport) => {
      const home = homeRef.current
      if (!home) return false
      return (
        Math.abs(viewport.x - home.x) > 24 ||
        Math.abs(viewport.y - home.y) > 24 ||
        Math.abs(viewport.scale - home.scale) > 0.02
      )
    }

    return useViewportStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return
      setAdrift(moved(state.viewport))
    })
  }, [])

  /*
   * ONE ESCAPE, ONE LAYER.
   *
   * The panel and the session stub each used to bind their own `window` keydown
   * listener. Both were open at the same time by construction — `launch()`
   * copies the current selection, so the stub never appears without a selection
   * behind it — and two listeners on the same target with no idea of each other
   * both ran on one keypress. Escape out of the session and the setup panel
   * went with it, which is not a thing anyone asked for and not a thing either
   * component could see itself doing.
   *
   * `stopPropagation` cannot fix that: they were on the same node, so the order
   * is registration order, and the fix would be one component reaching into
   * another's listener. What can fix it is knowing the whole stack, which only
   * this file does. Innermost first, one per press, and each press falls
   * through to the next layer only because the one above it was already shut.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const state = usePracticeStore.getState()

      if (state.launchedFrom !== null) {
        state.dismissLaunch()
        return
      }
      if (state.selection !== null) {
        state.select(null)
        return
      }
      // Deliberately the most recent one only. Pinning is how a learner leaves
      // several chapters open on purpose; closing the lot on one keystroke
      // would throw away work they did with the pointer.
      const last = state.pinnedChapterIds[state.pinnedChapterIds.length - 1]
      if (last !== undefined) state.toggleChapterPinned(last)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const onBackgroundPress = useCallback(() => {
    if (usePracticeStore.getState().selection !== null) select(null)
  }, [select])

  // The surface press also arrives here so a click on a node is not treated as
  // a background press; PanZoom already filters, this guards the outer div.
  const onOuterPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.target instanceof Element && event.target.closest('[data-node]')) return
      if (usePracticeStore.getState().selection !== null) select(null)
    },
    [select],
  )

  return (
    <main ref={rootRef} className="practice-map">
      <div aria-hidden className="pm-ground" />

      <div
        ref={surfaceRef}
        style={{ position: 'absolute', inset: 0 }}
        onPointerDown={onOuterPointerDown}
      >
        <PanZoom onBackgroundPress={onBackgroundPress}>
          <Constellation />
        </PanZoom>
      </div>

      <ContinuePractising />
      <PracticePanel />
      <SessionView />

      <div className="pm-hint">
        <p>Drag to move · scroll to zoom</p>
        <button
          type="button"
          className="pm-reset"
          onClick={fitToMap}
          tabIndex={adrift ? 0 : -1}
          aria-hidden={!adrift}
        >
          Reset view
        </button>
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Continue practising                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The one piece of chrome kept from the reference.
 *
 * It is the only route back to work already started — everything else on the
 * map is spatial, and "where was I?" is not a spatial question. Fixed to the
 * viewport rather than the map, so panning away does not lose it.
 */
function ContinuePractising() {
  /*
   * COMMITTED STATE ON BOTH SIDES OF THIS COMPONENT.
   *
   * The list is `progress`, which is persisted and only ever changes when a
   * session is recorded — it does not move as the pointer crosses the map, and
   * a `useMemo` on that one stable reference is what keeps it still.
   *
   * Picking an item used to call `hoverChapter` to reveal the topic, and that
   * was the transient half: hover is the pointer's opinion, and the pointer was
   * about to have a different one. The chapter opened, then shut again the
   * moment the learner moved towards the topic they had just asked for —
   * leaving the panel describing a topic that was by then `aria-hidden` and out
   * of the tab order. Opening a chapter on purpose is a pin, which is the
   * field that survives being moved away from.
   */
  const progress = usePracticeStore((state) => state.progress)
  const recent = useMemo(() => recentTopicsOf(progress, 4), [progress])
  const select = usePracticeStore((state) => state.select)
  const pinChapter = usePracticeStore((state) => state.pinChapter)

  return (
    <section className="pm-continue" aria-label="Continue practising">
      <h2>Continue practising</h2>

      {recent.length === 0 ? (
        <p className="pm-empty">Nothing yet. Pick a chapter on the map to start.</p>
      ) : (
        <ul>
          {recent.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="pm-continue-item"
                onClick={() => {
                  select({ kind: 'topic', id })
                  const chapterId = CHAPTER_OF_TOPIC.get(id)
                  if (chapterId) pinChapter(chapterId)
                }}
              >
                {labelForTopic(id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function labelForTopic(id: TopicId): string {
  return TOPIC_BY_ID.get(id)?.name ?? CHAPTER_BY_ID.get(id)?.name ?? id
}
