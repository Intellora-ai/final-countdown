import React, { Suspense, lazy, useMemo, useRef, useState, useLayoutEffect } from 'react'
import type { Lesson, LessonElement, RepresentationContext, Invariant } from '../contract/types'
import { select, contractFor } from '../contract/registry'
import { loaderFor, isRendererKey, type PanelProps } from './renderers'
import { color, type, space, radius, stroke, ink } from '../design/tokens'
import { selectArchetype, compositionFor, GRID_COLUMNS } from '../layout/archetypes'
import { contentMass, climbLadder } from '../layout/disclosure'
import {
  validateAndRepair, type LayoutFrame, type PlacedBlock, type ValidationOutcome,
} from '../layout/validate'
import { useElementSize, useBlockMeasurements, type BlockMeasurement } from './measure'

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
  /** Invariants this representation failed. Non-empty means: do not draw it. */
  violated?: Invariant[]
  /** Set when the declared representation was swapped for a safer one. */
  degradedFrom?: { kind: string; reason: string }
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

  /* INVARIANTS RUN HERE, IN THE RENDER PATH.
   *
   * Every contract has declared them since Step 2 and nothing ever called them
   * outside a unit test. The cost was visible on the gas lesson: its `graph`
   * element carries two points, chart fitness scores it 0.1, and
   * `enoughPointsToPlot` reports holds:false — and it rendered anyway, as a
   * confident two-point trend line. The contract knew the chart was dishonest
   * and the renderer never asked.
   *
   * A violated invariant is not a warning to log. It means this representation
   * cannot state this data truthfully, so the renderer must not draw it. */
  const invariants = contract.invariants(normalized, context)
  const violated = invariants.filter((i) => !i.holds)

  /* DEGRADE BEFORE REFUSING.
   *
   * `degradeIfNeeded` and every contract's `degrade()` have existed since
   * Step 2 with zero callers. The chart contract says in as many words that
   * fewer than three points "is a table, not a trend" and hands back a
   * fully-formed table payload. Nothing ever asked for it, so a two-point
   * chart could only ever draw a dishonest line or show a refusal box -- both
   * of which throw away an answer the contract was already holding.
   *
   * EXACTLY ONE HOP. The degraded representation is accepted or refused on its
   * own merits and is never itself degraded. If chart -> table and table ->
   * chart were both reachable, an unbounded loop would hang the render. */
  if (violated.length > 0) {
    const degraded = tryDegrade(contract, normalized, context, element)
    if (degraded) return degraded
  }

  const plans = contract.disclosure(normalized, context)
  const derived = contract.derive(normalized, context) as Record<string, unknown>

  return {
    element,
    kind: chosen.selected,
    rendererKey: contract.renderer,
    data: normalized,
    derived,
    violated,
    ...(plans[0] ? { disclosure: plans[0] } : {}),
    reason: chosen.reason,
    ...(chosen.fallbackFrom ? { fallbackFrom: chosen.fallbackFrom } : {}),
  }
}

/** One degradation hop, or null when there is nothing honest to fall back to. */
function tryDegrade(
  contract: NonNullable<ReturnType<typeof contractFor>>,
  normalized: unknown,
  context: RepresentationContext,
  element: LessonElement,
): Resolved | null {
  const plan = contract.degrade(normalized, context)
  if (!plan) return null

  const target = contractFor(plan.to)
  if (!target) return null

  /* The replacement payload is validated like any other. A contract handing
   * over a malformed payload must not bypass the checks every lesson faces. */
  const parsed = target.validate(plan.payload)
  if (!parsed.ok) return null

  const dNormalized = target.normalize(parsed.value, context)

  /* A degradation that is itself dishonest is not a fallback. If the
   * replacement fails its own invariants, refuse rather than swap one lie for
   * another. */
  const dViolated = target.invariants(dNormalized, context).filter((i) => !i.holds)
  if (dViolated.length > 0) return null

  const dPlans = target.disclosure(dNormalized, context)

  return {
    element,
    kind: target.kind,
    rendererKey: target.renderer,
    data: dNormalized,
    derived: target.derive(dNormalized, context) as Record<string, unknown>,
    violated: [],
    ...(dPlans[0] ? { disclosure: dPlans[0] } : {}),
    reason: plan.reason,
    degradedFrom: { kind: contract.kind, reason: plan.reason },
  }
}

/* A SUBSTITUTION THE LEARNER CAN SEE.
 *
 * Swapping a chart for a table silently would leave someone who expected a
 * chart wondering whether the lesson was authored wrong. The notice states
 * what changed and quotes the contract's own reason. */
function Degraded({
  from, to, reason, children,
}: { from: string; to: string; reason: string; children: React.ReactNode }) {
  return (
    <div data-canvas="degraded" data-degraded-from={from} data-degraded-to={to}>
      {children}
      <p role="status" style={{
        fontFamily: type.mono.family, fontSize: type.mono.size,
        color: ink.axis, margin: 0, marginTop: space.xs,
      }}>
        Shown as a {to} rather than a {from}. {reason}
      </p>
    </div>
  )
}

