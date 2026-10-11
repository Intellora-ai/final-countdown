// Keep the model's hue, but make pale strokes readable on ivory paper.
export function paperInk(color = '#292b30') {
  const channels = color.slice(1).match(/.{2}/g)?.map(n => parseInt(n, 16))
  if (!channels || channels.length !== 3 || channels.some(n => !Number.isFinite(n))) return color
  const luminance = (values: number[]) => values.reduce((sum, n, i) => {
    const c = n / 255
    return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
  }, 0)
  let ink = channels
  while (1.03 / (luminance(ink) + .05) < 4.5) ink = ink.map(n => Math.floor(n * .9))
  return '#' + ink.map(n => n.toString(16).padStart(2, '0')).join('')
}
