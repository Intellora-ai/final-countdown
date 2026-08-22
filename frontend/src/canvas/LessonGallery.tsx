import React, { useRef, useState } from 'react'
import './scene.css'
import { color, ink, overlay, space, type, radius, stroke, accentAlpha } from './design/tokens'
import { cssVariables } from './design/generateCss'
import { ACCEPTANCE_LESSONS } from './lessons/acceptance'
import { financialCrisis } from './lessons/demo'
import { selectArchetype, compositionFor, GRID_COLUMNS } from './layout/archetypes'
import { contentMass, climbLadder } from './layout/disclosure'
import { checkFrame, type LayoutFrame, type PlacedBlock } from './layout/validate'
import { LessonRenderer } from './renderer/LessonRenderer'
import { useElementSize } from './renderer/measure'
import { registerRepresentations } from './contract/bootstrap'

/* THE ENGINE, MADE VISIBLE.
 *
 * Everything since Step 2 has been machinery with no pixels: contracts,
 * archetypes, a density policy, a validator. This page is how that machinery
 * gets looked at rather than taken on trust — seven lessons composed by the
 * real selector, laid out on the real grid, checked by the real validator.
 *
 * It renders the SLOTS rather than finished panels, deliberately. The claim
 * under inspection is compositional: that seven semantic profiles produce
 * different shapes while sharing one design language. Filling each slot with a
 * real panel would make that harder to see, not easier, and those panels are
 * Step 6 and Step 7's work.
 *
 * Every value here comes from the token layer. There is no hex in this file,
 * which is the same rule every other component in the canvas follows.
 */

function frameFor(lesson: (typeof ACCEPTANCE_LESSONS)[number]): {
  decision: ReturnType<typeof selectArchetype>
  frame: LayoutFrame
  ladder: ReturnType<typeof climbLadder>
  ok: boolean
} {
  const decision = selectArchetype(lesson.elements as never)
  const comp = compositionFor(decision.archetype)
  const mass = contentMass(lesson.elements as never)
  const ladder = climbLadder(decision.archetype, mass, comp.slots.length, lesson.elements.length)
  const final = compositionFor(ladder.archetype)

  const blocks: PlacedBlock[] = lesson.elements.map((e, i) => {
    const slot = final.slots[Math.min(i, final.slots.length - 1)]
    const band = i < final.slots.length ? slot.band : slot.band + (i - final.slots.length) + 1
    return { id: e.id, col: slot.col, span: slot.span, band, rows: 3, overflows: false }
  })

  const frame: LayoutFrame = { archetype: ladder.archetype, blocks, edges: [], mass }
  return { decision, frame, ladder, ok: checkFrame(frame).every((c) => c.holds) }
}

/* CHROME IS A BUDGET, NOT A CONSTANT.
 *
 * This page wrapped every lesson in two paddings chosen for a desktop: 48px of
 * page gutter and 24px of panel gutter, on both sides. On a 1440px screen that
 * is 146 of 1440 pixels — 10%, and invisible. On a 320px phone it is 146 of 320
 * pixels: 46% of the screen spent on emptiness before a single word is placed,
 * and the 174px that survived was too narrow for the grid's own gutters, so
 * every column collapsed to zero. The frame was not merely cramped; it was
 * arithmetically impossible.
 *
 * So the page chooses the largest padding pair ON THE TOKEN SCALE that keeps
 * total chrome inside a quarter of the measured screen. Every value below is a
 * `space` token — the scale shrinks, it is never stepped off. Above 576px the
 * top rung is affordable and the page renders exactly as it does today. */
const CHROME_LADDER = [
  { page: space.h1, panel: space.xl },
  { page: space.xl, panel: space.lg },
  { page: space.lg, panel: space.md },
  { page: space.md, panel: space.sm },
  { page: space.sm, panel: space.xs },
] as const

/** Page + panel gutters may claim at most this fraction of the screen. */
const CHROME_SHARE = 4

/* Mirrors UNMEASURED_VIEWPORT in the renderer, and for the same reason: before
 * the first measurement lands there is no width to read, and guessing SMALL is
 * the recoverable direction. A narrow guess corrected to a wide screen loosens
 * the padding a frame later; a wide guess on a phone paints the broken frame
 * this fix exists to remove. */
const UNMEASURED_WIDTH = 360

function chromeFor(width: number): (typeof CHROME_LADDER)[number] {
  const budget = width / CHROME_SHARE
  return CHROME_LADDER.find((c) => (c.page + c.panel) * 2 <= budget)
    ?? CHROME_LADDER[CHROME_LADDER.length - 1]!
}