/* WHAT A LEARNER SEES WHEN A REPRESENTATION CANNOT BE HONEST.
 *
 * Not nothing, and not a plausible-looking chart. The block states which
 * invariant failed and in whose words, keeps the block's title so the lesson
 * still reads as a sequence, and stays inside the token system so a refusal
 * looks like part of the product rather than a crash. */
function InvariantRefusal({
  element, kind, violated,
}: { element: LessonElement; kind: string; violated: Invariant[] }) {
  return (
    <div
      data-canvas="invariant-refusal"
      data-kind={kind}
      data-violated={violated.map((v) => v.name).join(',')}
      role="status"
      style={{
        border: `${stroke.hair}px dashed ${color.border}`,
        borderRadius: radius.md, padding: space.lg, background: color.surface,
      }}
    >
      {element.title && (
        <h3 style={{
          fontFamily: type.title.family, fontSize: type.title.size,
          fontWeight: type.title.weight, letterSpacing: type.title.tracking,
          textTransform: 'uppercase', color: color.text, margin: 0, marginBottom: space.sm,
        }}>{element.title}</h3>
      )}
      <p style={{
        fontFamily: type.mono.family, fontSize: type.mono.size,
        color: color.warning, margin: 0,
      }}>
        Not shown as a {kind}: it would misstate the data.
      </p>
      <ul style={{
        fontFamily: type.body.family, fontSize: type.label.size,
        color: ink.axis, margin: 0, marginTop: space.xs, paddingLeft: space.lg,
      }}>
        {violated.map((v) => (
          <li key={v.name}>{v.detail ?? v.name}</li>
        ))}
      </ul>
    </div>
  )
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

/* THE FALLBACK VIEWPORT, and why it is small rather than comfortable.
 *
 * Before the first measurement lands there is genuinely no viewport to read.
 * The old code guessed 1200x800 — a wide desktop — so every capacity decision
 * on a phone was made for a screen four times its width, and the guess was
 * never corrected because nothing measured afterwards. Guessing SMALL is the
 * safe direction: a layout computed for 360px and then measured at 1440px
 * discloses less than it could for one frame, which is recoverable. The
 * reverse ships an overflowing frame. */
const UNMEASURED_VIEWPORT = { width: 360, height: 640 } as const

/* Measure -> validate -> repair -> re-measure can in principle oscillate if a
 * repair changes the geometry that triggered it. Two applied repairs is enough
 * for every fixture in the suite; beyond that the frame is held and reported
 * rather than allowed to loop in front of a learner. */
const MAX_REPAIR_ROUNDS = 2

export function LessonRenderer({ lesson, viewport, explain = false }: LessonRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const measuredSize = useElementSize(rootRef)
  const { register, measureAll } = useBlockMeasurements()

  /* Precedence: an explicit prop (a test, or an embedding that knows better),
   * then the real measured container, then the small safe guess. */
  const effectiveViewport = viewport ?? measuredSize ?? UNMEASURED_VIEWPORT
  const measurementSource: 'prop' | 'measured' | 'unmeasured' =
    viewport ? 'prop' : measuredSize ? 'measured' : 'unmeasured'

  const ctx: RepresentationContext = useMemo(() => ({
    element: lesson.elements[0],
    lessonPurpose: lesson.question,
    sourceDataProfile: {},
    viewport: effectiveViewport,
    availableRenderers: [],
    existingRelationships: lesson.relationships ?? [],
    accessibilityRequirements: {
      contrastRatio: 4.5, minTapTarget: 40, textAlternativeRequired: true,
    },
  }), [lesson, effectiveViewport])

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

    return { decision, ladder, composition, placements, mass }
  }, [lesson])

  /* ── the repair loop ──────────────────────────────────────────────────
   *
   * The proposed placement above is a PREDICTION. It becomes a frame only
   * after the DOM has been measured and the validator has had a say.
   *
   * BE PRECISE ABOUT WHAT THIS GUARANTEES, because the phrase "never paints a
   * failing frame" was previously in the codebase and was not true. A browser
   * cannot measure a box it has not laid out. What happens here is:
   * predict -> paint -> measure -> validate -> repair -> repaint. The repair
   * runs in useLayoutEffect, which fires after layout but BEFORE the browser
   * paints, so a repaired frame reaches the screen without the broken one
   * being visible. That is a real guarantee, and it is narrower than the one
   * the old comment claimed. */
  const [outcome, setOutcome] = useState<ValidationOutcome | null>(null)
  const rounds = useRef(0)

  useLayoutEffect(() => {
    rounds.current = 0
    setOutcome(null)
  }, [lesson, effectiveViewport.width, effectiveViewport.height])

  useLayoutEffect(() => {
    if (rounds.current >= MAX_REPAIR_ROUNDS) return

    const measured = measureAll()
    const active = outcome?.frame.blocks ?? plan.placements.map((p) => ({
      ...p, rows: 1, overflows: false,
    })) as PlacedBlock[]

    const blocks: PlacedBlock[] = active.map((p) => {
      const m: BlockMeasurement | undefined = measured[p.id]
      return {
        ...p,
        /* Measured, not assumed. These two fields were the constants
         * `rows: 3` and `overflows: false` that made the validator vacuous. */
        rows: m?.rows ?? p.rows ?? 1,
        overflows: m?.overflows ?? false,
        ...(m?.tapTarget !== undefined ? { tapTarget: m.tapTarget } : {}),
        ...(m?.truncatedLabel !== undefined
          ? { truncatedLabel: m.truncatedLabel, hasTooltip: m.hasTooltip }
          : {}),
      }
    })

    const frame: LayoutFrame = {
      archetype: outcome?.frame.archetype ?? plan.ladder.archetype,
      blocks,
      /* Relationships are the connectors the validator checks for orphans. */
      edges: (lesson.relationships ?? []).map((r) => ({ from: r.from, to: r.to })),
      mass: plan.mass,
    }

    const next = validateAndRepair(frame, lesson.elements.length)

    /* Only re-render when the repair actually changed the geometry. Without
     * this the measure -> setState -> measure cycle never settles. */
    const changed = !outcome
      || next.frame.archetype !== outcome.frame.archetype
      || next.frame.blocks.some((b, i) => {
        const prev = outcome.frame.blocks[i]
        return !prev || prev.col !== b.col || prev.span !== b.span || prev.band !== b.band
      })
      || next.passed !== outcome.passed

    if (changed) {
      rounds.current += 1
      setOutcome(next)
    }
  })

  const placements = outcome?.frame.blocks ?? plan.placements
  const archetype = outcome?.frame.archetype ?? plan.ladder.archetype
  const bands = [...new Set(placements.map((p) => p.band))].sort((a, b) => a - b)

  const failedChecks = (outcome?.checks ?? []).filter((c) => !c.holds)

  const byId = new Map(resolved.map((r) => [r.element.id, r]))

  return (
    <div ref={rootRef}
      data-canvas="lesson"
      data-archetype={archetype}
      /* The validator's verdict, on the element, so a browser test can assert
       * that validation actually ran rather than trusting that it did. */
      data-validated={outcome ? 'true' : 'pending'}
      data-validation-passed={outcome ? String(outcome.passed) : undefined}
      data-repairs={outcome ? String(outcome.repairs.length) : undefined}
      data-used-fallback={outcome ? String(outcome.usedFallback) : undefined}
      data-viewport-source={measurementSource}
      data-viewport-width={String(Math.round(effectiveViewport.width))}
      data-failed-checks={failedChecks.map((c) => c.name).join(',') || undefined}
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
          {archetype} · {plan.decision.rule} · {plan.ladder.policy.density}
          {outcome && outcome.repairs.length > 0 && (
            <> · repaired ×{outcome.repairs.length}: {outcome.repairs.map((x) => x.action).join(' ')}</>
          )}
          {failedChecks.length > 0 && (
            <> · unresolved: {failedChecks.map((c) => c.name).join(', ')}</>
          )}
        </p>
      )}

      {bands.map((band) => (
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
      {placements.filter((p) => p.band === band).map((p) => {
        const r = byId.get(p.id)!
        const Component = r.rendererKey && isRendererKey(r.rendererKey)
          ? componentFor(r.rendererKey)
          : null

        return (
          <section
            key={r.element.id}
            ref={(el) => register(r.element.id, el)}
            data-canvas="block"
            data-block-id={r.element.id}
            data-kind={r.kind ?? 'unknown'}
            style={{ gridColumn: `${p.col} / span ${p.span}`, minWidth: 0 }}
          >
            {r.violated && r.violated.length > 0 ? (
              /* The contract said this cannot be drawn honestly. That outranks
               * having a renderer available for it. */
              <InvariantRefusal element={r.element} kind={r.kind ?? 'unknown'} violated={r.violated} />
            ) : Component ? (
              r.degradedFrom ? (
                <Degraded
                  from={r.degradedFrom.kind}
                  to={r.kind ?? 'unknown'}
                  reason={r.degradedFrom.reason}
                >
                  <Suspense fallback={<Skeleton />}>
                    <Component data={r.data} derived={r.derived}
                      disclosure={r.disclosure} title={r.element.title} />
                  </Suspense>
                </Degraded>
              ) : (
                <Suspense fallback={<Skeleton />}>
                  <Component data={r.data} derived={r.derived}
                    disclosure={r.disclosure} title={r.element.title} />
                </Suspense>
              )
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
                {r.violated && r.violated.length > 0
                  ? ` · REFUSED: ${r.violated.map((v) => v.name).join(', ')}`
                  : ''}
                {r.degradedFrom ? ` · DEGRADED ${r.degradedFrom.kind} → ${r.kind}` : ''}
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
