/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  /* THE DEV SERVER COULD NOT REACH ALMANAC AT ALL.
   *
   * The browser posts to /api/day and /api/lesson. Vite serves the app on one
   * port and the planner listens on another, so in development every one of
   * those requests 404'd against Vite itself -- the dashboard reported "the
   * planner answered 404" honestly, and nobody could run the product end to
   * end on their own machine.
   *
   * Found by the deep-qa harness, which counts console errors and saw 180 of
   * them from this one cause. The gap was mine: a server was built in Phase 1
   * and never connected to the thing that talks to it.
   *
   * `changeOrigin` is off deliberately: the planner is same-machine and binds
   * to loopback, and rewriting the Host header would hide which origin a
   * request really came from. */
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
      },
    },
  },
  plugins: [react()],

  /* ONE REACT, ONE THREE — enforced, not assumed.
   *
   * react-three-fiber renders through its own reconciler, so it must be
   * handed the SAME React instance as the app. When it is not, <Canvas>
   * calls useMemo on a module whose dispatcher is null and every 3D panel
   * throws "Invalid hook call" — which is exactly what happened here after
   * installing r3f against an already-running dev server: Vite re-optimized
   * mid-session and two pre-bundled React chunks (?v=80c1eb3d and
   * ?v=1bb23c48) were live at once.
   *
   * dedupe makes the resolver collapse them to one copy. `three` is listed
   * for the same reason a class lower down: two Three instances means
   * instanceof checks across the boundary silently fail. */
  resolve: {
    dedupe: ['react', 'react-dom', 'three'],
  },
  /* The echarts entries are listed for the SECOND half of the note above.
   * Nothing in the entry graph imports them — the canvas is a lazy route — so
   * Vite would not discover them at startup and would re-optimize the moment a
   * learner first opened a lesson. That mid-session re-optimize is the exact
   * event that produced two live React chunks last time.
   *
   * THE SUBPATHS ARE LISTED SEPARATELY, AND THEY HAVE TO BE.
   *
   * This originally read `'echarts', 'echarts-for-react'`, which looked right
   * and was not: `optimizeDeps.include` matches the SPECIFIER as written, not
   * the package it resolves to. The chart modules import `echarts/core`,
   * `echarts/charts`, `echarts/components`, `echarts/renderers` and
   * `echarts-for-react/lib/core` — five specifiers, none of which the two
   * package names cover. The dev server proved it by logging
   * "new dependencies optimized: … optimized dependencies changed. reloading"
   * on the first lesson opened, which is precisely the reload this block
   * exists to prevent. Adding a deep import from either package means adding
   * it here too. */
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'echarts-for-react/lib/core',
    ],
  },
  test: {
    /* Two test runners live in this package and they must not read each
     * other's files. Vitest owns the pure-logic tests under src/; Playwright
     * owns the browser harness under e2e/. Vitest's default glob would sweep
     * up e2e/*.spec.ts and fail on the first test.describe() it finds there,
     * so the boundary is stated rather than left to precedence.
     *
     * No environment is set: every vitest test here is DOM-free by design.
     * jsdom is deliberately absent — it performs no layout and implements no
     * container queries, so a "mobile" assertion made against it would be an
     * assertion about the stub. Those claims belong to the browser harness.
     *
     * scripts/ is swept too, and it is a THIRD area rather than a widening of
     * src/. The only test there drives scripts/mutation-gate.mjs as a child
     * process to prove its empty-shard guard refuses and exits 1. That is safe
     * only because the guard now sits above the gate's own vitest call: a test
     * that reached that call would start a suite containing itself. See the
     * header of scripts/mutation-gate.test.mjs before adding a second case. */
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'eslint-rules/**/*.test.ts',
      'scripts/**/*.test.mjs',
      /* server/ is a FOURTH area, and deliberately separate from src/. It never
       * ships to the browser: it holds the API key. Its tests run here so the
       * one command that proves the frontend also proves the thing standing
       * between the browser and the model. */
      'server/**/*.test.ts',
    ],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],

    /* jsdom ONLY where a test opts in, via a per-file
     *   // @vitest-environment jsdom
     * docblock. The engine tests are DOM-free by design and must stay that
     * way -- jsdom performs no layout and implements no container queries, so
     * a layout assertion made against it would be an assertion about the stub.
     *
     * What jsdom CAN prove is the thing 252 tests could not: that a lesson
     * turns into elements with real text in them. That gap is precisely how a
     * renderer came to be missing while every gate stayed green. */
    /* `src/canvas/renderer/**` used to be named here. That directory went with
     * the old canvas, and a glob pointing at nothing is worse than no glob: it
     * reads as coverage of a path that no longer exists.
     *
     * Nothing replaces it. The teaching view genuinely needs a DOM — the one
     * claim worth proving about it ("the earlier beat is STILL on screen after
     * continuing") cannot be made without rendering — but it opts in through
     * its own `// @vitest-environment jsdom` docblock. A directory glob would
     * have swept its DOM-FREE neighbours (beat derivation, doubt resolution)
     * into jsdom as well, and those two are pure functions whose freedom from
     * the DOM is a property worth keeping true rather than incidental. */
    environmentMatchGlobs: [],
  },
})
