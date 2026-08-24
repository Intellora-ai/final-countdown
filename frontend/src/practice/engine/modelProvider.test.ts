import { describe, expect, it } from 'vitest';

import { modelProvider, toCandidate } from './modelProvider';
import { verify } from './verify';
import type { QuestionSpec } from './types';

/**
 * The model-backed provider.
 *
 * These do not call a model. They pin the two things that stay true whatever a
 * model returns: the request never carries a key from the browser, and a
 * malformed response fails loudly at the provider rather than quietly reaching
 * a student.
 */

const SPEC: QuestionSpec = {
  specId: 'rotational-motion-0',
  topicId: 'rotational-motion',
  chapterId: 'mechanics',
  conceptId: 'moment-of-inertia',
  conceptName: 'moment of inertia',
  questionType: 'standard',
  difficultyTarget: 'easy',
  reasoningStructure: 'single_step_application',
  prerequisites: ['mass'],
  misconceptionTested: 'treats inertia as mass',
};

const GOOD = {
  questionText: 'A 2 kg mass sits 3 m from the axis. What is its moment of inertia?',
  options: [
    { key: 'A', text: '18 kg m^2', rationale: '' },
    { key: 'B', text: '6 kg m^2', rationale: 'Multiplies mass by radius instead of radius squared' },
    { key: 'C', text: '12 kg m^2', rationale: 'Doubles the radius rather than squaring it' },
    { key: 'D', text: '9 kg m^2', rationale: 'Forgets the mass entirely' },
  ],
  correctOption: 'A',
  fullSolution:
    'Moment of inertia for a point mass is m r squared, so 2 multiplied by 3 squared ' +
    'gives 18 kg m^2. The radius is squared because the distance enters twice.',
  computation: {
    inputs: { m: 2, r: 3 },
    steps: [
      { op: 'mul', left: 'r', right: 'r', into: 'r2' },
      { op: 'mul', left: 'm', right: 'r2', into: 'out' },
    ],
    expected: 18,
    tolerance: 0.001,
    unit: 'kg m^2',
  },
};

function messagesResponse(payload: unknown) {
  return {
    id: 'msg_1',
    content: [
      { type: 'thinking', thinking: 'considering the formula' },
      { type: 'text', text: JSON.stringify(payload) },
    ],
  };
}

function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { impl, calls };
}

describe('the key never reaches the browser', () => {
  /*
   * THE ONE THAT MATTERS.
   *
   * This app is client-side. A key in a request the browser makes is a key you
   * have published — devtools, view-source and the network tab all hand it
   * over, and rotating it does not recall the copies already taken. The default
   * posts to a same-origin path that holds the key server-side.
   */
  it('posts to a relative proxy path and sends no credential', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({ fetchImpl: impl }).generate(SPEC, 0);

    expect(calls[0]?.url).toBe('/api/practice/generate');
    expect(calls[0]?.url).not.toContain('api.anthropic.com');

    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['x-api-key']).toBeUndefined();
    expect(JSON.stringify(calls[0]?.init.headers)).not.toContain('sk-');
  });

  it('ignores an apiKey unless direct mode is explicitly turned on', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({ fetchImpl: impl, apiKey: 'sk-should-not-ship' }).generate(SPEC, 0);

    expect(calls[0]?.url).toBe('/api/practice/generate');
    expect(JSON.stringify(calls[0]?.init.headers)).not.toContain('sk-should-not-ship');
  });

  it('goes direct only when both the key and the explicit flag are set', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({
      fetchImpl: impl,
      apiKey: 'sk-node-only',
      directToAnthropic: true,
    }).generate(SPEC, 0);

    expect(calls[0]?.url).toContain('api.anthropic.com');
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-node-only');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });
});

