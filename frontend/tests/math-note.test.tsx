// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import MathNote from '../src/MathNote'

afterEach(cleanup)
it.each(['\\frac{a+b}{c}', 'x^2+y^2=r^2', '\\sqrt{x}', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\sum_{i=1}^{n}i'])('typesets %s as real mathematical notation', latex => {
  const view = render(<MathNote latex={latex} />)
  expect(view.container.querySelector('math')!.getAttribute('display')).toBe('block')
  expect(screen.queryByRole('alert')).toBeNull()
})
it.each(['\\href{javascript:alert(1)}{click}', '\\includegraphics{https://attacker.invalid/track}', '<script>alert(1)</script>'])('does not execute or fetch model markup %s', latex => {
  const view = render(<MathNote latex={latex} />)
  expect(view.container.querySelector('script, img, a, iframe')).toBeNull()
})
it.each(['\\href{https://attacker.invalid/track}{x}', '\\url{https://attacker.invalid/track}', '\\includegraphics{https://attacker.invalid/track}'])('does not create links or resources through MathML command %s', latex => {
  const view = render(<MathNote latex={latex} />)
  expect(view.container.querySelector('[href], [src], mglyph')).toBeNull()
})
it('shows invalid notation as literal text instead of crashing the board', () => {
  render(<MathNote latex={'\\frac{'} />)
  expect(screen.getByRole('alert').textContent).toContain('could not be typeset')
  expect(screen.getByText('\\frac{')).toBeTruthy()
})
