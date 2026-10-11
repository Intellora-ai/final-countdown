export function wrapText(text: string, width: number, measure: (text: string) => number) {
  return text.split('\n').flatMap(paragraph => {
    const rows: string[] = []; let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate) > width) { rows.push(line); line = '' }
      if (measure(word) > width) {
        for (const char of Array.from(word)) {
          if (line && measure(line + char) > width) { rows.push(line); line = '' }
          line += char
        }
      } else line = line ? `${line} ${word}` : word
    }
    return [...rows, ...(line || !rows.length ? [line] : [])]
  })
}
export function fontMeasure(size: number, bold = false) {
  const context = typeof CanvasRenderingContext2D !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  if (context) context.font = `${bold ? 'bold ' : ''}${size}px Caveat, cursive`
  return (text: string) => context ? context.measureText(text).width : Array.from(text).length * size
}
