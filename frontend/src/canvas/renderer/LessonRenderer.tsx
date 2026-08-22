import React, { Suspense, lazy, useMemo } from 'react'
import type { Lesson, LessonElement, RepresentationContext } from '../contract/types'
import { select, contractFor } from '../contract/registry'
import { loaderFor, isRendererKey, type PanelProps } from './renderers'
import { color, type, space, radius, stroke, ink } from '../design/tokens'
import { selectArchetype, compositionFor, GRID_COLUMNS } from '../layout/archetypes'
import { contentMass, climbLadder } from '../layout/disclosure'

/* THE MISSING LAYER — root cause A.
 *
 * Everything either side of this file already existed. Contracts validated,
 * normalised, measured and derived; panels drew. Nothing joined them, so a
 * lesson could be fully understood by the engine and still render as nothing.
 * This is the join, and it is the ONLY place lesson data becomes a component.
 *
 * The pipeline, per element:
 *
 *   select()      which representation serves this content, and why
 *   normalize()   the canonical form, already done inside select
 *   capacity()    how much fits, in the representation's own units
 *   disclosure()  what changes when it does not fit -- never the styling
 *   derive()      the frontend decisions: alignment, ticks, marks, scales
 *   renderer      a KEY, resolved through the renderer map
 *
 * WHAT THIS FILE REFUSES TO DO is as important as what it does. It never reads
 * a component name from lesson data, never evaluates a string as JSX, and never
 * positions anything absolutely. A lesson names a KIND; the contract names a
 * renderer KEY; the map names a component. Three hops, each closed, so no
 * lesson can name a component that this build did not choose to register.
 *
 * PLACEMENT COMES FROM THE ARCHETYPE GRAMMAR. Until now this stacked blocks in
 * a column while the engine computed a composition and then ignored it — the
 * selector would decide PROCESS, log why, and the screen would show a stack
 * anyway. The grammar is now the thing that places, so what the engine decides
 * is what the learner sees.
 *
 * The density ladder runs first and may return a SIMPLER archetype than the
 * selector chose. That is not a fallback in the apologetic sense: a lesson with
 * more blocks than slots genuinely reads better in a plainer composition, and
 * the ladder logs which rung fired.
 *
 * Blocks past the last slot stack into fresh bands rather than piling into the
 * final one, which would recreate the overlap the layout validator exists to
 * refuse.
 */

export interface LessonRendererProps {
  lesson: Lesson
  viewport?: { width: number; height: number }
  /** Surfaces the decision trace. Off by default — this is a learner's screen. */
  explain?: boolean
}

interface Resolved {
  element: LessonElement
  kind: string | null
  rendererKey: string | null
  data: unknown
  derived: Record<string, unknown>
  disclosure?: PanelProps['disclosure']
  reason: string
  fallbackFrom?: string
}

function resolveElement(element: LessonElement, ctx: RepresentationContext): Resolved {
  const chosen = select(element, { ...ctx, element })

  if (!chosen.selected || chosen.normalized === undefined) {
    return {
      element, kind: null, rendererKey: null,
      data: null, derived: {}, reason: chosen.reason,
    }
  }

  const contract = contractFor(chosen.selected)!
  const normalized = chosen.normalized
  const context = { ...ctx, element }

  const plans = contract.disclosure(normalized, context)
  const derived = contract.derive(normalized, context) as Record<string, unknown>

  return {
    element,
    kind: chosen.selected,
    rendererKey: contract.renderer,
    data: normalized,
    derived,
    ...(plans[0] ? { disclosure: plans[0] } : {}),
    reason: chosen.reason,
    ...(chosen.fallbackFrom ? { fallbackFrom: chosen.fallbackFrom } : {}),
  }
}

/* One lazy component per key, created once. Rebuilding lazy() per render would
 * remount every panel on every parent update. */
const CACHE = new Map<string, React.LazyExoticComponent<React.ComponentType<PanelProps>>>()

function componentFor(key: string) {
  if (!CACHE.has(key)) {
    const load = loaderFor(key)
    if (!load) return null
    CACHE.set(key, lazy(load))
  }
  return CACHE.get(key)!
}

/* A block this build cannot draw becomes a VISIBLE placeholder. Rendering
 * nothing would leave a hole the learner cannot see and nobody can debug. */
