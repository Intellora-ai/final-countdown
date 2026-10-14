import { cp, mkdtemp, readFile, writeFile, symlink, rm, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, basename, dirname, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import ts from 'typescript'

// Real source mutations run against an isolated snapshot, never the working app.
// A timeout, transform failure, or missing test report is not a detected fault.
const root = process.cwd(), count = 200, workers = 2, timeout = 30000
const reportPath = resolve(root, 'test-results/mutations.json')
const temporary = await mkdtemp(join(tmpdir(), 'canvas-mutations-'))
const excluded = new Set(['node_modules', 'dist', 'dist-server', 'coverage', 'test-results', 'playwright-report', '.canvas-state', '.git'])
const report = { version: 1, requested: count, startedAt: new Date().toISOString(), baseline: null, files: [], mutants: [], summary: {} }
report.runnerSha256 = createHash('sha256').update(await readFile(resolve(root, 'scripts/check-test-strength.mjs'))).digest('hex')
report.sequencerSha256 = createHash('sha256').update(await readFile(resolve(root, 'scripts/mutation-sequencer.mjs'))).digest('hex')
report.configSha256 = createHash('sha256').update(await readFile(resolve(root, 'scripts/mutation.vitest.config.mjs'))).digest('hex')
const log = message => console.log(message)
let evidenceWrite = Promise.resolve()
function saveEvidence() {
  const content = JSON.stringify(report, null, 2)
  evidenceWrite = evidenceWrite.then(async () => { await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, content) })
  return evidenceWrite
}

