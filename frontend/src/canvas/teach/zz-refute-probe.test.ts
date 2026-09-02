import { describe, expect, it } from 'vitest'
import { isPlea, classifyTurn } from '/Users/tanveersidhu/Desktop/FINAL COUNTDOWN/final countdown/frontend/src/canvas/teach/turn'

const sentences = [
  'the energy is lost as heat',
  'some of the energy gets lost to friction',
  'the ball gets stuck at the top',
  'plants do not get sunlight at night',
  'a magnet does not get weaker when you cut it',
  'the two terms are often confused',
  'the current does not follow the shorter path only',
  'she never learnt to swim',
  'heat is lost to the surroundings',
  'the electron is stuck in the potential well',
  'energy cannot be created or destroyed',
  'the image is real and inverted',
  'the sum of the roots is minus b over a',
]

describe('probe', () => {
  it('prints', () => {
    for (const s of sentences) {
      console.log(JSON.stringify(s), 'isPlea=', isPlea(s), 'classify=', classifyTurn(s))
    }
    expect(true).toBe(true)
  })
})
