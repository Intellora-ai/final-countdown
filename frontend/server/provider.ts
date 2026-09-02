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
  /**
   * WHAT ONE CONCEPT MAY RESERVE FROM THIS VENDOR'S BUDGET.
   *
   * `max_tokens` IS A RESERVATION, NOT A MEASUREMENT -- `groq.ts` records the
   * whole argument and the headers it was measured from: a vendor DEDUCTS the
   * reservation at request time, so the reservation, not the usage, decides how
   * many lessons a day buys.
   *
   * ONE NUMBER FOR EVERY VENDOR WAS THE MISTAKE, and it is a subtle one because
   * the number itself was right. `CONCEPT_MAX_TOKENS` is 1400 because GEMINI
   * writes long -- at 1000 a full concept came back truncated. `gpt-oss` on
   * Groq has a measured worst case of 791 (272 thinking + 519 written at
   * `effort: low`), so every Groq request reserved 609 tokens it could never
   * use. A single constant has to be the maximum over all vendors, which means
   * every vendor but the longest-writing one overpays on every request.
   *
   * MEASURED, ON THIS ACCOUNT, TODAY:
   *
   *   tokens per day (TPD): Limit 200000, Used 199967, Requested 1473
   *
   * 1,473 per concept is ~135 lessons a day. At 1000 the same budget buys ~186.
   * That is the difference between a class getting through an afternoon and not.
   *
   * HONESTLY UNFINISHED, exactly as `groq.ts` says: Gemini's worst case is not
   * measured, because the free tier rate-limited the measurement. Its number
   * stays at the safe 1400 until `[model] reply hit the ceiling` says otherwise
   * -- that log line is the evidence to collect, and it prints
   * `completion_tokens` for precisely this.
   */
  readonly conceptTokens: number
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
    /*
     * GEMINI, FIRST, AND THROUGH ITS OPENAI-COMPATIBLE ENDPOINT.
     *
     * Google publishes one at `/v1beta/openai/`, which speaks the same
     * chat-completions shape as every other vendor here -- so it needs no new
     * client, no second retry policy and no second deadline. That is the whole
     * reason `groq.ts` was generalised.
     *
     * FIRST IN THE LIST because it is the most recently chosen key, which is
     * the ordering argument this file has always made: a key typed today beats
     * one exported in August. It also has by far the largest free daily budget
     * of the vendors here, which matters because Groq's 200,000 tokens per day
     * was measured exhausted in a single afternoon.
     *
     * `gemini-2.5-flash`, CHOSEN BY MEASUREMENT AND NOT BY REASONING.
     *
     * This shipped twice wrong first. `gemini-2.0-flash` was dead on arrival --
     * 404, "no longer available" -- so it was replaced with the alias
     * `gemini-flash-latest`, on the sound argument that a pinned version is a
     * default with an expiry date nobody writes down.
     *
     * Then the alias was measured, against a full-size request:
     *
     *   gemini-flash-latest    503 in 10.1s   (unserviceable)
     *   gemini-2.5-flash       200 in 1.25s
     *   gemini-2.5-flash-lite  200 in 0.99s
     *
     * And end to end, writing a real lesson through the whole pipeline:
     *
     *   gemini-2.5-flash       15-30s per lesson, with 429s on top
     *   gemini-2.5-flash-lite  6-10s per lesson
     *
     * A learner waits that difference on every question, and the gate refuses
     * anything the smaller model gets wrong -- so the cost of being wrong is a
     * retry and the cost of being slow is a child staring at a screen.
     *
     * The argument for the alias is still right in principle and wrong today: a
     * name that resolves to something overloaded is worse than a name that
     * resolves to something that answers. A default has to WORK first.
     *
     * `GEMINI_MODEL` still pins anything else without a code change, so moving
     * to the next flash when this one ages is a variable, not a release.
     *
     * Flash rather than pro: both the controller and the tutor need fast,
     * strict JSON, not depth.
     */
    keyVar: 'GEMINI_API_KEY',
    modelVar: 'GEMINI_MODEL',
    urlVar: 'GEMINI_BASE_URL',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash-lite',
    hint: '  GEMINI_API_KEY=AIza...               use Gemini (Google)',
    /* The unmeasured one. See `Vendor.conceptTokens`: 1000 truncated a real
       concept here, so this keeps the safe number until the ceiling log says
       what the true worst case is. */
    conceptTokens: 1400,
  },
  {
    keyVar: 'MOONSHOT_API_KEY',
    modelVar: 'MOONSHOT_MODEL',
    urlVar: 'MOONSHOT_BASE_URL',
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2-0905-preview',
    hint: '  MOONSHOT_API_KEY=sk-...             use Kimi (Moonshot AI)',
    /* Unmeasured from this machine, so it keeps the safe number. */
    conceptTokens: 1400,
  },
  {
    keyVar: 'ZAI_API_KEY',
    modelVar: 'ZAI_MODEL',
    urlVar: 'ZAI_BASE_URL',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4.6',
    hint: '  ZAI_API_KEY=...                     use GLM (Z.ai)',
    conceptTokens: 1400,
  },
  {
    /*
     * MISTRAL, AND IT IS DATA RATHER THAN A CLIENT.
     *
     * This file's whole argument is that an OpenAI-shaped vendor is a base URL
     * and a default model: "a vendor here is DATA -- a base URL and a default
     * model -- and never a second client". Mistral publishes exactly that shape
     * at `/v1`, so it needs no client, no second retry policy and no second
     * deadline. Six lines, not a file.
     *
     * ABOVE GROQ, BELOW Z.AI, on this file's own ordering rule: a key typed
     * today beats one exported in August, and this is one of the keys in hand
     * now. The Groq key below it was measured exhausted at `Used 199967` of
     * 200,000 per day.
     *
     * `mistral-large-latest` RATHER THAN A SMALL ONE, AND THIS IS A JUDGEMENT
     * NOT A MEASUREMENT -- said plainly because nothing here has been run
     * against a Mistral key. The measured lesson is that a weak model does not
     * fail loudly: `qwen2.5:7b` returned lessons that only ever survived as
     * SALVAGED, and a salvaged lesson is deliberately never shelved, so the
     * cache can never warm and every ask pays full price. Reaching for the
     * capable model first makes that failure less likely; `MISTRAL_MODEL` moves
     * it to a faster one without a code change if it turns out to be slow.
     *
     * `conceptTokens` STAYS AT THE SAFE 1400 for the same reason it does for
     * every unmeasured vendor: only `gpt-oss` has a measured worst case here.
     * The number to move when evidence arrives is this one, and the evidence is
     * the `[model] reply hit the ceiling` line.
     */
    keyVar: 'MISTRAL_API_KEY',
    modelVar: 'MISTRAL_MODEL',
    urlVar: 'MISTRAL_BASE_URL',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    hint: '  MISTRAL_API_KEY=...                 use Mistral',
    conceptTokens: 1400,
  },
  {
    keyVar: 'GROQ_API_KEY',
    modelVar: 'GROQ_MODEL',
    urlVar: 'GROQ_BASE_URL',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    hint: '  GROQ_API_KEY=gsk_...                use Groq (openai/gpt-oss-120b)',
    /* THE ONE THAT IS MEASURED. `groq.ts` records this model's real cost at
       `effort: low` -- 30-272 thinking, 325-519 written, largest total 791 --
       so 1000 clears the worst reply ever seen here and hands 400 tokens per
       request back to a 200,000-per-day budget measured exhausted at 199,967. */
    conceptTokens: 1000,
  },
  {
    keyVar: 'NVIDIA_API_KEY',
    modelVar: 'NVIDIA_MODEL',
    urlVar: 'NVIDIA_BASE_URL',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
    hint: '  NVIDIA_API_KEY=nvapi-...            use Nemotron (NVIDIA NIM)',
    conceptTokens: 1400,
  },
  {
    keyVar: 'DEEPSEEK_API_KEY',
    modelVar: 'DEEPSEEK_MODEL',
    urlVar: 'DEEPSEEK_BASE_URL',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: '  DEEPSEEK_API_KEY=sk-...             use DeepSeek',
    conceptTokens: 1400,
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
      /** What one concept may reserve here. See `Vendor.conceptTokens`. */
      conceptTokens: number
    }
  | { kind: 'ollama'; model: string; endpoint: string | undefined }

