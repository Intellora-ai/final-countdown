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
  | { kind: 'groq'; apiKey: string; model: string }
  | { kind: 'gemini'; apiKey: string; model: string }
  | { kind: 'ollama'; model: string; endpoint: string | undefined }

/**
 * The model Groq serves when none is named.
 *
 * A 120B open model, which is the point of this provider existing: a student's
 * laptop can run a 3B model locally and cannot run this one, and a lesson
 * written by a 3B model is visibly a lesson written by a 3B model. Naming a
 * default here rather than requiring GROQ_MODEL means one environment variable
 * is enough to get a good lesson, and the variable is still there for anyone
 * who wants a cheaper or faster one.
 */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'

/**
 * Gemini, reached through Google's OPENAI-COMPATIBLE surface.
 *
 * Not a third client. Google serves `/v1beta/openai/chat/completions` with the
 * same request and response shape Groq uses, so `createGroqModel` talks to it
 * unchanged and only the base URL and the key differ. Writing a second
 * transport for an identical protocol is how two providers drift apart.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai'

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

  /* Groq before Anthropic, and the order is arbitrary only in the sense that
     both are keys. What is NOT arbitrary: whichever is checked first must be
     the one a reader can predict, so it is written down here rather than left
     to the order two branches happen to sit in. Set both and Groq wins. */
  const groqKey = value(env, 'GROQ_API_KEY')
  if (groqKey !== undefined) {
    return {
      kind: 'groq',
      apiKey: groqKey,
      model: value(env, 'GROQ_MODEL') ?? DEFAULT_GROQ_MODEL,
    }
  }

  const googleKey = value(env, 'GOOGLE_API_KEY')
  if (googleKey !== undefined) {
    return {
      kind: 'gemini',
      apiKey: googleKey,
      model: value(env, 'GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL,
    }
  }

  const apiKey = value(env, 'ANTHROPIC_API_KEY')
  if (apiKey !== undefined) return { kind: 'anthropic', apiKey }

  throw new Error(
    [
      'no model is configured, so no lesson can be written. Set one:',
      '  GROQ_API_KEY=gsk_...                use Groq (default model ' + DEFAULT_GROQ_MODEL + ')',
      '  GOOGLE_API_KEY=AIza...              use Gemini (default model ' + DEFAULT_GEMINI_MODEL + ')',
      '  ANTHROPIC_API_KEY=sk-ant-...        use Anthropic',
      '  OLLAMA_MODEL=qwen2.5:7b             use a model running on this machine',
      '                                      (ollama serve, then ollama pull qwen2.5:7b)',
    ].join('\n'),
  )
}
