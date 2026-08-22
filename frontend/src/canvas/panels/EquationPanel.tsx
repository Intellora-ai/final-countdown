import React, { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { color, pending, pendingSize } from '../design/tokens'

/* PANEL ③ — mathematics set as mathematics.
 *
 * KaTeX, not a styled string. `P ∝ T` and `PV = nRT` are typeset with real
 * math metrics: the proportional sign is the proportional sign, the italic is
 * variable-italic rather than italic prose, and spacing around the relation is
 * the spacing TeX would give it. A learner who has seen a textbook recognises
 * this; a learner who has not is being taught the notation correctly the first
 * time.
 *
 * throwOnError IS FALSE ON PURPOSE. A generator will eventually emit malformed
 * LaTeX. When it does, this renders the source text in the error colour rather
 * than throwing inside React and taking the whole scene down with it — one
 * broken equation costs one equation.
 *
 * SANITISATION. KaTeX's own output is the only HTML that reaches
 * dangerouslySetInnerHTML, produced from the string by KaTeX itself with
 * `trust: false`, so \htmlClass, \url and \includegraphics are refused at the
 * source. The input string is never interpolated into markup by this file.
 */

function useKatex(latex: string, displayMode: boolean): string {
  return useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        trust: false,
        strict: false,
        output: 'html',
      })
    } catch {
      return ''
    }
  }, [latex, displayMode])
}

export function Katex({ latex, display = true, className }: { latex: string; display?: boolean; className?: string }) {
  const html = useKatex(latex, display)
  if (!html) return <span className={className}>{latex}</span>
  return <span className={className} aria-label={latex} dangerouslySetInnerHTML={{ __html: html }} />
}

export function EquationPanel({
  relation,
  constants,
  law,
  emphasise,
}: {
  /** The proportionality being taught, e.g. 'P \\propto T'. */
  relation: string
  /** What is being held fixed for the relation to hold, e.g. 'Constant V, n'. */
  constants?: string
  /** The full law the relation is a special case of. */
  law?: string
  /** Terms of `law` to mark. Rendered as an accent underline beneath the term. */
  emphasise?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: pendingSize.gap14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: pendingSize.gap2 }}>
        <div style={{ fontSize: pendingSize.fontDisplayXl, lineHeight: pendingSize.line1, color: pending.inkBright }}>
          <Katex latex={relation} />
        </div>
        {constants && (
          <div style={{ fontSize: pendingSize.font125, color: color.textMuted, fontStyle: 'italic', fontFamily: "'Fraunces', Georgia, serif" }}>
            {constants}
          </div>
        )}
      </div>

      {law && (
        <div style={{ position: 'relative', fontSize: pendingSize.fontDisplayMd, lineHeight: pendingSize.line1, color: color.text, textAlign: 'center' }}>
          <Katex latex={law} />
          {emphasise && (
            /* The mark is a rule under the emphasised tail of the law, drawn in
             * the accent — the reference's way of saying "this is the term that
             * changed". Positioned as a fraction of the line so it moves with
             * the font size rather than being pinned to a pixel. */
            <span
              aria-hidden="true"
              style={{
                position: 'absolute', right: '0.6em', bottom: -4,
                width: `${Math.max(1, emphasise.length) * 0.62}em`, height: 2,
                background: 'var(--sc-accent)', borderRadius: pendingSize.radius2,
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
