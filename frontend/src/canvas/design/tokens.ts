/* THE CONSTANT — primitive → semantic → component.
 *
 * Three layers, because two is not enough and one is a pile of hex.
 *
 *   primitive   what a value IS          teal400 = '#2dd4bf'
 *   semantic    what it MEANS            color.accent = primitive.teal400
 *   component   where it is USED         glass.face, ink.annotation
 *
 * A component imports from the third layer and never sees a hex. Changing the
 * canvas accent is one edit in layer two; discovering that two glass tones are
 * actually the same is one edit in layer three. Neither requires touching a
 * component, which is the entire point.
 *
 * EXTRACTION IS NOT NORMALISATION. Every value here renders exactly what it
 * rendered before the token layer existed. The canvas uses six near-white inks
 * and twenty-one white-alpha overlays, and those differences were tuned by eye
 * against the reference image — they are visual layers, not sloppiness.
 * Collapsing them would make this file look tidier and the scene look worse.
 * Where two values are genuinely identical they share a primitive; where they
 * merely look similar, they stay apart and keep their own name.
 *
 * TOKENS ARE TYPESCRIPT because three.js cannot read CSS. A material prop
 * `color="var(--accent)"` throws, and `fill="var(--accent)"` is not a colour.
 * TypeScript feeds CSS, WebGL and SVG; CSS feeds only itself.
 */

/* ═══ LAYER 1 — PRIMITIVES ══════════════════════════════════════════════
 * Raw values, named for what they are. Nothing outside this file reads them
 * directly, and nothing inside the canvas imports this object. */

const primitive = {
  /* teals and cyans — five genuinely different hues, not five spellings of one */
  teal400: '#2dd4bf',
  teal300: '#5eead4',
  teal200: '#7ee7d8',
  cyan400: '#22d3ee',
  cyan350: '#2ad4ee',
  cyan200: '#a5f3fc',
  cyan100: '#d8f6ff',
  cyan50: '#eafcff',

  /* the glass cube's face tones — pale blues, deliberately distinct */
  glass300: '#9fd8e6',
  glass200: '#bcdfeb',
  glass100: '#cfeaf3',

  /* ink: near-whites that are different weights of emphasis, plus true white */
  white100: '#ffffff',
  ink000: '#f2f7f9',
  ink050: '#e8eef2',
  ink100: '#dbe6ea',
  ink200: '#d5dee3',
  ink300: '#cbd5d1',
  ink400: '#9aa5ad',
  ink500: '#93a1ab',
  ink600: '#8b949e',
  ink700: '#5b666f',

  /* ground */
  slate900: '#0e1113',
  slate950: '#0a0c0e',
  slate850: '#14181b',

  /* the heat glyph — the one place the canvas is warm */
  amber500: '#f59e0b',
  amber200: '#fde68a',
  grey500: '#6b7280',
  grey600: '#4b5563',

  /* status */
  red100: '#ffd9d9',

  /* alpha ramps, kept as functions of one base so an alpha cannot drift
   * away from its colour */
  white: (a: number) => `rgba(255,255,255,${a})`,
  black: (a: number) => `rgba(0,0,0,${a})`,
  tealA: (a: number) => `rgba(45,212,191,${a})`,
  glassA: (a: number) => `rgba(159,216,230,${a})`,
  redA: (a: number) => `rgba(255,120,120,${a})`,
  maroonA: (a: number) => `rgba(120,30,30,${a})`,
} as const

/* ═══ LAYER 2 — SEMANTIC ════════════════════════════════════════════════
 * What a value MEANS on this surface. This is the vocabulary a new
 * representation reaches for first. */

export const color = {
  bg: primitive.slate900,
  bgDeep: primitive.slate950,
  bgMid: primitive.slate850,

  surface: primitive.white(0.028),
  surfaceRaised: primitive.white(0.05),

  border: primitive.white(0.085),
  borderStrong: primitive.white(0.1),

  text: primitive.ink050,
  textMuted: primitive.ink600,
  textFaint: primitive.ink700,

  /* THE CANONICAL CANVAS ACCENT. One edit here moves every accent on the
   * board. The dashboard's accent is a different decision in a different
   * file and is deliberately not reachable from here. */
  accent: primitive.teal400,
  accentDim: primitive.tealA(0.42),
  accentGlow: primitive.teal300,

  positive: primitive.teal200,
  negative: primitive.red100,
  warning: primitive.amber500,
} as const

/* ═══ LAYER 3 — COMPONENT ═══════════════════════════════════════════════
 * Where a value is used. A panel imports from here, so a panel never sees a
 * hex and never has to know which primitive it resolved to. */

/** The 3D box: face tones, edges, and the particles inside it. */
export const glass = {
  face: primitive.glass200,
  edge: primitive.glass100,
  edgeSoft: primitive.glass300,
  stroke2d: primitive.glassA(0.42),
} as const

