import { figureFor } from './figure'
import type { QuestionProvider } from './provider';
import {
  isOptionKey,
  type CandidateQuestion,
  type NumericComputation,
  type NumericStep,
  type OptionKey,
  type QuestionOption,
  type QuestionSpec,
} from './types';

/**
 * A provider backed by a real model.
 *
 * THE KEY DOES NOT GO IN THE BROWSER. THAT IS NOT A PREFERENCE.
 * ------------------------------------------------------------
 * This app runs client-side. An API key shipped to a browser is a key you have
 * published — devtools, view-source, and the network tab all hand it over, and
 * rotating it does not undo the ones already taken. So this provider posts to a
 * relative `endpoint` on your own origin, and that endpoint is expected to hold
 * the key and forward the request.
 *
 * `apiKey` exists on the options for Node contexts — a build script, a batch
 * pre-generation job, a test. It is deliberately awkward to reach for from a
 * component, and `directToAnthropic` has to be set as well, so nobody enables
 * it by accident while wiring a screen.
 *
 * WHY THE MODEL IS STILL NOT TRUSTED
 * ----------------------------------
 * Everything this returns is a CANDIDATE. It goes through the same verifier as
 * the fixture: arithmetic recomputed from the declared inputs, exactly-one-
 * correct-answer enforced, solutions that only announce the answer rejected. A
 * model that writes a confident wrong question is caught by the same code that
 * catches a fixture writing one. That is the whole reason the provider boundary
 * exists.
 */

export interface ModelProviderOptions {
  /**
   * Where to POST. Default is a same-origin proxy that holds the key.
   * A relative path is the safe shape — it cannot leak a key it never has.
   */
  readonly endpoint?: string;
  readonly model?: string;
  /** Node-only. Requires `directToAnthropic` as well. See the note above. */
  readonly apiKey?: string;
  /** Must be explicitly true before `apiKey` is used. Never set this in a component. */
  readonly directToAnthropic?: boolean;
  /** Injected for tests. Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = '/api/practice/generate';
const DEFAULT_MODEL = 'claude-opus-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export function modelProvider(options: ModelProviderOptions = {}): QuestionProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const model = options.model ?? DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    name: `model:${model}`,

    async generate(spec, attempt, signal) {
      if (typeof doFetch !== 'function') {
        throw new Error('modelProvider: no fetch available in this environment');
      }

      const direct = options.directToAnthropic === true && Boolean(options.apiKey);
      const url = direct ? ANTHROPIC_URL : endpoint;

      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (direct && options.apiKey) {
        headers['x-api-key'] = options.apiKey;
        headers['anthropic-version'] = '2023-06-01';
      }

      const response = await doFetch(url, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          /* Adaptive thinking: the model decides how much reasoning a question
             needs. A one-step recall does not need the same work as a chain. */
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM,
          messages: [{ role: 'user', content: briefFor(spec, attempt) }],
        }),
      });

      if (!response.ok) {
        const body = await safeText(response);
        /*
         * The message carries the status, because the pipeline distinguishes a
         * provider outage from a question it could not write, and a bare
         * "request failed" collapses that distinction.
         */
        throw new Error(
          response.status >= 500 || response.status === 429
            ? `provider unavailable (${response.status}): ${body}`
            : `generation failed (${response.status}): ${body}`,
        );
      }

      return toCandidate(spec, attempt, await response.json(), model);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The brief                                                                  */
/* -------------------------------------------------------------------------- */

const SYSTEM = [
  'You write single-answer multiple-choice questions for exam practice.',
  '',
  'Every question you return is independently verified before a student sees it.',
  'The verifier recomputes your arithmetic from the inputs you declare, rejects',
  'any question where zero or more than one option is defensible, and rejects',
  'solutions that state the answer without justifying it. Writing confidently is',
  'not enough; the question has to survive being checked.',
  '',
  'Rules:',
  '- Exactly four options, keys A to D, exactly one defensible.',
  '- No two options may mean the same thing.',
  '- Every wrong option needs a rationale naming the mistake a student makes to',
  '  choose it. "Wrong" is not a rationale.',
  '- The solution explains the reasoning. Never "Option C is correct".',
  '- If the question involves arithmetic, declare it in `computation` so it can',
  '  be recomputed. Steps reference earlier inputs or earlier step names only.',
].join('\n');

