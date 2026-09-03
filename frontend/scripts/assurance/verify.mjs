#!/usr/bin/env node
/**
 * THE ASSURANCE GATE -- one entry, one verdict, one exit code.
 *
 * The same script runs in three places (the authority is GitHub, not this):
 *   LOCAL   fast feedback while Claude works
 *   GITHUB  the required "ASSURANCE" status, automatic on push/PR
 *   CLOUD   the deployed-layout canary, proving deployment preserved semantics
 *
 * Default-false: an inconsistent contract, or an ungraduated `required`
 * assertion, or a proven violation of a `required` assertion, FAILS the gate
 * (exit 1). Uncertainty is neutral: the static information-loss tripwire is
 * advisory -- it is reported, never blocks alone.
 *
 * Risk-tiered for speed: LOW (docs, nothing decision-relevant) runs only the
 * contract self-test; MEDIUM/HIGH run the full semantic attack (the runtime
 * equivalence laws). Set ASSURANCE_BASE=origin/main in CI to diff against the
 * base branch; locally it diffs the working tree against HEAD.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

import { graduationMissing, loadContract } from './contract.mjs'
import { infoloss } from './infoloss.mjs'
import { classifyRisk } from './risk.mjs'

const CONTRACTS_DIR = 'assurance/contracts'
const POLICY_PATH = 'assurance/policies/risk.json'

function changedFiles() {
  const out = []
  const base = process.env.ASSURANCE_BASE
  const run = (args) => (spawnSync('git', args, { encoding: 'utf8' }).stdout || '').split('\n').filter(Boolean)
  if (base) out.push(...run(['diff', '--name-only', '--relative', `${base}...HEAD`]))
  out.push(...run(['diff', '--name-only', '--relative', 'HEAD'])) // unstaged
  out.push(...run(['diff', '--name-only', '--relative', '--cached'])) // staged
  return [...new Set(out)]
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main() {
  const policy = existsSync(POLICY_PATH) ? readJson(POLICY_PATH) : {}
  const changed = changedFiles()
  /* The AUTHORITY never skips the deterministic attack. Risk-tiering is a LOCAL
     speed optimisation; in CI (ASSURANCE_FORCE=HIGH) correctness beats speed, so
     the runtime attack always runs regardless of what the diff appears to
     touch. */
  const forced = process.env.ASSURANCE_FORCE
  const risk = forced
    ? { tier: forced, reason: 'forced by ASSURANCE_FORCE (CI authority runs the full attack)', affected_decisions: [] }
    : classifyRisk(changed, policy)

  const failures = []
  const advisories = []
  const contractFiles = existsSync(CONTRACTS_DIR)
    ? readdirSync(CONTRACTS_DIR).filter((f) => f.endsWith('.json')).map((f) => `${CONTRACTS_DIR}/${f}`)
    : []

  for (const path of contractFiles) {
    let loaded
    try {
      loaded = loadContract(path)
    } catch (error) {
      failures.push(`${path}: could not be read (${error.message})`)
      continue
    }
    const { contract, selfTest } = loaded
    // Fail-closed: a contract that is not internally consistent has no authority.
    if (!selfTest.ok) failures.push(`${path}: inconsistent contract -- ${selfTest.failures.join('; ')}`)
    // Fail-closed: a `required` assertion must point at real graduation evidence.
    const missing = graduationMissing(contract, { exists: (rel) => existsSync(`assurance/${rel}`) })
    for (const m of missing) failures.push(`${path}: required assertion "${m.assertion}" has no real graduation evidence (${m.evidence})`)
    // Advisory: the static information-loss tripwire. Report, never block alone.
    try {
      const violations = infoloss(contract, { readFile: (rel) => readFileSync(rel, 'utf8') })
      for (const v of violations) advisories.push(`${contract.decision}: identity field "${v.field}" (${v.code}) absent from ${v.fn} -- investigate`)
    } catch (error) {
      advisories.push(`${contract.decision}: information-loss tripwire could not read source (${error.message})`)
    }
  }

  // The runtime attacks (the deterministic authority) run on anything that can
  // move a decision. LOW skips them -- speed.
  let ranRuntime = false
  if (risk.tier !== 'LOW') {
    ranRuntime = true
    const t0 = Date.now()
    const result = spawnSync('npx', [
      'vitest', 'run',
      'src/laws/assuranceEquivalence.test.ts',
      'scripts/assurance/contract.test.mjs',
      'scripts/assurance/infoloss.test.mjs',
      'scripts/assurance/risk.test.mjs',
      '--reporter=dot',
    ], { stdio: 'inherit', encoding: 'utf8' })
    const ms = Date.now() - t0
    // Timing budget (meta-assurance): flag a runtime attack that has ballooned.
    if (ms > 60_000) advisories.push(`the runtime attack took ${ms}ms (>60s) -- a check may have regressed in cost`)
    if (result.status !== 0) failures.push('a runtime semantic attack failed (a required assertion was violated)')
  }

  // One verdict.
  const line = '─'.repeat(60)
  console.log(`\n${line}\nASSURANCE GATE`)
  console.log(`  risk: ${risk.tier}${risk.affected_decisions.length ? ` (${risk.affected_decisions.join(', ')})` : ''} -- ${risk.reason}`)
  console.log(`  contracts: ${contractFiles.length} checked; runtime attack: ${ranRuntime ? 'ran' : 'skipped (LOW risk)'}`)
  for (const a of advisories) console.log(`  ⚠ advisory: ${a}`)
  if (failures.length === 0) {
    console.log(`  ✓ PASS -- no proven violation of any required assertion\n${line}`)
    process.exit(0)
  }
  for (const f of failures) console.log(`  ✗ ${f}`)
  console.log(`  ✗ FAIL -- merge blocked\n${line}`)
  process.exit(1)
}

main()
