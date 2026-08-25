import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import type { Subject } from './curriculum'
import { useExamChoice } from './examChoice'
import { useMapClass } from './mapClass'
import { practiceCurriculumFor } from './mapSource'

import { type ChapterId, type TopicId } from './curriculum'
import {
  buildGraph,
  nebulaFor,
  type ChapterNode,
  type Dot,
  type Graph,
  type TopicNode,
} from './layout'
import { chapterCoverageOf, isChapterOpen, usePracticeStore } from './store'

/**
 * The map.
 *
 * WHAT IS SVG AND WHAT IS HTML, AND WHY
 * -------------------------------------
 * Lines, dust and glows are SVG: they are geometry, there are ~400 of them, and
 * they must never take a click. Chapter and topic nodes are HTML `<button>`s —
 * a real button is the difference between a map a keyboard user can operate and
 * a picture they cannot. SVG text is also measurably blurrier than HTML text at
 * fractional scales, and every label here is read at a fractional scale because
 * the whole thing zooms.
 *
 * NOTHING MOVES ON ITS OWN EXCEPT THE GLOW
 * ----------------------------------------
 * Motion is a response to input: topics ease out when their chapter opens, the
 * halo widens on hover. The one exception is the slow breathe on practised
 * nodes, at seven seconds a cycle — below the rate at which peripheral motion
 * reads as fidgeting. All of it is flattened by `prefers-reduced-motion`.
 *
 * A CHAPTER AND ITS TOPICS ARE ADJACENT IN THE DOM, AND THAT IS LOAD-BEARING
 * -------------------------------------------------------------------------
 * They used to render as two blocks — all 24 chapters, then all 120 topics —
 * which put every other chapter between a chapter and the topics it opens. Tab
 * from a chapter therefore went to the NEXT CHAPTER; the one it left blurred,
 * `hoverChapter(null)` closed it, and its topics dropped out of the tab order
 * before the tab order ever reached them. A keyboard user could open a chapter
 * and then not select anything in it. Interleaving them is what makes the
 * cluster the next thing after its own owner.
 */

