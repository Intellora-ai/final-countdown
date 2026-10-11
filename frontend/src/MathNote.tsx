import { renderToString } from 'katex'

export default function MathNote({ latex }: { latex: string }) {
  try {
    const html = renderToString(latex, { output: 'mathml', displayMode: true, trust: false, strict: 'error', maxExpand: 1000, maxSize: 20 })
    return <div className="math-note" dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    return <div className="math-error"><p role="alert">This formula could not be typeset.</p><pre>{latex}</pre></div>
  }
}
