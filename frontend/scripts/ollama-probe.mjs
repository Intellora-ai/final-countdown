/**
 * ONE REAL CALL TO THE LIVE MODEL, BEFORE ANY CLAIM ABOUT IT.
 *
 * Not a test. Tests use an injected fetch and prove the ADAPTER is correct;
 * they cannot tell you whether the model on this machine can write a question.
 * This does, and it prints what came back so the answer is readable rather
 * than asserted.
 */
const MODEL = process.argv[2] ?? 'qwen3:8b';

const SYSTEM = [
  'You write single-answer multiple-choice questions for exam practice.',
  'Return ONLY JSON. Exactly four options, keys A to D, exactly one correct.',
  'Every wrong option needs a rationale naming the mistake that produces it.',
].join('\n');

const SCHEMA = {
  type: 'object',
  required: ['questionText', 'options', 'correctOption', 'fullSolution'],
  properties: {
    questionText: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'text', 'rationale'],
        properties: {
          key: { type: 'string' },
          text: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    correctOption: { type: 'string' },
    fullSolution: { type: 'string' },
  },
};

const started = Date.now();
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    system: SYSTEM,
    prompt:
      'Topic: Zeros of a polynomial. Subject: Mathematics, class 10.\n' +
      'Write one medium-difficulty question testing the sum of the zeros.',
    format: SCHEMA,
    stream: false,
    options: { temperature: 0.2 },
  }),
});

if (!response.ok) {
  console.log(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  process.exit(1);
}

const { response: raw } = await response.json();
const seconds = ((Date.now() - started) / 1000).toFixed(1);

try {
  const q = JSON.parse(raw);
  console.log(`MODEL   ${MODEL}   ${seconds}s   PARSED OK`);
  console.log(`Q       ${q.questionText}`);
  for (const o of q.options ?? []) {
    console.log(`  ${o.key}) ${o.text}${o.rationale ? '   <- ' + o.rationale : '   <- CORRECT'}`);
  }
  console.log(`ANSWER  ${q.correctOption}`);
  console.log(`SOLN    ${String(q.fullSolution).slice(0, 160)}`);
} catch {
  console.log(`MODEL   ${MODEL}   ${seconds}s   NOT JSON`);
  console.log(raw.slice(0, 300));
}
