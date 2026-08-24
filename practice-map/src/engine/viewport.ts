import { create } from "zustand";

/**
 * The viewport: one transform, and the arithmetic that moves it.
 *
 * ONE TRANSFORM, STATED ONCE
 * --------------------------
 * The map draws itself as `translate(x, y) scale(s)` on a single wrapper, so a
 * world point lands on screen at `p * s + t`. Every function here is that
 * sentence or its inverse. Writing it in one place is what lets the pan
 * handler, the wheel handler and the fit-on-load agree — the usual way a canvas
 * develops a "the cursor is not where the thing is" bug is two of those three
 * re-deriving the transform slightly differently.
 *
 * WHY THIS IS ITS OWN STORE
 * -------------------------
 * Panning changes the viewport on every pointer frame. Routing that through
 * React state re-renders the tree at 120 Hz on a trackpad. `PanZoom`
 * subscribes to this store directly and writes `style.transform` on one node,
 * so a pan touches no component at all.
 */

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Clamped so a scroll-wheel flick cannot leave the map unrecoverable. */
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

/** Breathing room, in screen pixels, left around a fitted rectangle. */
export const FIT_PADDING_PX = 56;

export interface ViewportState {
  viewport: Viewport;
  setViewport(viewport: Viewport): void;
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, originX: number, originY: number): void;
  resetViewport(): void;
}

export const useViewportStore = create<ViewportState>()((set) => ({
  viewport: DEFAULT_VIEWPORT,

  setViewport: (viewport) => set({ viewport: clampViewport(viewport) }),

  panBy: (dx, dy) =>
    set((state) => ({
      viewport: { ...state.viewport, x: state.viewport.x + dx, y: state.viewport.y + dy },
    })),

  /**
   * Zoom about a point, so the pixel under the cursor stays under the cursor.
   *
   * Scaling about the origin instead is the classic wrong version: the content
   * slides away from wherever you were pointing, and zooming in on a detail
   * becomes chase-the-detail.
   */
  zoomAt: (factor, originX, originY) =>
    set((state) => {
      const next = clampScale(state.viewport.scale * factor);
      const applied = next / state.viewport.scale;
      return {
        viewport: {
          scale: next,
          x: originX - (originX - state.viewport.x) * applied,
          y: originY - (originY - state.viewport.y) * applied,
        },
      };
    }),

  resetViewport: () => set({ viewport: DEFAULT_VIEWPORT }),
}));

/* -------------------------------------------------------------------------- */
/* Arithmetic                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The viewport that puts `rect` in the middle of a container of this size.
 *
 * The scale is clamped, so a tiny map cannot open at 40× and a huge one cannot
 * open at a scale where every node is one pixel of fog. Clamping means the rect
 * is still centred but may not fully fit; centred and slightly cropped is
 * recoverable by panning, whereas a map rendered at scale 0.001 looks like an
 * empty screen and reads as a bug.
 */
export function fitToRect(
  rect: Rect,
  containerWidth: number,
  containerHeight: number,
  padding: number = FIT_PADDING_PX,
): Viewport {
  const width = positive(rect?.width);
  const height = positive(rect?.height);
  const container = { width: positive(containerWidth), height: positive(containerHeight) };
  const pad = Math.max(0, finite(padding, 0));

  // Never let padding eat the whole container: a negative available width would
  // flip the scale's sign and mirror the map.
  const available = {
    width: Math.max(1, container.width - pad * 2),
    height: Math.max(1, container.height - pad * 2),
  };

  const scale = clampScale(Math.min(available.width / width, available.height / height));
  const centre = {
    x: finite(rect?.x, 0) + width / 2,
    y: finite(rect?.y, 0) + height / 2,
  };

  return {
    scale,
    x: container.width / 2 - centre.x * scale,
    y: container.height / 2 - centre.y * scale,
  };
}

export function clampScale(scale: number): number {
  return clamp(finite(scale, 1), MIN_SCALE, MAX_SCALE);
}

function clampViewport(viewport: Viewport): Viewport {
  return {
    x: finite(viewport?.x, 0),
    y: finite(viewport?.y, 0),
    scale: clampScale(viewport?.scale),
  };
}

/*
 * WHY EVERY ENTRY POINT SANITISES
 * -------------------------------
 * These take numbers that came from a pointer event or a
 * `getBoundingClientRect` on an element that may not be laid out yet. Either
 * can hand over `0`, `NaN` or `Infinity`. A `NaN` here does not throw — it
 * propagates into a `transform` string, the browser silently drops the whole
 * declaration, and the map goes blank with no error anywhere.
 */
function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positive(value: unknown): number {
  const number = finite(value, 0);
  return number > 0 ? number : 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
