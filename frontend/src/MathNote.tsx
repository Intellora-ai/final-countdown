import { renderToString } from 'katex'
import DOMPurify from 'dompurify'

export default function MathNote({ latex }: { latex: string }) {
  try {
    const html = renderToString(latex, { output: 'mathml', displayMode: true, trust: false, strict: 'error', maxExpand: 1000, maxSize: 20 })
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { mathMl: true }, FORBID_TAGS: ['annotation', 'annotation-xml'] })
    return <div className="math-note" dangerouslySetInnerHTML={{ __html: clean }} />
  } catch {
    return <div className="math-error"><p role="alert">This formula could not be typeset.</p><pre>{latex}</pre></div>
  }
}
