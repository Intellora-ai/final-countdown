/*
 * An OpenAI-compatible model, standing still.
 *
 * WHY A STUB AND NOT A REAL MODEL. The journey test crosses every layer of the
 * product -- browser, vite proxy, backend, model, validator, renderer -- and it
 * has to do that on every pull request, with no key and no network. Everything
 * in that chain is exercised for real except the one part whose creativity is
 * not what a wiring test should measure. The HTTP is real, the proxy is real,
 * the parsing is real, the validation is real, the rendering is real.
 *
 * WHY FOUR MODES AND NOT ONE. A stub that only ever returns a good lesson never
 * exercises the shape that actually took the product down: a model that answers
 * 200 with prose, or 200 with half a document, or 404 because its id was
 * withdrawn. Those are the failures that happened, and a happy-path stub would
 * have proved the product survives the one case that never occurs.
 *
 *   STUB_MODE=valid      one fixed valid lesson
 *   STUB_MODE=malformed  200, prose where JSON was asked for
 *   STUB_MODE=partial    200, JSON with no blocks
 *   STUB_MODE=dead       404, the model id does not exist
 *
 * An unknown mode is a hard exit rather than a fallback to `valid`. A typo that
 * silently degraded to the happy path would make a red run green for a reason
 * nobody could see -- the exact failure this whole suite is about.
 */
import { createServer } from 'node:http'

const MODES = new Set(['valid', 'malformed', 'partial', 'dead'])
const MODE = process.env.STUB_MODE ?? 'valid'
const PORT = Number(process.env.STUB_PORT ?? 8788)

if (!MODES.has(MODE)) {
  console.error(
    `stub-model: STUB_MODE=${JSON.stringify(MODE)} is not one of ${[...MODES].join(', ')}. ` +
      `Refusing to start rather than defaulting to a passing mode.`,
  )
  process.exit(2)
}

/* A lesson that satisfies the canvas schema and the teaching gate: it opens
   with a definition under thirty words, shows something rather than only
   telling it, closes with a summary, and marks one term. Deliberately dull --
   a convincing fake would invite judging teaching quality from output no model
   produced. */
const LESSON = {
  id: 'stub-photosynthesis',
  question: 'What is photosynthesis?',
  subject: 'Biology',
  blocks: [
    {
      id: 'says-what',
      kind: 'prose',
      role: 'definition',
      emphasis: 'primary',
      body: 'Photosynthesis is how a plant turns light into food.',
      terms: [{ text: 'Photosynthesis', mark: 'key' }],
    },
    {
      id: 'the-steps',
      kind: 'flow',
      role: 'framework',
      emphasis: 'supporting',
      caption: 'Light in, sugar out, in three steps.',
      nodes: [
        { id: 'light', label: 'a leaf catches light' },
        { id: 'water', label: 'it takes water and air' },
        { id: 'sugar', label: 'it makes sugar and oxygen' },
      ],
      links: [
        { from: 'light', to: 'water' },
        { from: 'water', to: 'sugar' },
      ],
    },
    {
      id: 'to-keep',
      kind: 'summary',
      role: 'summary',
      emphasis: 'supporting',
      mentalModel: 'A leaf eats light and breathes out oxygen.',
      progression: ['catch the light', 'take in water and air', 'make sugar'],
    },
  ],
  relations: [
    { from: 'the-steps', to: 'says-what', kind: 'supports' },
    { from: 'to-keep', to: 'says-what', kind: 'supports' },
  ],
}

const BODIES = {
  valid: () => JSON.stringify(LESSON),
  /* Prose where JSON was asked for. A small model does this constantly, and it
     must surface as "the model replied with something that is not a lesson",
     never as a crash three layers downstream. */
  malformed: () => 'Sure! Photosynthesis is how plants make food from sunlight.',
  /* Well-formed JSON, missing the one field everything downstream indexes. */
  partial: () => JSON.stringify({ id: 'stub', question: 'What is photosynthesis?' }),
}

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    /* HEALTH ANSWERS IN EVERY MODE, INCLUDING `dead`.
       Playwright polls this to decide the server is up. If it answered 404 in
       dead mode the harness would never start, and "the stub refuses" would
       present as "the stub is broken" -- two different failures with one face,
       which is the confusion this whole suite keeps removing. */
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, mode: MODE }))
      return
    }

    if (MODE === 'dead') {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: 'The model `stub-model` does not exist or you do not have access to it.',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        }),
      )
      return
    }

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: BODIES[MODE]() } }],
      }),
    )
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`stub-model listening on http://127.0.0.1:${String(PORT)} in ${MODE} mode`)
})
