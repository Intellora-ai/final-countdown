/* Which model writes the lessons, and how that is decided.
 *
 * THE RULE: EXPLICIT, NEVER CLEVER.
 *   Setting `OLLAMA_MODEL` chooses the local model. Nothing else does. A server
 *   that silently fell back to a local model when a key was missing would be
 *   worse than one that refused: a student would be taught by a 3B model on a
 *   laptop while everyone believed the key was working.
 *
 *   And the reverse matters just as much. With `OLLAMA_MODEL` set, the API key
 *   is not required and is not read -- so nothing can leak from an environment
 *   that happens to have one.
 */

import { describe, expect, it } from 'vitest'
import { chooseProvider, hostedProviders } from './provider.ts'

describe('choosing a provider', () => {
  it('uses the local model when OLLAMA_MODEL names one', () => {
    expect(chooseProvider({ OLLAMA_MODEL: 'qwen2.5:7b' })).toEqual({
      kind: 'ollama', model: 'qwen2.5:7b', endpoint: undefined,
    })
  })

  it('passes a custom endpoint through, so the daemon can live elsewhere', () => {
    expect(chooseProvider({ OLLAMA_MODEL: 'm', OLLAMA_ENDPOINT: 'http://10.0.0.5:11434' })).toEqual({
      kind: 'ollama', model: 'm', endpoint: 'http://10.0.0.5:11434',
    })
  })

  it('uses Anthropic when a key is set and no local model is named', () => {
    expect(chooseProvider({ ANTHROPIC_API_KEY: 'sk-ant-x' })).toEqual({
      kind: 'anthropic', apiKey: 'sk-ant-x',
    })
  })

  it('prefers the LOCAL model when both are set, because it was named explicitly', () => {
    /* Naming a local model is a deliberate act; a key can be inherited from a
     * shell that has had one exported for months. The deliberate one wins. */
    expect(chooseProvider({ OLLAMA_MODEL: 'qwen2.5:7b', ANTHROPIC_API_KEY: 'sk-ant-x' }).kind)
      .toBe('ollama')
  })

  it('does NOT read the key at all when the local model is chosen', () => {
    /* Nothing can leak from an environment that happens to hold one. */
    const chosen = chooseProvider({ OLLAMA_MODEL: 'm', ANTHROPIC_API_KEY: 'sk-ant-SECRET-9999' })
    expect(JSON.stringify(chosen)).not.toContain('sk-ant-SECRET-9999')
  })

  it('refuses to start with neither, and says exactly what to do', () => {
    /* Never a silent fallback. A server that quietly used a 3B local model
     * because a key was missing would teach a student while everyone believed
     * the key was working. */
    expect(() => chooseProvider({})).toThrow(/ANTHROPIC_API_KEY/)
    expect(() => chooseProvider({})).toThrow(/OLLAMA_MODEL/)
  })

  it('treats an empty or blank value as absent', () => {
    for (const env of [{ OLLAMA_MODEL: '' }, { OLLAMA_MODEL: '   ' }, { ANTHROPIC_API_KEY: '' }]) {
      expect(() => chooseProvider(env), JSON.stringify(env)).toThrow()
    }
  })

  it('names the local model in the refusal, so the fix is one command', () => {
    let message = ''
    try { chooseProvider({}) } catch (error) { message = String(error) }
    expect(message).toMatch(/ollama/i)
  })
})

describe('a Gemini key is all it takes', () => {
  /* Google publishes an OpenAI-compatible endpoint, so Gemini needs no new
     client -- which is the entire reason `groq.ts` was generalised. */
  it('is chosen ahead of the others, and only its key is read', () => {
    const chosen = chooseProvider({
      GEMINI_API_KEY: 'AIza-test',
      GROQ_API_KEY: 'gsk_test',
      MOONSHOT_API_KEY: 'sk-test',
    })
    expect(chosen.kind).toBe('openai-compatible')
    if (chosen.kind === 'openai-compatible') {
      expect(chosen.vendor).toBe('gemini')
      expect(chosen.apiKey).toBe('AIza-test')
      expect(chosen.baseUrl).toContain('generativelanguage.googleapis.com')
      expect(chosen.model).toBe('gemini-2.5-flash-lite')
    }
  })

  it('takes a different model or endpoint without a code change', () => {
    const chosen = chooseProvider({
      GEMINI_API_KEY: 'AIza-test',
      GEMINI_MODEL: 'gemini-2.5-pro',
      GEMINI_BASE_URL: 'https://example.test/v1',
    })
    if (chosen.kind === 'openai-compatible') {
      expect(chosen.model).toBe('gemini-2.5-pro')
      expect(chosen.baseUrl).toBe('https://example.test/v1')
    }
  })

  it('is listed as a standby when another vendor is primary', () => {
    const all = hostedProviders({ MOONSHOT_API_KEY: 'sk-x', GEMINI_API_KEY: 'AIza-y' })
    expect(all.map((p) => p.vendor)).toEqual(['gemini', 'moonshot'])
  })
})

describe('the vendors a key can actually select', () => {
  /* A vendor is DATA in this file -- a base URL and a default model -- so the
     thing worth testing is that a key selects one, in the documented order,
     with the endpoint and model the table names. */
  it('builds a Mistral client from MISTRAL_API_KEY alone', () => {
    const built = hostedProviders({ MISTRAL_API_KEY: 'mk_test' })
    expect(built).toHaveLength(1)
    expect(built[0]?.vendor).toBe('mistral')
    expect(built[0]?.baseUrl).toBe('https://api.mistral.ai/v1')
    expect(built[0]?.model).toBe('mistral-large-latest')
    expect(built[0]?.keyVar, 'a failure would name the wrong variable').toBe('MISTRAL_API_KEY')
  })

  it('lets the endpoint and model be moved without a code change', () => {
    /* Every default here is overridable on purpose: none of these base URLs has
       been verified against a live endpoint from this machine, so a wrong one
       must be a variable and never a release. */
    const built = hostedProviders({
      MISTRAL_API_KEY: 'mk_test',
      MISTRAL_MODEL: 'mistral-small-latest',
      MISTRAL_BASE_URL: 'https://example.test/v1',
    })
    expect(built[0]?.model).toBe('mistral-small-latest')
    expect(built[0]?.baseUrl).toBe('https://example.test/v1')
  })

  it('keeps the documented order when several keys are held at once', () => {
    /* The three keys in hand today. Order decides who teaches on a healthy day,
       and `failover` walks this list as it stands. */
    const built = hostedProviders({
      GEMINI_API_KEY: 'g',
      ZAI_API_KEY: 'z',
      MISTRAL_API_KEY: 'm',
    })
    expect(built.map((one) => one.vendor)).toEqual(['gemini', 'zai', 'mistral'])
  })
})
