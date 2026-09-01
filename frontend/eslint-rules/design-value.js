/* LAW 4, AS A COMPILER ERROR.
 *
 * "No raw colour or arbitrary design value outside the token layer" is an
 * instruction, and instructions do not enforce. This does. It walks the TS/TSX
 * AST and refuses a literal that carries appearance, wherever appearance can
 * reach the screen from JavaScript:
 *
 *   style={{ padding: 12 }}          a JSX style object
 *   fill="#2dd4bf"                   an SVG presentation attribute
 *   <meshStandardMaterial color=…>   a three.js material prop, which is the
 *                                    reason tokens.ts exists in TypeScript at
 *                                    all — WebGL cannot read a CSS variable
 *   const s = { fontSize: 14 }       a plain style object assigned later
 *
 * WHAT IT DELIBERATELY ALLOWS is as important as what it refuses. A canvas is
 * made of geometry, and geometry is not styling: an SVG `x`, a viewBox, a
 * radius in user units, a z-index, an opacity, a percentage, a `1fr` column.
 * Refusing those would make the rule unusable and invite the one thing that
 * must never happen — an eslint-disable comment. When this rule blocks
 * something legitimate, the fix is an allowlist entry here, argued for in the
 * open, never a suppression at the call site.
 */

const COLOUR = /(^|[^\w-])(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\()/
const NAMED_COLOURS = new Set([
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black',
  'blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue',
  'darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
  'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
  'darkseagreen','darkslateblue','darkslategray','darkturquoise','darkviolet',
  'deeppink','deepskyblue','dimgray','dodgerblue','firebrick','floralwhite',
  'forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod','gray',
  'green','greenyellow','grey','honeydew','hotpink','indianred','indigo','ivory',
  'khaki','lavender','lawngreen','lemonchiffon','lightblue','lightcoral','lightcyan',
  'lightgray','lightgreen','lightgrey','lightpink','lightsalmon','lightseagreen',
  'lightskyblue','lightslategray','lightsteelblue','lightyellow','lime','limegreen',
  'linen','magenta','maroon','mediumaquamarine','mediumblue','mediumorchid',
  'mediumpurple','mediumseagreen','mediumslateblue','mediumspringgreen',
  'mediumturquoise','mediumvioletred','midnightblue','mintcream','mistyrose',
  'moccasin','navajowhite','navy','oldlace','olive','olivedrab','orange','orangered',
  'orchid','palegoldenrod','palegreen','paleturquoise','palevioletred','papayawhip',
  'peachpuff','peru','pink','plum','powderblue','purple','rebeccapurple','red',
  'rosybrown','royalblue','saddlebrown','salmon','sandybrown','seagreen','seashell',
  'sienna','silver','skyblue','slateblue','slategray','snow','springgreen',
  'steelblue','tan','teal','thistle','tomato','turquoise','violet','wheat','white',
  'whitesmoke','yellow','yellowgreen',
])

/* Style-object keys whose value is a DESIGN decision. A number here is banned. */
const DESIGN_KEYS = new Set([
  'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
  'paddingBlock','paddingInline','paddingBlockStart','paddingBlockEnd',
  'margin','marginTop','marginRight','marginBottom','marginLeft',
  'marginBlock','marginInline',
  'gap','rowGap','columnGap',
  'fontSize','lineHeight','letterSpacing','wordSpacing',
  'borderRadius','borderTopLeftRadius','borderTopRightRadius',
  'borderBottomLeftRadius','borderBottomRightRadius',
  'borderWidth','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
  'outlineWidth','outlineOffset',
])

/* Keys whose value is a COLOUR, wherever it appears. */
const COLOUR_KEYS = new Set([
  'color','backgroundColor','background','borderColor','outlineColor',
  'fill','stroke','stopColor','floodColor','lightingColor','caretColor',
  'textDecorationColor','columnRuleColor','emissive','specular','sheenColor',
  'attenuationColor','borderTopColor','borderRightColor','borderBottomColor',
  'borderLeftColor','boxShadow','textShadow','filter',
])

/* SVG / R3F attributes that carry colour. `color` on a three.js material is
 * the whole reason this rule reaches into JSX attributes and not just style
 * objects. */
const COLOUR_ATTRS = new Set([
  'fill','stroke','stopColor','color','emissive','floodColor','lightingColor',
  'attenuationColor','sheenColor','specular','backgroundColor',
])

/* GEOMETRY, NOT STYLING. These are coordinates and shapes; a canvas cannot be
 * drawn without them and they carry no brand decision. */
const GEOMETRY_ATTRS = new Set([
  'x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','viewBox',
  'width','height','dx','dy','offset','transform','pathLength','strokeDasharray',
  'strokeDashoffset','opacity','fillOpacity','strokeOpacity','zIndex','scale',
  'position','rotation','args','intensity','count','size','radius','far','near',
  'strokeWidth','fontSize','fontWeight','startAngle','endAngle','innerRadius',
  'outerRadius','textAnchor','dominantBaseline','fontFamily','fontStyle',
])

/* Structural CSS values that are always legitimate. */
const STRUCTURAL = /^(0|auto|none|inherit|initial|unset|revert|min-content|max-content|fit-content|[\d.]+%|[\d.]+(vw|vh|vmin|vmax|fr|deg|rad|turn|ch|ex)|calc\(.*\)|var\(.*\)|url\(.*\))$/

const isTokenFile = (filename) =>
  /design[\\/]tokens\.ts$/.test(filename) ||
  /design[\\/]generateCss\.ts$/.test(filename) ||
  /eslint-rules[\\/]/.test(filename) ||
  /\.test\.tsx?$/.test(filename)

/* COULD THIS VALUE EVER BE A CSS SIZE?
 *
 * `DESIGN_KEYS` is matched on the property NAME alone, which is right for
 * `style={{ gap: 12 }}` and wrong for every object that happens to share a word
 * with CSS. `gap` is the one that bites: it is an ordinary English noun, and a
 * lesson's own DATA used it -- a table of how far 0.999… still is from 1, with
 * rows `{ digits: '0.9', gap: '0.1' }` and `{ digits: 'all of them', gap:
 * 'nothing left' }`. The rule reported all three as arbitrary spacing, and the
 * only fixes available were a suppression (forbidden) or renaming the lesson's
 * column to dodge a linter (a change to teaching content for a tooling reason).
 *
 * A value that could not be a CSS size cannot be a design decision about size.
 * `nothing left` is not a length in any stylesheet, and neither is a bare
 * `0.1` -- CSS lengths need a unit, and unitless is legal only for zero.
 *
 * NOTHING REAL IS LET THROUGH. `gap: 12`, `gap: '12px'`, `gap: '1.5rem'` and
 * `fontSize: 14` are all still sizes and still reported; this only declines to
 * judge values that no browser would read as one.
 */
const SIZE_WITH_A_UNIT = /^-?(\d+(\.\d+)?|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in|q|fr)$/i
const BARE_ZERO = /^-?0(\.0+)?$/

function couldBeASize(value) {
  /* A NUMBER in a style object IS a size -- React writes `gap: 12` as `12px`,
     which is exactly the arbitrary value this rule exists to catch. */
  if (typeof value === 'number') return true
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v === '') return false
  /* A STRING NEEDS ITS UNIT. CSS accepts a unitless length only for zero, so
     `'0.1'` is not a gap in any stylesheet -- it is data that happens to sit
     under a key sharing a word with CSS. `'12px'` and the shorthand `'8px 12px'`
     still are, and are still reported. */
  return v.split(/\s+/).every((part) => SIZE_WITH_A_UNIT.test(part) || BARE_ZERO.test(part))
}