async function filesBelow(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) result.push(path)
  }
  return result.sort()
}
function run(args, cwd, limit = timeout, testOrder = []) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, CANVAS_MUTATION_TEST_ORDER: JSON.stringify(testOrder) } })
    let output = '', expired = false
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-16000) })
    const timer = setTimeout(() => { expired = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, limit)
    child.once('error', error => { clearTimeout(timer); resolveRun({ code: null, expired, output: String(error) }) })
    child.once('close', code => { clearTimeout(timer); resolveRun({ code, expired, output }) })
  })
}
function candidates(path, content) {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true)
  const found = [], seen = new Set()
  const add = (node, operator, replacement, start = node.getStart(source), end = node.end) => {
    const original = content.slice(start, end), key = `${start}:${end}:${replacement}`
    if (original === replacement || seen.has(key)) return
    seen.add(key)
    const location = source.getLineAndCharacterOfPosition(start)
    const id = createHash('sha256').update(`${path}:${start}:${operator}:${original}:${replacement}`).digest('hex').slice(0, 16)
    found.push({ id, file: path, line: location.line + 1, column: location.character + 1, operator, start, end, original, replacement })
  }
  const opposite = new Map([
    [ts.SyntaxKind.AmpersandAmpersandToken, '||'], [ts.SyntaxKind.BarBarToken, '&&'],
    [ts.SyntaxKind.EqualsEqualsEqualsToken, '!=='], [ts.SyntaxKind.ExclamationEqualsEqualsToken, '==='],
    [ts.SyntaxKind.EqualsEqualsToken, '!='], [ts.SyntaxKind.ExclamationEqualsToken, '=='],
    [ts.SyntaxKind.LessThanToken, '>='], [ts.SyntaxKind.LessThanEqualsToken, '>'],
    [ts.SyntaxKind.GreaterThanToken, '<='], [ts.SyntaxKind.GreaterThanEqualsToken, '<'],
  ])
  const visit = node => {
    if (ts.isIfStatement(node)) add(node.expression, 'negate-condition', `!(${node.expression.getText(source)})`)
    if (ts.isConditionalExpression(node)) add(node.condition, 'negate-ternary-condition', `!(${node.condition.getText(source)})`)
    if (ts.isBinaryExpression(node) && opposite.has(node.operatorToken.kind)) add(node.operatorToken, 'replace-' + node.operatorToken.getText(source), opposite.get(node.operatorToken.kind))
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) add(node, 'remove-negation', `(${node.operand.getText(source)})`)
    if ((node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) && !ts.isLiteralTypeNode(node.parent)) add(node, 'flip-boolean', node.kind === ts.SyntaxKind.TrueKeyword ? 'false' : 'true')
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      if (['has', 'includes', 'isFinite', 'isInteger', 'isSafeInteger', 'test'].includes(method)) add(node, 'negate-predicate', `!(${node.getText(source)})`)
      if (['trim', 'toLowerCase', 'toLocaleLowerCase'].includes(method) && !node.arguments.length) add(node, 'remove-normalization', `(${node.expression.expression.getText(source)})`)
      if (method === 'filter' && node.arguments.length === 1) add(node.arguments[0], 'retain-all-elements', '() => true')
      if (method === 'sort' && node.arguments.length === 1) add(node.arguments[0], 'preserve-input-order', '() => 0')
      // Contract bounds are behavior, unlike arbitrary drawing colors or labels.
      if (['min', 'max'].includes(method) && node.arguments.length === 1 && ts.isNumericLiteral(node.arguments[0])) add(node.arguments[0], 'shift-contract-boundary', String(Number(node.arguments[0].text) + 1))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found.sort((a, b) => a.id.localeCompare(b.id))
}
function testDependencies(contents) {
  const graph = new Map()
  for (const [path, content] of contents) {
    const imports = [], source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true)
    const visit = node => {
      // Process tests can execute a source file by path rather than importing it.
      if (ts.isStringLiteral(node) && contents.has(node.text)) imports.push(node.text)
      const specifier = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly ? null : node.moduleSpecifier : ts.isExportDeclaration(node) ? node.isTypeOnly ? null : node.moduleSpecifier : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : null
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        const base = relative(root, resolve(root, dirname(path), specifier.text)).replace(/\\/g, '/')
        const target = [base, base + '.ts', base + '.tsx', base + '/index.ts'].find(candidate => contents.has(candidate))
        if (target) imports.push(target)
      }
      ts.forEachChild(node, visit)
    }
    visit(source); graph.set(path, imports)
  }
  const distance = (path, target) => {
    const queue = [[path, 0]], visited = new Set()
    for (const [current, depth] of queue) {
      if (current === target) return depth
      if (visited.has(current)) continue
      visited.add(current)
      for (const dependency of graph.get(current) ?? []) queue.push([dependency, depth + 1])
    }
    return Infinity
  }
  const tests = [...contents.keys()].filter(path => /\.test\.tsx?$/.test(path))
  return source => {
    const related = tests.map(file => ({ file, distance: distance(file, source), bounded: contents.get(file).includes('node:worker_threads') })).filter(test => Number.isFinite(test.distance))
      .sort((a, b) => a.distance - b.distance || Number(b.bounded) - Number(a.bounded) || contents.get(a.file).length - contents.get(b.file).length || a.file.localeCompare(b.file)).map(test => test.file)
    return related.length ? related : tests
  }
}
function classification(result, evidence) {
  if (result.expired) return { status: 'timeout', reason: `Exceeded ${timeout} ms; not counted as a kill.` }
  if (!evidence || !Array.isArray(evidence.testResults)) return { status: 'invalid', reason: 'No usable test evidence.', output: result.output }
  const failed = evidence.testResults.flatMap(file => (file.assertionResults ?? []).filter(test => test.status === 'failed').map(test => ({ file: file.name.replace(/^.*\/worker-\d+\//, ''), name: test.fullName, messages: test.failureMessages?.map(message => message.slice(0, 1600)) })))
  const assertionFailures = failed.filter(test => !test.messages?.some(message => /\b(?:test|hook) timed out\b/i.test(message)))
  if (result.code === 1 && assertionFailures.length && evidence.numFailedTests > 0) return { status: 'killed', failedTests: assertionFailures }
  if (failed.length && !assertionFailures.length) return { status: 'timeout', reason: 'Vitest test/hook timeout; not counted as a kill.', failedTests: failed }
  if (result.code === 0 && evidence.success && evidence.numTotalTests > 0 && evidence.numFailedTests === 0 && evidence.numPendingTests === 0 && evidence.numTodoTests === 0) return { status: 'survived', reason: 'The selected behavioral tests passed with mutated source.' }
  return { status: 'invalid', reason: 'Test infrastructure or module loading failed; not counted as a kill.', output: result.output }
}
function moduleCompiler(snapshot) {
  const configuration = ts.readConfigFile(join(snapshot, 'tsconfig.json'), ts.sys.readFile)
  if (configuration.error) throw new Error('Cannot read mutation snapshot TypeScript configuration.')
  const config = ts.parseJsonConfigFileContent(configuration.config, ts.sys, snapshot)
  const host = ts.createCompilerHost(config.options), getSource = host.getSourceFile.bind(host), sources = new Map()
  host.getSourceFile = (file, language, ...rest) => {
    if (!sources.has(file)) sources.set(file, getSource(file, language, ...rest))
    return sources.get(file)
  }
  let program = ts.createProgram(config.fileNames, config.options, host)
  const baseline = ts.getPreEmitDiagnostics(program)
  if (baseline.length) throw new Error('The mutation baseline has TypeScript errors: ' + ts.formatDiagnostics(baseline, host))
  return (file, content) => {
    const path = join(snapshot, file), original = sources.get(path)
    sources.set(path, ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true))
    program = ts.createProgram(config.fileNames, config.options, host, program)
    const source = program.getSourceFile(path)
    const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
    sources.set(path, original)
    return diagnostics.map(diagnostic => ({ code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') }))
  }
}
try {
  const snapshot = join(temporary, 'baseline')
  await cp(root, snapshot, { recursive: true, filter: path => !excluded.has(basename(path)) && !basename(path).startsWith('.env') })
  await symlink(resolve(root, 'node_modules'), join(snapshot, 'node_modules'), 'dir')
  const paths = [...await filesBelow(join(snapshot, 'src')), ...await filesBelow(join(snapshot, 'server')), ...await filesBelow(join(snapshot, 'tests'))]
  const contents = new Map(await Promise.all(paths.map(async path => [relative(snapshot, path).replace(/\\/g, '/'), await readFile(path, 'utf8')])))
  const relatedTests = testDependencies(contents)
  const sourceFiles = [...contents.keys()].filter(path => /^(src|server)\//.test(path))
  const groups = sourceFiles.map(file => ({ file, available: candidates(file, contents.get(file)), tests: relatedTests(file) }))
  report.files = groups.map(group => ({ file: group.file, candidates: group.available.length, tests: group.tests, sha256: createHash('sha256').update(contents.get(group.file)).digest('hex') }))
  report.testFiles = [...contents.keys()].filter(file => /\.test\.tsx?$/.test(file)).map(file => ({ file, sha256: createHash('sha256').update(contents.get(file)).digest('hex') }))
  const selected = []
  for (let index = 0; ; index++) {
    let added = 0
    for (const group of groups) if (group.available[index]) { selected.push({ ...group.available[index], tests: group.tests }); added++ }
    if (!added) break
  }
  if (selected.length < count) throw new Error(`Only ${selected.length} source mutants exist; ${count} required. No duplicate or fabricated mutants are added.`)
  log(`Mutation baseline: all tests; then ${count} distinct source mutations across ${new Set(selected.map(m => m.file)).size} files, ${workers} workers.`)
  const baselinePath = join(snapshot, 'baseline.json')
  const baselineRun = await run(['run', '--maxWorkers=2', '--reporter=json', '--outputFile=' + baselinePath], snapshot, 60000)
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'))
  report.baseline = { tests: baseline.numTotalTests, passed: baseline.numPassedTests, failed: baseline.numFailedTests, pending: baseline.numPendingTests, todo: baseline.numTodoTests, exitCode: baselineRun.code, success: baseline.success, testFiles: baseline.testResults.map(file => ({ file: relative(snapshot, file.name).replace(/\\/g, '/'), tests: file.assertionResults.length })), failedTests: baseline.testResults.flatMap(file => (file.assertionResults ?? []).filter(test => test.status === 'failed').map(test => ({ file: file.name, name: test.fullName, messages: test.failureMessages }))) }
  if (baselineRun.code !== 0 || !baseline.success || baseline.numFailedTests || baseline.numPendingTests || baseline.numTodoTests) throw new Error('Unmutated baseline is not fully green: ' + baselineRun.output)
  const compile = moduleCompiler(snapshot)
  let next = 0, scheduled = 0
  await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    const copy = join(temporary, 'worker-' + worker)
    await cp(snapshot, copy, { recursive: true, filter: path => basename(path) !== 'node_modules' })
    await symlink(resolve(root, 'node_modules'), join(copy, 'node_modules'), 'dir')
    while (next < selected.length && scheduled < count) {
      const mutant = selected[next++], sourcePath = join(copy, mutant.file), original = contents.get(mutant.file)
      const changed = original.slice(0, mutant.start) + mutant.replacement + original.slice(mutant.end)
      const diagnostics = compile(mutant.file, changed)
      if (diagnostics.length) {
        report.mutants.push({ ...mutant, typeValid: false, status: 'invalid', reason: 'Mutated module does not typecheck; not counted as a kill.', diagnostics, executedTests: 0 })
        log(`Invalid mutation (not counted toward ${count}): ${mutant.file}:${mutant.line} ${mutant.operator} [${mutant.id}]`)
        await saveEvidence(); continue
      }
      scheduled++
      await writeFile(sourcePath, changed)
      const testReport = join(copy, 'mutant.json')
      await rm(testReport, { force: true })
      const started = Date.now()
      const result = await run(['run', ...mutant.tests, '--maxWorkers=1', '--bail=1', '--config=./scripts/mutation.vitest.config.mjs', '--reporter=json', '--outputFile=' + testReport], copy, timeout, mutant.tests)
      let evidence
      try { evidence = JSON.parse(await readFile(testReport, 'utf8')) } catch {}
      // Vitest's total includes cases collected but not run after --bail. Keep
      // those separate: stopping at one failing assertion is not full coverage.
      const passed = evidence?.numPassedTests ?? 0, failed = evidence?.numFailedTests ?? 0, pending = evidence?.numPendingTests ?? 0, todo = evidence?.numTodoTests ?? 0
      const executed = passed + failed + pending + todo, collected = evidence?.numTotalTests ?? 0
      const executedFiles = evidence?.testResults.map(file => {
        const tests = file.assertionResults.filter(test => test.status === 'passed' || test.status === 'failed').length
        return { file: relative(copy, file.name).replace(/\\/g, '/'), tests, collectedTests: file.assertionResults.length, notRunTests: file.assertionResults.length - tests }
      }) ?? []
      const outcome = { ...mutant, ...classification(result, evidence), typeValid: true, exitCode: result.code, timedOut: result.expired, durationMs: Date.now() - started, executedTests: executed, collectedTests: collected, notRunTests: collected - executed, passedTests: passed, failedTestsCount: failed, pendingTests: pending, todoTests: todo, executedTestFiles: executedFiles }
      if (outcome.status === 'invalid') scheduled--
      report.mutants.push(outcome)
      await writeFile(sourcePath, original)
      log(`${report.mutants.filter(m => m.status !== 'invalid').length}/${count} ${outcome.status}: ${mutant.file}:${mutant.line} ${mutant.operator} [${mutant.id}]`)
      await saveEvidence()
    }
  }))
  report.mutants.sort((a, b) => a.file.localeCompare(b.file) || a.start - b.start || a.operator.localeCompare(b.operator))
  report.summary = Object.fromEntries(['killed', 'survived', 'timeout', 'invalid'].map(status => [status, report.mutants.filter(mutant => mutant.status === status).length]))
  report.completedAt = new Date().toISOString()
  log('Mutation results: ' + JSON.stringify(report.summary))
  if (scheduled < count) throw new Error(`Only ${scheduled} valid source mutations were executed; ${count} required.`)
  if (report.summary.survived || report.summary.timeout) process.exitCode = 1
} catch (error) { report.error = String(error); process.exitCode = 1; console.error(error) }
finally {
  await saveEvidence()
  await rm(temporary, { recursive: true, force: true })
}