function briefFor(spec: QuestionSpec, attempt: number): string {
  const lines = [
    `Topic: ${spec.topicId}`,
    `Concept: ${spec.conceptName}`,
    `Question type: ${spec.questionType}`,
    `Target difficulty: ${spec.difficultyTarget}`,
    `Reasoning structure: ${spec.reasoningStructure}`,
  ];

  if (spec.prerequisites.length > 0) {
    lines.push(`May assume: ${spec.prerequisites.join(', ')}`);
  }
  if (spec.misconceptionTested) {
    lines.push(`Distractors should separate out this misconception: ${spec.misconceptionTested}`);
  }
  if (attempt > 0) {
    /*
     * Regeneration has to produce a DIFFERENT question, not a retyped one. The
     * deduplicator will reject a near-copy, so saying so here saves a round
     * trip rather than merely being polite about it.
     */
    lines.push(
      `This is retry ${attempt}. A previous attempt was rejected. Write a genuinely` +
        ' different question on the same concept, not a rewording of one.',
    );
  }

  return lines.join('\n');
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questionText', 'options', 'correctOption', 'fullSolution'],
  properties: {
    questionText: { type: 'string' },
    options: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'text', 'rationale'],
        properties: {
          key: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          text: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    correctOption: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    fullSolution: { type: 'string' },
    computation: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['inputs', 'steps', 'expected', 'tolerance'],
      properties: {
        inputs: { type: 'object', additionalProperties: { type: 'number' } },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['op', 'left', 'right', 'into'],
            properties: {
              op: { type: 'string', enum: ['add', 'sub', 'mul', 'div', 'pow'] },
              left: { type: 'string' },
              right: { type: 'string' },
              into: { type: 'string' },
            },
          },
        },
        expected: { type: 'number' },
        tolerance: { type: 'number' },
        unit: { type: ['string', 'null'] },
      },
    },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a response into a candidate, or throw.
 *
 * Throwing is the right failure here rather than returning something partial:
 * the pipeline treats a throw as "this slot did not produce a question" and
 * retries it. A half-built candidate would reach the verifier and be rejected
 * for the wrong reason, which is a worse diagnostic for the same outcome.
 */
export function toCandidate(
  spec: QuestionSpec,
  attempt: number,
  payload: unknown,
  model: string,
): CandidateQuestion {
  const parsed = extractJson(payload);

  const questionText = requireString(parsed, 'questionText');
  const fullSolution = requireString(parsed, 'fullSolution');
  const correctOption = requireOptionKey(parsed['correctOption']);

  const rawOptions = parsed['options'];
  if (!Array.isArray(rawOptions)) throw new Error('model returned no options array');

  const options: QuestionOption[] = rawOptions.map((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`option ${index} is not an object`);
    }
    const record = raw as Record<string, unknown>;
    return {
      key: requireOptionKey(record['key']),
      text: requireString(record, 'text'),
      /* An absent rationale is allowed through as empty; the verifier rejects it
         for the correct reason, with a message about distractor quality. */
      rationale: typeof record['rationale'] === 'string' ? record['rationale'] : '',
    };
  });

  const computation = parseComputation(parsed['computation']);

  return {
    candidateId: `${spec.specId}-a${attempt}`,
    spec,
    questionText,
    options,
    correctOption,
    fullSolution,
    generationSource: model,
    computation,
    /*
     * BUILT HERE, NOT ASKED OF THE MODEL. LAW 1 -- the model never draws. It
     * returns the question and the arithmetic; the figure is derived from that
     * arithmetic, so a model cannot put a quantity on screen that its own
     * question does not use, however it was prompted.
     */
    figure: figureFor(spec, computation),
  };
}

/** Pull the JSON out of a Messages response, or accept an already-parsed object. */
function extractJson(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('model returned a non-object response');
  }

  const record = payload as Record<string, unknown>;

  /* A proxy may hand back the parsed question directly. */
  if (typeof record['questionText'] === 'string') return record;

  const content = record['content'];
  if (!Array.isArray(content)) throw new Error('model response has no content blocks');

  /*
   * Text blocks only. Thinking blocks are also text-bearing and skipping them
   * by type is the difference between parsing the answer and parsing the
   * reasoning that led to it.
   */
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b['type'] !== 'text' || typeof b['text'] !== 'string') continue;

    try {
      const value: unknown = JSON.parse(b['text']);
      if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
    } catch {
      /* Not JSON. Keep looking rather than failing on the first prose block. */
    }
  }

  throw new Error('model response contained no parsable question JSON');
}

function parseComputation(raw: unknown): NumericComputation | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const inputs = record['inputs'];
  const steps = record['steps'];
  if (typeof inputs !== 'object' || inputs === null || !Array.isArray(steps)) return null;

  const numericInputs: Record<string, number> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'number' && Number.isFinite(value)) numericInputs[key] = value;
  }

  const parsedSteps = steps.flatMap((step): NumericStep[] => {
    if (typeof step !== 'object' || step === null) return [];
    const s = step as Record<string, unknown>;
    const op = s['op'];
    if (op !== 'add' && op !== 'sub' && op !== 'mul' && op !== 'div' && op !== 'pow') return [];
    if (typeof s['left'] !== 'string' || typeof s['right'] !== 'string') return [];
    if (typeof s['into'] !== 'string') return [];
    return [{ op, left: s['left'], right: s['right'], into: s['into'] }];
  });

  if (parsedSteps.length === 0) return null;

  const expected = record['expected'];
  if (typeof expected !== 'number' || !Number.isFinite(expected)) return null;

  const tolerance = record['tolerance'];

  return {
    inputs: numericInputs,
    steps: parsedSteps,
    expected,
    /* A missing tolerance means exact, which is the strict reading. */
    tolerance: typeof tolerance === 'number' && Number.isFinite(tolerance) ? tolerance : 0,
    unit: typeof record['unit'] === 'string' ? record['unit'] : null,
  };
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`model response is missing "${key}"`);
  }
  return value;
}

function requireOptionKey(value: unknown): OptionKey {
  /* `isOptionKey` is the declared guard and it NARROWS, which is what removes
     the `as OptionKey` this function used to need. Re-writing its body here
     bought a cast and a second copy of the rule; importing it costs neither. */
  if (typeof value !== 'string' || !isOptionKey(value)) {
    throw new Error(`model returned an option key that is not A-D: ${String(value)}`);
  }
  return value;
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '<unreadable body>';
  }
}
