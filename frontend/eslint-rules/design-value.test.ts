import { RuleTester } from '@typescript-eslint/rule-tester'
import { afterAll, describe, it } from 'vitest'
// @ts-expect-error - the rule is plain ESM JS, deliberately untyped
import rule from './design-value.js'

/* THE RULE'S OWN TESTS.
 *
 * Vitest runs these; it is NOT the enforcement mechanism. Law 4 is enforced by
 * the AST rule in CI. This file exists so the rule cannot quietly stop working
 * — a lint rule that silently matches nothing is worse than no rule, because
 * the green check says the codebase is clean when nothing was inspected.
 *
 * Both halves matter. The invalid cases prove it catches what Law 4 bans. The
 * valid cases prove it does NOT catch geometry — and that half is what keeps
 * anyone from reaching for an eslint-disable, which Law 4 forbids outright.
 */
RuleTester.afterAll = afterAll
RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('design-value', rule as never, {
  valid: [
    /* ── geometry is not styling ─────────────────────────────────────── */
    { code: 'const a = <circle cx={12} cy={40} r={3} />' },
    { code: 'const a = <path d="M 0 0 L 10 10" />' },
    { code: 'const a = <svg viewBox="0 0 700 400" width={300} height={180} />' },
    { code: 'const a = <line x1={0} y1={6} x2={19} y2={6} strokeWidth={1.3} />' },
    { code: 'const a = <text textAnchor="middle" dominantBaseline="middle" />' },

    /* ── structural CSS values are always allowed ────────────────────── */
    { code: 'const s = { padding: 0, margin: 0 }' },
    { code: 'const s = { width: "100%", height: "50vh" }' },
    { code: 'const s = { gridTemplateColumns: "1fr auto" }' },
    { code: 'const s = { padding: "var(--c-space-lg)" }' },
    { code: 'const s = { gap: "calc(var(--c-space-sm) * 2)" }' },
    { code: 'const s = { maxWidth: "fit-content", minWidth: "min-content" }' },
    { code: 'const s = { transform: "translateX(50%)", opacity: 0.5, zIndex: 40 }' },
    { code: 'const s = { aspectRatio: "16 / 9" }' },

    /* ── tokens are the sanctioned source ────────────────────────────── */
    { code: 'const s = { color: tokens.color.accent }' },
    { code: 'const a = <path stroke={color.accent} fill={color.surface} />' },
    { code: 'const s = { padding: space.lg, fontSize: type.body.size }' },
    { code: 'const a = <meshStandardMaterial color={series[0]} />' },

    /* ── the token layer itself is exempt, or nothing could define a value ── */
    { code: 'export const color = { accent: "#2dd4bf" }', filename: 'src/canvas/design/tokens.ts' },
  ],

  invalid: [
    /* ── raw colour in an SVG presentation attribute ─────────────────── */
    {
      code: 'const a = <path stroke="#2dd4bf" />',
      errors: [{ messageId: 'rawColour' }],
    },
    {
      code: 'const a = <circle fill="rgba(255,255,255,0.35)" />',
      errors: [{ messageId: 'rawColour' }],
    },
    /* ── gradient stops: the sneakiest colour surface in SVG ─────────── */
    {
      code: 'const a = <stop stopColor="#22d3ee" />',
      errors: [{ messageId: 'rawColour' }],
    },
    /* ── three.js material props — CSS variables cannot reach here ───── */
    {
      code: 'const a = <meshStandardMaterial color="#a5f3fc" emissive="#22d3ee" />',
      errors: [{ messageId: 'rawColour' }, { messageId: 'rawColour' }],
    },
    {
      code: 'const a = <pointLight color="#22d3ee" />',
      errors: [{ messageId: 'rawColour' }],
    },
    /* ── JSX style objects ───────────────────────────────────────────── */
    {
      code: 'const a = <div style={{ color: "#e8eef2" }} />',
      errors: [{ messageId: 'rawColour' }],
    },
    {
      code: 'const a = <div style={{ padding: 12 }} />',
      errors: [{ messageId: 'rawSize' }],
    },
    {
      code: 'const a = <div style={{ fontSize: 27, lineHeight: 1.25 }} />',
      errors: [{ messageId: 'rawSize' }, { messageId: 'rawSize' }],
    },
    /* ── plain TS style objects, not only JSX ────────────────────────── */
    {
      code: 'const s = { backgroundColor: "rgb(14, 17, 19)" }',
      errors: [{ messageId: 'rawColour' }],
    },
    {
      code: 'const s = { borderRadius: 14, borderWidth: 2 }',
      errors: [{ messageId: 'rawSize' }, { messageId: 'rawSize' }],
    },
    {
      code: 'const s = { gap: "18px", letterSpacing: "0.04em" }',
      errors: [{ messageId: 'rawSize' }, { messageId: 'rawSize' }],
    },
    /* ── named CSS colours are colours too ───────────────────────────── */
    {
      code: 'const s = { color: "hotpink" }',
      errors: [{ messageId: 'rawColour' }],
    },
    {
      code: 'const a = <rect fill="white" />',
      errors: [{ messageId: 'rawColour' }],
    },
    /* ── hsl(), and template literals with no interpolation ──────────── */
    {
      code: 'const s = { color: "hsl(174, 65%, 51%)" }',
      errors: [{ messageId: 'rawColour' }],
    },
    {
      code: 'const s = { color: `#2dd4bf` }',
      errors: [{ messageId: 'rawColour' }],
    },
  ],
})
