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

/*
 * AN OPENAI-COMPATIBLE PROVIDER, AND WHY AMBIGUITY REFUSES INSTEAD OF PICKING.
 *
 * The lesson route returned 502 for a reason that had nothing to do with
 * teaching: the server accepted `ANTHROPIC_API_KEY` or `OLLAMA_MODEL` and
 * nothing else, so a Groq key -- the only working credential on this machine --
 * could not reach it at all. The frontend had a model; the server did not.
 *
 * The law being applied here, verbatim: no branch may produce a verdict it has
 * no evidence for, and a default arm is a guess wearing a decision's clothes.
 * Two keys set at once is exactly that case. Silently preferring one would mean
 * a student is taught by a model nobody chose, which is the same quiet
 * degradation this file already refuses for the local-vs-key case.
 *
 * So: local wins when named, because naming it is deliberate. Otherwise exactly
 * one key may be set. Two is not a tie to be broken -- it is a question only
 * the operator can answer, and it is asked rather than guessed.
 */
describe('an OpenAI-compatible provider', () => {
  it('is chosen from GROQ_API_KEY', () => {
    expect(chooseProvider({ GROQ_API_KEY: 'gsk-x' })).toEqual({
      kind: 'openai',
      apiKey: 'gsk-x',
      model: 'openai/gpt-oss-120b',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    })
  })

  it('takes the model and endpoint when they are named', () => {
    expect(
      chooseProvider({
        GROQ_API_KEY: 'gsk-x',
        GROQ_MODEL: 'qwen/qwen3.8-27b',
        GROQ_ENDPOINT: 'https://example.invalid/v1/chat/completions',
      }),
    ).toEqual({
      kind: 'openai',
      apiKey: 'gsk-x',
      model: 'qwen/qwen3.8-27b',
      endpoint: 'https://example.invalid/v1/chat/completions',
    })
  })

  it('still lets a named local model win, and does not read the key', () => {
    /* The rule this file already states: naming a local model is deliberate,
       and a key can sit exported in a shell for months. */
    const chosen = chooseProvider({ OLLAMA_MODEL: 'qwen2.5:7b', GROQ_API_KEY: 'gsk-SECRET' })
    expect(chosen.kind).toBe('ollama')
    expect(JSON.stringify(chosen)).not.toContain('SECRET')
  })

  it('refuses when two keys are set, instead of picking one', () => {
    /*
     * THE LOAD-BEARING CASE. A default arm here would teach a student with a
     * model nobody selected and report success -- a component that looks fine
     * while being wrong, which is the hardest class to find.
     */
    expect(() => chooseProvider({ GROQ_API_KEY: 'gsk-x', ANTHROPIC_API_KEY: 'sk-ant-y' })).toThrow(
      /GROQ_API_KEY.*ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*GROQ_API_KEY/s,
    )
  })

  it('names GROQ_API_KEY when nothing at all is configured', () => {
    /* The pair for the refusal above: the error has to be actionable, and an
       option the operator cannot discover is not an option. */
    expect(() => chooseProvider({})).toThrow(/GROQ_API_KEY/)
  })
})
