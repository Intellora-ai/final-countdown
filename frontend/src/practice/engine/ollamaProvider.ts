import { briefFor, SCHEMA, SYSTEM, toCandidate } from './modelProvider';
import type { QuestionProvider } from './provider';
import type { CandidateQuestion, QuestionSpec } from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE GENERATOR SEAM, CONNECTED TO A MODEL THAT IS ACTUALLY RUNNING.
 *
 * `modelProvider.ts` has existed for months. It builds the brief, declares the
 * JSON schema, parses the reply and hands a candidate to the same pipeline
 * every other provider uses -- and it has never been given a live model.
 * Measured on this machine: Ollama serves ten of them on port 11434.
 *
 * WHY A SECOND PROVIDER RATHER THAN A FLAG ON THE FIRST
 * ----------------------------------------------------
 * The two speak different HTTP. Anthropic takes `messages` and returns content
 * blocks; Ollama takes `prompt` and returns `{ response: "<json string>" }`.
 * Threading both through one function puts a branch in every step and leaves a
 * request body that is correct for neither the next time somebody edits it.
 *
 * WHAT IS SHARED IS THE PART THAT MATTERS. `SYSTEM`, `SCHEMA` and `briefFor`
 * are imported, never copied. Two prompts for one job drift, and then a
 * question that passes on one model fails on the other for reasons invisible in
 * the diff.
 *
 * THE MODEL IS STILL NOT TRUSTED. Everything it returns goes through the same
 * verifier, the same boundary, and the same drift and solution-scope gates.
 * This changes WHO WRITES the question, not who decides whether it ships.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface OllamaOptions {
  /** Where Ollama is listening. Its own default port. */
  readonly endpoint?: string;
  readonly model?: string;
  /** Injected for tests. Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /**
   * Low by default, because this is not creative writing.
   *
   * A question has one correct answer and its arithmetic has to survive
   * recomputation. Sampling widely produces prettier sentences and more
   * questions the verifier throws away.
   */
  readonly temperature?: number;
}

const DEFAULT_ENDPOINT = 'http://localhost:11434/api/generate';
const DEFAULT_MODEL = 'qwen3:8b';

export function ollamaProvider(options: OllamaOptions = {}): QuestionProvider {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const model = options.model ?? DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch;

  return {
    name: `ollama:${model}`,

    async generate(
      spec: QuestionSpec,
      attempt: number,
      signal: AbortSignal,
    ): Promise<CandidateQuestion> {
      if (typeof doFetch !== 'function') {
        throw new Error('ollamaProvider: no fetch available in this environment');
      }

      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            system: SYSTEM,
            prompt: briefFor(spec, attempt),
            /*
             * `format` as an OBJECT makes Ollama constrain decoding to the
             * schema. Without it the model wraps its JSON in prose -- "Sure!
             * Here is a question..." -- and every reply fails to parse.
             */
            format: SCHEMA,
            /*
             * NOT A PREFERENCE. Streaming returns newline-delimited fragments,
             * and `response.json()` on that throws on the second line -- a
             * parse error a long way from its cause.
             */
            stream: false,
            options: { temperature: options.temperature ?? 0.2 },
          }),
        });
      } catch (cause) {
        /*
         * The most common failure by far, and the one a stack trace explains
         * worst: `fetch` to a closed port rejects with a bare "fetch failed",
         * which reads like a bug in this file rather than a server that is not
         * running.
         */
        throw new Error(
          `ollama did not answer at ${endpoint}. Is it running? Start it with \`ollama serve\`. (${
            cause instanceof Error ? cause.message : String(cause)
          })`,
        );
      }

      if (!response.ok) {
        const body = await safeText(response);
        throw new Error(`ollama returned ${response.status}: ${body}`);
      }

      const envelope = (await response.json()) as { response?: unknown };
      const raw = envelope.response;

      if (typeof raw !== 'string') {
        throw new Error('ollama returned no `response` field');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /*
         * A small model ignores the schema sometimes. The message has to say
         * THAT, and show what arrived, rather than surfacing a parse error from
         * three layers down with no context.
         */
        throw new Error(
          `ollama did not return JSON for ${spec.specId}. First 120 characters: ${raw.slice(0, 120)}`,
        );
      }

      return toCandidate(spec, attempt, parsed, `ollama:${model}`);
    },
  };
}

/** A body we could not read must not replace the status code with a new error. */
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return '(no body)';
  }
}