function looksLikeColour(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (COLOUR.test(v)) return true
  return NAMED_COLOURS.has(v.toLowerCase())
}

/* A SHORTHAND IS STRUCTURAL IF EVERY PART OF IT IS.
 *
 * ALLOWLIST ENTRY, argued rather than assumed. `margin: '0 auto'` is the
 * centring idiom; `0` and `auto` are each already allowed on their own, and
 * refusing them when written together would have pushed someone toward an
 * eslint-disable — the one escape Law 4 forbids outright. Splitting on
 * whitespace and requiring every atom to pass keeps `0 auto`, `1fr auto` and
 * `0 var(--c-space-lg)` legal while still refusing `12px 14px`, because 12px
 * is not structural however many friends it arrives with. */
function isStructural(value) {
  if (typeof value === 'number') return value === 0
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (STRUCTURAL.test(v)) return true
  const parts = v.split(/\s+/)
  return parts.length > 1 && parts.every((p) => STRUCTURAL.test(p))
}

/* The package is type:module, so this rule is ESM like everything else here.
 * ESLint 10's flat config imports it directly — no CommonJS bridge. */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Law 4 — raw colours and arbitrary design values may only appear in the token layer.',
    },
    schema: [],
    messages: {
      rawColour:
        "Raw colour '{{value}}' in `{{where}}`. Import the role from design/tokens.ts. Law 4 — colour lives in the token layer, and three.js cannot read a CSS variable, which is why tokens are TypeScript.",
      rawSize:
        "Arbitrary {{prop}} '{{value}}'. Use a token from design/tokens.ts (space, type, radius, stroke). Law 4 — a size chosen here is a size the design system does not know about.",
      needsAllowlist:
        "'{{value}}' looks structural but is not on the allowlist. If it is legitimate geometry, add it to GEOMETRY_ATTRS or STRUCTURAL in eslint-rules/design-value.js and say why — never an eslint-disable.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename()
    if (isTokenFile(filename)) return {}

    function checkProperty(node, keyName) {
      const value = node.value
      const literal =
        value.type === 'Literal' ? value.value
        : value.type === 'TemplateLiteral' && value.quasis.length === 1
          ? value.quasis[0].value.cooked
          : undefined
      if (literal === undefined || literal === null) return

      if (COLOUR_KEYS.has(keyName) && looksLikeColour(literal)) {
        context.report({ node: value, messageId: 'rawColour', data: { value: String(literal), where: keyName } })
        return
      }
      if (typeof literal === 'string' && looksLikeColour(literal) && !COLOUR_KEYS.has(keyName)) {
        context.report({ node: value, messageId: 'rawColour', data: { value: literal, where: keyName } })
        return
      }
      if (DESIGN_KEYS.has(keyName) && couldBeASize(literal) && !isStructural(literal)) {
        context.report({ node: value, messageId: 'rawSize', data: { prop: keyName, value: String(literal) } })
      }
    }

    return {
      /* style={{ … }} and any plain object with style-shaped keys */
      Property(node) {
        if (node.computed) return
        const key = node.key
        const name = key.type === 'Identifier' ? key.name
          : key.type === 'Literal' ? String(key.value) : null
        if (!name) return
        checkProperty(node, name)
      },

      /* fill="#2dd4bf", <meshStandardMaterial color="#22d3ee" />, and friends */
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (!name || !node.value) return
        if (GEOMETRY_ATTRS.has(name) && !COLOUR_ATTRS.has(name)) return

        let literal
        if (node.value.type === 'Literal') literal = node.value.value
        else if (
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Literal'
        ) literal = node.value.expression.value

        if (typeof literal !== 'string') return
        if (looksLikeColour(literal)) {
          context.report({ node: node.value, messageId: 'rawColour', data: { value: literal, where: name } })
        }
      },
    }
  },
}
