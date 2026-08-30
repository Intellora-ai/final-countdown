/* Which model writes the lessons.
 *
 * EXPLICIT, NEVER CLEVER.
 *   `OLLAMA_MODEL` chooses the local model. Nothing else does.
 *
 *   A server that silently fell back to a local model when the key was missing
 *   would be worse than one that refused: a student would be taught by a 3B
 *   model on a laptop while everyone believed the key was working. Quiet
 *   degradation is the failure this whole project keeps guarding against.
 *
 *   The reverse matters too. When the local model is chosen the API key is not
 *   read at all, so nothing can leak out of an environment that happens to
 *   hold one.
 */

export type Provider =
  | { kind: 'anthropic'; apiKey: string }
  | { kind: 'ollama'; model: string; endpoint: string | undefined }
  | { kind: 'openai'; apiKey: string; model: string; endpoint: string }

/** Where an OpenAI-compatible key points when nothing names somewhere else. */
export const DEFAULT_OPENAI_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/** The model used when a key is given and no model is named. */
export const DEFAULT_OPENAI_MODEL = 'openai/gpt-oss-120b'

function value(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

export function chooseProvider(env: Record<string, string | undefined>): Provider {
  const local = value(env, 'OLLAMA_MODEL')
  if (local !== undefined) {
    /* Naming a local model is a deliberate act. A key can sit exported in a
       shell for months, so the deliberate one wins -- and the key is not even
       read on this branch. */
    return { kind: 'ollama', model: local, endpoint: value(env, 'OLLAMA_ENDPOINT') }
  }

  /*
   * EXACTLY ONE KEY, AND TWO IS A QUESTION RATHER THAN A TIE.
   *
   * Preferring one silently would teach a student with a model nobody chose
   * and report success -- the same quiet degradation this file already refuses
   * between a local model and a key. A default arm is not a decision; it is a
   * guess wearing a decision's clothes, and it fails silently forever.
   *
   * So the ambiguous case is asked back, not resolved.
   */
  const openaiKey = value(env, 'GROQ_API_KEY')
  const anthropicKey = value(env, 'ANTHROPIC_API_KEY')

  if (openaiKey !== undefined && anthropicKey !== undefined) {
    throw new Error(
      [
        'GROQ_API_KEY and ANTHROPIC_API_KEY are both set, and this server will',
        'not choose between them. Unset one, or name a local model with',
        'OLLAMA_MODEL, which wins over either.',
      ].join(' '),
    )
  }

  if (openaiKey !== undefined) {
    return {
      kind: 'openai',
      apiKey: openaiKey,
      model: value(env, 'GROQ_MODEL') ?? DEFAULT_OPENAI_MODEL,
      endpoint: value(env, 'GROQ_ENDPOINT') ?? DEFAULT_OPENAI_ENDPOINT,
    }
  }

  if (anthropicKey !== undefined) return { kind: 'anthropic', apiKey: anthropicKey }

  throw new Error(
    [
      'no model is configured, so no lesson can be written. Set one:',
      '  GROQ_API_KEY=gsk-...                use Groq, or any OpenAI-compatible',
      '                                      endpoint via GROQ_ENDPOINT',
      '  ANTHROPIC_API_KEY=sk-ant-...        use Anthropic',
      '  OLLAMA_MODEL=qwen2.5:7b             use a model running on this machine',
      '                                      (ollama serve, then ollama pull qwen2.5:7b)',
    ].join('\n'),
  )
}
