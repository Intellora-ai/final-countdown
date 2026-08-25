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
import { chooseProvider } from './provider.ts'

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
