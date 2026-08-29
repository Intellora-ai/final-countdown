import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import designValue from './eslint-rules/design-value.js'

/*
 * ACCESSIBILITY, CHECKED WHERE IT IS WRITTEN AS WELL AS WHERE IT RUNS.
 *
 * `e2e/a11y.spec.ts` runs axe over eight routes, five projects and three states
 * each. That is the better measurement -- it sees the real DOM -- and it arrives
 * minutes later, in CI, after the change is already written. This catches the
 * cheap half at the keystroke.
 *
 * TWO RULES ARE TUNED, AND EACH IS A MEASURED DISAGREEMENT RATHER THAN A
 * SILENCED COMPLAINT.
 *
 * `no-noninteractive-tabindex` is OFF. It fires on five scrollable regions that
 * carry `role="region"`, `tabIndex={0}` and an `aria-label` -- and that pattern
 * is not a mistake, it is the fix axe's own `scrollable-region-focusable`
 * REQUIRES. A scrollable box that cannot take focus cannot be scrolled without
 * a mouse. Two tools disagree; the one measuring the real browser against WCAG
 * wins, and "fixing" the lint finding would turn a passing axe run red.
 *
 * `label-has-associated-control` gets `depth: 3`. `SimulationView` nests its
 * label text one span deeper than the rule looks by default, and the control IS
 * inside the label. Raising the depth makes the rule see what is there rather
 * than turning it off.
 */
