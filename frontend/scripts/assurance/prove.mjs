#!/usr/bin/env node
/**
 * AG10 -- THE RECURSIVE SELF-TEST, ON DEMAND.
 *
 * The engine's deepest property is "the gate catches the bug", not merely "the
 * code passes the gate". This script proves it in one command: it reintroduces
 * the EXACT historical shelf bug (subject-only identity), runs the gate, and
 * requires it to FAIL; then restores the real code and requires the gate to
 * PASS. If either half is wrong, the engine is not trustworthy and this exits
 * non-zero.
 *
 * It mutates a source line at runtime and restores it via git. It refuses to
 * run if that file has uncommitted changes, so it can never lose real work.
 *
 *   node scripts/assurance/prove.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const LESSONS = 'server/memory/lessons.ts'
const CORRECT = ".filter((one) => (one.asked ?? 'teach') === wanted)"
const BUG = '.filter(() => true) /* AG10 injected: subject-only identity */'

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' })
}

function gate() {
  const r = spawnSync('node', ['scripts/assurance/verify.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, ASSURANCE_FORCE: 'HIGH' },
  })
  return r.status ?? 1
}

function fail(msg) {
  console.error(`\n✗ AG10 PROOF FAILED: ${msg}\n`)
  process.exit(1)
}

function main() {
  // Never risk real work: the file must be clean before we mutate it.
  if (git(['diff', '--quiet', '--', LESSONS]).status !== 0) {
    fail(`${LESSONS} has uncommitted changes; commit or stash them first (this script mutates and restores it via git)`)
  }
  const source = readFileSync(LESSONS, 'utf8')
  if (!source.includes(CORRECT)) {
    fail(`could not find the shelf identity filter in ${LESSONS}; the code moved -- update CORRECT`)
  }

  console.log('\n── AG10: reintroducing the historical shelf bug (subject-only identity) ──')
  writeFileSync(LESSONS, source.replace(CORRECT, BUG))
  const buggedExit = gate()
  // Restore BEFORE asserting, so a thrown assertion never leaves the bug in place.
  git(['checkout', '--', LESSONS])

  if (buggedExit === 0) fail('the gate PASSED with the subject-only bug present -- the gate does not catch the bug')
  console.log('✓ the gate blocked the reintroduced bug (exit ' + buggedExit + ')')

  console.log('\n── AG10: the real code restored, the gate must pass ──')
  const cleanExit = gate()
  if (cleanExit !== 0) fail('the gate FAILED on the correct code -- a false positive')
  console.log('✓ the gate passed the correct code (exit 0)')

  console.log('\n✓ AG10 PROVEN: the gate catches the bug, and only the bug.\n')
}

main()
