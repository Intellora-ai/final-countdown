import { resolve } from 'node:path'

// Only the public model is cached. Student text and generated audio stay in memory.
export const VOICE_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
export const VOICE_REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231'
let model: Promise<import('kokoro-js').KokoroTTS> | undefined
function load() {
  model ??= (async () => {
    process.env.ORT_DISABLE_TELEMETRY = '1'
    const [{ KokoroTTS }, { StyleTextToSpeech2Model, AutoTokenizer, env }] = await Promise.all([import('kokoro-js'), import('@huggingface/transformers')])
    env.cacheDir = resolve(process.env.CANVAS_STATE_DIR ?? '.canvas-state', 'voice')
    const options = { revision: VOICE_REVISION }
    const [network, tokenizer] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained(VOICE_MODEL, { ...options, dtype: 'fp32', device: 'cpu', session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 } }),
      AutoTokenizer.from_pretrained(VOICE_MODEL, options),
    ])
    return new KokoroTTS(network, tokenizer)
  })().catch(error => { model = undefined; throw error })
  return model
}
// One inference at a time; a cancelled waiting turn never enters the model.
let tail: Promise<unknown> = Promise.resolve()
export function generateSpeech(text: string, signal: AbortSignal): Promise<Buffer> {
  const result = tail.catch(() => {}).then(async () => {
    signal.throwIfAborted()
    const tts = await load()
    signal.throwIfAborted()
    const audio = await tts.generate(text, { voice: 'af_heart' })
    signal.throwIfAborted()
    if (!audio.audio.length || audio.audio.length > audio.sampling_rate * 60 || !audio.audio.every(Number.isFinite)) throw new Error('Invalid generated audio')
    return Buffer.from(audio.toWav())
  })
  tail = result
  return result
}
