/**
 * DOES A TOPIC GET A CORRECT QUESTION ABOUT ITSELF?
 *
 *     node scripts/topic-rate.mjs [writer] [judge] [count]
 *
 * Not a test. It needs Ollama running and takes about a minute, so it must
 * never sit in `npm test` where it would be a flake with a plausible excuse.
 *
 * THREE THINGS THIS GETS RIGHT THAT THE FIRST VERSION DID NOT
 * ----------------------------------------------------------
 * 1. IT MEASURES ONLY TOPICS THE PRODUCT WOULD OFFER. The first version pulled
 *    raw names out of the generated file and skipped the quality filter, so it
 *    graded the model on "Prescribed", "DTH" and "Chapter-1" -- headings the
 *    map never shows a student. Those counted as failures. That was a bug in
 *    the MEASUREMENT, scoring the generator on work it is never asked to do.
 *
 * 2. IT SENDS THE TOPIC'S CONTEXT, NOT JUST ITS NAME. A heading like
 *    "Situational problems based on quadratic equations" is a filing label. The
 *    first version sent that one line and asked for a question, so the model had
 *    to GUESS the content -- and a guess is exactly what drifts off-topic. The
 *    chapter, the subject, the class and the sibling topics were sitting in the
 *    curriculum the whole time and were never sent.
 *
 * 3. A DIFFERENT MODEL MARKS THE WORK. The first version had qwen3:8b judging
 *    qwen3:8b, which is marking your own homework, and the quality directive
 *    asks for an independent solver for exactly this reason.
 *
 * ALL TOPICS AT ONCE. The measurements are independent -- nothing about topic 7
 * depends on topic 3. Sequential was never a requirement, it was the shape the
 * loop happened to be written in, and three runs of it were killed before
 * printing a single number.
 */
import { readFileSync } from 'node:fs';

const WRITER = process.argv[2] ?? 'qwen3:8b';
const JUDGE = process.argv[3] ?? 'gemma3:12b';
const COUNT = Number(process.argv[4] ?? 12);

const { isPractisable } = await import('./topic-quality.mjs');

const WRITER_SYSTEM = [
  'You write single-answer multiple-choice questions for exam practice.',
  'Every question is independently verified before a student sees it.',
  '',
  'Rules:',
  '- Exactly four options, keys A to D, exactly one defensible.',
  '- No two options may mean the same thing.',
  '- Every wrong option needs a rationale naming the mistake that produces it.',
  '- The solution explains the reasoning. Never "Option C is correct".',
  '- Test the NAMED topic. Being in the right subject is not enough.',
].join('\n');

const QUESTION_SCHEMA = {
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

const MARK_SCHEMA = {
  type: 'object',
  required: ['onTopic', 'answerable', 'why'],
  properties: {
    onTopic: { type: 'boolean' },
    answerable: { type: 'boolean' },
    why: { type: 'string' },
  },
};

async function ask(model, system, prompt, format) {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        system,
        prompt,
        format,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!response.ok) return null;
    const { response: raw } = await response.json();
    return JSON.parse(raw);
  } catch {
    /* A model that did not answer is a failed observation, not a crashed run.
       One dead call must not lose the other eleven results. */
    return null;
  }
}

/*
 * THE CORPUS IS WHAT THE PRODUCT OFFERS.
 *
 * Parsed out of the generated class file with its chapter and subject intact,
 * then passed through the SAME filter the map uses. A topic the student cannot
 * reach is not the generator's problem and must not be counted against it.
 */
function corpus(path) {
  const source = readFileSync(path, 'utf8');
  const out = [];

  let subject = '';
  let chapter = '';
  let chapterTopics = [];

  for (const line of source.split('\n')) {
    const name = /"name":\s*("(?:[^"\\]|\\.)*")/.exec(line);
    if (!name) continue;

    let value;
    try {
      value = JSON.parse(name[1]);
    } catch {
      continue;
    }

    const indent = line.search(/\S/);
    if (indent <= 4) {
      subject = value;
      chapter = '';
      chapterTopics = [];
    } else if (indent <= 8) {
      chapter = value;
      chapterTopics = [];
    } else if (subject && chapter && isPractisable(value)) {
      chapterTopics.push(value);
      out.push({ subject, chapter, topic: value, siblings: chapterTopics });
    }
  }

  return out;
}

const all = corpus('src/data/curriculum/class10.ts');
const seen = new Set();
const topics = all.filter((t) => (seen.has(t.topic) ? false : seen.add(t.topic))).slice(0, COUNT);

console.log(
  `writer ${WRITER}   judge ${JUDGE}   ${topics.length} of ${all.length} practisable topics\n` +
    `asking about all of them at once...\n`,
);

const started = Date.now();

const results = await Promise.all(
  topics.map(async ({ subject, chapter, topic, siblings }) => {
    /*
     * THE CONTEXT THE MODEL WAS NEVER GIVEN. Siblings are the strongest signal
     * here: they say what the chapter is ABOUT far better than a chapter title
     * does, and they mark the boundary -- these belong to neighbours, not you.
     */
    const others = siblings.filter((s) => s !== topic).slice(0, 6);
    const brief = [
      `Class 10 CBSE, subject: ${subject}`,
      `Chapter: ${chapter}`,
      `Topic to test: ${topic}`,
      others.length > 0
        ? `Other topics in this chapter (do NOT test these): ${others.join('; ')}`
        : '',
      '',
      'Write ONE medium-difficulty question testing the topic named above.',
    ]
      .filter(Boolean)
      .join('\n');

    const q = await ask(WRITER, WRITER_SYSTEM, brief, QUESTION_SCHEMA);

    if (!q || !Array.isArray(q.options) || q.options.length === 0) {
      return { topic, ok: false, why: 'the model returned nothing usable', text: '' };
    }

    const mark = await ask(
      JUDGE,
      [
        'You mark exam questions written by someone else. Answer only with JSON.',
        'onTopic: does the question test the NAMED topic? The right subject is not enough.',
        'answerable: could a student answer it, with exactly one option correct?',
        'why: one short sentence naming the problem, if either is false.',
      ].join('\n'),
      `Topic: ${topic}\nChapter: ${chapter}\n\nQuestion: ${q.questionText}\n\nOptions:\n${q.options
        .map((o) => `${o.key}) ${o.text}`)
        .join('\n')}`,
      MARK_SCHEMA,
    );

    if (!mark) return { topic, ok: false, why: 'the judge returned nothing', text: q.questionText };

    return {
      topic,
      ok: mark.onTopic === true && mark.answerable === true,
      why: `onTopic=${mark.onTopic} answerable=${mark.answerable} — ${String(mark.why ?? '').slice(0, 86)}`,
      text: String(q.questionText).slice(0, 104),
    };
  }),
);

let good = 0;
for (const r of results) {
  if (r.ok) good += 1;
  console.log(
    `${r.ok ? 'GOOD ' : 'BAD  '} ${r.topic.slice(0, 54)}\n      ${r.text}` +
      (r.ok ? '' : `\n      ${r.why}`),
  );
}

const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(
  `\n=== RESULT  ${good}/${results.length} = ${Math.round((100 * good) / Math.max(1, results.length))}%  on-topic AND answerable   (${seconds}s)`,
);