export const particle = {
  core: primitive.cyan400,
  emissive: primitive.cyan350,
  halo: primitive.cyan200,
  bright: primitive.cyan100,
} as const

/** Six weights of ink. They are NOT `text` and `textMuted` in disguise — each
 *  was picked against a different ground, and merging them flattens the
 *  hierarchy the reference image draws with. */
export const ink = {
  /* Pure white. A panel heading in the reference is #fff, not near-white --
   * extracting it to `bright` shifted every heading by three points per
   * channel, which no test caught because the guards assert "not serif", not
   * an exact colour. Small, silent, and exactly the kind of drift a token
   * layer is supposed to prevent. */
  pure: primitive.white100,
  bright: primitive.ink000,
  high: primitive.ink050,
  equation: primitive.ink100,
  node: primitive.ink200,
  annotation: primitive.ink300,
  axis: primitive.ink400,
  sub: primitive.ink500,
  muted: primitive.ink600,
  faint: primitive.ink700,
} as const

/** White overlays. Twenty-one alphas is not twenty-one mistakes: a hairline
 *  divider, a hover surface and a focus ring are different jobs. */
export const overlay = {
  ghost: primitive.white(0.015),
  faintest: primitive.white(0.03),
  fainter: primitive.white(0.035),
  faint: primitive.white(0.04),
  soft: primitive.white(0.045),
  softer: primitive.white(0.055),
  low: primitive.white(0.07),
  card: primitive.white(0.09),
  line: primitive.white(0.12),
  lineStrong: primitive.white(0.14),
  edge: primitive.white(0.16),
  edgeStrong: primitive.white(0.22),
  rule: primitive.white(0.28),
  ruleStrong: primitive.white(0.3),
  axis: primitive.white(0.32),
  guide: primitive.white(0.35),
  mark: primitive.white(0.4),
  markStrong: primitive.white(0.42),
  strong: primitive.white(0.45),
  strongest: primitive.white(0.5),
  full: primitive.white(0.55),
} as const

export const accentAlpha = {
  wash: primitive.tealA(0.1),
  line: primitive.tealA(0.5),
  connector: primitive.tealA(0.55),
  node: primitive.tealA(0.75),
} as const

export const heat = {
  flame: primitive.amber500,
  spark: primitive.amber200,
  body: primitive.grey500,
  base: primitive.grey600,
} as const

export const shadow = {
  soft: primitive.black(0.4),
  medium: primitive.black(0.42),
  strong: primitive.black(0.5),
} as const

/** COMPOSITES, not colours — and separated for that reason.
 *
 * A box-shadow is an offset, a blur and a colour in one string. Keeping it in
 * the `shadow` colour group made a test fail that asserts every value there
 * resolves to a colour, and the test was right: mixing a composite into a
 * colour group is how a token layer stops being checkable. */
export const elevation = {
  /* The glass panel's lift. Composed here rather than in a stylesheet so the
   * TSX primitive and the CSS class cannot drift apart. */
  panel: `0 18px 46px ${primitive.black(0.5)}, inset 0 1px 0 ${primitive.white(0.05)}`,
} as const

/** The frosted surface the reference uses for interactive panels. A gradient,
 *  not a flat fill — that top-to-bottom fade is what reads as glass. */
export const surface = {
  glassTop: primitive.white(0.045),
  glassBottom: primitive.white(0.015),
  glassBlur: '6px',
} as const

/** Sizes that belong to a visual primitive rather than to the spacing scale:
 *  a badge is a circle of a fixed diameter, not a padding value. */
export const primitiveSize = {
  badge: 19,
  badgeBorder: 1,
  headGap: 9,
  headTextGap: 1,
} as const

export const status = {
  errorSurface: primitive.maroonA(0.35),
  errorBorder: primitive.redA(0.35),
  errorText: primitive.red100,
} as const

/* Chart series. A lesson picks an INDEX, never a colour — which is what stops
 * a generator inventing a palette one chart at a time. */
export const series = [
  primitive.teal400,
  primitive.cyan400,
  primitive.cyan200,
  primitive.teal300,
  primitive.teal200,
  primitive.ink400,
] as const

/* ═══ SPACE ═════════════════════════════════════════════════════════════ */

/** The canonical 4px scale. New work uses this. */
export const space = {
  none: 0, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, h1: 48, h2: 64, h3: 96,
} as const

/** SPACING THE REFERENCE SCENE ACTUALLY USES that is not on the scale.
 *
 * Tuned by eye against the reference image. Snapping 6 to 4 moves things on
 * screen, and Step 1 is extraction, not normalisation — so these keep their
 * exact values and their own names. Normalising them is a later, visually
 * reviewed decision. This object shrinking is how that progress is measured. */
