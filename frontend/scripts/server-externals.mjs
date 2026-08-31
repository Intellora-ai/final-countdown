/**
 * WHAT THE BUILT SERVER STILL NEEDS FROM node_modules, AND A GUARD ON IT.
 *
 * The runtime image ships ONE package. That is not a guess: Vite bundles the
 * server, so every workspace module is already inlined and the only things left
 * as bare specifiers are Node's own builtins plus whatever Vite decided to keep
 * external. Measured on 2026-08-30 that is `zod`, and nothing else.
 *
 * WHY THIS IS A GUARD AND NOT A COMMENT
 *     Shipping one package instead of the whole tree removes 268 MB of browser
 *     libraries -- echarts, three, hls.js, mediapipe -- that the server never
 *     loads. The risk is that somebody later imports a new package into server
 *     code, the bundle keeps it external, and the image then fails at RUNTIME
 *     with ERR_MODULE_NOT_FOUND, in production, on a route nobody tested.
 *
 *     This turns that into a BUILD failure with the package named. The image
 *     build runs it, so an unlisted dependency cannot reach a student.
 *
 * Run: node scripts/server-externals.mjs [--check]
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Packages the runtime image installs. Add here AND to the Dockerfile. */
const SHIPPED = new Set(['zod', 'pg'])

const BUNDLE_DIR = 'dist-server'

function bundleSources() {
  const entry = join(BUNDLE_DIR, 'index.js')
  if (!existsSync(entry)) {
    console.error(`${entry} is missing. Build it first: npx vite build --config vite.server.config.ts`)
    process.exit(2)
  }
  const files = [entry]
  const assets = join(BUNDLE_DIR, 'assets')
  if (existsSync(assets)) {
    for (const name of readdirSync(assets)) {
      if (name.endsWith('.js')) files.push(join(assets, name))
    }
  }
  return files
}

const external = new Set()
for (const file of bundleSources()) {
  const source = readFileSync(file, 'utf8')
  const patterns = [
    /(?:import|export)[^;]*?from\s*["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue
      if (specifier.startsWith('node:')) continue
      /* `pkg/sub/path` still means the package `pkg`; scoped names keep two
       * segments. Comparing the whole specifier would report a subpath import
       * as an unknown package. */
      const parts = specifier.split('/')
      external.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
    }
  }
}

const needed = [...external].sort()
const missing = needed.filter((name) => !SHIPPED.has(name))

if (process.argv.includes('--check')) {
  if (missing.length > 0) {
    console.error('The built server needs packages the runtime image does not install:')
    for (const name of missing) console.error(`  ${name}`)
    console.error('')
    console.error('Add each to SHIPPED in this file AND to the Dockerfile runtime stage,')
    console.error('or stop importing it from server code. Left alone this is')
    console.error('ERR_MODULE_NOT_FOUND in production, on whichever route reaches it first.')
    process.exit(1)
  }
  console.log(`server runtime dependencies OK: ${needed.length === 0 ? '(none)' : needed.join(', ')}`)
} else {
  console.log(needed.join('\n'))
}
