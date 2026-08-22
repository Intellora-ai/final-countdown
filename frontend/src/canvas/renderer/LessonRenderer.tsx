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

/* THE CONTENT-BEARING ARRAYS every representation normalizes to. Checked by
 * name rather than by kind, so a new contract inherits the guard without
 * editing this file -- the same reason the registry keys renderers by string. */
const CONTENT_KEYS = ['rows', 'data', 'nodes', 'paragraphs', 'steps', 'events', 'items'] as const

/** Does this normalized payload carry anything a learner could read? */
function hasContent(normalized: unknown): boolean {
  if (!normalized || typeof normalized !== 'object') return false
  const o = normalized as Record<string, unknown>
  const present = CONTENT_KEYS.filter((k) => Array.isArray(o[k]))
  /* No content-bearing array at all means this representation does not measure
   * its content in items, so we cannot judge it empty and must not refuse it. */
  if (!present.length) return true
  return present.some((k) => (o[k] as unknown[]).length > 0)
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

  /* AN EMPTY SUBSTITUTE IS NOT A SUBSTITUTE.
   *
   * Found by rendering the real gas lesson in a browser after the jsdom tests
   * were already green. Its `graph` element is authored `data: []` -- the
   * author meant it driven by the lesson's `model`, and the chart contract has
   * no concept of model-driven data. Every hop then behaved correctly and
   * produced a lie: chart normalizes to zero points, `enoughPointsToPlot`
   * fails, `degrade()` hands over `rows: []`, the table contract validates it
   * happily, and every table invariant holds because every row of zero rows is
   * trivially reachable. The learner got a table with headers "T" and
   * "P (kPa)" and no body.
   *
   * A header with nothing under it reads as a real answer that happens to be
   * empty. There is no answer. Refuse, and let the invariant explain why. */
  if (!hasContent(dNormalized)) return null

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

/* THE GUTTER IS A CAPACITY DECISION, NOT A STYLE ONE.
 *
 * A twelve-column grid with a fixed `space.lg` gutter has eleven gaps, so it
 * spends 176px on gutters before it places a single pixel of content. On a
 * 320px phone the band measured 174px wide — less than the gutters alone — and
 * `1fr` cannot go negative, so every one of the twelve tracks resolved to
 * exactly 0px and each block became pure gutter: span 4 drew 48px, span 12 drew
 * 176px, two pixels WIDER than the band containing it.
 *
 * The fix is not a smaller font or a media query. It is to notice that a gutter
 * has to be affordable. This picks the largest gutter ON THE TOKEN SCALE whose
 * eleven copies claim no more than a third of the measured band, so at least
 * two thirds of the band always reaches content. Nothing here invents a value:
 * the ladder is `space`, and it is capped at `space.lg` so a wide desktop keeps
 * the exact gutter it has today rather than growing a new one.
 *
 * Ratio, not breakpoint, deliberately. The renderer already measures its own
 * container for capacity; asking that same number one more question is cheaper
 * and more honest than a second source of truth in a stylesheet that would
 * describe the WINDOW while the band is a box several paddings inside it. */
const GUTTER_LADDER = [space.lg, space.md, space.sm, space.xs] as const

/** Gutters may claim at most this fraction of the band. */
const GUTTER_SHARE = 3

function gutterFor(bandWidth: number): number {
  const budget = bandWidth / GUTTER_SHARE
  const gaps = GRID_COLUMNS - 1
  /* No affordable gutter means a band narrower than 132px. Butting the tracks
   * together is ugly; collapsing them to zero is broken. Prefer ugly. */
  return GUTTER_LADDER.find((g) => g * gaps <= budget) ?? space.none
}

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

  /* RESET ON WIDTH, NEVER ON HEIGHT. Height is an OUTPUT of the layout this
   * effect resets, so depending on it closes a feedback loop:
   *
   *   repair widens a block -> lesson grows taller -> measured height changes
   *   -> this effect fires -> rounds.current = 0 -> the repair budget is
   *   refunded -> repair runs again, forever.
   *
   * Observed at 320px on the gas lesson: `equation#law` and `chart#graph`
   * flipped 77x365 <-> 157x257 indefinitely, which is span 4 against
   * singleColumnFallback's span 8. The fallback made the blocks wide enough to
   * stop overflowing, so the next validation reverted it, so they overflowed
   * again. MAX_REPAIR_ROUNDS was supposed to cap exactly this and could not,
   * because its counter was being zeroed on every oscillation.
   *
   * Width is a genuine input -- capacity decisions are made from it -- and it
   * does not change as a consequence of the repair. */
  useLayoutEffect(() => {
    rounds.current = 0
    setOutcome(null)
  }, [lesson, effectiveViewport.width])

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

  /* The band is exactly as wide as this component's root, so the viewport the
   * renderer already resolved is the band width. Same precedence, same number,
   * one more question asked of it. */
  const gutter = gutterFor(effectiveViewport.width)

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
            gap: gutter,
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
            /* WHICH COMPONENT DREW THIS, stated in the DOM.
             *
             * A browser test that finds clipped content knows the block id and
             * the representation kind, and neither of those is a file. So every
             * Playwright annotation pointed at the SPEC LINE that noticed the
             * problem rather than the source that caused it: 49 annotations on
             * this branch, every one of them naming composed-renderer.spec.ts.
             * Finding the actual file meant reading the contract registry by
             * hand, every time.
             *
             * `rendererKey` is already resolved here and maps 1:1 to a file in
             * renderers.ts. Emitting it costs one attribute and lets the
             * reporter say ChartPanel.tsx instead of spec.ts:134. */
            data-renderer={r.rendererKey ?? 'none'}
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
