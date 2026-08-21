/* CAMERA MATH — the board's viewpoint as pure arithmetic.
 *
 * The camera is three numbers. Everything else in this file is the algebra
 * that keeps those numbers honest: zoom clamped to its range, zoom anchored
 * to the pointer so the point under the cursor stays under the cursor, pan
 * expressed in world units so a drag feels identical at every zoom.
 *
 * Pure on purpose: every function here is testable without a browser, and the
 * hook that owns the DOM (useCamera) contains no arithmetic of its own.
 *
 * COORDINATE CONVENTION. camera.x/y is the WORLD point at the viewport's
 * top-left corner. screen = (world - camera) * zoom, so:
 *   worldToScreen(w) = (w - c) * z
 *   screenToWorld(s) = s / z + c
 * The CSS transform that realises it: scale(z) translate(-cx, -cy) — applied
 * as translate3d(-cx*z, -cy*z, 0) scale(z) for compositor-friendly rendering.
 */

export interface CanvasCamera {
  x: number
  y: number
  zoom: number
}

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 2.5
export const ZOOM_DEFAULT = 1.0
export const ZOOM_BTN_IN = 1.1
export const ZOOM_BTN_OUT = 0.9
export const KEY_PAN_STEP = 80
export const DRAG_THRESHOLD = 4
export const WORLD_GRID = 8

export const DEFAULT_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: ZOOM_DEFAULT }

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

/** Pan by a SCREEN-space delta (what a drag reports). World shift = delta/zoom. */
export function panBy(cam: CanvasCamera, dxScreen: number, dyScreen: number): CanvasCamera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom }
}

/** Arrow-key pan: a fixed screen-space step, direction in (-1|0|1). */
export function panByKey(cam: CanvasCamera, dirX: number, dirY: number): CanvasCamera {
  return panBy(cam, -dirX * KEY_PAN_STEP, -dirY * KEY_PAN_STEP)
}

/* Zoom keeping the given SCREEN point fixed: the world point under the cursor
 * before equals the world point under the cursor after. Derivation:
 *   w = s/z0 + c0  must equal  s/z1 + c1  →  c1 = c0 + s/z0 - s/z1 */
export function zoomAround(cam: CanvasCamera, factor: number, sx: number, sy: number): CanvasCamera {
  const z1 = clampZoom(cam.zoom * factor)
  if (z1 === cam.zoom) return cam
  return {
    zoom: z1,
    x: cam.x + sx / cam.zoom - sx / z1,
    y: cam.y + sy / cam.zoom - sy / z1,
  }
}

export function worldToScreen(cam: CanvasCamera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom }
}

export function screenToWorld(cam: CanvasCamera, sx: number, sy: number): { x: number; y: number } {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y }
}

/** Snap a world coordinate to the 8px world grid (step placement uses this). */
export function snapToGrid(v: number): number {
  return Math.round(v / WORLD_GRID) * WORLD_GRID
}

export interface WorldRect { x: number; y: number; width: number; height: number }

/* The camera that centres a world rect in a viewport, at a zoom that fits it
 * with margin — never zooming IN past 1 (content should not blow up merely
 * because it is small), never out past the floor. */
export function cameraToFocus(
  rect: WorldRect,
  viewportW: number,
  viewportH: number,
  margin = 48,
): CanvasCamera {
  const fitZ = Math.min(
    (viewportW - margin * 2) / Math.max(1, rect.width),
    (viewportH - margin * 2) / Math.max(1, rect.height),
  )
  const zoom = clampZoom(Math.min(1, fitZ))
  return {
    zoom,
    x: rect.x + rect.width / 2 - viewportW / 2 / zoom,
    y: rect.y + rect.height / 2 - viewportH / 2 / zoom,
  }
}

/** The world rect currently visible, expanded by `overscan` viewports on every
 *  side — the culling window. */
export function visibleWorldRect(
  cam: CanvasCamera,
  viewportW: number,
  viewportH: number,
  overscan = 1,
): WorldRect {
  const w = viewportW / cam.zoom
  const h = viewportH / cam.zoom
  return {
    x: cam.x - w * overscan,
    y: cam.y - h * overscan,
    width: w * (1 + overscan * 2),
    height: h * (1 + overscan * 2),
  }
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}