describe('the brief it sends', () => {
  it('carries the concept by name, not by slug', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({ fetchImpl: impl }).generate(SPEC, 0);

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    const text = JSON.stringify(body['messages']);

    expect(text).toContain('moment of inertia');
    expect(text).not.toContain('moment-of-inertia');
  });

  it('tells a retry that a rewording will be rejected', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({ fetchImpl: impl }).generate(SPEC, 2);

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(JSON.stringify(body['messages'])).toContain('genuinely different');
  });

  it('asks for the current model and adaptive thinking', async () => {
    const { impl, calls } = stubFetch(messagesResponse(GOOD));
    await modelProvider({ fetchImpl: impl }).generate(SPEC, 0);

    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body['model']).toBe('claude-opus-5');
    expect(body['thinking']).toEqual({ type: 'adaptive' });
  });
});

describe('what comes back is a candidate, not a question', () => {
  it('parses a well-formed response and survives verification', async () => {
    const { impl } = stubFetch(messagesResponse(GOOD));
    const candidate = await modelProvider({ fetchImpl: impl }).generate(SPEC, 0);

    const outcome = verify({
      candidate,
      sessionId: 's1',
      expectedTopicId: 'rotational-motion',
    });
    expect(outcome.ok).toBe(true);
  });

  /*
   * The point of the provider boundary. A model that writes a confident wrong
   * question is caught by exactly the code that catches a fixture writing one -
   * no separate trust level, no special case.
   */
  it('lets the verifier catch a model whose arithmetic does not hold', async () => {
    const wrong = { ...GOOD, computation: { ...GOOD.computation, expected: 999 } };
    const { impl } = stubFetch(messagesResponse(wrong));
    const candidate = await modelProvider({ fetchImpl: impl }).generate(SPEC, 0);

    const outcome = verify({
      candidate,
      sessionId: 's1',
      expectedTopicId: 'rotational-motion',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failures.map((f) => f.check)).toContain('calculation_correctness');
  });

  it('reads the answer out of a text block, never out of the thinking block', () => {
    const candidate = toCandidate(
      SPEC,
      0,
      {
        content: [
          { type: 'thinking', thinking: JSON.stringify({ questionText: 'DRAFT, NOT THE ANSWER' }) },
          { type: 'text', text: JSON.stringify(GOOD) },
        ],
      },
      'test',
    );
    expect(candidate.questionText).toBe(GOOD.questionText);
  });

  it('accepts a proxy that returns the parsed question directly', () => {
    const candidate = toCandidate(SPEC, 0, GOOD, 'test');
    expect(candidate.correctOption).toBe('A');
    expect(candidate.options).toHaveLength(4);
  });
});

describe('malformed responses fail at the provider', () => {
  it.each([
    ['a non-object', 'not an object'],
    ['no content blocks', { id: 'msg_1' }],
    ['no parsable JSON', { content: [{ type: 'text', text: 'here is your question!' }] }],
    ['a missing questionText', { content: [{ type: 'text', text: '{"correctOption":"A"}' }] }],
    [
      'an option key outside A-D',
      { content: [{ type: 'text', text: JSON.stringify({ ...GOOD, correctOption: 'E' }) }] },
    ],
  ])('throws on %s', (_label, payload) => {
    expect(() => toCandidate(SPEC, 0, payload, 'test')).toThrow();
  });

  it('reports a 5xx as an outage so the pipeline can tell it apart', async () => {
    const { impl } = stubFetch({ error: 'overloaded' }, 503);
    await expect(modelProvider({ fetchImpl: impl }).generate(SPEC, 0)).rejects.toThrow(
      /unavailable/,
    );
  });

  it('reports a 400 as a generation failure rather than an outage', async () => {
    const { impl } = stubFetch({ error: 'bad request' }, 400);
    await expect(modelProvider({ fetchImpl: impl }).generate(SPEC, 0)).rejects.toThrow(
      /generation failed/,
    );
  });

  it('treats a missing rationale as empty so the verifier names the real problem', () => {
    const noRationale = {
      ...GOOD,
      options: GOOD.options.map((o) => ({ key: o.key, text: o.text })),
    };
    const candidate = toCandidate(SPEC, 0, noRationale, 'test');

    const outcome = verify({
      candidate,
      sessionId: 's1',
      expectedTopicId: 'rotational-motion',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failures.map((f) => f.check)).toContain('distractor_quality');
  });
});
