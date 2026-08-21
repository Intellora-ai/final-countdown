import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CAMERA, ZOOM_MIN, ZOOM_MAX, KEY_PAN_STEP, WORLD_GRID,
  clampZoom, panBy, panByKey, zoomAround, worldToScreen, screenToWorld,
  snapToGrid, cameraToFocus, visibleWorldRect, rectsIntersect,
} from './camera'

describe('clampZoom', () => {
  it('holds the 0.5–2.5 range and refuses non-finite input', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN)
    expect(clampZoom(9)).toBe(ZOOM_MAX)
    expect(clampZoom(1.7)).toBe(1.7)
    expect(clampZoom(Number.NaN)).toBe(1)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('panBy', () => {
  it('converts a screen drag into a world shift scaled by zoom', () => {
    const c = panBy({ x: 0, y: 0, zoom: 2 }, 100, -50)
    expect(c.x).toBe(-50)   // dragging content right moves the camera left
    expect(c.y).toBe(25)
  })

  it('keyboard pan moves a fixed screen step', () => {
    const c = panByKey(DEFAULT_CAMERA, 1, 0)
    expect(c.x).toBe(KEY_PAN_STEP)
  })
})

describe('zoomAround', () => {
  it('keeps the world point under the pointer fixed — the anchor invariant', () => {
    const cam = { x: 120, y: 40, zoom: 1 }
    const anchor = { sx: 300, sy: 200 }
    const before = screenToWorld(cam, anchor.sx, anchor.sy)
    const after = zoomAround(cam, 1.1, anchor.sx, anchor.sy)
    const still = screenToWorld(after, anchor.sx, anchor.sy)
    expect(still.x).toBeCloseTo(before.x, 10)
    expect(still.y).toBeCloseTo(before.y, 10)
  })

  it('is identity at the clamp boundary — no pan drift when zoom cannot move', () => {
    const cam = { x: 5, y: 5, zoom: ZOOM_MAX }
    expect(zoomAround(cam, 1.1, 100, 100)).toBe(cam)
  })

  it('round-trips: world→screen→world is the identity', () => {
    const cam = { x: -37, y: 91, zoom: 1.6 }
    const s = worldToScreen(cam, 250, -80)
    const w = screenToWorld(cam, s.x, s.y)
    expect(w.x).toBeCloseTo(250, 10)
    expect(w.y).toBeCloseTo(-80, 10)
  })
})

describe('snapToGrid', () => {
  it('snaps to the 8px world grid', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(11)).toBe(8)
    expect(snapToGrid(12.1)).toBe(16)
    expect(snapToGrid(-5)).toBe(-8)
    expect(snapToGrid(4) % WORLD_GRID).toBe(0)
  })
})

describe('cameraToFocus', () => {
  it('centres the rect and never zooms in past 1', () => {
    const cam = cameraToFocus({ x: 100, y: 100, width: 200, height: 100 }, 1000, 800)
    expect(cam.zoom).toBe(1)
    /* rect centre (200,150) must land at viewport centre (500,400). */
    const s = worldToScreen(cam, 200, 150)
    expect(s.x).toBeCloseTo(500, 8)
    expect(s.y).toBeCloseTo(400, 8)
  })

  it('zooms out (never below the floor) to fit an oversized rect', () => {
    const cam = cameraToFocus({ x: 0, y: 0, width: 4000, height: 400 }, 1000, 800)
    expect(cam.zoom).toBeLessThan(1)
    expect(cam.zoom).toBeGreaterThanOrEqual(ZOOM_MIN)
  })
})

describe('culling window', () => {
  it('covers the viewport plus one viewport of overscan on every side', () => {
    const r = visibleWorldRect({ x: 0, y: 0, zoom: 1 }, 1000, 800, 1)
    expect(r).toEqual({ x: -1000, y: -800, width: 3000, height: 2400 })
  })

  it('grows in world units as zoom shrinks', () => {
    const r = visibleWorldRect({ x: 0, y: 0, zoom: 0.5 }, 1000, 800, 0)
    expect(r.width).toBe(2000)
  })

  it('intersection: touching edges count, gaps do not', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    expect(rectsIntersect(a, { x: 100, y: 0, width: 50, height: 50 })).toBe(true)
    expect(rectsIntersect(a, { x: 151, y: 0, width: 50, height: 50 })).toBe(false)
  })
})
