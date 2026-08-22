/* THE WORLD, IN THE REFERENCE'S OWN COORDINATES.
 *
 * The reference frame is 1408 x 768. Every position below is a pixel in THAT
 * frame, so a measurement taken off the image goes in unchanged and the scene
 * is a transcription rather than an approximation. The viewport scales the
 * whole world to whatever the browser actually is, so these numbers never have
 * to be re-derived for a different screen.
 *
 * Keeping them in one file — rather than inline in the JSX — is what makes the
 * layout reviewable against the image: this table IS the design.
 */

export const WORLD_W = 1408
export const WORLD_H = 768

export const L = {
  title:        { y: 88, ruleW: 412, ruleY: 39 },

  /* ① particle model */
  p1Badge:      { x: 220, y: 165 },
  p1Head:       { x: 249, y: 162 },
  p1Cube:       { x: 226, y: 226, w: 240, h: 234 },
  p1GasNote:    { x: 468, y: 206 },
  p1SpeedNote:  { x: 470, y: 310 },
  p1Caption:    { x: 203, y: 464 },

  /* ② causal chain */
  p2Badge:      { x: 530, y: 165 },
  p2Chain:      { x: 556, y: 182 },

  /* ③ equations */
  p3Badge:      { x: 596, y: 315 },
  p3Body:       { x: 620, y: 306, w: 232 },

  /* ④ pressure vs temperature */
  p4Badge:      { x: 884, y: 300 },
  p4Head:       { x: 910, y: 298 },
  p4Graph:      { x: 878, y: 322, w: 306, h: 178 },

  /* ⑤ physical simulation */
  p5Badge:      { x: 884, y: 518 },
  p5Head:       { x: 910, y: 516 },
  p5Panel:      { x: 888, y: 542, w: 336, h: 174 },

  /* ⑥ concept map */
  p6Badge:      { x: 584, y: 521 },
  p6Map:        { x: 596, y: 512 },

  /* the pencilled margin sketch under the cube */
  sketch:       { x: 196, y: 524, w: 322 },

  sparkle:      { x: 1268, y: 628 },
} as const

/* Half-clipped cards at both edges: the board says "there is more graph out
 * there" by letting two columns of it fall off the frame. They are content,
 * not chrome, so they live in the world and move when the board pans. */
export interface EdgeCard {
  x: number; y: number
  title: string
  sub?: string
  /** Which side the connector leaves from. */
  side: 'left' | 'right'
  /** Anchor y for the wire into the board. */
  anchorY: number
}

export const EDGE_CARDS: EdgeCard[] = [
  { x: -44, y: 176, title: 'Kinetic Theory', sub: 'and uncommonly', side: 'left',  anchorY: 234 },
  { x: -66, y: 362, title: 'Theory',         side: 'left',  anchorY: 380 },
  { x: -60, y: 494, title: 'ntic Know',      side: 'left',  anchorY: 512 },
  { x: 1302, y: 214, title: 'Kinetic',       sub: 'Theory', side: 'right', anchorY: 242 },
  { x: 1310, y: 358, title: 'Infinites',     sub: 'Concept', side: 'right', anchorY: 386 },
  { x: 1300, y: 504, title: 'Boyles Law',    sub: '(P ∝ 1/V)', side: 'right', anchorY: 530 },
]
