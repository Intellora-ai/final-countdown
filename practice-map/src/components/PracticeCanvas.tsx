"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Constellation } from "@/components/Constellation";
import { PracticePanel } from "@/components/PracticePanel";
import { SessionStub } from "@/components/SessionStub";
import { PanZoom } from "@/components/PanZoom";
import {
  CHAPTER_BY_ID,
  CHAPTER_OF_TOPIC,
  TOPIC_BY_ID,
  type TopicId,
} from "@/engine/curriculum";
import { buildGraph } from "@/engine/layout";
import {
  hydratePracticeStore,
  recentTopicsOf,
  usePracticeStore,
} from "@/engine/store";
import { useViewportStore } from "@/engine/viewport";
import type { Viewport } from "@/engine/viewport";
import { fitToRect } from "@/engine/viewport";
import { cn } from "@/lib/cn";

/**
 * The screen.
 *
 * REUSING `PanZoom` RATHER THAN WRITING PAN/ZOOM AGAIN
 * ----------------------------------------------------------
 * It already carries three fixes that are invisible until they are missing:
 * a non-passive wheel listener (React's `onWheel` cannot `preventDefault`, so
 * the page zooms instead of the canvas), pointer capture so a drag that leaves
 * the window still ends cleanly, and a trackpad-versus-wheel heuristic. Writing
 * a second pan implementation here would mean rediscovering all three.
 *
 * WHY BACKGROUND-CLICK CLEARING IS HANDLED HERE
 * ---------------------------------------------
 * `PanZoom` clears the *canvas* store's selection on a background press.
 * The practice selection is a different thing in a different store, so it is
 * cleared here, using the same `[data-node]` test so the two agree on what
 * counts as "the background".
 */

