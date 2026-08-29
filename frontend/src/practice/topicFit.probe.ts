/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DOES A TOPIC GET CORRECT QUESTIONS ABOUT THAT TOPIC?
 *
 * THE PREVIOUS PROBE MEASURED THE WRONG THING, and the difference matters
 * enough to write down. It reported a SURVIVAL RATE -- what fraction of
 * generated questions cleared every gate -- and that is a measurement of the
 * GATES, not of the product. A gate that refused everything would score 0% and
 * ship nothing wrong; a gate that passed everything would score 100% and
 * prove nothing. Neither number tells a student anything.
 *
 * The question a student has is: I opened this topic, are these questions
 * about it, and are they right?
 *
 * So this probe asks exactly that, of every delivered question:
 *
 *     ON-TOPIC    is it about the topic it was generated for?
 *     ANSWERABLE  does exactly one option stand up?
 *
 * AND IT DOES NOT ASK THE GENERATOR. A separate call, a different prompt, no
 * knowledge that a model wrote the question or which topic it was aimed at
 * beyond the one being tested. The maker never grades itself; that is the only
 * reason the number means anything.
 *
 * WHAT THE JUDGE IS NOT. It is the same 8B model, so it is not an authority --
 * it is a second opinion that is cheap and independent. Where it and the gates
 * disagree, the disagreement is printed rather than resolved, because that
 * disagreement is the most useful line in the output.
 *
 *     npm run probe:fit
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './engine/ids';
import { ollamaProvider } from './engine/ollamaProvider';
import { buildPlan } from './engine/plan';
import { verify } from './engine/verify';
import { toPracticeCurriculum } from './officialCurriculum';

const ENV = import.meta.env as Record<string, string | undefined>;
const MODEL = ENV['VITE_OLLAMA_MODEL'] ?? 'qwen3:8b';
const HOW_MANY = Number(ENV['VITE_PROBE_TOPICS'] ?? 10);

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['onTopic', 'answerable', 'why'],
  properties: {
    onTopic: { type: 'boolean' },
    answerable: { type: 'boolean' },
    why: { type: 'string' },
  },
} as const;

/**
 * The judge never learns that a model wrote this, or that anything is at stake.
 * It is asked to mark a question, which is a task it can do without being told
 * what answer would be convenient.
 */
async function judge(
  topicName: string,
  questionText: string,
  options: readonly { key: string; text: string }[],
): Promise<{ onTopic: boolean; answerable: boolean; why: string } | null> {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      system: [
        'You mark exam questions. Answer only with JSON.',
        'onTopic: is the question testing the named topic? Being in the same',
        '  subject is not enough. A question about a different topic is false.',
        'answerable: could a student answer it, with exactly one option correct?',
        'why: one short sentence. If either answer is false, say which and why.',
      ].join('\n'),
      prompt: `Topic: ${topicName}\n\nQuestion: ${questionText}\n\nOptions:\n${options
        .map((option) => `${option.key}) ${option.text}`)
        .join('\n')}`,
      format: JUDGE_SCHEMA,
      stream: false,
      options: { temperature: 0 },
    }),
  });

  if (!response.ok) return null;

  const { response: raw } = (await response.json()) as { response?: string };
  try {
    return JSON.parse(String(raw)) as { onTopic: boolean; answerable: boolean; why: string };
  } catch {
    return null;
  }
}

describe('do topics get correct questions about themselves', () => {
  it('measures on-topic and answerable, judged independently', async () => {
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);

    const picked = subjects
      .flatMap((subject) =>
        subject.chapters.flatMap((chapter) =>
          chapter.topics.map((topic) => ({ subject, chapter, topic })),
        ),
      )
      .filter(({ subject }) => /math|science/i.test(subject.name))
      .slice(0, HOW_MANY);

    const provider = ollamaProvider({ model: MODEL });
    const lines: string[] = [];
    let onTopic = 0;
    let answerable = 0;
    let both = 0;
    let gatePassed = 0;
    let judged = 0;

    for (const { subject, chapter, topic } of picked) {
      const profile = {
        topicId: asTopicId(topic.id),
        chapterId: asChapterId(chapter.id),
        subjectId: asSubjectId(subject.id),
        quantitative: 0.7,
        concepts: [
          {
            id: topic.id,
            name: topic.name,
            topicId: asTopicId(topic.id),
            numeric: true,
            prerequisites: [],
            commonMisconception: null,
          },
        ],
      };

      const spec = buildPlan(profile, 5)[0];
      if (!spec) continue;

      try {
        const candidate = await provider.generate(spec, 0, new AbortController().signal);
        const gates = verify({ candidate, sessionId: 'fit', expectedTopicId: topic.id });
        if (gates.ok) gatePassed += 1;

        const mark = await judge(topic.name, candidate.questionText, candidate.options);
        if (mark === null) {
          lines.push(`?     ${topic.name.slice(0, 44)}  (judge gave no verdict)`);
          continue;
        }

        judged += 1;
        if (mark.onTopic) onTopic += 1;
        if (mark.answerable) answerable += 1;
        if (mark.onTopic && mark.answerable) both += 1;

        const flag = mark.onTopic && mark.answerable ? 'GOOD ' : 'BAD  ';
        lines.push(
          `${flag} ${topic.name.slice(0, 44)}\n      ${candidate.questionText.slice(0, 100)}\n` +
            `      topic=${mark.onTopic} answerable=${mark.answerable} gate=${gates.ok ? 'pass' : 'FAIL'}  ${mark.why.slice(0, 90)}`,
        );
      } catch (error) {
        lines.push(
          `ERR   ${topic.name.slice(0, 44)}  ${error instanceof Error ? error.message.slice(0, 70) : ''}`,
        );
      }
    }

    const pct = (n: number) => `${n}/${judged} = ${Math.round((100 * n) / Math.max(1, judged))}%`;

    console.log(
      `\n=== ${MODEL} — judged independently, ${judged} topics\n` +
        `=== ON-TOPIC    ${pct(onTopic)}\n` +
        `=== ANSWERABLE  ${pct(answerable)}\n` +
        `=== BOTH        ${pct(both)}          <- the number that matters\n` +
        `=== gates passed ${gatePassed}/${judged}\n\n${lines.join('\n')}`,
    );

    expect(judged).toBeGreaterThan(0);
  });
});
