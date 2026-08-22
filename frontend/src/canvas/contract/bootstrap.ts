import { register, registeredKinds } from './registry'
import { textContract } from './representations/text'
import { tableContract } from './representations/table'
import { chartContract } from './representations/chart'
import { diagramContract } from './representations/diagram'
import { equationContract } from './representations/equation'

/* REGISTRATION, IN ONE PLACE AND ONCE.
 *
 * The registry throws on a duplicate kind, deliberately: two contracts for one
 * kind makes the selector's answer depend on import order, which is a bug that
 * only shows up in production. That means registration cannot happen as an
 * import side-effect scattered across modules -- it has to be a call somebody
 * makes, exactly once, at a place you can point at.
 *
 * Idempotent because React StrictMode double-invokes effects in development,
 * and a renderer that crashed on the second mount would be a development-only
 * failure, which is the worst kind to debug.
 */
let done = false

export function registerRepresentations(): void {
  if (done) return
  register(textContract)
  register(tableContract)
  register(chartContract)
  register(diagramContract)
  register(equationContract)
  done = true
}

/** Test seam — lets a suite re-register after resetRegistry(). */
export function resetBootstrap(): void {
  done = false
}

export function registeredRepresentations(): string[] {
  return registeredKinds()
}