export function PracticeCanvas() {
  const select = usePracticeStore((state) => state.select);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  /** The viewport the map opened at — what "reset view" returns to. */
  const homeRef = useRef<Viewport | null>(null);
  const [adrift, setAdrift] = useState(false);

  // Saved chapters and progress arrive here, one frame after first paint.
  useEffect(hydratePracticeStore, []);

  /*
   * WHY THIS CONTROL EXISTS AT ALL
   * ------------------------------
   * Cursor-anchored zoom on empty space walks the map off screen, and a
   * surface with no scrollbar gives no clue how to get back. `PanZoom`
   * binds `0` to reset, but only while the canvas itself has focus, and
   * nothing on screen says so — so the honest failure mode is a learner who
   * concludes the page is broken.
   *
   * It stays invisible until the view has actually moved, so the resting
   * screen keeps its zero-chrome composition and the button only appears at
   * the moment it means something.
   */
  useEffect(() => {
    const moved = (viewport: Viewport) => {
      const home = homeRef.current;
      if (!home) return false;
      return (
        Math.abs(viewport.x - home.x) > 24 ||
        Math.abs(viewport.y - home.y) > 24 ||
        Math.abs(viewport.scale - home.scale) > 0.02
      );
    };

    return useViewportStore.subscribe((state, previous) => {
      if (state.viewport === previous.viewport) return;
      setAdrift(moved(state.viewport));
    });
  }, []);

  /* Frame the whole map on first paint. Without this the canvas opens at
     scale 1 on the origin, which is empty space above and left of everything. */
  const fitToMap = useCallback(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    const { bounds } = buildGraph();
    const fitted = fitToRect(bounds, box.width, box.height, 56);
    homeRef.current = fitted;
    useViewportStore.getState().setViewport(fitted);
  }, []);

  /*
   * FIT ONCE — BUT ONLY ONCE THE ELEMENT ACTUALLY HAS A SIZE.
   *
   * A bare `useEffect(fitToMap, [])` looks right and silently does nothing:
   * on the first commit the surface can still measure 0 x 0, `fitToMap`
   * returns early, and nothing ever calls it again — so the map opens at
   * scale 1 on the origin and overflows the screen with no error anywhere.
   * That is exactly how this shipped a moment ago.
   *
   * So a ResizeObserver retries until a real box arrives, then disconnects
   * itself. Staying subscribed would re-fit on every window resize, yanking
   * the view out from under someone who had panned somewhere deliberately.
   */
  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;

    if (element.getBoundingClientRect().width > 0) {
      fitToMap();
      return;
    }

    const observer = new ResizeObserver(() => {
      if (element.getBoundingClientRect().width === 0) return;
      fitToMap();
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitToMap]);

  const onBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target instanceof Element && event.target.closest("[data-node]")) return;
      if (usePracticeStore.getState().selection !== null) select(null);
    },
    [select],
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-void">
      {/* The ambient lift behind the field, so the map does not sit on flat
          black. Matches the reference's centre-top glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(118% 74% at 50% -14%, var(--color-void-lift) 0%, var(--color-void) 62%)",
        }}
      />

      <div ref={surfaceRef} className="absolute inset-0" onPointerDown={onBackgroundPointerDown}>
        <PanZoom>
          <Constellation />
        </PanZoom>
      </div>

      <ContinuePractising />
      <PracticePanel />
      <SessionStub />
      <ViewHint adrift={adrift} onReset={fitToMap} />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Continue practising                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The one piece of chrome kept from the reference.
 *
 * It is the only route back to work already started — everything else on the
 * map is spatial, and "where was I?" is not a spatial question. Fixed to the
 * viewport rather than the canvas, so panning away does not lose it.
 */
function ContinuePractising() {
  const progress = usePracticeStore((state) => state.progress);
  const recent = useMemo(() => recentTopicsOf(progress, 4), [progress]);
  const select = usePracticeStore((state) => state.select);
  const hoverChapter = usePracticeStore((state) => state.hoverChapter);

  return (
    <section
      aria-label="Continue practising"
      className="absolute top-8 left-8 z-10 w-[212px]"
    >
      <h2 className="border-b border-line pb-3 text-[15px] font-normal text-ink">
        Continue practising
      </h2>

      {recent.length === 0 ? (
        <p className="pt-3.5 text-[12.5px] leading-relaxed text-ink-faint">
          Nothing yet. Pick a chapter on the map to start.
        </p>
      ) : (
        <ul>
          {recent.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  select({ kind: "topic", id });
                  const chapterId = CHAPTER_OF_TOPIC.get(id);
                  if (chapterId) hoverChapter(chapterId);
                }}
                className="w-full cursor-pointer border-b border-line/60 py-3 text-left text-[14px] text-ink-muted transition-[color,padding] duration-150 hover:pl-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {labelForTopic(id)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function labelForTopic(id: TopicId): string {
  return TOPIC_BY_ID.get(id)?.name ?? CHAPTER_BY_ID.get(id)?.name ?? id;
}

/* -------------------------------------------------------------------------- */
/* View hint                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Three words, bottom right, at low contrast.
 *
 * A pannable surface with no scrollbar and no visible affordance is genuinely
 * undiscoverable — the first-run failure is someone deciding the page is broken
 * because it will not scroll. One quiet line is the cheapest fix that does not
 * add chrome.
 */
function ViewHint({ adrift, onReset }: { adrift: boolean; onReset(): void }) {
  return (
    <div className="absolute right-8 bottom-7 z-10 flex items-center gap-4">
      <p className="pointer-events-none text-[11px] text-ink-faint/60">
        Drag to move · scroll to zoom
      </p>
      <button
        type="button"
        onClick={onReset}
        tabIndex={adrift ? 0 : -1}
        aria-hidden={!adrift}
        className={cn(
          "cursor-pointer rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-muted",
          "transition-[opacity,color,border-color] duration-200 motion-reduce:transition-none",
          "hover:border-line-strong hover:text-ink",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          adrift ? "opacity-100" : "pointer-events-none invisible opacity-0",
        )}
      >
        Reset view
      </button>
    </div>
  );
}
