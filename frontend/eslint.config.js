import tseslint from 'typescript-eslint'
import designValue from './eslint-rules/design-value.js'

/* TWO DESIGN SYSTEMS, SO TWO LINT SURFACES.
 *
 * src/components, src/data and src/styles are the original dashboard. They are
 * out of scope for this refactor, and pointing a token rule at them would do
 * exactly what CLAUDE.md forbids: restyle the dashboard to satisfy a canvas
 * rule. So they are not linted here — not because their code is exempt from
 * good practice, but because this rule encodes the CANVAS's design system and
 * the dashboard has its own.
 *
 * src/practice was linted by NOTHING until now, which was not a decision — it
 * simply post-dates this file, and "the lint surface is the canvas" quietly
 * became "several thousand lines nobody checks". It gets the general TypeScript
 * rules below, but NOT `canvas/design-value`: the practice map deliberately
 * keeps its own tokens scoped to `.practice-map` so nothing it declares can
 * reach the canvas, and a rule that enforces canvas token NAMES there would
 * force exactly the coupling that separation exists to prevent.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'e2e/report/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['src/canvas/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    plugins: {
      canvas: { rules: { 'design-value': designValue } },
    },
    rules: {
      'canvas/design-value': 'error',
      /* The codebase predates this config and uses `any` deliberately in a few
       * registry-shaped places. Turning these into errors now would bury the
       * one rule this step exists to add under noise it did not cause. */
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/practice/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)