export const spaceLegacy = {
  hair: 1, tight: 2, snug: 5, cosy: 6, roomy: 10, wide: 14,
} as const

/* ═══ TYPE ══════════════════════════════════════════════════════════════ */

export const font = {
  sans: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "'Fraunces', 'Iowan Old Style', Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
} as const

export interface TypeRole {
  size: number
  lineHeight: number
  weight: number
  tracking: string
  family: string
}

/** The seven canonical roles. */
export const type: Record<
  'display' | 'title' | 'heading' | 'body' | 'label' | 'micro' | 'mono',
  TypeRole
> = {
  display: { size: 27, lineHeight: 1.25, weight: 600, tracking: '-0.015em', family: font.sans },
  title: { size: 15, lineHeight: 1.2, weight: 700, tracking: '0.055em', family: font.sans },
  heading: { size: 13.5, lineHeight: 1.3, weight: 650, tracking: '0em', family: font.sans },
  body: { size: 13, lineHeight: 1.5, weight: 400, tracking: '0em', family: font.sans },
  label: { size: 11.5, lineHeight: 1.35, weight: 500, tracking: '0em', family: font.sans },
  micro: { size: 10.5, lineHeight: 1.3, weight: 500, tracking: '0.09em', family: font.sans },
  mono: { size: 11, lineHeight: 1.3, weight: 400, tracking: '0.06em', family: font.mono },
} as const

/** SIZES THE REFERENCE SCENE USES that are not one of the seven roles.
 *
 * Mathematics is the honest reason most of these exist: `P ∝ T` at 46px and
 * `PV = nRT` at 30px are a display hierarchy the seven roles do not model,
 * and setting them both to `display` would flatten the panel the whole scene
 * is built around. Named for their job, not their pixel value, so a later
 * normalisation has something to aim at. */
export const typeLegacy = {
  /* The numbered badge sets at 10px, half a point below the `micro` role.
   * Snapping it to micro made every badge fractionally larger. */
  badge: { size: 10, lineHeight: 1 },
  gasRelation: { size: 46, lineHeight: 1 },
  gasSymbol: { size: 42, lineHeight: 1 },
  gasLaw: { size: 30, lineHeight: 1 },
  sketchLaw: { size: 22, lineHeight: 1 },
  annotation: { size: 13, lineHeight: 1.35 },
  bodyLegacy: { size: 12, lineHeight: 1.25 },
  constants: { size: 12.5, lineHeight: 1.3 },
} as const

/* ═══ RADIUS · STROKE · MOTION · ARROW ══════════════════════════════════ */

export const radius = { xs: 2, sm: 8, md: 11, lg: 14, xl: 18, pill: 999 } as const
export const stroke = { hair: 1, base: 1.25, bold: 1.7 } as const

export const motion = {
  fast: 120, base: 180, slow: 320,
  /* One curve for the whole canvas. Two easings is two design systems. */
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

/** Arrow geometry is COMPUTED from node boxes plus these constants. A lesson
 *  supplies from/to ids and never a control point. */
export const arrow = {
  curvature: 0.45,
  minBow: 40,
  headLength: 6,
  headWidth: 3.8,
  cap: 'round',
} as const

/* ═══ WHAT IS STILL UNRESOLVED ══════════════════════════════════════════ */

/** Consolidations that are DEFENSIBLE but would change rendered pixels, so
 *  they wait for a visual review rather than riding in on a refactor. */
export const NORMALISATION_BACKLOG = {
  spacing: 'spaceLegacy — 6 values off the 4px scale (1, 2, 5, 6, 10, 14).',
  typography: 'typeLegacy — 7 sizes outside the seven roles, mostly mathematics.',
  ink: 'ink has 9 weights; some pairs may be interchangeable at render size.',
  overlay: 'overlay has 21 alphas; several are within 0.005 of a neighbour.',
  glass: 'glass.face / edge / edgeSoft may be two tones rather than three.',
} as const

/** Four accent teals exist in this repository. The canvas adopts one; the
 *  dashboard keeps its own, and this refactor is forbidden from touching it.
 *  Whether the two should ever converge is a product decision, recorded here
 *  rather than taken here. */
export const ACCENT_OWNERSHIP = {
  canvas: primitive.teal400,
  dashboard: ['#0C9B8E', '#1AADA6'],
  removedWithBlackboard: '#38e4d7',
  note: 'No canvas teal was merged during extraction — every distinct value kept its own token.',
} as const

export const tokens = {
  color, glass, particle, ink, overlay, accentAlpha, heat, shadow, status,
  series, space, spaceLegacy, font, type, typeLegacy, radius, stroke, motion, arrow,
  elevation, surface, primitiveSize,
} as const
export type Tokens = typeof tokens
