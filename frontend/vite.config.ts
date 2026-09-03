/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { enginePlugin } from './vite-plugin-engine'
import { searchPlugin } from './vite-plugin-search'

export default defineConfig({
  /* THE ENGINE ROUTE, IN DEV ONLY.
   *
   * `POST /api/doubt` spawns the Python engine and returns its answer. It is a
   * middleware on a server that is already running rather than a server of its
   * own, because this repository has no HTTP server anywhere and adding one to
   * move a single JSON document between two languages on the same machine would
   * be a framework, a port and a deployment story for nothing.
   *
   * It is absent from `vite build` on purpose, and `vite-plugin-engine.ts` says
   * why: making the engine reachable in production is a hosting decision, not
   * one a build plugin should make quietly. */
  /* THE OPEN-WEB SEARCH ROUTE, IN DEV ONLY, FOR THE SAME REASONS.
   *
   * `POST /api/search` searches a general provider and reads the pages it
   * returns. It needs a server for two independent reasons — a key cannot ship
   * to a browser, and a browser may not read a page that did not opt into CORS
   * — and it is absent from `vite build` on purpose. See
   * `vite-plugin-search.ts`. */

  /* AND THE PLANNER, WHICH IS A SEPARATE PROCESS.
   *
   * The browser posts to /api/day and /api/lesson. Vite serves the app on one
   * port and the planner listens on another, so in development every one of
   * those requests 404'd against Vite itself -- the dashboard reported "the
   * planner answered 404" honestly, and nobody could run the product end to end
   * on their own machine. Found by the deep-qa harness, which counted 180
   * console errors from this one cause.
   *
   * ROUTED ONE PATH AT A TIME, NOT AS `/api`. A blanket `/api` proxy would
   * swallow `/api/doubt` and `/api/search` above, which are handled HERE by
   * plugins and are not the planner's at all. Two owners of one prefix is a
   * collision that only shows up as a confusing 404 in somebody's dev session.
   *
   * `changeOrigin` is off deliberately: the planner is same-machine and binds
   * to loopback, and rewriting the Host header would hide which origin a
   * request really came from. */
  server: {
    proxy: Object.fromEntries(
      /* `/api/situation` IS ON THIS LIST BECAUSE IT WAS NOT, AND LAW G MEASURED
       * THE GAP in all four browsers (run 33596363576 and the two before it):
       * the canvas's GET and PUT to /api/situation never reached the server --
       * Vite's SPA fallback answered them with index.html and a 200, the
       * client read "not JSON" as "no loops", and her unfinished question was
       * never stored, so the return card had nothing to return. Every route
       * the canvas fetches from the API server has to be named here, one at a
       * time, for the reason above. */
      /* `/api/memory` IS ON THIS LIST BEFORE THE BROWSER CALLS IT, for the
       * same reason `/api/situation` was added after the fact: the server has
       * answered on it since the memory store landed, and the one thing that
       * kept every per-topic memory on this machine at zero rows was that no
       * request could reach it. Named now, so the first caller does not spend
       * a day on a 200 that is index.html. */
      /* `/api/canvas` IS ON THIS LIST FOR THE SAME REASON, AND IT MATTERS
         MORE THAN THE OTHERS: it carries a student's learning history. Left
         off, Vite's SPA fallback answers it with index.html and a 200, the
         client reads "not the shape I expected" and reports that the canvas
         could not be read -- correctly, and for a reason nobody would guess.
         The route must be named the day it is added, not after. */
      ['/api/day', '/api/done', '/api/lesson', '/api/ask', '/api/health', '/api/situation', '/api/memory', '/api/canvas', '/api/evidence', '/api/next'].map((route) => [
        route,
        /* `API_TARGET` points a second dev server at a second API build,
           so two builds can be compared on one machine without touching the
           default. Unset, it is the API server everyone runs. */
        { target: process.env['API_TARGET'] ?? 'http://127.0.0.1:8787', changeOrigin: false },
      ]),
    ),
  },
  plugins: [react(), enginePlugin(), searchPlugin()],

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
      /* A FOURTH AREA: the dev-server plugins beside this file.
       *
       * `vite-plugin-engine.ts` spawns a Python subprocess and turns its output
       * into an HTTP response. It has real failure modes -- a missing
       * interpreter, a missing package, a non-zero exit, a timeout -- and it
       * shipped with the wrong venv in its discovery order, which made every
       * request a traceback. Infrastructure that can fail and has no test is
       * infrastructure nobody finds out about until a learner does. */
      '*.test.ts',
      /* AND A FIFTH: `server/`, deliberately separate from `src/`. It never
       * ships to the browser because it holds the API key. Its tests run here
       * so the one command that proves the frontend also proves the thing
       * standing between the browser and the model. */
      'server/**/*.test.ts',
      /* AND A SIXTH: the PURE HELPERS under `e2e/util/`, and only those.
       *
       * `e2e/**` stays excluded below, because a Playwright spec started by
       * vitest fails on the first `test.describe()` it meets. But the helpers
       * beside those specs are ordinary functions with ordinary bugs, and one
       * of them shipped a real defect that only GitHub caught: the a11y
       * baseline recorded a viewport-dependent finding in a field with no
       * viewport, and `scenes 2/2` went red on `reduced-motion` alone.
       *
       * A helper that decides what a gate permits deserves a test that runs in
       * a second, not one that needs five browsers. The include is narrowed to
       * `util/` so it can never reach a spec. */
      'e2e/util/**/*.test.ts',
      /* AND A SEVENTH: `cto/`, the engineering environment this repo is built
       * IN rather than part of what it ships. It never reaches a browser and
       * never reaches a student, but it is the thing that decides what I am
       * allowed to call known — so a fault in it is a fault in every claim
       * made afterwards. It runs here for the same reason `server/` does: one
       * command proves the whole tree. */
      'cto/**/*.test.ts',
    ],
    exclude: ['e2e/**/*.spec.ts', 'node_modules/**', 'dist/**'],

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