export function Constellation() {
  /*
   * The curriculum the student's CLASS actually studies, not the class-12
   * commerce seed the map used to draw for everyone. `mapSource` loads the
   * official CBSE data lazily -- one class file is 240-560 KB and a student has
   * exactly one class -- and filters out the topics nobody could practise.
   *
   * The seed still renders while that promise is in flight, so the map is never
   * blank; `source` on the result says which one is on screen.
   */
  const [curriculum, setCurriculum] = useState<readonly Subject[] | null>(null)
  const cls = useMapClass()
  /*
   * The entrance exam is drawn ALONGSIDE the class, not instead of it. A
   * student sits both, and Class 11 Physics and JEE Physics are overlapping but
   * different scopes.
   */
  const [exam] = useExamChoice()

  useEffect(() => {
    let live = true
    void practiceCurriculumFor(cls, exam).then((result) => {
      if (live) setCurriculum(result.subjects)
    })
    return () => {
      live = false
    }
  }, [cls, exam])

  const graph = useMemo(() => buildGraph(curriculum ?? undefined), [curriculum])
  const dots = useMemo(() => nebulaFor(graph.subjects), [graph.subjects])

  return (
    <>
      <FieldLayer graph={graph} dots={dots} />
      <SubjectLabels graph={graph} />
      <ChapterClusters graph={graph} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Static field: dust, spokes, and the glow behind each subject               */
/* -------------------------------------------------------------------------- */

function FieldLayer({ graph, dots }: { graph: Graph; dots: readonly Dot[] }) {
  /*
   * Two stable selections combined here, rather than one selector returning a
   * merged array. A selector that builds an array returns a new reference on
   * every store change, and zustand's reference comparison then reports a
   * change on every pointer move — an infinite render loop, not a performance
   * nit. Both of these are referentially stable until they genuinely change.
   */
  const hoveredChapterId = usePracticeStore((state) => state.hoveredChapterId)
  const pinnedChapterIds = usePracticeStore((state) => state.pinnedChapterIds)

  const openIds = useMemo(() => {
    const set = new Set(pinnedChapterIds)
    if (hoveredChapterId) set.add(hoveredChapterId)
    return set
  }, [hoveredChapterId, pinnedChapterIds])

  const { x, y, width, height } = graph.bounds

  return (
    <svg
      aria-hidden
      className="pm-sky"
      style={{ left: x, top: y, width, height }}
      viewBox={`${x} ${y} ${width} ${height}`}
      width={width}
      height={height}
    >
      <defs>
        <radialGradient id="pm-haze">
          <stop offset="0%" stopColor="var(--pm-accent)" stopOpacity="0.055" />
          <stop offset="55%" stopColor="var(--pm-accent)" stopOpacity="0.018" />
          <stop offset="100%" stopColor="var(--pm-accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="pm-bloom" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Haze first: everything else sits on top of it. */}
      {graph.subjects.map((subject) => (
        <circle key={subject.id} cx={subject.x} cy={subject.y} r={340} fill="url(#pm-haze)" />
      ))}

      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={dot.hot ? 'var(--pm-accent-soft)' : 'var(--pm-ink-faint)'}
          fillOpacity={dot.opacity}
          filter={dot.hot ? 'url(#pm-bloom)' : undefined}
        />
      ))}

      {graph.spokes.map((edge, index) => (
        <line
          key={index}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="var(--pm-ink-faint)"
          strokeOpacity={0.17}
          strokeWidth={0.9}
        />
      ))}

      {/* Tendrils grow out of their chapter rather than popping into place. */}
      {graph.tendrils.map((edge, index) => {
        const open = edge.chapterId !== null && openIds.has(edge.chapterId)
        return (
          <line
            key={index}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={open ? edge.to.x : edge.from.x}
            y2={open ? edge.to.y : edge.from.y}
            stroke="var(--pm-accent)"
            strokeOpacity={open ? 0.3 : 0}
            strokeWidth={0.9}
            style={{ transition: 'all 300ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        )
      })}
    </svg>
  )
}

/* -------------------------------------------------------------------------- */
/* Subject labels                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Large, dim, and not interactive.
 *
 * They are wayfinding, not controls — you steer by them the way you steer by a
 * street name. Making them clickable would imply a "practise all of Economics"
 * action that does not exist.
 */
function SubjectLabels({ graph }: { graph: Graph }) {
  return (
    <>
      {graph.subjects.map((subject) => (
        <div
          key={subject.id}
          aria-hidden
          className="pm-subject"
          style={{ left: subject.x, top: subject.y }}
        >
          {subject.name}
        </div>
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Chapter clusters: a chapter and the topics it opens                        */
/* -------------------------------------------------------------------------- */

const NO_TOPICS: readonly TopicNode[] = []

function ChapterClusters({ graph }: { graph: Graph }) {
  /* Grouped so a topic's stagger index is its position within its own chapter,
     not within all 120 topics — otherwise the last chapter's fan would take
     four seconds to finish opening. */
  const byChapter = useMemo(() => {
    const map = new Map<ChapterId, TopicNode[]>()
    for (const topic of graph.topics) {
      const list = map.get(topic.chapterId)
      if (list) list.push(topic)
      else map.set(topic.chapterId, [topic])
    }
    return map
  }, [graph.topics])

  /* One hint, referenced by all 24 chapters. Arrow-key entry into a fan is not
     guessable from a button that only says "Chapter 3" — an affordance nothing
     announces is an affordance only its author has. */
  const hintId = useId()

  return (
    <>
      <p id={hintId} className="pm-sr-only">
        Press the down or right arrow key to move into this chapter&rsquo;s topics. Inside a
        chapter, the arrow keys move between topics, and Home and End jump to the first and
        last.
      </p>

      {graph.chapters.map((chapter) => (
        <ChapterCluster
          key={chapter.id}
          chapter={chapter}
          topics={byChapter.get(chapter.id) ?? NO_TOPICS}
          hintId={hintId}
        />
      ))}
    </>
  )
}

/**
 * ROVING TABINDEX, NOT 120 TAB STOPS.
 *
 * Every topic in the tab order would mean a keyboard user crossing an open
 * chapter one Tab per topic, and — because a chapter is also opened by FOCUS —
 * every chapter they passed through on the way would fan open and add its own
 * topics to the queue ahead of them. So the cluster is one tab stop: Tab
 * reaches the chapter, Tab again reaches its fan, Tab again leaves. Inside the
 * fan the arrow keys move between siblings, which is what the pattern exists
 * for and what a screen-reader user is already trying when the nodes are
 * arranged in space rather than in a list.
 *
 * The remembered topic is component state, not store state. It is "where the
 * caret was in this fan", which dies with the render tree — persisting it would
 * put a fourth thing in a store whose whole first comment is about which kinds
 * of open deserve to be saved.
 */
function ChapterCluster({
  chapter,
  topics,
  hintId,
}: {
  chapter: ChapterNode
  topics: readonly TopicNode[]
  hintId: string
}) {
  const hoverChapter = usePracticeStore((state) => state.hoverChapter)
  const activateChapter = usePracticeStore((state) => state.activateChapter)
  const select = usePracticeStore((state) => state.select)

  const buttons = useRef(new Map<TopicId, HTMLButtonElement>())
  const [rovingId, setRovingId] = useState<TopicId | null>(null)
  const activeId = rovingId ?? topics[0]?.id ?? null

  const focusTopic = useCallback((id: TopicId) => {
    setRovingId(id)
    buttons.current.get(id)?.focus()
  }, [])

  const step = useCallback(
    (from: TopicId, delta: number) => {
      if (topics.length === 0) return
      const index = topics.findIndex((topic) => topic.id === from)
      if (index < 0) return
      const next = topics[(index + delta + topics.length) % topics.length]
      if (next) focusTopic(next.id)
    },
    [topics, focusTopic],
  )

  /*
   * FOCUS MOVING WITHIN THE CLUSTER MUST NOT CLOSE IT.
   *
   * Hover and focus share one slot, so the chapter's own `blur` closed the fan
   * the instant focus stepped into it — the topic was hidden and `aria-hidden`
   * for the frame before its `focus` reopened the chapter, and a pointer that
   * wandered off the chapter closed the fan out from under a topic that had the
   * caret. Both are the same mistake: treating "focus left this button" as
   * "the learner left this chapter".
   */
  const stillInside = useCallback(
    (node: EventTarget | null) =>
      node instanceof Element &&
      node.closest('[data-chapter]')?.getAttribute('data-chapter') === chapter.id,
    [chapter.id],
  )

  const leave = useCallback(() => {
    if (stillInside(document.activeElement)) return
    hoverChapter(null)
  }, [hoverChapter, stillInside])

  const blur = useCallback(
    (next: EventTarget | null) => {
      if (stillInside(next)) return
      hoverChapter(null)
    },
    [hoverChapter, stillInside],
  )

  const onChapterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowRight') return
      const first = activeId ?? topics[0]?.id
      if (!first) return
      // Otherwise the surface behind would also read this as a pan.
      event.preventDefault()
      focusTopic(first)
    },
    [activeId, topics, focusTopic],
  )

  const onTopicKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, id: TopicId) => {
      const last = topics[topics.length - 1]
      const first = topics[0]

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        step(id, 1)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        step(id, -1)
      } else if (event.key === 'Home' && first) {
        event.preventDefault()
        focusTopic(first.id)
      } else if (event.key === 'End' && last) {
        event.preventDefault()
        focusTopic(last.id)
      }
    },
    [topics, step, focusTopic],
  )

  return (
    <>
      <ChapterNodeView
        id={chapter.id}
        x={chapter.x}
        y={chapter.y}
        number={chapter.number}
        name={chapter.name}
        hintId={hintId}
        onEnter={() => hoverChapter(chapter.id)}
        onLeave={leave}
        onBlur={blur}
        onKeyDown={onChapterKeyDown}
        onActivate={() => activateChapter(chapter.id)}
      />

      {topics.map((topic, index) => (
        <TopicNodeView
          key={topic.id}
          id={topic.id}
          chapterId={chapter.id}
          name={topic.name}
          chapterName={chapter.name}
          x={topic.x}
          y={topic.y}
          index={index}
          roving={topic.id === activeId}
          register={(node) => {
            if (node) buttons.current.set(topic.id, node)
            else buttons.current.delete(topic.id)
          }}
          onEnter={() => hoverChapter(chapter.id)}
          onLeave={leave}
          onBlur={blur}
          onFocusIn={() => setRovingId(topic.id)}
          onKeyDown={(event) => onTopicKeyDown(event, topic.id)}
          onActivate={() => select({ kind: 'topic', id: topic.id })}
        />
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Chapter node                                                               */
/* -------------------------------------------------------------------------- */

interface ChapterNodeViewProps {
  id: string
  x: number
  y: number
  number: number
  name: string
  hintId: string
  onEnter(): void
  onLeave(): void
  onBlur(next: EventTarget | null): void
  onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void
  onActivate(): void
}

function ChapterNodeView({
  id,
  x,
  y,
  number,
  name,
  hintId,
  onEnter,
  onLeave,
  onBlur,
  onKeyDown,
  onActivate,
}: ChapterNodeViewProps) {
  const open = usePracticeStore((state) => isChapterOpen(state, id))
  const pinned = usePracticeStore((state) => state.pinnedChapterIds.includes(id))
  const selected = usePracticeStore(
    (state) => state.selection?.kind === 'chapter' && state.selection.id === id,
  )

  /* `progress` is one stable reference that only changes when a session is
     recorded; the {done,total} pair is derived from it here. Selecting the pair
     directly would hand zustand a new object every render. */
  const progress = usePracticeStore((state) => state.progress)
  const coverage = useMemo(() => chapterCoverageOf(progress, id), [progress, id])

  const started = coverage.done > 0
  const complete = coverage.total > 0 && coverage.done === coverage.total

  return (
    <button
      data-node=""
      data-chapter={id}
      data-selected={selected}
      type="button"
      aria-expanded={open}
      aria-describedby={hintId}
      aria-label={`Chapter ${number}, ${name}. ${coverage.done} of ${coverage.total} topics practised.`}
      className="pm-node pm-chapter"
      style={{ left: x, top: y }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => onBlur(event.relatedTarget)}
      onKeyDown={onKeyDown}
      onClick={onActivate}
    >
      <span className="pm-dot-stack">
        <span aria-hidden className="pm-halo" />
        <span aria-hidden className="pm-core" data-started={started} data-complete={complete} />
        {selected && <span aria-hidden className="pm-ring" />}
      </span>

      <span className="pm-chapter-label">
        <span className="pm-chapter-number">Ch {number}</span>
        {name}
      </span>

      {/* Coverage, only once there is something to report. */}
      {started && (
        <span className="pm-coverage">
          {coverage.done}/{coverage.total}
        </span>
      )}

      {/* A pinned chapter says so, quietly — otherwise "why is this one still
          open?" has no answer on screen. */}
      {pinned && <span aria-hidden className="pm-pin" />}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Topic node                                                                 */
/* -------------------------------------------------------------------------- */

interface TopicNodeViewProps {
  id: string
  chapterId: string
  name: string
  chapterName: string
  x: number
  y: number
  index: number
  /** True for the one topic in this fan that carries the cluster's tab stop. */
  roving: boolean
  register(node: HTMLButtonElement | null): void
  onEnter(): void
  onLeave(): void
  onBlur(next: EventTarget | null): void
  onFocusIn(): void
  onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void
  onActivate(): void
}

function TopicNodeView({
  id,
  chapterId,
  name,
  chapterName,
  x,
  y,
  index,
  roving,
  register,
  onEnter,
  onLeave,
  onBlur,
  onFocusIn,
  onKeyDown,
  onActivate,
}: TopicNodeViewProps) {
  const open = usePracticeStore((state) => isChapterOpen(state, chapterId))
  const selected = usePracticeStore(
    (state) => state.selection?.kind === 'topic' && state.selection.id === id,
  )
  const practised = usePracticeStore((state) => (state.progress[id]?.lastPracticedAt ?? 0) > 0)

  return (
    <button
      ref={register}
      data-node=""
      data-chapter={chapterId}
      data-open={open}
      data-selected={selected}
      type="button"
      /* Closed topics leave the tab order entirely, and so do all but one of an
         OPEN chapter's topics — the fan is a single tab stop, walked with the
         arrow keys. A keyboard user must not have to tab through 120 buttons,
         invisible or otherwise, to cross the map. */
      tabIndex={open && roving ? 0 : -1}
      aria-hidden={!open}
      /* The visible label is just "Opportunity cost". Out of context that could
         be any of three subjects, so the announced name carries its chapter. */
      aria-label={
        practised
          ? `${name}, in ${chapterName}. Practised.`
          : `${name}, in ${chapterName}. Not practised yet.`
      }
      className="pm-node pm-topic"
      style={{ left: x, top: y, transitionDelay: open ? `${index * 32}ms` : '0ms' }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={() => {
        onEnter()
        onFocusIn()
      }}
      onBlur={(event) => onBlur(event.relatedTarget)}
      onKeyDown={onKeyDown}
      onClick={onActivate}
    >
      <span aria-hidden className="pm-topic-dot" data-practised={practised} />
      <span className="pm-topic-label" data-practised={practised}>
        {name}
      </span>
    </button>
  )
}