/**
 * An environment variable, or nothing. Blank and whitespace-only are unset.
 *
 * EXPORTED so `index.ts` reads a variable by exactly this rule rather than by a
 * second copy of it. What counts as "set" is a decision, and a decision kept in
 * two places is a decision that drifts.
 */
export function value(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * A local model for the controller DECISION alone. Measured 2026-09-02: the
 * verdict is a short JSON object that qwen2.5:7b returns in 1.4 s and
 * gemma3:12b in 11 s, while gemma is the one refused less when WRITING. Unset,
 * whichever model writes also decides.
 */
export function controllerModel(env: Record<string, string | undefined>): string | undefined {
  return value(env, 'OLLAMA_CONTROLLER_MODEL')
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

  /* THE LAPTOP AS THE ONLY RESORT. `OLLAMA_FALLBACK_MODEL` is the standby that
     sits behind every hosted vendor (see `index.ts standbysFor`), and it meant
     nothing at all without a hosted key in front of it -- so a clean checkout
     with a model already pulled and no key refused to start, while the one
     variable naming that model sat set. One variable, one meaning: the laptop
     answers when nothing else can. Behind the cloud when there is a cloud;
     alone when there is not. Read LAST, so a hosted key still wins. */
  const fallback = value(env, 'OLLAMA_FALLBACK_MODEL')
  if (fallback !== undefined) {
    return { kind: 'ollama', model: fallback, endpoint: value(env, 'OLLAMA_ENDPOINT') }
  }

  throw new Error(
    [
      'no model is configured, so no lesson can be written. Set one:',
      ...VENDORS.map((vendor) => vendor.hint),
      '  ANTHROPIC_API_KEY=sk-ant-...        use Anthropic',
      '  OLLAMA_MODEL=qwen2.5:7b             use a model running on this machine',
      '                                      (ollama serve, then ollama pull qwen2.5:7b)',
      '  OLLAMA_FALLBACK_MODEL=qwen2.5:7b    the same model as the last resort behind any key above',
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
    conceptTokens: vendor.conceptTokens,
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
