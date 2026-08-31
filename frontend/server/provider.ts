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
  | { kind: 'groq'; apiKey: string; model: string | undefined }
  | { kind: 'ollama'; model: string; endpoint: string | undefined }

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

  /* GROQ BEFORE ANTHROPIC, AND THE ORDER IS NOT ARBITRARY.
   *
   * The same argument as the local model above: the LATER a key can be sitting
   * exported in a shell without anyone thinking about it, the earlier the
   * deliberate choice has to win. A machine with both keys exported should use
   * the one whose name was typed most recently and most deliberately, and in
   * this project that is Groq -- it was added for a specific model, on purpose.
   *
   * Only ONE branch ever reads a credential. Whichever provider is chosen, the
   * other's key is never touched, so nothing can leak out of an environment
   * that happens to hold several. */
  const groqKey = value(env, 'GROQ_API_KEY')
  if (groqKey !== undefined) {
    return { kind: 'groq', apiKey: groqKey, model: value(env, 'GROQ_MODEL') }
  }

  const apiKey = value(env, 'ANTHROPIC_API_KEY')
  if (apiKey !== undefined) return { kind: 'anthropic', apiKey }

  throw new Error(
    [
      'no model is configured, so no lesson can be written. Set one:',
      '  GROQ_API_KEY=gsk_...                use Groq (openai/gpt-oss-120b)',
      '  GROQ_MODEL=<name>                   optional: a different Groq model',
      '  ANTHROPIC_API_KEY=sk-ant-...        use Anthropic',
      '  OLLAMA_MODEL=qwen2.5:7b             use a model running on this machine',
      '                                      (ollama serve, then ollama pull qwen2.5:7b)',
    ].join('\n'),
  )
}
