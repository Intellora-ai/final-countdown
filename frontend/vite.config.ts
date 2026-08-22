/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
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
     * assertion about the stub. Those claims belong to the browser harness. */
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'eslint-rules/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
