import React, { useMemo, useState } from 'react'
import { BlackboardShell } from './shell/BlackboardShell'
import { BoardRenderer } from './renderer/BoardRenderer'
import { NoticeBar } from './shell/NoticeBar'
import { BoardEmpty, BoardError, BoardLoading } from './shell/BoardStates'
import { validateBoard } from './renderer/validateBoard'
import { useBoardSource } from './hooks/useBoardSource'
import { FIXTURES } from './fixtures'

/* THE ROUTE — and the pipeline every future board will use.
 *
 * The shape of this file IS the product's data flow:
 *
 *   source (untrusted) → validateBoard → status
 *     failed        → ErrorState + the notices collected before failure
 *     ok/repaired   → NoticeBar + board, or EmptyState when nothing survived
 *
 * BoardView never composes blocks. It chooses a source, validates it, and
 * hands BoardRenderer a ValidatedBoard. When AI generation arrives, the ONLY
 * change here is where the source comes from.
 *
 * THE PICKER is component state, not routing — its job is to prove one shell
 * renders many lessons, including a deliberately broken one whose repairs the
 * learner can read in the NoticeBar.
 */
export function BoardView() {
  const [fixtureId, setFixtureId] = useState(FIXTURES[0].id)
  const src = useBoardSource(fixtureId)

  const result = useMemo(
    () => (src.status === 'ok' ? validateBoard(src.source) : null),
    [src],
  )

  /* Shell header content follows the loaded board; sensible placeholders
   * while loading or failed keep the room intact. */
  const board = result && result.status !== 'failed' ? result.board : null
  const title =
    board?.title ?? (src.status === 'failed' ? 'Learning canvas' : 'Loading…')
  const subtitle = board?.subtitle ?? null
  const eyebrow = src.status === 'ok' ? src.eyebrow : ''

  return (
    <BlackboardShell
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      picker={
        <div data-board="picker" role="group" aria-label="Choose a board">
          {FIXTURES.map((f) => (
            <button
              key={f.id}
              type="button"
              data-board="picker-pill"
              data-active={f.id === fixtureId ? 'true' : 'false'}
              onClick={() => setFixtureId(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {src.status === 'loading' && <BoardLoading />}
      {src.status === 'failed' && <BoardError message={src.error} />}
      {src.status === 'ok' && result && (
        <>
          <NoticeBar notices={result.notices} />
          {result.status === 'failed' ? (
            <BoardError message={result.error} />
          ) : result.board.blocks.length === 0 ? (
            <BoardEmpty />
          ) : (
            <BoardRenderer board={result.board} />
          )}
        </>
      )}
    </BlackboardShell>
  )
}
