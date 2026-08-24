// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FigureSvg } from './primitives'

/**
 * The one property that keeps diagram text readable.
 *
 * WHAT WENT WRONG, AND WHY NO TEST SAW IT
 * ---------------------------------------
 * `.lc-flow` was `width: 100%` over a fixed `viewBox`. A browser then scales the
 * whole coordinate system to the container, and SVG text is measured in user
 * units, so it scales with it:
 *
 *     on-screen px = font-size × container width ÷ viewBox width
 *
 * Measured in a real browser, the civics process diagram rendered its labels at
 * 1.29px at a 320px viewport and 8.84px at 1440px, against a smallest type
 * token of 11px. Every unit test passed throughout, because jsdom performs no
 * layout and the `font-size` PROPERTY was correct the whole time — 12px, in
 * units nobody had checked the scale of.
 *
 * jsdom still cannot measure the rendered result. What it CAN check is the
 * mechanism: that the element carries a pixel size equal to its viewBox, which
 * is what pins the scale factor at exactly 1. The rendered numbers are proved
 * in the browser; this stops the mechanism being removed between those runs.
 */
describe('FigureSvg pins the scale factor at 1', () => {
  it('sizes the element from its own viewBox', () => {
    const { container } = render(
      <FigureSvg viewBox="0 0 940 260">
        <text>node</text>
      </FigureSvg>,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('940')
    expect(svg?.getAttribute('height')).toBe('260')
  })

  it('reads width and height from the viewBox, not from the offset', () => {
    /* `minX minY width height` — a viewBox with a non-zero origin is the case
       where taking parts[0] and parts[1] would look right on the common
       `0 0 w h` form and be silently wrong here. FlowWeightedShape emits
       exactly this shape. */
    const { container } = render(
      <FigureSvg viewBox="-120 -120 240 240">
        <text>node</text>
      </FigureSvg>,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('240')
    expect(svg?.getAttribute('height')).toBe('240')
  })

  it('leaves a malformed viewBox unsized rather than emitting NaN', () => {
    /* `width="NaN"` is treated as zero, which hides the figure completely. An
       unsized element merely falls back to the old scaling behaviour, which is
       a readability bug rather than an invisible one. */
    const { container } = render(
      <FigureSvg viewBox="0 0 nonsense">
        <text>node</text>
      </FigureSvg>,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBeNull()
    expect(svg?.getAttribute('height')).toBeNull()
  })

  it('refuses a zero-width viewBox, which would divide by zero downstream', () => {
    const { container } = render(
      <FigureSvg viewBox="0 0 0 100">
        <text>node</text>
      </FigureSvg>,
    )
    expect(container.querySelector('svg')?.getAttribute('width')).toBeNull()
  })

  it('keeps the caller’s role and label, so the swap did not cost accessibility', () => {
    const { container } = render(
      <FigureSvg viewBox="0 0 100 100" role="img" aria-label="a described figure">
        <text>node</text>
      </FigureSvg>,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('a described figure')
  })
})
