import React, { useEffect } from 'react'
import { BoardCanvas } from './BoardCanvas'
import { BoardTopControls, BoardSideControls } from './BoardControls'
import { mark } from '../perf/marks'
import './board-theme.css'

/* THE PERMANENT ROOM — now with two arrangements of the same furniture.
 *
 * variant="scroll" is the Phase 1B reading column (still used by nothing by
 * default, kept because the pieces are shared). variant="camera" is the
 * infinite board: the root clips to the viewport, children ARE the camera
 * viewport, and the header collapses to a compact fixed strip so the world
 * owns the space. In BOTH variants every control and the header live outside
 * any transformed subtree — the camera cannot move the chrome, structurally.
 */
export function BlackboardShell({
  eyebrow,
  title,
  subtitle,
  picker,
  variant = 'scroll',
  cameraControls,
  overlay,
  children,
}: {
  eyebrow?: string
  title: string
  subtitle?: string | null
  picker?: React.ReactNode
  variant?: 'scroll' | 'camera'
  cameraControls?: { onZoomIn: () => void; onZoomOut: () => void; onReset: () => void }
  /** Fixed chrome the view supplies (notices, teaching controls, checkpoint). */
  overlay?: React.ReactNode
  children: React.ReactNode
}) {
  useEffect(() => { mark('shell-visible') }, [])

  if (variant === 'camera') {
    return (
      <div data-board="root" data-variant="camera">
        <div data-board="edge" aria-hidden="true" />
        {children}
        <BoardTopControls />
        <BoardSideControls {...cameraControls} />
        <header data-board="header-compact">
          {picker}
          {eyebrow ? <p data-board="eyebrow">{eyebrow}</p> : null}
          <h1 data-board="title-compact">{title}</h1>
          {subtitle ? <p data-board="subtitle">{subtitle}</p> : null}
        </header>
        {overlay}
      </div>
    )
  }

  return (
    <div data-board="root">
      <div data-board="edge" aria-hidden="true" />
      <BoardTopControls />
      <BoardSideControls />
      <BoardCanvas>
        {picker}
        <header data-board="header">
          {eyebrow ? <p data-board="eyebrow">{eyebrow}</p> : null}
          <h1 data-board="title">{title}</h1>
          {subtitle ? <p data-board="subtitle">{subtitle}</p> : null}
        </header>
        {children}
      </BoardCanvas>
    </div>
  )
}
