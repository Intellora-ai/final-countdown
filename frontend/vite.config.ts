/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
