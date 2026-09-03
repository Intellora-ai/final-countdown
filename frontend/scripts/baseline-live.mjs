#!/usr/bin/env node
/**
 * S0 / S2 -- THE LIVE ROWS, measured against the real server and a real model.
 *
 * Run through the `baseline-live` launch entry (the sandbox cannot bind or
 * reach a port). Writes `data/baseline-live.json` and prints one line per
 * measurement so `data/baseline-live.log` can be read while it runs.
 *
 *   node scripts/baseline-live.mjs http://127.0.0.1:8793 [N]
 *
 * WHAT IT MEASURES, AND WITH WHOM. A shelf hit needs a route the learner has
 * not seen, so one learner cannot measure the shelf: after her first ask the
 * only lesson on it is the one she was shown. Three identities, three cookie
 * jars, exactly as three students at three desks:
 *
 *   A  asks a fresh subject         -> decision + writer; the lesson is filed
 *   B  asks A's exact phrasing      -> the memo: no decision, no writer
 *   C  asks a NEW phrasing of it    -> one decision, then the shelf
 *   C  asks that phrasing again     -> the memo learned it: nothing
 *
 * Then N fresh subjects, each from a fresh identity, for the refusal rate;
 * then N requests that name a representation ("in 3D", "animate", "graph")
 * for the refusal rate on those. Every number is recorded, none asserted.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://127.0.0.1:8793'
const N = Number(process.argv[3] ?? '12')
const out = {}
const say = (line) => { console.log(`[live] ${line}`) }

/** One student's cookie jar. */
function student() {
  let cookie = ''
  return async (path, body) => {
    const t0 = performance.now()
    let res
    try {
      res = await fetch(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...(cookie === '' ? {} : { cookie }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      return { status: 0, ms: performance.now() - t0, body: { error: String(error) } }
    }
    const set = res.headers.get('set-cookie')
    if (set !== null) cookie = set.split(';')[0]
    let parsed = null
    try { parsed = await res.json() } catch { parsed = null }
    return { status: res.status, ms: performance.now() - t0, body: parsed }
  }
}

async function waitForHealth() {
  const ask = student()
  for (let n = 0; n < 120; n += 1) {
    const { status } = await ask('/api/health')
    if (status === 200) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

async function ollamaModels() {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags')
    const body = await res.json()
    return (body.models ?? []).map((m) => m.name)
  } catch {
    return null
  }
}

const round = (ms) => Math.round(ms)

async function main() {
  mkdirSync('data', { recursive: true })
  out.startedAt = new Date().toISOString()
  out.ollamaModels = await ollamaModels()
  say(`ollama models: ${out.ollamaModels === null ? 'UNREACHABLE' : out.ollamaModels.join(', ')}`)
  if (!(await waitForHealth())) {
    out.error = 'the server never answered /api/health'
    writeFileSync('data/baseline-live.json', JSON.stringify(out, null, 2))
    say(out.error)
    process.exit(2)
  }
  say('server is up')

  /* ---- S2: what the shelf costs, live ---------------------------------- */
  const subject = 'osmosis'
  const phrasingA = 'explain osmosis'
  const phrasingC = 'how does water get through the wall of a cell'
  const A = student(), B = student(), C = student()

  const a = await A('/api/ask', { question: phrasingA, topicId: subject, classId: '10' })
  out.s2_A_fresh_subject = { status: a.status, ms: round(a.ms), route: a.body?.route ?? null }
  say(`A fresh "${phrasingA}": ${a.status} in ${round(a.ms)} ms, route=${a.body?.route ?? '-'}`)

  const b = await B('/api/ask', { question: phrasingA, topicId: subject, classId: '10' })
  out.s2_B_memoed_phrasing = { status: b.status, ms: round(b.ms), route: b.body?.route ?? null, sameLessonAsA: b.body?.route === a.body?.route }
  say(`B memoed "${phrasingA}": ${b.status} in ${round(b.ms)} ms, route=${b.body?.route ?? '-'} (same as A: ${b.body?.route === a.body?.route})`)

  const c1 = await C('/api/ask', { question: phrasingC, topicId: subject, classId: '10' })
  out.s2_C_new_phrasing = { status: c1.status, ms: round(c1.ms), route: c1.body?.route ?? null, sameLessonAsA: c1.body?.route === a.body?.route }
  say(`C new "${phrasingC}": ${c1.status} in ${round(c1.ms)} ms, route=${c1.body?.route ?? '-'} (shelf hit if same as A: ${c1.body?.route === a.body?.route})`)

  const D = student()
  const c2 = await D('/api/ask', { question: phrasingC, topicId: subject, classId: '10' })
  out.s2_D_new_phrasing_again = { status: c2.status, ms: round(c2.ms), route: c2.body?.route ?? null }
  say(`D same new phrasing again: ${c2.status} in ${round(c2.ms)} ms, route=${c2.body?.route ?? '-'}`)

  /* ---- S0 row 5: fresh subjects refused ------------------------------- */
  const fresh = [
    'photosynthesis', 'the french revolution', 'compound interest', 'newton s second law', 'how a fridge works',
    'the water cycle', 'what is inflation', 'binary search', 'the pythagorean theorem', 'how vaccines work',
    'plate tectonics', 'supply and demand', 'the greenhouse effect', 'ohm s law', 'the structure of dna',
    'how a bill becomes law', 'the pigeonhole principle', 'osmosis in plants', 'the doppler effect', 'what is a prime number',
  ].slice(0, N)
  let refused = 0
  const freshDetail = []
  for (const q of fresh) {
    const r = await student()('/api/ask', { question: `explain ${q}`, classId: '10' })
    const ok = r.status === 200 && r.body?.lesson !== undefined
    if (!ok) refused += 1
    freshDetail.push({ q, status: r.status, ms: round(r.ms), ok, error: ok ? undefined : (r.body?.error ?? null) })
    say(`fresh "${q}": ${r.status} in ${round(r.ms)} ms ${ok ? 'taught' : 'REFUSED ' + (r.body?.error ?? '')}`)
  }
  out.s0_fresh_subjects = { n: fresh.length, refused, detail: freshDetail }

  /* ---- S0 row 6: requests naming a representation --------------------- */
  const wanting = [
    'show me a 3D simulation of how gas pressure rises with temperature',
    'animate how a bill becomes law',
    'make a graph of how compound interest grows over ten years',
    'draw a diagram of the water cycle',
    'show the french revolution as a timeline',
    'put mitosis and meiosis side by side in a table',
    'simulate what happens to a spring when i change the mass',
    'show me in 3D how the planets orbit the sun',
    'animate binary search on a sorted list',
    'graph the doppler effect for a passing siren',
    'give me the pythagorean theorem as an equation i can play with',
    'show ohm s law as an interactive circuit',
  ].slice(0, N)
  let refusedWanting = 0
  const wantingDetail = []
  for (const q of wanting) {
    const r = await student()('/api/ask', { question: q, classId: '10' })
    const ok = r.status === 200 && r.body?.lesson !== undefined
    if (!ok) refusedWanting += 1
    const kinds = ok && Array.isArray(r.body?.lesson?.blocks) ? [...new Set(r.body.lesson.blocks.map((b) => b.kind))] : []
    wantingDetail.push({ q, status: r.status, ms: round(r.ms), ok, kinds, error: ok ? undefined : (r.body?.error ?? null) })
    say(`wants "${q}": ${r.status} in ${round(r.ms)} ms ${ok ? 'taught kinds=' + kinds.join('|') : 'REFUSED ' + (r.body?.error ?? '')}`)
  }
  out.s0_representation_requests = { n: wanting.length, refused: refusedWanting, detail: wantingDetail }

  out.finishedAt = new Date().toISOString()
  writeFileSync('data/baseline-live.json', JSON.stringify(out, null, 2))
  say(`written data/baseline-live.json`)
}

main().catch((error) => {
  out.error = String(error)
  writeFileSync('data/baseline-live.json', JSON.stringify(out, null, 2))
  say(`FAILED: ${String(error)}`)
  process.exit(1)
})
