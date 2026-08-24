import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest needs the `@/` alias spelled out — it does not read `tsconfig.json`.
 *
 * No React plugin and no jsdom: every test here covers pure functions and the
 * store, none of which touch the DOM. Adding an environment they do not use
 * would cost a second of startup per run and hide the fact that this logic is
 * deliberately renderer-independent.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
