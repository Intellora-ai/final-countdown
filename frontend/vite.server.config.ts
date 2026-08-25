import { defineConfig } from 'vite'

/**
 * BUILDING THE SERVER.
 *
 * The server imports the canvas's `validateLesson`, on purpose: the browser and
 * the server must apply the SAME gate to a lesson, and two copies of a schema
 * drift. But that module — and its transitive imports — use extensionless
 * specifiers (`from './figure'`), which Vite and TypeScript resolve and Node's
 * native ESM does not.
 *
 * The result was a server that passed its unit tests, passed typecheck, and
 * crashed on the first line of a real boot with ERR_MODULE_NOT_FOUND. Bundling
 * resolves every specifier ahead of time, so the artifact that runs is the
 * artifact that was checked.
 *
 * `ssr` rather than `lib` because this targets Node: no browser polyfills, and
 * node: builtins stay external.
 */
export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      output: { entryFileNames: 'index.js', format: 'esm' },
    },
  },
})
