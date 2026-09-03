#!/usr/bin/env node
/**
 * THE ENTRY POINT. Node 26 runs TypeScript directly, so there is no build step
 * and no second toolchain -- `node cto/cto.ts status` is the whole story.
 *
 * Everything real lives in `cli.ts`, which takes its output and its store
 * directory as parameters. That is what lets the whole tool be tested without
 * spawning a process or writing to the real store.
 */
import { fileURLToPath } from 'node:url'

import { run } from './cli.ts'

/* Resolved from THIS file, not the working directory, so `cto status` means
   the same thing from anywhere in the repo. */
const dir = process.env['CTO_STORE'] ?? fileURLToPath(new URL('./nodes/', import.meta.url))
process.exit(run(process.argv.slice(2), { dir, say: (line) => { console.log(line) } }))
