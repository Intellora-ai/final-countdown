/**
 * HOW MANY MODEL-WRITTEN QUESTIONS SURVIVE THE GATES?
 *
 * Not a test — it needs a model running and takes minutes, so it must never sit
 * in `npm test` where it would be a flake with a plausible excuse. It is the
 * measurement that answers "how far is 100%", and that number has to come from
 * a run rather than from an estimate.
 *
 *     npx vitest run src/practice/ollamaRate.probe.ts --testTimeout 900000
 */
import { describe, expect, it } from 'vitest';

import { buildCentroids, driftsFrom } from './engine/drift';
import { asChapterId, asSubjectId, asTopicId } from './engine/ids';
import { ollamaProvider } from './engine/ollamaProvider';
import { buildPlan } from './engine/plan';
import { scopeViolations } from './engine/requirements';
import { verify } from './engine/verify';
import { toPracticeCurriculum } from './officialCurriculum';

/*
 * Read through `import.meta.env`, which Vite provides, rather than `process` --
 * `@types/node` is not a dependency of this package and adding one to read two
 * strings would be a poor trade.
 */
const ENV = import.meta.env as Record<string, string | undefined>;
const MODEL = ENV['VITE_OLLAMA_MODEL'] ?? 'qwen3:8b';
const HOW_MANY = Number(ENV['VITE_PROBE_TOPICS'] ?? 12);

describe('model-written questions against the gates', () => {
  it('measures the survival rate', async () => {
    const mod: Record<string, unknown> = await import('../data/curriculum/class10');
    const official = Object.values(mod).find((value) => Array.isArray(value)) as never;
    const subjects = toPracticeCurriculum(official);
    const centroids = buildCentroids(subjects);

    const topics = subjects
      .flatMap((subject) =>
        subject.chapters.flatMap((chapter) =>
          chapter.topics.map((topic) => ({ subject, chapter, topic })),
        ),
      )
      .filter(({ subject }) => /math|science/i.test(subject.name))
      .slice(0, HOW_MANY);

    const provider = ollamaProvider({ model: MODEL });
    const tally: Record<string, number> = {};
    const bump = (key: string) => (tally[key] = (tally[key] ?? 0) + 1);
    const lines: string[] = [];

    for (const { subject, chapter, topic } of topics) {
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

      let verdict = 'PASS';
      try {
        const candidate = await provider.generate(spec, 0, new AbortController().signal);
        const checked = verify({
          candidate,
          sessionId: 'probe',
          expectedTopicId: topic.id,
        });

        if (!checked.ok) {
          verdict = `verify:${checked.failures.map((f) => f.check).join('+')}`;
        } else if (driftsFrom(candidate.questionText, topic.id, centroids)) {
          verdict = 'drift';
        } else {
          const violations = scopeViolations(
            candidate.questionText,
            candidate.fullSolution,
            { topicId: topic.id, allowedTopicIds: [] },
            centroids,
          );
          if (violations.length > 0) verdict = violations.join('+');
        }

        lines.push(`${verdict === 'PASS' ? 'PASS ' : 'FAIL '} ${topic.name.slice(0, 44)}
      ${candidate.questionText.slice(0, 110)}${verdict === 'PASS' ? '' : `\n      -> ${verdict}`}`);
      } catch (error) {
        verdict = `error:${error instanceof Error ? error.message.slice(0, 60) : 'unknown'}`;
        lines.push(`FAIL  ${topic.name.slice(0, 44)}\n      -> ${verdict}`);
      }

      bump(verdict === 'PASS' ? 'PASS' : verdict.split(':')[0] ?? verdict);
    }

    const total = Object.values(tally).reduce((sum, n) => sum + n, 0);
    const passed = tally['PASS'] ?? 0;

    console.log(
      `\n=== ${MODEL} — ${passed}/${total} survived every gate (${Math.round((100 * passed) / Math.max(1, total))}%)\n` +
        `=== ${JSON.stringify(tally)}\n\n${lines.join('\n')}`,
    );

    expect(total).toBeGreaterThan(0);
  });
});
