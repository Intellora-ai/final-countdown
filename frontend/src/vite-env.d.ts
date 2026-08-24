/// <reference types="vite/client" />

/*
 * Vite's ambient types, declared the way Vite's own scaffolding declares them.
 *
 * This package never had this file, which went unnoticed for as long as nothing
 * used a Vite-specific import. The shape tests do: they read their own source
 * with `import src from './GraphShape.tsx?raw'` and assert against it, and
 * without the reference above the compiler sees an unresolvable module.
 *
 * A triple-slash reference rather than `"types": ["vite/client"]` in the
 * tsconfig, because the `types` field is a whitelist — naming one package there
 * silently drops every OTHER @types package from the global scope, which is a
 * surprising amount of collateral damage for one import syntax.
 */
