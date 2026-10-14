import { mergeConfig } from 'vitest/config'
import base from '../vitest.config.ts'
import MutationSequencer from './mutation-sequencer.mjs'

export default mergeConfig(base, { test: { sequence: { sequencer: MutationSequencer } } })
