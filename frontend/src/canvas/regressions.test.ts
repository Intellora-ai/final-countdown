import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { fitViewport, MIN_SCALE, MAX_SCALE } from './useViewport'
import { CANVAS_GL } from './panels/ParticleBox3D'

/* REGRESSION GUARDS — one per bug that actually shipped.
 *
 * Every assertion below FAILS against the code as it was before the fix. A
 * guard that could not have caught the original bug is decoration, so each
 * case here is written from the observed symptom, not from the patch.
 */

describe('the board cannot be pinned into a corner again', () => {
  /* OBSERVED: matrix(0.35, 0, 0, 0.35, -246.4, -134.4). Solving x back through
   * (viewW - 1408*scale)/2 gives viewW = 0 — the element had no layout yet and
   * min(0/W, 0/H) clamped UP to MIN_SCALE, producing a well-formed, entirely
   * wrong viewport that nothing downstream could detect. */
  it('refuses a zero-sized viewport instead of scaling to MIN_SCALE', () => {
    const vp = fitViewport(1408, 768, 0, 0)
    expect(vp).toEqual({ x: 0, y: 0, scale: 1 })
    /* The exact broken output, asserted as forbidden. */
    expect(vp.scale).not.toBe(MIN_SCALE)
    expect(vp.x).not.toBeCloseTo(-246.4, 1)
  })

  it('refuses any non-positive or non-finite measurement', () => {
    for (const [w, h] of [[0, 768], [1408, 0], [-100, 768], [1408, -1], [NaN, 768], [1408, NaN]]) {
      expect(fitViewport(1408, 768, w, h), `${w}x${h}`).toEqual({ x: 0, y: 0, scale: 1 })
    }
  })

  it('refuses a degenerate world as well as a degenerate viewport', () => {
    expect(fitViewport(0, 0, 1408, 768)).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('still fits correctly when the measurement is real', () => {
    /* Same-size world and viewport is the case the scene actually runs in. */
    expect(fitViewport(1408, 768, 1408, 768)).toEqual({ x: 0, y: 0, scale: 1 })
    /* Half-size viewport halves the scale and leaves no offset. */
    expect(fitViewport(1408, 768, 704, 384)).toEqual({ x: 0, y: 0, scale: 0.5 })
    /* A wider viewport is constrained by height, and centres horizontally. */
    const wide = fitViewport(1408, 768, 2816, 768)
    expect(wide.scale).toBe(1)
    expect(wide.x).toBe(704)
    expect(wide.y).toBe(0)
  })

  it('keeps scale inside its declared bounds', () => {
    expect(fitViewport(1408, 768, 100000, 100000).scale).toBe(MAX_SCALE)
    expect(fitViewport(1408, 768, 10, 10).scale).toBe(MIN_SCALE)
  })
})

describe('the particle glow cannot be tone-mapped back to grey', () => {
  /* OBSERVED: cubes rendered as a wireframe full of grey dust. r3f defaults to
   * ACESFilmicToneMapping, which rolls highlights toward white; an emissive
   * particle is a highlight. */
  it('renders with tone mapping off', () => {
    expect(CANVAS_GL.toneMapping).toBe(THREE.NoToneMapping)
    expect(CANVAS_GL.toneMapping).not.toBe(THREE.ACESFilmicToneMapping)
  })

  it('keeps the canvas transparent so the board shows through', () => {
    expect(CANVAS_GL.alpha).toBe(true)
  })
})

/* THE TYPOGRAPHY AND KaTeX GUARDS LIVE IN e2e/scene-regressions.spec.ts.
 *
 * They were written here first, reading scene.css as text, and that was the
 * wrong instrument twice over. Vitest stubs CSS modules to empty — `?raw`
 * returns 2719 characters for a .ts file and 0 for a .css one — so the
 * assertions were silently matching against an empty string. And even with the
 * text in hand, grepping a stylesheet proves a rule was TYPED, not that it
 * WON: the entire defect was a correctly-typed rule losing to an element
 * selector higher in the cascade. Only a browser can settle that, so the guard
 * belongs where a browser is. */

describe('react-three-fiber cannot be handed a second React', () => {
  /* OBSERVED: <Canvas> threw "Cannot read properties of null (reading
   * 'useMemo')" and every 3D panel vanished. Not a Three problem — two
   * pre-bundled React chunks were live at once (?v=80c1eb3d beside
   * ?v=1bb23c48) after installing r3f against a running dev server. r3f
   * renders through its own reconciler and MUST share the app's React.
   *
   * THE FIRST VERSION OF THIS TEST WAS BLIND, which is the reason it is now
   * written against the config OBJECT rather than the config FILE. It scraped
   * the source for the word 'dedupe' and asserted the following text contained
   * 'react' — but 'dedupe' also appears in the comment explaining the setting,
   * and the text after it includes optimizeDeps.include, which lists the same
   * three packages. Deleting the entire dedupe array left it green. Asserting
   * on prose is not asserting on behaviour. */
  it('dedupes react, react-dom and three', async () => {
    const mod = await import('../../vite.config')
    const config = mod.default as { resolve?: { dedupe?: string[] } }
    const dedupe = config.resolve?.dedupe
    expect(dedupe, 'vite.config.ts must set resolve.dedupe').toBeDefined()
    for (const pkg of ['react', 'react-dom', 'three']) {
      expect(dedupe, pkg).toContain(pkg)
    }
  })
})
