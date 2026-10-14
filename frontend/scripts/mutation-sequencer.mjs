import { resolve } from 'node:path'
import { BaseSequencer } from 'vitest/node'

// Test the nearest source dependencies first. Once one assertion fails, Vitest
// can stop; surviving mutations still execute every selected test file.
export default class MutationSequencer extends BaseSequencer {
  async sort(files) {
    const order = new Map(JSON.parse(process.env.CANVAS_MUTATION_TEST_ORDER ?? '[]').map((file, index) => [resolve(file), index]))
    return [...files].sort((a, b) => (order.get(a.moduleId) ?? Infinity) - (order.get(b.moduleId) ?? Infinity) || a.moduleId.localeCompare(b.moduleId))
  }
}