export function LessonGallery() {
  const [open, setOpen] = useState<string | null>(null)

  /* `.scene` is `position: fixed; inset: 0`, so its width IS the screen and
   * cannot be pushed around by the content inside it — measuring it here
   * cannot feed back into the padding it decides. */
  const sceneRef = useRef<HTMLDivElement>(null)
  const sceneSize = useElementSize(sceneRef)
  const chrome = chromeFor(sceneSize?.width ?? UNMEASURED_WIDTH)

  /* The slot preview's panel has always been tighter than the renderer's. It
   * keeps that relationship: it shrinks with the screen, it never grows. */
  const slotPanelPad = Math.min(space.lg, chrome.panel)

  /* THE FEATURE FLAG. ?renderer=v2 draws real content through the registry;
   * anything else keeps the slot view. Default behaviour is unchanged, so the
   * new path has to be asked for and can be abandoned by removing a query
   * parameter rather than a revert. */
  const dynamic = typeof window !== 'undefined'
    && new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('renderer') === 'v2'

  if (dynamic) registerRepresentations()

  return (
    <div ref={sceneRef} className="scene" style={{ ...(cssVariables() as React.CSSProperties), overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: chrome.page }}>
        <h1 style={{
          fontSize: type.display.size, lineHeight: type.display.lineHeight,
          fontWeight: type.display.weight, letterSpacing: type.display.tracking,
          fontFamily: type.display.family, color: color.text, margin: 0,
        }}>
          One engine, seven lessons
        </h1>
        <p style={{
          fontSize: type.body.size, lineHeight: type.body.lineHeight,
          color: color.textMuted, fontFamily: type.body.family,
          marginTop: space.sm, marginBottom: space.xxl, maxWidth: 620,
        }}>
          Each lesson below was composed by the same deterministic selector, laid out on the
          same twelve-column grid, and checked by the same validator. The shapes differ
          because the content differs. The design language does not differ at all.
        </p>

        {[financialCrisis, ...ACCEPTANCE_LESSONS].map((lesson) => {
          const { decision, frame, ladder, ok } = frameFor(lesson)
          const bands = [...new Set(frame.blocks.map((b) => b.band))].sort((a, b) => a - b)
          const isOpen = open === lesson.id

          return (
            <section key={lesson.id} style={{ marginBottom: space.xxl }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: space.md, marginBottom: space.sm }}>
                <h2 style={{
                  fontSize: type.heading.size, fontWeight: type.heading.weight,
                  fontFamily: type.heading.family, color: color.text, margin: 0,
                }}>
                  {lesson.question}
                </h2>
                <span style={{
                  fontFamily: type.mono.family, fontSize: type.mono.size,
                  letterSpacing: type.mono.tracking, color: color.accent,
                  border: `${stroke.hair}px solid ${accentAlpha.wash}`,
                  borderRadius: radius.pill, padding: `${space.xs}px ${space.md}px`,
                }}>
                  {decision.archetype}
                </span>
                {!ok && (
                  <span style={{ fontFamily: type.mono.family, fontSize: type.mono.size, color: color.negative }}>
                    validator failed
                  </span>
                )}
              </div>

              {dynamic ? (
                <div style={{
                  border: `${stroke.hair}px solid ${color.border}`,
                  borderRadius: radius.lg, padding: chrome.panel,
                  background: color.surface,
                }}>
                  <LessonRenderer lesson={lesson as never} explain />
                </div>
              ) : (
              /* the composition, on the real grid */
              <div style={{
                border: `${stroke.hair}px solid ${color.border}`,
                borderRadius: radius.lg, padding: slotPanelPad,
                background: color.surface,
              }}>
                {bands.map((band) => (
                  <div key={band} style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
                    gap: space.sm, marginBottom: space.sm,
                  }}>
                    {frame.blocks.filter((b) => b.band === band).map((b) => {
                      const el = lesson.elements.find((e) => e.id === b.id)
                      return (
                        <div key={b.id} style={{
                          gridColumn: `${b.col} / span ${b.span}`,
                          background: overlay.soft,
                          border: `${stroke.hair}px solid ${color.borderStrong}`,
                          borderRadius: radius.md,
                          padding: space.md,
                          minHeight: 64,
                        }}>
                          <div style={{
                            fontFamily: type.micro.family, fontSize: type.micro.size,
                            letterSpacing: type.micro.tracking, textTransform: 'uppercase',
                            color: el?.priority === 'primary' ? color.accent : ink.axis,
                          }}>
                            {el?.kind} · {el?.priority ?? 'supporting'}
                          </div>
                          <div style={{
                            fontFamily: type.label.family, fontSize: type.label.size,
                            color: color.text, marginTop: space.xs,
                          }}>
                            {el?.title ?? el?.id}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              )}

              <button
                onClick={() => setOpen(isOpen ? null : lesson.id)}
                /* EIGHT BUTTONS CANNOT ALL BE CALLED "why this shape?".
                 *
                 * A screen reader lists controls by name; eight identical
                 * names is eight indistinguishable rows and no way to pick
                 * one. The VISIBLE text stays terse because it sits directly
                 * under the lesson it belongs to and the association is
                 * obvious to a sighted reader. The accessible name carries the
                 * lesson so the control is identifiable out of context. */
                aria-label={isOpen
                  ? `Hide the composition reasoning for: ${lesson.question}`
                  : `Why this shape? Show the composition reasoning for: ${lesson.question}`}
                aria-expanded={isOpen}
                style={{
                  marginTop: space.sm, background: 'transparent', cursor: 'pointer',
                  border: `${stroke.hair}px solid ${color.border}`, borderRadius: radius.sm,
                  color: color.textMuted, fontFamily: type.mono.family,
                  fontSize: type.mono.size, padding: `${space.xs}px ${space.md}px`,
                  minHeight: 40,
                }}
              >
                {isOpen ? 'hide' : 'why this shape?'}
              </button>

              {isOpen && (
                <div style={{
                  marginTop: space.sm, padding: space.lg,
                  border: `${stroke.hair}px solid ${color.border}`,
                  borderRadius: radius.md, background: color.bgDeep,
                  fontFamily: type.mono.family, fontSize: type.mono.size,
                  color: ink.axis, lineHeight: type.body.lineHeight,
                }}>
                  <div><span style={{ color: color.accent }}>rule</span> {decision.rule}</div>
                  <div><span style={{ color: color.accent }}>because</span> {decision.because}</div>
                  <div><span style={{ color: color.accent }}>density</span> {ladder.policy.density} (mass {frame.mass.mass.toFixed(2)})</div>
                  {ladder.steps.filter((s) => s.applied).map((s) => (
                    <div key={s.rung}><span style={{ color: color.accent }}>{s.rung}</span> {s.detail}</div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
