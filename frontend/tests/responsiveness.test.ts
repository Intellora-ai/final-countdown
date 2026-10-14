import { it, expect } from 'vitest'
import { Worker } from 'node:worker_threads'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
// These imports also declare the runtime dependencies to the mutation runner.
import { calculate } from '../src/math'
import { paperInk } from '../src/ink'

async function evaluate(file: string, name: string, input: string) {
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');
import(${JSON.stringify(pathToFileURL(resolve(file)).href)}).then(module=>parentPort.postMessage({finished:true,value:module[${JSON.stringify(name)}](${JSON.stringify(input)})})).catch(()=>parentPort.postMessage({finished:false}));`, { eval: true })
  try {
    return await new Promise<{ finished: boolean; value?: unknown }>(done => {
      const timer = setTimeout(() => done({ finished: false }), 2000)
      worker.once('message', value => { clearTimeout(timer); done(value) })
      worker.once('error', () => { clearTimeout(timer); done({ finished: false }) })
    })
  } finally { await worker.terminate() }
}
it('a valid arithmetic question finishes promptly instead of freezing the board', async () => {
  expect(await evaluate('src/math.ts', 'calculate', '2 + 3')).toEqual({ finished: true, value: 5 })
  expect(calculate('2 + 3')).toBe(5)
})
it('already readable ink finishes promptly instead of trapping the browser in darkening', async () => {
  expect(await evaluate('src/ink.ts', 'paperInk', '#000000')).toEqual({ finished: true, value: '#000000' })
  expect(paperInk('#000000')).toBe('#000000')
})
