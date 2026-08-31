import { describe, expect, it, vi } from 'vitest';

import { asChapterId, asSubjectId, asTopicId } from './ids';
import { ollamaProvider } from './ollamaProvider';
import type { QuestionSpec } from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GENERATOR SEAM, CONNECTED TO A MODEL THAT IS ACTUALLY RUNNING.
 *
 * `modelProvider.ts` has existed for months: it builds the brief, declares the
 * JSON schema, parses the reply, and hands a candidate to the same pipeline
 * every other provider uses. It has never been given a live model. Measured on
 * this machine, Ollama is serving ten of them on port 11434.
 *
 * WHY A SECOND PROVIDER RATHER THAN A FLAG ON THE FIRST
 * ----------------------------------------------------
 * The two speak different HTTP. Anthropic returns content blocks and takes
 * `messages`; Ollama returns `{ response: "<json string>" }` and takes
 * `prompt`. Threading both through one function means a branch in every step
 * and a request body that is correct for neither when somebody edits it later.
 *
 * WHAT IS SHARED IS THE PART THAT MATTERS: the SYSTEM prompt, the SCHEMA and
 * the per-question brief are imported from `modelProvider`, not copied. Two
 * prompts for one job is how the two drift, and then a question that passes on
 * one model fails on the other for reasons nobody can see.
 *
 * THE MODEL IS STILL NOT TRUSTED. Everything it returns goes through the same
 * verifier, the same boundary, the same drift and solution-scope gates. This
 * changes WHO writes the question, not who decides whether it ships.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SPEC: QuestionSpec = {
  specId: 'quad-0',
  topicId: asTopicId('quadratics'),
  chapterId: asChapterId('algebra'),
  subjectId: asSubjectId('mathematics'),
  conceptId: 'quadratics--roots',
  conceptName: 'Zeros of a polynomial',
  questionType: 'standard',
  difficultyTarget: 'medium',
  reasoningStructure: 'single_step_application',
  prerequisites: [],
  misconceptionTested: null,
};

/** What Ollama actually returns: the model's JSON, as a STRING, in `response`. */
function ollamaSays(question: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ response: JSON.stringify(question), done: true }),
    text: async () => '',
  } as unknown as Response;
}

const GOOD_QUESTION = {
  questionText: 'The polynomial p(x) = x² − 7x + 12 has two zeros. What is their sum?',
  options: [
    { key: 'A', text: '7', rationale: '' },
    { key: 'B', text: '12', rationale: 'Read the product off the constant term.' },
    { key: 'C', text: '-7', rationale: 'Dropped the sign.' },
    { key: 'D', text: '3.5', rationale: 'Assumed the zeros are equal.' },
  ],
  correctOption: 'A',
  fullSolution: 'For x² + bx + c the sum of the zeros is −b, so −(−7) = 7.',
  /*
   * A REAL STEP, because `parseComputation` returns null for an empty step
   * list -- and it is right to. A declared answer with no derivation is a
   * number the verifier cannot recompute, which is the one thing it exists to
   * do. The first version of this fixture had `steps: []` and asserted the
   * expected value survived; it did not, and the CODE was correct.
   */
  computation: {
    inputs: { b: 7, one: 1 },
    steps: [{ op: 'mul', left: 'b', right: 'one', into: 'out' }],
    expected: 7,
    tolerance: 0.001,
    unit: null,
  },
};

