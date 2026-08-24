"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useViewportStore, type Viewport } from "@/engine/viewport";
import { cn } from "@/lib/cn";

/**
 * The pannable surface: one transformed layer, and the input that moves it.
 *
 * THE TRANSFORM IS APPLIED WITHOUT REACT
 * --------------------------------------
 * Panning changes the viewport every pointer frame. If that ran through React
 * state, every one of those frames would re-render this component — and at
 * 120 Hz on a trackpad the reconciler becomes the frame budget. So this
 * component subscribes to the store directly and writes `style.transform` on
 * one wrapper node. It renders once. The nodes inside it are `children`, an
 * element the parent created and never recreates, so a pan does not touch
 * them at all: no reconciliation, no effects, no layout on anything but the
 * wrapper.
 *
 * WHEEL IS THE ONE THAT SHIPS BROKEN
 * ----------------------------------
 * React's `onWheel` is delegated to a passive root listener, and in a passive
 * listener `preventDefault()` does nothing — it does not throw, it does not
 * warn, it just silently fails, and the browser zooms the page while the map
 * appears to ignore the wheel. The only fix is a real `addEventListener` with
 * `{ passive: false }`, which is what the effect below does.
 *
 * THE TRACKPAD PROBLEM
 * --------------------
 * A pinch arrives as a `wheel` event with `ctrlKey: true` — that part is
 * unambiguous. Telling a two-finger *scroll* from a mouse wheel is not: they
 * are the same event type. The heuristic below leans on what a mouse wheel
 * does that a trackpad does not — report in lines or pages, or emit big,
 * evenly quantised deltas with no horizontal component. It is a heuristic and
 * it is documented as one; the keyboard shortcuts exist so nobody is stuck if
 * it guesses wrong on some device.
 */

/** Scale multiplier per pixel of wheel delta, as an exponent. */
const WHEEL_ZOOM_RATE = 0.0015;
/** Pinch deltas are an order of magnitude smaller than a wheel notch. */
const PINCH_ZOOM_RATE = 0.01;
/** No single event may zoom by more than this, however hard the flick. */
const MAX_ZOOM_PER_EVENT = 2;
/** Pixels an arrow key pans. Shift multiplies it. */
const KEY_PAN_PX = 64;
const KEY_ZOOM_FACTOR = 1.25;

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 400;

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The transform must be on the layer before the browser paints or the map
 * flashes at the wrong scale; but React warns about layout effects during SSR,
 * where there is nothing to lay out.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface PanZoomProps {
  children: ReactNode;
  className?: string;
  /** Fired on a press that did not land on a node — used to clear selection. */
  onBackgroundPress?(): void;
}

