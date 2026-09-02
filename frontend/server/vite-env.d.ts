/// <reference types="vite/client" />

/*
 * THE SERVER IS BUNDLED BY VITE (`vite.server.config.ts`), so `import.meta.glob`
 * is real at runtime here. It reaches the server through the capability
 * registry: `knownTopicCount()` in `src/knowledge/load.ts` reads the verified
 * knowledge models with a glob, and the registry reports honestly whether
 * any are loaded. `src/vite-env.d.ts` makes the same declaration for `src`;
 * this project includes only `server/`, so it needs its own.
 */
