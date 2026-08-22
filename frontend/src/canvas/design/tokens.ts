/* THE CONSTANT.
 *
 * Every colour, size, weight and duration the canvas is allowed to use. This
 * file is the ONLY place in the canvas where a raw design value may appear;
 * the `design-value` ESLint rule enforces that everywhere else, and this file
 * is the single exemption.
 *
 * IT IS ALSO THE SOURCE OF TRUTH FOR CSS, and that direction is not arbitrary.
 * three.js material props and SVG presentation attributes cannot read a CSS
 * custom property — `fill="var(--accent)"` is not a colour and
 * `<meshStandardMaterial color="var(--accent)" />` throws. TypeScript can feed
 * both CSS and WebGL; CSS cannot feed WebGL. So values live here and
 * `generateCss.ts` emits the custom properties from them.
 *
 * NOTHING HERE CHANGES WHAT RENDERS TODAY. Every value below was read out of
 * the shipping canvas. Where a role and a hardcoded value disagreed, the
 * hardcoded value won and the disagreement is recorded in COLLAPSE_CANDIDATES
 * rather than silently resolved — merging two colours that currently look
 * different is a visual change, and a visual change needs approval, not a
 * refactor commit.
 */

/* ── space ─────────────────────────────────────────────────────────────── */
/* A 4px scale. There is no other spacing value in the canvas. */
export const space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  h1: 48,
  h2: 64,
  h3: 96,
} as const

/* ── type ──────────────────────────────────────────────────────────────── */
/* Exactly seven roles. A size that is not one of these does not exist.
 * Each role fixes size, line-height, weight and tracking together, because a
 * size chosen without its line-height is how a design system starts leaking. */
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

export const type: Record<
  'display' | 'title' | 'heading' | 'body' | 'label' | 'micro' | 'mono',
  TypeRole
> = {
  /* The question at the top of the board. */
  display: { size: 27, lineHeight: 1.25, weight: 600, tracking: '-0.015em', family: font.sans },
  /* A panel heading — uppercase in use, but that is the recipe's job, not the token's. */
  title: { size: 15, lineHeight: 1.2, weight: 700, tracking: '0.055em', family: font.sans },
  heading: { size: 13.5, lineHeight: 1.3, weight: 650, tracking: '0em', family: font.sans },
  body: { size: 13, lineHeight: 1.5, weight: 400, tracking: '0em', family: font.sans },
  label: { size: 11.5, lineHeight: 1.35, weight: 500, tracking: '0em', family: font.sans },
  micro: { size: 10.5, lineHeight: 1.3, weight: 500, tracking: '0.09em', family: font.sans },
  mono: { size: 11, lineHeight: 1.3, weight: 400, tracking: '0.06em', family: font.mono },
} as const

/* ── colour ────────────────────────────────────────────────────────────── */
/* Semantic roles only. No component names, no "teal", no "the one on the
 * gauge". A role says what a colour MEANS so the value can change without
 * every caller having to. */
export const color = {
  bg: '#0e1113',
  bgDeep: '#0a0c0e',

  surface: 'rgba(255,255,255,0.028)',
  surfaceRaised: 'rgba(255,255,255,0.05)',

  border: 'rgba(255,255,255,0.085)',
  borderStrong: 'rgba(255,255,255,0.10)',

  text: '#e8eef2',
  textMuted: '#8b949e',
  textFaint: '#5b666f',

  accent: '#2dd4bf',
  accentDim: 'rgba(45,212,191,0.42)',
  accentGlow: '#5eead4',

  positive: '#7ee7d8',
  negative: '#ffd9d9',
  warning: '#f59e0b',
} as const

/* Chart series. Fixed order — a lesson picks an INDEX, never a colour, which
 * is what stops a generator inventing a palette one chart at a time. */
export const series = [
  '#2dd4bf',
  '#22d3ee',
  '#a5f3fc',
  '#5eead4',
  '#7ee7d8',
  '#9aa5ad',
] as const

/* ── radius · stroke · motion · arrow ──────────────────────────────────── */
export const radius = { sm: 8, md: 11, lg: 14, xl: 18, pill: 999 } as const
export const stroke = { hair: 1, base: 1.25, bold: 1.7 } as const

