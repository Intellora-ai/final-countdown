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
 *
 * WHY FIVE HOSTED VENDORS SHARE ONE CLIENT.
 *   Groq, Moonshot (Kimi), Z.ai (GLM), DeepSeek and NVIDIA NIM all speak the
 *   OpenAI chat-completions shape -- same `messages`, same `max_tokens`, same
 *   `choices[0].message.content`, same 429. `groq.ts` already implements that
 *   shape, along with a retry policy, a whole-request deadline, an abort
 *   signal, transport-error handling and secret scrubbing. Every one of those
 *   was a real defect fixed in that file within the last day, and a second copy
 *   would be a second place for each of them to come back.
 *
 *   So a vendor here is DATA -- a base URL and a default model -- and never a
 *   second client. `openAiCompatible` below is the whole of what differs.
 */

export interface Vendor {
  /** The env var holding the key. Reading it is what selects this vendor. */
  readonly keyVar: string
  /** The env var that overrides the model, when someone wants a different one. */
  readonly modelVar: string
  /** The env var that overrides the endpoint, for a region or a proxy. */
  readonly urlVar: string
  /** Where its chat-completions live, when nothing overrides it. */
  readonly baseUrl: string
  /** What it is asked for when nothing overrides it. */
  readonly model: string
  /** Shown in the "no model is configured" message, so setup is one line. */
  readonly hint: string
}

/**
 * The hosted vendors, in the order they are tried.
 *
 * THE ORDER IS THE SAME ARGUMENT `chooseProvider` HAS ALWAYS MADE: the later a
 * key can sit exported in a shell without anyone thinking about it, the earlier
 * a deliberate choice has to win. A key typed today beats one exported in
 * August.
 *
 * KIMI AND GLM BEFORE GROQ, ON PURPOSE. Groq's free tier is 200000 tokens per
 * DAY and was measured exhausted at 199591 during a single afternoon of
 * testing, which stopped every lesson. A machine that has been given a newer
 * key should use it rather than fail against a spent one.
 *
 * NEMOTRON AND DEEPSEEK ARE HERE AND LAST, as the fallback tier -- reachable
 * the moment a key exists, ahead of nothing, so adding one is setting a
 * variable rather than shipping a change.
 *
 * THE BASE URLS ARE DEFAULTS AND EVERY ONE IS OVERRIDABLE. They are each
 * vendors' documented OpenAI-compatible paths as known here, and NONE of them
 * has been verified against a live endpoint from this machine -- there is no
 * key for any of them to test with. `<NAME>_BASE_URL` exists precisely so a
 * wrong default is a one-line fix and never a code change, and
 * `completionsUrl` in `groq.ts` accepts either `/v1` or the full path so both
 * forms of what a vendor's docs print will work.
 */
export const VENDORS: readonly Vendor[] = [
  {
    keyVar: 'MOONSHOT_API_KEY',
    modelVar: 'MOONSHOT_MODEL',
    urlVar: 'MOONSHOT_BASE_URL',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2-0905-preview',
    hint: '  MOONSHOT_API_KEY=sk-...             use Kimi (Moonshot AI)',
  },
  {
    keyVar: 'ZAI_API_KEY',
    modelVar: 'ZAI_MODEL',
    urlVar: 'ZAI_BASE_URL',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4.6',
    hint: '  ZAI_API_KEY=...                     use GLM (Z.ai)',
  },
  {
    keyVar: 'GROQ_API_KEY',
    modelVar: 'GROQ_MODEL',
    urlVar: 'GROQ_BASE_URL',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    hint: '  GROQ_API_KEY=gsk_...                use Groq (openai/gpt-oss-120b)',
  },
  {
    keyVar: 'NVIDIA_API_KEY',
    modelVar: 'NVIDIA_MODEL',
    urlVar: 'NVIDIA_BASE_URL',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    hint: '  NVIDIA_API_KEY=nvapi-...            use Nemotron (NVIDIA NIM)',
  },
  {
    keyVar: 'DEEPSEEK_API_KEY',
    modelVar: 'DEEPSEEK_MODEL',
    urlVar: 'DEEPSEEK_BASE_URL',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '  DEEPSEEK_API_KEY=sk-...             use DeepSeek',
  },
]

/**
 * The hosted kind, named so a list of them has a type.
 *
 * `hostedProviders` returns only these -- Anthropic and Ollama are different
 * clients with different request shapes and cannot stand in for each other --
 * and a caller building one client per entry needs to see `apiKey`, `model` and
 * `baseUrl` without narrowing the union at every use.
 */
export type OpenAiCompatible = Extract<Provider, { kind: 'openai-compatible' }>

