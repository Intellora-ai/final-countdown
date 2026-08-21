import React from 'react'
import type { Notice } from '../types/learningBoard'

/* WHERE REPAIRS BECOME VISIBLE.
 *
 * The validator's contract is that nothing it changes is silent; this is the
 * other half of that contract — the place the learner reads what happened.
 * "Showing 50 of 400 rows" is information about the lesson, so it renders as
 * calm board chrome, not as an alarm. role="status" lets a screen reader
 * announce it without interrupting.
 */
export function NoticeBar({ notices }: { notices: Notice[] }) {
  if (!notices.length) return null
  return (
    <div data-board="notices" role="status">
      <p data-board="notices-title">
        {notices.length === 1 ? 'One adjustment was made to this board' : `${notices.length} adjustments were made to this board`}
      </p>
      <ul data-board="notices-list">
        {notices.map((n, i) => (
          <li key={i} data-board="notice" data-level={n.level}>{n.message}</li>
        ))}
      </ul>
    </div>
  )
}
