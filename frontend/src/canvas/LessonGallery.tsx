import React, { useState } from 'react'
import './scene.css'
import { color, ink, overlay, space, type, radius, stroke, accentAlpha } from './design/tokens'
import { cssVariables } from './design/generateCss'
import { ACCEPTANCE_LESSONS } from './lessons/acceptance'
import { financialCrisis } from './lessons/demo'
import { selectArchetype, compositionFor, GRID_COLUMNS } from './layout/archetypes'
import { contentMass, climbLadder } from './layout/disclosure'
import { checkFrame, type LayoutFrame, type PlacedBlock } from './layout/validate'

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

export function LessonGallery() {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="scene" style={{ ...(cssVariables() as React.CSSProperties), overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: space.h1 }}>
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

              {/* the composition, on the real grid */}
              <div style={{
                border: `${stroke.hair}px solid ${color.border}`,
                borderRadius: radius.lg, padding: space.lg,
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

              <button
                onClick={() => setOpen(isOpen ? null : lesson.id)}
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
