import { defineConfig } from 'vitest/config';

/**
 * PROBES ARE NOT TESTS, AND THIS FILE IS WHY THEY CANNOT BE MISTAKEN FOR THEM.
 *
 * A probe needs a model running on this machine and takes minutes. Inside
 * `npm test` it would be a flake with a plausible excuse -- red on a laptop
 * with Ollama stopped, red in CI forever, and eventually skipped, which is the
 * shape this project has already paid for once.
 *
 * So probes are named `*.probe.ts`, the main config does not match them, and
 * they run only when somebody asks:
 *
 *     npm run probe:ollama
 */
export default defineConfig({
  test: {
    include: ['src/**/*.probe.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
