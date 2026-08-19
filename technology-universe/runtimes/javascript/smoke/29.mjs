// shadcn/ui ships a CLI, not a runtime library: exercise the binary.
import {execFileSync} from 'node:child_process';
const v = execFileSync('node', ['node_modules/shadcn/dist/index.js', '--version'], {encoding: 'utf8'}).trim();
if (!/^\d+\.\d+\.\d+/.test(v)) throw new Error('unexpected --version output: ' + v);
console.log('ok', v);