export const motion = {
  fast: 120,
  base: 180,
  slow: 320,
  /* One curve for the whole canvas. Two easings is two design systems. */
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const

/* Arrow geometry is COMPUTED from node boxes plus these constants — a lesson
 * never authors a control point. See Step 7. */
export const arrow = {
  /* Fraction of the horizontal span used as the bezier tangent length. */
  curvature: 0.45,
  minBow: 40,
  headLength: 6,
  headWidth: 3.8,
  cap: 'round',
} as const


/* THE UNRESOLVED VALUES, NAMED SO THEY CAN BE USED WITHOUT LYING.
 *
 * These render exactly what they rendered before this refactor. They are here
 * rather than inline in a component for one reason: Law 4 says a raw value may
 * not appear outside the token layer, and the honest way to satisfy that
 * without changing a pixel is to move the value here and give it a name that
 * admits what it is.
 *
 * Each of these is a question, not an answer. `particleCore` is probably the
 * same idea as `accent` at a different temperature; the six `ink*` values are
 * probably `text` and `textMuted`; the white alphas are almost certainly
 * `surface` and `border` wearing different hats. Resolving any of them changes
 * what appears on screen, so each is a decision to be taken deliberately and
 * shown, not folded into a refactor commit.
 *
 * The measure of this step's success is that this object shrinks over time.
 */
export const pending = {
  /* the glass cube and its contents */
  glassBody: '#bcdfeb',
  glassEdge: '#cfeaf3',
  glassEdgeSoft: '#9fd8e6',
  glassStroke2d: 'rgba(159,216,230,0.42)',
  particleCore: '#22d3ee',
  particleEmissive: '#2ad4ee',
  particleHalo: '#a5f3fc',
  particleBright: '#d8f6ff',
  thermoBulb: '#eafcff',

  /* near-white inks used for annotation, axes and equations */
  inkAnnotation: '#cbd5d1',
  inkEquation: '#dbe6ea',
  inkNode: '#d5dee3',
  inkBright: '#f2f7f9',
  inkAxis: '#9aa5ad',
  inkSub: '#93a1ab',

  /* the heat glyph, which has no role vocabulary at all */
  spark: '#fde68a',
  stoveBody: '#6b7280',
  stoveBase: '#4b5563',

  /* the background gradient's midpoint */
  bgGradientMid: '#14181b',

  /* white overlays at every alpha the canvas currently uses */
  white015: 'rgba(255,255,255,0.015)',
  white03: 'rgba(255,255,255,0.03)',
  white035: 'rgba(255,255,255,0.035)',
  white04: 'rgba(255,255,255,0.04)',
  white045: 'rgba(255,255,255,0.045)',
  white055: 'rgba(255,255,255,0.055)',
  white07: 'rgba(255,255,255,0.07)',
  white09: 'rgba(255,255,255,0.09)',
  white12: 'rgba(255,255,255,0.12)',
  white14: 'rgba(255,255,255,0.14)',
  white16: 'rgba(255,255,255,0.16)',
  white22: 'rgba(255,255,255,0.22)',
  white28: 'rgba(255,255,255,0.28)',
  white30: 'rgba(255,255,255,0.30)',
  white32: 'rgba(255,255,255,0.32)',
  white35: 'rgba(255,255,255,0.35)',
  white40: 'rgba(255,255,255,0.4)',
  white42: 'rgba(255,255,255,0.42)',
  white45: 'rgba(255,255,255,0.45)',
  white50: 'rgba(255,255,255,0.5)',
  white55: 'rgba(255,255,255,0.55)',

  /* shadows and the validator's error banner */
  shadow40: 'rgba(0,0,0,0.4)',
  shadow42: 'rgba(0,0,0,0.42)',
  shadow50: 'rgba(0, 0, 0, 0.5)',
  errorSurface: 'rgba(120,30,30,0.35)',
  errorBorder: 'rgba(255,120,120,0.35)',

  /* accent at alphas the role vocabulary does not carry */
  accent10: 'rgba(45,212,191,0.10)',
  accent50: 'rgba(45,212,191,0.5)',
  accent55: 'rgba(45,212,191,0.55)',
  accent75: 'rgba(45,212,191,0.75)',
} as const


/* OFF-SCALE SIZES THE CANVAS ACTUALLY USES.
 *
 * The brief specifies a 4px spacing scale and exactly seven type roles. The
 * shipping canvas honours neither: it uses gaps of 1, 2, 5, 6, 10 and 14, and
 * font sizes of 12, 12.5, 22, 30, 42 and 46. Every one of those was chosen by
 * eye against the reference image.
 *
 * Snapping 6 to 4, or 46 to the 27px `display` role, moves things on screen.
 * That is a design decision, not a refactor, so these are preserved verbatim
 * and reported. The scale is the goal; this is the distance still to travel.
 *
 * Anything referenced here is, by definition, a Step 1 finding awaiting a call.
 */
export const pendingSize = {
  /* gaps that are not on the 4px scale */
  gap1: 1, gap2: 2, gap5: 5, gap6: 6, gap10: 10, gap14: 14,
  /* the equation panel's display sizes, tuned against the reference */
  fontDisplayXl: 46,
  fontDisplayLg: 42,
  fontDisplayMd: 30,
  fontDisplaySm: 22,
  /* sizes between the `label` and `body` roles */
  font12: 12,
  font125: 12.5,
  font13: 13,
  /* line heights not tied to a type role */
  line1: 1,
  line125: 1.25,
  line135: 1.35,
  /* one-off spacing inside components */
  pad2: 2,
  pad4: 4,
  pad6: 6,
  pad12: 12,
  pad14: 14,
  radius2: 2,
  radius8: 8,
} as const

/* ── the honest part ───────────────────────────────────────────────────── */

/* WHAT THIS FILE DOES NOT YET COVER.
 *
 * The canvas currently renders 66 distinct colour values. Fourteen semantic
 * roles cannot absorb 66 values without changing what appears on screen, and
 * Step 1's contract is "no UNREPORTED visual change" — not "no visual change",
 * which would be incompatible with having a token layer at all.
 *
 * So every value below still renders exactly as it did. Each is a COLLAPSE
 * CANDIDATE: a value that probably wants to become a role, where doing so
 * would alter a pixel and therefore needs a decision rather than a commit.
 * They are grouped by the argument for collapsing them.
 */
export const COLLAPSE_CANDIDATES = {
  /* The 3D box's pale blues. Six values within a few percent of each other,
   * almost certainly one "glass" role and one "particle core" role. */
  glass: ['#bcdfeb', '#cfeaf3', '#9fd8e6', 'rgba(159,216,230,0.42)'],
  particle: ['#22d3ee', '#2ad4ee', '#a5f3fc', '#d8f6ff', '#eafcff'],

  /* Near-white greys used for annotation text. Likely `text` and `textMuted`,
   * but #cbd5d1 against #e8eef2 is a visible difference on a dark ground. */
  inkVariants: ['#cbd5d1', '#dbe6ea', '#d5dee3', '#f2f7f9', '#9aa5ad', '#93a1ab'],

  /* White overlays at eleven different alphas. These are `surface`,
   * `surfaceRaised`, `border` and `borderStrong` wearing slightly different
   * hats; collapsing them is the single biggest tidy available here. */
  whiteAlphas: [
    'rgba(255,255,255,0.015)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.035)',
    'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.055)',
    'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.09)', 'rgba(255,255,255,0.12)',
    'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.22)',
    'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.32)',
    'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.42)',
    'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.55)',
  ],

  /* The heat glyph under the causal chain. Its flame is adopted as `warning`
   * above — the only value in this whole audit that mapped cleanly onto an
   * unused role. The rest are the stove body and the collision sparks: real
   * colours with no role, and the one group here that may deserve NEW roles
   * rather than absorption into existing ones. */
  heat: ['#fde68a', '#6b7280', '#4b5563'],

  /* Shadow blacks and the error banner. */
  shadow: ['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.42)', 'rgba(0, 0, 0, 0.5)'],
  error: ['rgba(120,30,30,0.35)', 'rgba(255,120,120,0.35)'],
} as const

/* FOUR ACCENTS EXIST IN THIS REPOSITORY and only one of them is in this file.
 *
 *   #0C9B8E  --accent          src/styles/tokens/colors.css   (dashboard)
 *   #1AADA6  --agabi-teal-400  src/styles/tokens/colors.css   (dashboard)
 *   #38e4d7  --board-accent    deleted with the blackboard in Step 0
 *   #2dd4bf  --sc-accent       the canvas — adopted above
 *
 * The canvas takes #2dd4bf because the canvas is the visual reference. The two
 * dashboard values are deliberately NOT touched: the dashboard is out of scope
 * and restyling it to satisfy a canvas rule is explicitly forbidden. Whether
 * the two systems should eventually share one accent is a product decision,
 * and it is recorded here rather than made here.
 */
export const ACCENT_CONFLICTS = {
  canvas: '#2dd4bf',
  dashboard: ['#0C9B8E', '#1AADA6'],
  removedWithBlackboard: '#38e4d7',
} as const

export const tokens = { space, font, type, color, series, radius, stroke, motion, arrow, pending, pendingSize } as const
export type Tokens = typeof tokens
