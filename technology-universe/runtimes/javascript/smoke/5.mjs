// TypeScript 7 moved the JS API; the root export only carries `version`.
// Functional check: compile a real .ts file with the shipped tsc binary.
import {execFileSync} from 'node:child_process';
import {writeFileSync, readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {version} from 'typescript';
const d = mkdtempSync(join(tmpdir(), 'tsc-smoke-'));
writeFileSync(join(d, 'a.ts'), 'export const x: number = 1 + 1;\n');
execFileSync('node_modules/.bin/tsc', ['--outDir', d, '--module', 'esnext', '--target', 'es2022', join(d, 'a.ts')], {stdio: 'pipe'});
const out = readFileSync(join(d, 'a.js'), 'utf8');
if (!out.includes('export const x = 1 + 1')) throw new Error('emit was: ' + out);
console.log('ok', version);