const a11yRules = {
  ...jsxA11y.flatConfigs.recommended.rules,
  'jsx-a11y/no-noninteractive-tabindex': 'off',
  'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
}

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
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...a11yRules,
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
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...a11yRules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  /* src/agent is the AI capability layer, and it was in exactly the position
   * src/practice was in above: outside every `files` block, and therefore
   * silently unlinted. Flat config does not warn about this --- a path with no
   * matching block is reported as "ignored", which reads like a deliberate
   * exclusion rather than an omission. Adding the directory to the lint SCRIPT
   * without adding a block here would have changed nothing at all, and the
   * gate would have looked green over several thousand unchecked lines.
   *
   * `canvas/design-value` is deliberately NOT applied. It encodes the canvas
   * design system, and this layer emits no styling of any kind --- it chooses
   * WHICH representation and hands that to the renderer. The Four Laws
   * guarantee for it is asserted directly instead, by a test that serialises a
   * communication plan and fails on any hex, rgb(), px/rem, or positional key.
   * A rule about token NAMES here would check the wrong thing and pass.
   *
   * `no-explicit-any` is an ERROR rather than off: this code is new, so there
   * is no pre-existing `any` to bury the rule under. */
  {
    files: ['src/agent/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /* src/websearch was unlinted for the same reason src/practice was: flat
   * config lints only paths with a MATCHING `files:` entry, so a new directory
   * is silently exempt rather than loudly missing. `npm run lint` returned 0
   * over that tree without reading one of its files, which is worse than no
   * lint at all — a green gate that checked nothing.
   *
   * No `canvas/design-value` here, and that is deliberate rather than an
   * oversight. Nothing under src/websearch renders: it fetches bytes, turns
   * them into text, and measures how long that took. A design-token rule would
   * have no true positives to find, and a rule that can only produce noise is
   * one people learn to switch off.
   *
   * `no-explicit-any` is an ERROR here, matching src/practice rather than the
   * canvas exemption. This directory has no legacy to grandfather, and its
   * whole job is parsing untrusted input — where `any` is precisely how a
   * malformed response becomes a runtime surprise instead of a compile error.
   */
  {
    files: ['src/websearch/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /* src/tutor is the fourth directory to arrive unlinted for the SAME reason,
   * and the comment above this one had already named that reason.
   *
   * It ships. `App.tsx` routes `/quick-question` to `TutorView`, and that view
   * is what makes the whole of `src/agent` reachable from the product. It was
   * absent from both the `files:` list here and the `npm run lint` argument
   * list, so `npx eslint src/tutor` printed "ignored because no matching
   * configuration was supplied" and EXITED 0 --- the silent-exemption failure
   * this repository has now had four times, and the one the note above warns
   * about in writing.
   *
   * `canvas/design-value` IS applied here, and that is the one place this block
   * differs from the two above it. The reason those exempt it does not hold:
   * `src/agent` and `src/websearch` never render, so the rule has no true
   * positive available in either and could only ever produce noise. `src/tutor`
   * renders --- it is a React view with its own stylesheet --- so Law 4 applies
   * to it exactly as it applies to the canvas.
   *
   * Measured before enabling, not assumed: with the plugin declared in this
   * same object, `npx eslint src/tutor` reports zero findings. So it costs
   * nothing today and refuses the first raw hex or px literal somebody adds
   * tomorrow, which is the cheaper end of that trade by a wide margin.
   *
   * (The first version of this comment claimed the rule found nothing and
   * therefore did not belong. The claim was written before the command ran, and
   * the run that followed disagreed with the conclusion drawn from it.)
   *
   * KNOWN LIMIT, NOT CLOSED HERE: ESLint does not lint standalone `.css`, so
   * `tutor.css` is unchecked by this or any other rule. CLAUDE.md records that
   * separately.
   *
   * `no-explicit-any` is an ERROR. This directory is new, so there is no
   * pre-existing `any` for the rule to be buried under, and it sits directly on
   * the boundary where a model response becomes rendered output.
   */
  {
    files: ['src/tutor/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    plugins: { canvas: { rules: { 'design-value': designValue } }, 'jsx-a11y': jsxA11y },
    rules: {
      ...a11yRules,
      'canvas/design-value': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /* src/almanac was unlinted for the same reason src/websearch and src/practice
   * were: flat config lints only paths with a MATCHING `files:` entry, so a new
   * directory is silently exempt rather than loudly missing. Adding it to the
   * lint SCRIPT alone changes nothing without this block.
   *
   * `design-value` applies because this area renders: `resolve.ts` decides the
   * words a student reads on a row, and the backlog label is painted from the
   * token layer. A colour written here would be a colour the design system does
   * not know about. */
  {
    files: ['src/almanac/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    plugins: { canvas: { rules: { 'design-value': designValue } }, 'jsx-a11y': jsxA11y },
    rules: {
      ...a11yRules,
      'canvas/design-value': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /*
   * `src/api` -- the typed client for the Learning OS HTTP API.
   *
   * ADDED IN TWO PLACES, WHICH IS THE ONLY WAY IT WORKS. A flat config lints
   * only paths with a MATCHING `files:` entry, so adding the directory to the
   * `npm run lint` argument alone changes nothing -- eslint would be handed the
   * path, find no block for it, and lint none of it while exiting 0.
   *
   * `scripts/lint-coverage.test.mjs` caught this directory the moment it
   * appeared, which is what it was built for: `src/tutor` was the fourth
   * directory to ship unlinted, and that test exists to make a fifth
   * impossible. This is the fifth, and it was refused.
   *
   * `no-explicit-any` is an ERROR. The directory is new, so there is no
   * pre-existing `any` for the rule to be buried under, and this code sits on
   * the boundary where an untyped JSON response becomes a typed value -- which
   * is exactly where an `any` does the most damage and is least visible.
   *
   * `design-value` is NOT applied here. It forbids raw colours and spacing
   * outside the token layer, and this directory renders nothing; including it
   * would be a rule that can never fire, which is worse than no rule because it
   * reads as coverage.
   */
  {
    files: ['src/api/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /*
   * THE FOUR TOP-LEVEL DIRECTORIES, WHICH NO BLOCK HAS EVER MATCHED.
   *
   * `lint-coverage.test.mjs` was built to stop a directory being silently
   * exempt, and it worked -- five times, all of them under `src/`. It only ever
   * looked under `src/`, so four whole trees outside it were invisible to the
   * gate AND to the linter at once. Measured before writing this:
   *
   *     e2e            19 files   the browser harness, and every gate that
   *                               depends on it
   *     server         28 files   holds the API key; the one process standing
   *                               between a browser and the model
   *     scripts        43 files   every gate, the mutation runner, the
   *                               curriculum pipeline
   *     eslint-rules    1 file    the custom rule the canvas lint depends on
   *
   * `npx eslint e2e server scripts eslint-rules` reported "ignored because no
   * matching configuration was supplied" for all of them. Ninety-one files, no
   * rule ever applied. The gate's own scope was the blind spot.
   *
   * `no-explicit-any` is a WARNING rather than an error in these three
   * TypeScript trees: they predate this block, and turning a rule on as an
   * error over existing code buries the rule under work it did not cause. The
   * lint script runs at `--max-warnings 0`, so a warning still fails the gate
   * -- it is the SEVERITY that is softened for a future reader, not the
   * enforcement.
   */
  {
    files: ['e2e/**/*.{ts,tsx,mjs}', 'server/**/*.ts', 'eslint-rules/**/*.{ts,js}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /* `scripts/` is plain ESM JavaScript, not TypeScript. The type-aware preset
     would report nothing useful there, so it gets the base rules only. */
  {
    files: ['scripts/**/*.mjs', '*.mjs'],
    extends: [tseslint.configs.base],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
)
