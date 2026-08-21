import React from 'react'
import type { ExampleBlock as ExampleBlockData } from '../types/learningBoard'

/* A worked example: prompt → input → working → result. The working steps are
 * mono because they are the "shown work" — the part a learner checks line by
 * line. Nothing here is specific to any subject; the shape is the component,
 * the content arrives as data. */
export function ExampleBlock({ block }: { block: ExampleBlockData }) {
  const prompt = String(block.prompt ?? '').trim()
  const working = Array.isArray(block.working) ? block.working : []
  if (!prompt) return null
  return (
    <div data-board="example">
      <p data-board="example-prompt">{prompt}</p>
      {block.input ? <p data-board="example-input">{block.input}</p> : null}
      {working.length > 0 && (
        <ol data-board="example-working">
          {working.map((w, i) => <li key={i}>{w}</li>)}
        </ol>
      )}
      {block.result ? <p data-board="example-result">{block.result}</p> : null}
    </div>
  )
}
