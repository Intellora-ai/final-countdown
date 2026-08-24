"use client";

import { useMemo } from "react";

import { CHAPTER_BY_ID, type ChapterId } from "@/engine/curriculum";
import { buildGraph, nebulaFor, type Graph, type TopicNode } from "@/engine/layout";
import { chapterCoverageOf, isChapterOpen, usePracticeStore } from "@/engine/store";
import { cn } from "@/lib/cn";

/**
 * The map.
 *
 * WHAT IS SVG AND WHAT IS HTML, AND WHY
 * -------------------------------------
 * Lines, dust and glows are SVG: they are geometry, there are ~500 of them, and
 * they must never take a click. Chapter and topic nodes are HTML `<button>`s:
 * they are the interactive surface, and a real button is the difference between
 * a map a keyboard user can operate and a picture they cannot. SVG text is also
 * measurably blurrier than HTML text at fractional scales, and every label here
 * is read at fractional scales because the whole thing zooms.
 *
 * NOTHING MOVES ON ITS OWN EXCEPT THE GLOW
 * ----------------------------------------
 * Motion is a response to input: topics ease out when their chapter opens, the
 * ring tightens on hover. The one exception is the slow breathe on practised
 * nodes, at 6–9 seconds a cycle — below the rate at which peripheral motion
 * reads as fidgeting. Anything faster turns a study tool into a slot machine.
 * All of it is off under `prefers-reduced-motion`.
 */

/** Nodes carry this so `PanZoom` lets the click through instead of panning. */
const NODE_ATTR = { "data-node": "" } as const;

export function Constellation() {
  const graph = useMemo(() => buildGraph(), []);
  const dots = useMemo(() => nebulaFor(graph.subjects), [graph.subjects]);

  return (
    <>
      <FieldLayer graph={graph} dots={dots} />
      <SubjectLabels graph={graph} />
      <ChapterNodes graph={graph} />
      <TopicNodes graph={graph} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Static field: dust, spokes, and the glow behind each subject               */
/* -------------------------------------------------------------------------- */

function FieldLayer({ graph, dots }: { graph: Graph; dots: ReturnType<typeof nebulaFor> }) {
  /*
   * Two stable selections combined here, rather than one selector returning a
   * merged array. A selector that builds an array returns a new reference every
   * time the store changes, and zustand's reference comparison then reports a
   * change on every pointer move — which is an infinite render loop, not a
   * performance nit. Both of these are a primitive and a persisted array, so
   * both are referentially stable until they genuinely change.
   */
  const hoveredChapterId = usePracticeStore((state) => state.hoveredChapterId);
  const pinnedChapterIds = usePracticeStore((state) => state.pinnedChapterIds);

  const openIds = useMemo(() => {
    const set = new Set(pinnedChapterIds);
    if (hoveredChapterId) set.add(hoveredChapterId);
    return set;
  }, [hoveredChapterId, pinnedChapterIds]);

  const { x, y, width, height } = graph.bounds;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute overflow-visible"
      style={{ left: x, top: y, width, height }}
      viewBox={`${x} ${y} ${width} ${height}`}
      width={width}
      height={height}
    >
      <defs>
        <radialGradient id="subject-haze">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.055" />
          <stop offset="55%" stopColor="var(--color-accent)" stopOpacity="0.018" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <filter id="dot-bloom" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Haze first: everything else sits on top of it. */}
      {graph.subjects.map((subject) => (
        <circle
          key={subject.id}
          cx={subject.x}
          cy={subject.y}
          r={340}
          fill="url(#subject-haze)"
        />
      ))}

      {dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={dot.hot ? "var(--color-accent-soft)" : "var(--color-ink-faint)"}
          fillOpacity={dot.opacity}
          filter={dot.hot ? "url(#dot-bloom)" : undefined}
        />
      ))}

      {graph.spokes.map((edge, index) => (
        <line
          key={index}
          x1={edge.from.x}
          y1={edge.from.y}
          x2={edge.to.x}
          y2={edge.to.y}
          stroke="var(--color-ink-faint)"
          strokeOpacity={0.17}
          strokeWidth={0.9}
        />
      ))}

      {/* Tendrils fade in with their chapter rather than popping. */}
      {graph.tendrils.map((edge, index) => {
        const open = edge.chapterId !== null && openIds.has(edge.chapterId);
        return (
          <line
            key={index}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={open ? edge.to.x : edge.from.x}
            y2={open ? edge.to.y : edge.from.y}
            stroke="var(--color-accent)"
            strokeOpacity={open ? 0.3 : 0}
            strokeWidth={0.9}
            className="transition-all duration-300 ease-out motion-reduce:transition-none"
          />
        );
      })}
    </svg>
  );
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
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[27px] font-normal tracking-[0.14em] whitespace-nowrap text-ink-faint/55 uppercase select-none"
          style={{ left: subject.x, top: subject.y }}
        >
          {subject.name}
        </div>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Chapter nodes                                                              */
