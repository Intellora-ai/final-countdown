import React from 'react'
import { ALL_CALLOUT_TONES, type CalloutBlock as CalloutBlockData } from '../types/learningBoard'

/* One sentence that matters more than the sentences around it.
 *
 * TONE IS A WORD, NOT A COLOUR. The block says 'key' or 'warning'; the
 * stylesheet decides what that looks like. An unrecognised tone falls back to
 * 'note' rather than rendering an unstyled element, so a future generator
 * inventing a tone degrades to the calmest option instead of the loudest.
 */
export function CalloutBlock({ block }: { block: CalloutBlockData }) {
  const content = String(block.content ?? '').trim()
  if (!content) return null

  const tone = ALL_CALLOUT_TONES.indexOf(block.tone as never) >= 0 ? block.tone : 'note'

  return (
    <p data-board="callout" data-tone={tone}>
      {content}
    </p>
  )
}
