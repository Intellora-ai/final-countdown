import React from 'react'
import type { ImageBlock as ImageBlockData } from '../types/learningBoard'

/* A picture through a narrow, safe door.
 *
 * The validator has already refused http(s), protocol-relative and javascript:
 * sources, and dropped any image without alt text — so by the time this
 * renders, src is local-or-data and alt exists. The belt-and-braces check here
 * is cheap and keeps the component safe even if someone bypasses the
 * validator in a test.
 */
const SAFE_SRC = /^(data:image\/|\.{0,2}\/|[a-zA-Z0-9_-])/

export function ImageBlock({ block }: { block: ImageBlockData }) {
  const src = String(block.src ?? '')
  const alt = String(block.alt ?? '').trim()
  if (!src || !alt || /^(https?:)?\/\//i.test(src) || /^javascript:/i.test(src) || !SAFE_SRC.test(src)) return null
  return (
    <figure data-board="image">
      <img src={src} alt={alt} loading="lazy" />
      {(block.caption || block.sourceNote) && (
        <figcaption data-board="image-caption">
          {block.caption}
          {block.sourceNote ? <span data-board="image-source"> — {block.sourceNote}</span> : null}
        </figcaption>
      )}
    </figure>
  )
}