/* -------------------------------------------------------------------------- */

function ChapterNodes({ graph }: { graph: Graph }) {
  const hoverChapter = usePracticeStore((state) => state.hoverChapter);
  const toggleChapterPinned = usePracticeStore((state) => state.toggleChapterPinned);
  const select = usePracticeStore((state) => state.select);

  return (
    <>
      {graph.chapters.map((chapter) => (
        <ChapterNode
          key={chapter.id}
          id={chapter.id}
          x={chapter.x}
          y={chapter.y}
          number={chapter.number}
          name={chapter.name}
          onEnter={() => hoverChapter(chapter.id)}
          onLeave={() => hoverChapter(null)}
          onActivate={() => {
            toggleChapterPinned(chapter.id);
            select({ kind: "chapter", id: chapter.id });
          }}
        />
      ))}
    </>
  );
}

interface ChapterNodeProps {
  id: string;
  x: number;
  y: number;
  number: number;
  name: string;
  onEnter(): void;
  onLeave(): void;
  onActivate(): void;
}

function ChapterNode({ id, x, y, number, name, onEnter, onLeave, onActivate }: ChapterNodeProps) {
  const open = usePracticeStore((state) => isChapterOpen(state, id));
  const pinned = usePracticeStore((state) => state.pinnedChapterIds.includes(id));
  const selected = usePracticeStore(
    (state) => state.selection?.kind === "chapter" && state.selection.id === id,
  );
  /* `progress` is one stable object reference that only changes when a session
     is recorded; the {done,total} pair is derived from it here. Selecting the
     pair directly would hand zustand a new object every render — the same
     reference-comparison loop guarded against in `FieldLayer`. */
  const progress = usePracticeStore((state) => state.progress);
  const coverage = useMemo(
    () => chapterCoverageOf(progress, id),
    [progress, id],
  );

  const started = coverage.done > 0;
  const complete = coverage.total > 0 && coverage.done === coverage.total;

  return (
    <button
      {...NODE_ATTR}
      type="button"
      aria-expanded={open}
      aria-label={`Chapter ${number}, ${name}. ${coverage.done} of ${coverage.total} topics practised.`}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-2 rounded-lg px-2 py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      style={{ left: x, top: y }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onActivate}
    >
      <span className="relative grid size-0 place-items-center">
        {/* Halo. Widens on open so the node reads as the source of the fan. */}
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full transition-all duration-300 ease-out motion-reduce:transition-none",
            open ? "size-16 opacity-100" : "size-9 opacity-60",
          )}
          style={{
            background:
              "radial-gradient(circle, var(--color-accent-glow) 0%, transparent 68%)",
          }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute rounded-full ring-1 transition-all duration-200 ease-out motion-reduce:transition-none",
            complete
              ? "bg-accent-soft ring-accent-soft/70"
              : started
                ? "bg-accent ring-accent/60"
                : "bg-ink-faint ring-ink-faint/40",
            open || selected ? "size-[13px]" : "size-[9px]",
            started && !open && "animate-[breathe_7s_ease-in-out_infinite]",
          )}
        />
        {selected && (
          <span
            aria-hidden
            className="absolute size-7 rounded-full ring-1 ring-accent/70 transition-all duration-200"
          />
        )}
      </span>

      <span
        className={cn(
          "mt-3 max-w-[168px] text-center text-[13px] leading-tight transition-colors duration-200",
          open || selected ? "text-ink" : "text-ink-muted",
        )}
      >
        <span className="block text-[10.5px] tracking-[0.13em] text-ink-faint uppercase">
          Ch {number}
        </span>
        {name}
      </span>

      {/* Coverage, only once there is something to report. */}
      {started && (
        <span className="text-[10px] tabular-nums text-accent/70">
          {coverage.done}/{coverage.total}
        </span>
      )}

      {/* A pinned chapter says so, quietly — otherwise "why is this one still
          open?" has no answer on screen. */}
      {pinned && (
        <span aria-hidden className="size-1 rounded-full bg-accent/60" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Topic nodes                                                                */
/* -------------------------------------------------------------------------- */

function TopicNodes({ graph }: { graph: Graph }) {
  const select = usePracticeStore((state) => state.select);
  const hoverChapter = usePracticeStore((state) => state.hoverChapter);

  /* Grouped so a topic's stagger index is its position within its own chapter,
     not within all ~120 topics — otherwise the last chapter's fan would take
     four seconds to finish opening. */
  const byChapter = useMemo(() => {
    const map = new Map<ChapterId, TopicNode[]>();
    for (const topic of graph.topics) {
      const list = map.get(topic.chapterId);
      if (list) list.push(topic);
      else map.set(topic.chapterId, [topic]);
    }
    return map;
  }, [graph.topics]);

  return (
    <>
      {[...byChapter.entries()].map(([chapterId, topics]) =>
        topics.map((topic, index) => (
          <TopicNode
            key={topic.id}
            id={topic.id}
            chapterId={chapterId}
            name={topic.name}
            chapterName={CHAPTER_BY_ID.get(chapterId)?.name ?? ""}
            x={topic.x}
            y={topic.y}
            index={index}
            onEnter={() => hoverChapter(chapterId)}
            onLeave={() => hoverChapter(null)}
            onActivate={() => select({ kind: "topic", id: topic.id })}
          />
        )),
      )}
    </>
  );
}

interface TopicNodeProps {
  id: string;
  chapterId: string;
  name: string;
  chapterName: string;
  x: number;
  y: number;
  index: number;
  onEnter(): void;
  onLeave(): void;
  onActivate(): void;
}

function TopicNode({
  id,
  chapterId,
  name,
  chapterName,
  x,
  y,
  index,
  onEnter,
  onLeave,
  onActivate,
}: TopicNodeProps) {
  const open = usePracticeStore((state) => isChapterOpen(state, chapterId));
  const selected = usePracticeStore(
    (state) => state.selection?.kind === "topic" && state.selection.id === id,
  );
  const practiced = usePracticeStore(
    (state) => (state.progress[id]?.lastPracticedAt ?? 0) > 0,
  );

  return (
    <button
      {...NODE_ATTR}
      type="button"
      /* Closed topics leave the tab order entirely. A keyboard user must not
         have to tab through 120 invisible buttons to cross the map. */
      tabIndex={open ? 0 : -1}
      aria-hidden={!open}
      /* The visible label is just "Opportunity cost". Out of context that could
         be any of three subjects, so the announced name carries its chapter. */
      aria-label={
        practiced
          ? `${name}, in ${chapterName}. Practised.`
          : `${name}, in ${chapterName}. Not practised yet.`
      }
      className={cn(
        "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-md px-1.5 py-1",
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
        open
          ? "pointer-events-auto scale-100 cursor-pointer opacity-100"
          : "pointer-events-none scale-75 opacity-0",
      )}
      style={{ left: x, top: y, transitionDelay: open ? `${index * 32}ms` : "0ms" }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onActivate}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full ring-1 transition-all duration-200",
          practiced ? "bg-accent ring-accent/50" : "bg-ink-faint/70 ring-ink-faint/30",
          selected ? "size-2.5" : "size-1.5",
        )}
      />
      <span
        className={cn(
          "max-w-[124px] text-center text-[11.5px] leading-tight whitespace-normal transition-colors duration-200",
          selected ? "text-accent-soft" : practiced ? "text-ink-muted" : "text-ink-faint",
        )}
      >
        {name}
      </span>
    </button>
  );
}