export type Provider =
  | { kind: 'anthropic'; apiKey: string }
  | {
      /*
       * ONE KIND FOR EVERY OPENAI-SHAPED VENDOR.
       *
       * `vendor` is carried so a log line, an error and a startup banner can
       * name WHICH one answered. A shared kind that could not say who it was
       * would make "the model could not be reached" unattributable across five
       * hosts, which is the same blindness `handler.ts:428` cost a whole day.
       */
      kind: 'openai-compatible'
      vendor: string
      /**
       * THE VARIABLE THE OPERATOR ACTUALLY SET, carried so a failure can name
       * it. `createGroqModel` refuses a blank key with a message naming an env
       * var, and it named `GROQ_API_KEY` for all five hosts -- so a Moonshot
       * key that trimmed to empty stopped the server pointing at a variable
       * nobody had touched. The vendor is not derivable from the model name and
       * must not be guessed from `vendor` by re-casing it: a name that round
       * trips today is a name that silently stops round tripping when the sixth
       * vendor is added.
       */
      keyVar: string
      apiKey: string
      model: string
      baseUrl: string
    }
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
       shell for months, so the deliberate one wins -- and no key is even read
       on this branch. */
    return { kind: 'ollama', model: local, endpoint: value(env, 'OLLAMA_ENDPOINT') }
  }

  /*
   * THE FIRST VENDOR WITH A KEY WINS, AND ONLY ITS KEY IS EVER READ.
   *
   * The loop stops at the first match, so on a machine holding four keys the
   * other three are never touched -- nothing can leak out of an environment
   * that happens to hold several, which is the property the hand-written
   * branches had and which a loop must not lose.
   */
  /*
   * FIRST MATCH WINS, AND THE LOSERS' KEYS ARE NEVER READ.
   *
   * This briefly delegated to `hostedProviders(env)[0]` to remove a duplicated
   * constructor, and that quietly withdrew the guarantee stated three times in
   * this file: `hostedProviders` reads EVERY key in order to build a list, so
   * answering "which provider is configured" pulled four credentials it had no
   * use for into memory.
   *
   * `providerFrom` is the shared constructor instead, so there is still exactly
   * one place the shape is built -- and the loop stops at the first vendor with
   * a key, so on a machine holding five, four are never touched.
   */
  for (const vendor of VENDORS) {
    const hosted = providerFrom(env, vendor)
    if (hosted !== undefined) return hosted
  }

  const apiKey = value(env, 'ANTHROPIC_API_KEY')
  if (apiKey !== undefined) return { kind: 'anthropic', apiKey }

  throw new Error(
    [
      'no model is configured, so no lesson can be written. Set one:',
      ...VENDORS.map((vendor) => vendor.hint),
      '  ANTHROPIC_API_KEY=sk-ant-...        use Anthropic',
      '  OLLAMA_MODEL=qwen2.5:7b             use a model running on this machine',
      '                                      (ollama serve, then ollama pull qwen2.5:7b)',
      '',
      'Each hosted vendor also takes <NAME>_MODEL and <NAME>_BASE_URL, so a',
      'different model or a regional endpoint needs no code change.',
    ].join('\n'),
  )
}

/**
 * EVERY HOSTED VENDOR THE OPERATOR CONFIGURED, IN THE ORDER THEY ARE TRIED.
 *
 * `chooseProvider` returns ONE and stops, which is right when the question is
 * "who writes the lesson". It is wrong when the question is "what happens when
 * that one says no" -- and it does say no. MEASURED on this machine: Groq's
 * free tier is 200,000 tokens per DAY, and the account reached
 * `Used 198032, Requested 2950` in an afternoon. From that moment the product
 * could not teach at all, with four other vendors sitting unconfigured beside
 * it and no way for a second key to help even if one existed.
 *
 * THE ONE-CREDENTIAL PROPERTY, AND WHAT REPLACES IT. `chooseProvider` promises
 * that only the winner's key is ever read, so "nothing can leak out of an
 * environment that happens to hold several". That promise cannot survive a
 * feature whose whole purpose is to use several, so it is replaced by a
 * narrower one that is still worth having: a key is read only when the operator
 * set THAT vendor's variable, and it is only ever sent to THAT vendor's base
 * URL -- `createGroqModel` is constructed per vendor with its own key and its
 * own host, and no key is ever held by more than one client. An operator who
 * wants the old behaviour sets one variable, which is what they already do.
 *
 * ANTHROPIC AND OLLAMA ARE NOT HERE. They are different clients with different
 * request shapes; this is the list of hosts that speak one shape and can
 * therefore stand in for each other. `chooseProvider` still owns the choice
 * between the three kinds.
 */
/**
 * ONE VENDOR, READ ONLY IF ITS OWN VARIABLE IS SET.
 *
 * The single place the hosted shape is constructed. `chooseProvider` and
 * `hostedProviders` both call it, so the `vendor` derivation, the `keyVar` and
 * the two defaults exist once and cannot drift into two readings of the same
 * environment.
 *
 * READS EXACTLY ONE CREDENTIAL, and never before it knows it needs it. That is
 * what lets `chooseProvider` keep the promise this file makes three times over:
 * "Only ONE branch ever reads a credential ... nothing can leak out of an
 * environment that happens to hold several."
 */
function providerFrom(
  env: Record<string, string | undefined>,
  vendor: Vendor,
): OpenAiCompatible | undefined {
  const apiKey = value(env, vendor.keyVar)
  if (apiKey === undefined) return undefined
  return {
    kind: 'openai-compatible',
    vendor: vendor.keyVar.replace(/_API_KEY$/, '').toLowerCase(),
    keyVar: vendor.keyVar,
    apiKey,
    model: value(env, vendor.modelVar) ?? vendor.model,
    baseUrl: value(env, vendor.urlVar) ?? vendor.baseUrl,
  }
}

/**
 * EVERY configured hosted vendor. Only `failover` needs this.
 *
 * It reads every key that is set, which is the point -- a standby with no key
 * read is a standby that cannot answer. `chooseProvider` deliberately does NOT
 * use it, so asking which provider is configured still touches one credential.
 */
export function hostedProviders(
  env: Record<string, string | undefined>,
): readonly OpenAiCompatible[] {
  const out: OpenAiCompatible[] = []
  for (const vendor of VENDORS) {
    const one = providerFrom(env, vendor)
    if (one !== undefined) out.push(one)
  }
  return out
}
