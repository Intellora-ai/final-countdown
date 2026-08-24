import next from 'eslint-config-next/core-web-vitals'

/* eslint-config-next 16 exports a flat config array directly.
 *
 * The first version wrapped it in FlatCompat, the way most Next projects still
 * do, and it threw on a circular reference while validating the legacy schema.
 * That wrapper exists to translate an OLD eslintrc-style config; running it
 * over a config that is already flat is a translation with nothing to
 * translate. Importing it directly is both correct and one dependency lighter. */
/* Named, then exported. An anonymous array literal as the default export trips
 * `import/no-anonymous-default-export` — which the config would otherwise
 * report against itself on every run. */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
]

export default config
