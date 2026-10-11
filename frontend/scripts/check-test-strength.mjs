import { cp, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

// Mutate an isolated temporary copy. Never rewrite the working application's code.
const root = process.cwd()
const copy = await mkdtemp(join(tmpdir(), 'canvas-test-strength-'))
try {
  await cp(root, copy, { recursive: true, filter: path => !['node_modules', 'dist', 'dist-server', 'test-results', 'playwright-report', '.env', '.env.local', '.canvas-state'].includes(basename(path)) })
  await symlink(resolve(root, 'node_modules'), join(copy, 'node_modules'), 'dir')
  for (const mutation of [
    { file: 'src/attachments.ts', needle: ' if (!Number.isFinite(budget)', replacement: ' return text.slice(0, budget)\n if (!Number.isFinite(budget)', expected: 'retains matching evidence' },
    { file: 'src/learner.ts', needle: '  const indexed = entries.filter', replacement: "  return ''\n  const indexed = entries.filter", expected: 'retrieves unseen vocabulary' },
  ]) {
    const path = join(copy, mutation.file), original = await readFile(path, 'utf8')
    assert.ok(original.includes(mutation.needle), 'Mutation target changed; update the check.')
    await writeFile(path, original.replace(mutation.needle, mutation.replacement))
    const reportPath = join(copy, 'mutation-report.json')
    const run = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/generated-invariants.test.ts', '--maxWorkers=1', '--reporter=json', '--outputFile=' + reportPath], { cwd: copy, encoding: 'utf8', timeout: 30000 })
    assert.equal(run.status, 1, 'Broken behavior must fail the tests: ' + run.stderr)
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.ok(report.testResults.some(file => file.assertionResults.some(test => test.status === 'failed' && test.title.includes(mutation.expected))), 'Expected behavior assertion did not detect the mutation.')
    console.log('Detected deliberate break: ' + mutation.expected)
    await writeFile(path, original)
  }
} finally { await rm(copy, { recursive: true, force: true }) }