export function PanZoom({ children, className, onBackgroundPress }: PanZoomProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const helpId = useId();

  /** Set while a pointer drag or a wheel gesture is in flight: no easing then. */
  const directRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const firstPaintRef = useRef(true);
  const wheelSettleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  /* -- The transform ------------------------------------------------------ */

  const applyViewport = useCallback((viewport: Viewport) => {
    const layer = layerRef.current;
    if (!layer) return;

    const x = Number.isFinite(viewport.x) ? viewport.x : 0;
    const y = Number.isFinite(viewport.y) ? viewport.y : 0;
    const scale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;

    const eased = !directRef.current && !reducedMotionRef.current && !firstPaintRef.current;
    layer.style.transitionDuration = eased ? "200ms" : "0ms";
    layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    firstPaintRef.current = false;
  }, []);

  useIsomorphicLayoutEffect(() => {
    applyViewport(useViewportStore.getState().viewport);

    return useViewportStore.subscribe((state, previous) => {
      if (state.viewport !== previous.viewport) applyViewport(state.viewport);
    });
  }, [applyViewport]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = query.matches;

    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /* -- Wheel: zoom at the cursor, pan on two fingers ---------------------- */

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const onWheel = (event: WheelEvent) => {
      // Non-passive, so this actually takes effect. See the note above.
      event.preventDefault();

      const store = useViewportStore.getState();
      const box = surface.getBoundingClientRect();
      const originX = event.clientX - box.left;
      const originY = event.clientY - box.top;

      const deltaY = normaliseDelta(event.deltaY, event.deltaMode);
      const deltaX = normaliseDelta(event.deltaX, event.deltaMode);

      directRef.current = true;
      if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current);
      wheelSettleRef.current = setTimeout(() => {
        directRef.current = false;
      }, 140);

      const pinching = event.ctrlKey || event.metaKey;
      if (pinching || looksLikeMouseWheel(event, deltaX, deltaY)) {
        const rate = pinching ? PINCH_ZOOM_RATE : WHEEL_ZOOM_RATE;
        const factor = clamp(
          Math.exp(-deltaY * rate),
          1 / MAX_ZOOM_PER_EVENT,
          MAX_ZOOM_PER_EVENT,
        );
        store.zoomAt(factor, originX, originY);
        return;
      }

      store.panBy(-deltaX, -deltaY);
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      surface.removeEventListener("wheel", onWheel);
      if (wheelSettleRef.current) clearTimeout(wheelSettleRef.current);
    };
  }, []);

  /* -- Pointer: drag the background --------------------------------------- */

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // A drag that begins on a node belongs to the node, not to the map.
      if (event.target instanceof Element && event.target.closest("[data-node]")) return;
      // Middle and right buttons keep their own meanings; touch and pen have none.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (panRef.current) return;

      const surface = surfaceRef.current;
      if (!surface) return;

      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      directRef.current = true;
      surface.dataset.panning = "true";
      surface.focus({ preventScroll: true });

      // Pressing the empty map clears the selection — once, here, and never
      // again during the drag itself.
      onBackgroundPress?.();

      // Capture, so a drag that leaves the element — or the window — keeps
      // panning and still delivers its pointerup.
      if (surface.setPointerCapture) surface.setPointerCapture(event.pointerId);
    },
    [onBackgroundPress],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;

    if (dx !== 0 || dy !== 0) useViewportStore.getState().panBy(dx, dy);
  }, []);

  const endPan = useCallback((pointerId?: number) => {
    const pan = panRef.current;
    if (!pan) return;
    if (pointerId !== undefined && pan.pointerId !== pointerId) return;

    panRef.current = null;
    directRef.current = false;

    const surface = surfaceRef.current;
    if (!surface) return;
    delete surface.dataset.panning;
    if (surface.hasPointerCapture?.(pan.pointerId)) surface.releasePointerCapture(pan.pointerId);
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => endPan(event.pointerId),
    [endPan],
  );

  // Releasing a capture we still hold is the difference between a clean unmount
  // and a pointer the browser thinks is still ours.
  useEffect(() => () => endPan(), [endPan]);

  /* -- Keyboard ----------------------------------------------------------- */

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    /*
     * Only when the surface ITSELF has focus.
     *
     * React key events bubble, so without this guard every `preventDefault()`
     * below cancels the native behaviour of whatever control the learner is
     * actually using — the questions slider could not be moved with the arrow
     * keys at all, because the map ate every ArrowRight and panned instead.
     */
    if (event.target !== event.currentTarget) return;

    const store = useViewportStore.getState();
    const surface = surfaceRef.current;
    const box = surface?.getBoundingClientRect();
    const centreX = (box?.width ?? 0) / 2;
    const centreY = (box?.height ?? 0) / 2;
    const step = KEY_PAN_PX * (event.shiftKey ? 4 : 1);

    const pan = PAN_KEYS[event.key];
    if (pan) {
      event.preventDefault();
      store.panBy(pan.x * step, pan.y * step);
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      store.zoomAt(KEY_ZOOM_FACTOR, centreX, centreY);
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      store.zoomAt(1 / KEY_ZOOM_FACTOR, centreX, centreY);
    }
  }, []);

  return (
    <div
      ref={surfaceRef}
      data-surface
      role="application"
      tabIndex={0}
      aria-label="Practice map. A pannable, zoomable space."
      aria-describedby={helpId}
      className={cn(
        "absolute inset-0 overflow-hidden",
        // The ring is drawn inside the surface: an outset ring on an element
        // that fills its clipping parent is a ring nobody ever sees.
        "focus-visible:outline-offset-[-4px]",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div
        ref={layerRef}
        className="absolute top-0 left-0 h-0 w-0 will-change-transform"
        style={{
          transformOrigin: "0 0",
          transitionProperty: "transform",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDuration: "0ms",
        }}
      >
        {children}
      </div>

      <p id={helpId} className="sr-only">
        Drag to move the map. Arrow keys pan, hold shift to pan faster. Plus and minus
        zoom about the centre.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PAN_KEYS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function normaliseDelta(delta: number, mode: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (mode === 1) return delta * LINE_HEIGHT_PX;
  if (mode === 2) return delta * PAGE_HEIGHT_PX;
  return delta;
}

/**
 * Best guess at "this came from a wheel, not two fingers".
 *
 * Line and page deltas are only ever produced by discrete wheels. Pixel deltas
 * are ambiguous, so the test is the signature of a notched wheel: nothing
 * sideways, a large step, and a step quantised to a round number (Chrome emits
 * multiples of 120). A trackpad's inertial deltas are small, uneven and usually
 * carry some horizontal component.
 */
function looksLikeMouseWheel(event: WheelEvent, deltaX: number, deltaY: number): boolean {
  if (event.deltaMode !== 0) return true;
  if (deltaX !== 0) return false;
  const magnitude = Math.abs(deltaY);
  return magnitude >= 100 && magnitude % 20 === 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
