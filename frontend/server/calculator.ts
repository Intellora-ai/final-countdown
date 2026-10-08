const MAX_LENGTH = 200

export function calculate(expression: string): number {
  const source = expression.trim()
  if (!source || source.length > MAX_LENGTH) throw new Error('CALCULATION_INVALID')
  let index = 0
  const peek = () => source[index] ?? ''
  const eat = (value: string) => { if (source.slice(index, index + value.length) === value) { index += value.length; return true } return false }
  const spaces = () => { while (/\s/.test(peek())) index++ }
  const primary = (): number => {
    spaces()
    if (eat('(')) { const value = add(); spaces(); if (!eat(')')) throw new Error('CALCULATION_INVALID'); return value }
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
    if (!match) throw new Error('CALCULATION_INVALID')
    index += match[0].length
    const value = Number(match[0])
    if (!Number.isFinite(value)) throw new Error('CALCULATION_INVALID')
    return value
  }
  const power = (): number => { spaces(); if (eat('+')) return power(); if (eat('-')) return -power(); const left = primary(); spaces(); if (eat('^')) return checked(left ** power()); return left }
  const multiply = (): number => { let value = power(); for (;;) { spaces(); if (eat('*')) value = checked(value * power()); else if (eat('/')) { const divisor = power(); if (divisor === 0) throw new Error('CALCULATION_INVALID'); value = checked(value / divisor) } else return value } }
  function add(): number { let value = multiply(); for (;;) { spaces(); if (eat('+')) value = checked(value + multiply()); else if (eat('-')) value = checked(value - multiply()); else return value } }
  const result = add(); spaces()
  if (index !== source.length || !Number.isFinite(result) || Math.abs(result) > 1e15) throw new Error('CALCULATION_INVALID')
  return result
}
function checked(value: number) { if (!Number.isFinite(value) || Math.abs(value) > 1e15) throw new Error('CALCULATION_INVALID'); return value }