function Unrenderable({ element, reason }: { element: LessonElement; reason: string }) {
  return (
    <div
      data-canvas="unrenderable"
      style={{
        border: `${stroke.hair}px dashed ${color.border}`,
        borderRadius: radius.md, padding: space.lg,
        background: color.surface,
      }}
    >
      <p style={{
        fontFamily: type.mono.family, fontSize: type.mono.size,
        color: color.warning, margin: 0,
      }}>
        {element.kind} · not renderable in this build
      </p>
      <p style={{
        fontFamily: type.body.family, fontSize: type.label.size,
        color: ink.axis, margin: 0, marginTop: space.xs,
      }}>
        {reason}
      </p>
    </div>
  )
}

export function LessonRenderer({ lesson, viewport, explain = false }: LessonRendererProps) {
  const ctx: RepresentationContext = useMemo(() => ({
    element: lesson.elements[0],
    lessonPurpose: lesson.question,
    sourceDataProfile: {},
    viewport: viewport ?? { width: 1200, height: 800 },
    availableRenderers: [],
    existingRelationships: lesson.relationships ?? [],
    accessibilityRequirements: {
      contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true,
    },
  }), [lesson, viewport])

  const resolved = useMemo(
    () => lesson.elements.map((e) => resolveElement(e, ctx)),
    [lesson, ctx],
  )

  /* The composition, decided the same way the gallery reports it. */
  const plan = useMemo(() => {
    const decision = selectArchetype(lesson.elements)
    const mass = contentMass(lesson.elements)
    const first = compositionFor(decision.archetype)
    const ladder = climbLadder(decision.archetype, mass, first.slots.length, lesson.elements.length)
    const composition = compositionFor(ladder.archetype)

    const placements = lesson.elements.map((e, i) => {
      const slot = composition.slots[Math.min(i, composition.slots.length - 1)]
      /* Past the last slot, stack into new bands rather than overlapping. */
      const band = i < composition.slots.length
        ? slot.band
        : slot.band + (i - composition.slots.length) + 1
      return { id: e.id, col: slot.col, span: slot.span, band }
    })

    const bands = [...new Set(placements.map((p) => p.band))].sort((a, b) => a - b)
    return { decision, ladder, composition, placements, bands }
  }, [lesson])

  const byId = new Map(resolved.map((r) => [r.element.id, r]))

  return (
    <div data-canvas="lesson" data-archetype={plan.ladder.archetype}
      style={{ display: 'flex', flexDirection: 'column', gap: space.xl }}>
      <h2 style={{
        fontFamily: type.display.family, fontSize: type.display.size,
        fontWeight: type.display.weight, letterSpacing: type.display.tracking,
        lineHeight: type.display.lineHeight, color: color.text, margin: 0,
      }}>
        {lesson.question}
      </h2>

      {explain && (
        <p data-canvas="composition" style={{
          fontFamily: type.mono.family, fontSize: type.mono.size,
          color: color.accent, margin: 0,
        }}>
          {plan.ladder.archetype} · {plan.decision.rule} · {plan.ladder.policy.density}
        </p>
      )}

      {plan.bands.map((band) => (
        <div
          key={band}
          data-canvas="band"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
            gap: space.lg,
            alignItems: 'start',
          }}
        >
      {plan.placements.filter((p) => p.band === band).map((p) => {
        const r = byId.get(p.id)!
        const Component = r.rendererKey && isRendererKey(r.rendererKey)
          ? componentFor(r.rendererKey)
          : null

        return (
          <section
            key={r.element.id}
            data-canvas="block"
            data-kind={r.kind ?? 'unknown'}
            style={{ gridColumn: `${p.col} / span ${p.span}`, minWidth: 0 }}
          >
            {Component ? (
              <Suspense fallback={<Skeleton />}>
                <Component
                  data={r.data}
                  derived={r.derived}
                  disclosure={r.disclosure}
                  title={r.element.title}
                />
              </Suspense>
            ) : (
              <Unrenderable element={r.element} reason={r.reason} />
            )}

            {explain && (
              <p style={{
                fontFamily: type.mono.family, fontSize: type.mono.size,
                color: ink.axis, margin: 0, marginTop: space.xs,
              }}>
                {r.fallbackFrom ? `${r.fallbackFrom} → ` : ''}{r.kind ?? 'none'} · {r.reason}
                {r.disclosure ? ` · ${r.disclosure.strategy}` : ''}
              </p>
            )}
          </section>
        )
      })}
        </div>
      ))}
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{
      height: space.h2, borderRadius: radius.md,
      background: color.surface,
      border: `${stroke.hair}px solid ${color.border}`,
    }} />
  )
}
