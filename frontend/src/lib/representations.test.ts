/* CS-5 / DOD-4 — every representation declares what it explains AND what it cannot.
 *
 * The interesting assertions are the negative ones. Anyone can register an
 * object with a `purpose` string; the registry earns its place by refusing an
 * empty one, by refusing to let a caller overclaim, and by using
 * `cannotExplain` to choose what the board offers next.
 */

import { describe, it, expect } from 'vitest'
import { RepresentationRegistry, CLAIM, type RepresentationDefinition } from './representations'

const GRAPH: RepresentationDefinition = {
  representationId: 'pt-graph',
  name: 'Pressure vs temperature',
  renderer: 'svg',
  purpose: 'show that pressure rises in proportion to temperature at fixed volume',
  explains: [CLAIM.correlation, CLAIM.magnitude],
  cannotExplain: [CLAIM.mechanism, CLAIM.particleMotion],
  misconceptionRisk: ['a straight line looks like a cause'],
  requiredData: ['temperature', 'pressure'],
  supportedZoomLevels: [1, 2],
  supportsInteraction: true,
  supportsAnimation: false,
}

const SIM: RepresentationDefinition = {
  representationId: 'particle-sim',
  name: 'Particle simulation',
  renderer: 'pixi',
  purpose: 'show the collisions that produce pressure',
  explains: [CLAIM.mechanism, CLAIM.particleMotion],
  cannotExplain: [CLAIM.algebraicForm],
  requiredData: ['temperature'],
  supportedZoomLevels: [2, 3],
  supportsInteraction: true,
  supportsAnimation: true,
}

const EQUATION: RepresentationDefinition = {
  representationId: 'ideal-gas',
  name: 'PV = nRT',
  renderer: 'katex',
  purpose: 'state the exact relationship between the four quantities',
  explains: [CLAIM.algebraicForm],
  cannotExplain: [CLAIM.mechanism],
  requiredData: ['temperature', 'pressure', 'volume'],
  supportedZoomLevels: [2, 3],
  supportsInteraction: false,
  supportsAnimation: false,
}

const filled = () => {
  const r = new RepresentationRegistry()
  r.register(GRAPH)
  r.register(SIM)
  r.register(EQUATION)
  return r
}

describe('CS-5 representation registry', () => {
  it('refuses to register a representation with an empty purpose', () => {
    const r = new RepresentationRegistry()
    expect(() => r.register({ ...GRAPH, purpose: '   ' })).toThrow(/purpose is empty/i)
    expect(() => r.register({ ...GRAPH, explains: [] })).toThrow(/explains/)
    expect(r.all()).toHaveLength(0)
  })

  it('refuses a duplicate id rather than silently replacing a live definition', () => {
    const r = filled()
    expect(() => r.register(GRAPH)).toThrow(/already registered/)
  })

  it('offers the alternative that covers what the current one cannot explain', () => {
    // This is the whole mechanism behind "show me another way": the graph
    // declares it cannot explain mechanism, so the simulation ranks first —
    // not because someone hard-coded that order, but because it is the one
    // that answers the gap.
    const r = filled()
    const data = ['temperature', 'pressure', 'volume']
    const ranked = r.alternativesFor('pt-graph', data).map((d) => d.representationId)
    expect(ranked[0]).toBe('particle-sim')
    expect(ranked).not.toContain('pt-graph')
  })

  it('hides a representation whose required data this concept has not defined', () => {
    const r = filled()
    // Only temperature is available: the equation needs pressure and volume.
    const ids = r.availableWith(['temperature']).map((d) => d.representationId)
    expect(ids).toContain('particle-sim')
    expect(ids).not.toContain('ideal-gas')
  })

  it('explains a refusal and names the nearest real alternative, never a generic fallback', () => {
    const r = filled()
    const missing = r.request('timeline', ['temperature'], 'pt-graph')
    expect(missing.ok).toBe(false)
    expect(missing.reason).toContain('timeline')
    expect(missing.nearest?.representationId).toBe('particle-sim')

    const underfed = r.request('ideal-gas', ['temperature'], 'pt-graph')
    expect(underfed.ok).toBe(false)
    expect(underfed.reason).toContain('pressure')
    expect(underfed.reason).toContain('volume')
    expect(underfed.nearest?.representationId).toBe('particle-sim')
  })

  it('succeeds when the data is there', () => {
    const r = filled()
    const ok = r.request('ideal-gas', ['temperature', 'pressure', 'volume'])
    expect(ok.ok).toBe(true)
    expect(ok.definition?.name).toBe('PV = nRT')
  })

  it('will not let the board claim a representation explains what it declared it cannot', () => {
    const r = filled()
    expect(() => r.assertCanClaim('pt-graph', CLAIM.mechanism)).toThrow(/cannot explain/)
    expect(() => r.assertCanClaim('pt-graph', CLAIM.correlation)).not.toThrow()
    expect(() => r.assertCanClaim('nope', CLAIM.correlation)).toThrow(/unknown representation/)
  })

  it('gives every registered representation a non-empty purpose — acceptance test T7', () => {
    const r = filled()
    expect(r.all()).toHaveLength(3)
    for (const d of r.all()) {
      expect(d.purpose.trim().length).toBeGreaterThan(0)
      expect(d.explains.length).toBeGreaterThan(0)
      expect(Array.isArray(d.cannotExplain)).toBe(true)
    }
  })
})
