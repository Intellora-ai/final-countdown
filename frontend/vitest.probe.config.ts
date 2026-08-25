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
    /*
     * An hour, and the number is measured rather than generous.
     *
     * 900_000 was chosen before retries existed and the run then took 1800s --
     * the probe was killed mid-flight and produced NO number at all, which is
     * strictly worse than a slow one. Twelve topics, up to three attempts each,
     * at roughly 30 seconds per call, is 18 minutes of model time before any
     * of it is slow.
     */
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