describe('the request Ollama is given', () => {
  it('asks the named model, without streaming, and pins the JSON shape', async () => {
    const fetchImpl = vi.fn(async () => ollamaSays(GOOD_QUESTION));

    await ollamaProvider({ model: 'qwen3:8b', fetchImpl: fetchImpl as never }).generate(
      SPEC,
      0,
      new AbortController().signal,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toContain('/api/generate');
    expect(body['model']).toBe('qwen3:8b');
    /*
     * `stream: false` is not a preference. Streaming returns newline-delimited
     * fragments and `response.json()` on that throws on the second line, so the
     * failure would be a parse error a long way from its cause.
     */
    expect(body['stream']).toBe(false);
    /* Ollama enforces a JSON schema when `format` is an object. Without it the
     * model returns prose around the JSON and every question fails to parse. */
    expect(body['format']).toBeTypeOf('object');
  });

  it('sends the SAME system prompt and brief as the Anthropic path', async () => {
    /*
     * Imported, not copied. Two prompts for one job drift, and then a question
     * that passes on one model fails on the other for reasons nobody can see.
     */
    const fetchImpl = vi.fn(async () => ollamaSays(GOOD_QUESTION));

    await ollamaProvider({ fetchImpl: fetchImpl as never }).generate(
      SPEC,
      0,
      new AbortController().signal,
    );

    const body = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    ) as Record<string, string>;

    /*
     * Asserted against the real text rather than a guess. The first version
     * looked for 'LAW', which is this repository's vocabulary and not the
     * prompt's -- a test that would have passed only by coincidence.
     */
    expect(body['system']).toContain('independently verified');
    expect(body['system']).toContain('Exactly four options');
    expect(body['prompt']).toContain('Zeros of a polynomial');
    expect(body['prompt']).toContain('single_step_application');
  });

  it('passes the abort signal through, so a slow model can be cancelled', async () => {
    const fetchImpl = vi.fn(async () => ollamaSays(GOOD_QUESTION));
    const controller = new AbortController();

    await ollamaProvider({ fetchImpl: fetchImpl as never }).generate(SPEC, 0, controller.signal);

    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBe(controller.signal);
  });
});

describe('the reply Ollama gives back', () => {
  it('unwraps the response envelope into a candidate', async () => {
    const fetchImpl = vi.fn(async () => ollamaSays(GOOD_QUESTION));

    const candidate = await ollamaProvider({ fetchImpl: fetchImpl as never }).generate(
      SPEC,
      0,
      new AbortController().signal,
    );

    expect(candidate.questionText).toContain('polynomial');
    expect(candidate.correctOption).toBe('A');
    expect(candidate.options).toHaveLength(4);
    expect(candidate.computation?.expected).toBe(7);
    /* The spec travels with the candidate, so the boundary can still be checked. */
    expect(candidate.spec.topicId).toBe(SPEC.topicId);
  });

  it('names the model in the source, so a bad batch is traceable', async () => {
    /*
     * "every question made on Tuesday shares a flaw" is only actionable if the
     * question records WHICH model made it.
     */
    const fetchImpl = vi.fn(async () => ollamaSays(GOOD_QUESTION));

    const candidate = await ollamaProvider({
      model: 'gemma3:12b',
      fetchImpl: fetchImpl as never,
    }).generate(SPEC, 0, new AbortController().signal);

    expect(candidate.generationSource).toContain('gemma3:12b');
  });

  it('fails with a readable message when the model returns prose, not JSON', async () => {
    /*
     * A small model ignores the schema sometimes. The failure has to say THAT,
     * rather than surfacing a JSON parse error from three layers down.
     */
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ response: 'Sure! Here is a question about polynomials.' }),
          text: async () => '',
        }) as unknown as Response,
    );

    await expect(
      ollamaProvider({ fetchImpl: fetchImpl as never }).generate(
        SPEC,
        0,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/did not return JSON/i);
  });

  it('reports an HTTP failure with its status', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => 'model "nope" not found',
        }) as unknown as Response,
    );

    await expect(
      ollamaProvider({ model: 'nope', fetchImpl: fetchImpl as never }).generate(
        SPEC,
        0,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/404/);
  });

  it('says so plainly when Ollama is not running', async () => {
    /*
     * The most common failure by far, and the one a stack trace explains worst.
     * `fetch` to a closed port rejects with a bare "fetch failed".
     */
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      ollamaProvider({ fetchImpl: fetchImpl as never }).generate(
        SPEC,
        0,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/ollama/i);
  });
});
